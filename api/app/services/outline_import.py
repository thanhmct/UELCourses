"""Nạp đề cương CTĐT 2025 và danh mục quy chế vào DB.

Nguồn (xem data/README.md):
  <data>/outlines_2025/catalog.sqlite          records (3.690 dòng) + resources (4.736 liên kết)
  <data>/outlines_2025/download_report.json    url -> {status, file}
  <data>/outlines_2025/pdf_index.json          resource -> {status, reason}
  <data>/processed/ctdt_outlines_2025/rows.jsonl   dữ liệu chuẩn hóa + toàn bộ ô gốc
  <repo>/regulations/catalog.json              danh mục văn bản quy chế

Tất cả idempotent (upsert theo khóa). File PDF KHÔNG nằm trong DB: chỉ lưu đường dẫn tương đối, sha256, kích thước,
số trang và (sau bước `extract-outline-texts`) văn bản trích xuất.
"""

from __future__ import annotations

import json
import re
import shutil
import sqlite3
import subprocess
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import OutlineDocument, OutlineResource, ProgramCatalogEntry, RegulationDocument
from app.services.lineage import file_sha256


def _d(v) -> date | None:
    if not v:
        return None
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError:
        return None


def _s(v, n: int) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s[:n] if s else None


# --------------------------------------------------------------------------- outlines
def _normalized_index(rows_jsonl: Path) -> dict[tuple[str, str, int], dict]:
    idx: dict[tuple[str, str, int], dict] = {}
    if not rows_jsonl.is_file():
        return idx
    with rows_jsonl.open(encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            r = json.loads(line)
            s = r.get("source", {})
            idx[(s.get("file"), s.get("sheet"), int(s.get("row", 0)))] = r
    return idx


def import_outlines(db: Session, data_dir: Path, *, hash_pdfs: bool = True) -> dict:
    base = data_dir / "outlines_2025"
    catalog = base / "catalog.sqlite"
    if not catalog.is_file():
        raise FileNotFoundError(f"Không thấy {catalog}")
    norm = _normalized_index(data_dir / "processed" / "ctdt_outlines_2025" / "rows.jsonl")
    report = json.loads((base / "download_report.json").read_text(encoding="utf-8")) if (base / "download_report.json").is_file() else {"urls": {}}
    pdf_index = json.loads((base / "pdf_index.json").read_text(encoding="utf-8")) if (base / "pdf_index.json").is_file() else []
    reason_by_resource = {x.get("resource_id"): x.get("reason") for x in pdf_index}

    con = sqlite3.connect(catalog)
    con.row_factory = sqlite3.Row

    # ---- entries
    entries = 0
    for r in con.execute("select * from records"):
        n = norm.get((r["source_file"], r["sheet"], int(r["source_row"] or 0)), {})
        nm, orig = n.get("normalized", {}), n.get("original")
        db.merge(ProgramCatalogEntry(
            id=r["id"], program_label=_s(r["program"], 256) or "", track_label=_s(r["sheet"], 256), category=_s(r["category"], 32),
            module_code=_s(r["code"], 64), module_code_en=_s(nm.get("course_code_english"), 64),
            module_name=_s(r["name"], 512), module_name_en=_s(nm.get("course_name_english"), 512),
            term=_s(r["term"], 16), academic_year=_s(nm.get("academic_year"), 16),
            credits=float(r["credits"]) if r["credits"] not in (None, "") else None,
            required_raw=_s(r["required_raw"], 32), department=_s(nm.get("department"), 256), previous_raw=_s(nm.get("previous_raw"), 512),
            source_file=r["source_file"], source_sheet=r["sheet"], source_row=int(r["source_row"] or 0), original=orig,
        ))
        entries += 1
    db.flush()

    # ---- documents (PDF trên đĩa)
    docs: dict[str, OutlineDocument] = {d.sha256: d for d in db.scalars(select(OutlineDocument))}
    by_rel: dict[str, OutlineDocument] = {d.rel_path: d for d in docs.values()}
    new_docs = 0
    pdf_dir = base / "pdfs"
    for p in sorted(pdf_dir.glob("*.pdf")) if pdf_dir.is_dir() else []:
        rel = f"outlines_2025/pdfs/{p.name}"
        if rel in by_rel:
            continue
        sha = file_sha256(p) if hash_pdfs else None
        d = OutlineDocument(sha256=sha or f"nohash-{p.stem}", file_name=p.name, rel_path=rel, size_bytes=p.stat().st_size)
        if d.sha256 in docs:  # cùng nội dung, khác tên
            by_rel[rel] = docs[d.sha256]
            continue
        db.add(d)
        docs[d.sha256] = d
        by_rel[rel] = d
        new_docs += 1
    db.flush()

    # ---- resources
    url_file: dict[str, str] = {}
    for url, info in report.get("urls", {}).items():
        if info.get("status") in ("cached", "downloaded") and info.get("file"):
            url_file[url] = "outlines_2025/pdfs/" + Path(str(info["file"]).replace("\\", "/")).name
    resources = linked = 0
    for r in con.execute("select * from resources"):
        url = r["url"]
        rel = url_file.get(url) if url else None
        doc = by_rel.get(rel) if rel else None
        status = "no_url" if not url else ("downloaded" if doc else "failed")
        db.merge(OutlineResource(
            id=r["id"], entry_id=r["record_id"], kind=_s(r["kind"], 128), label=_s(r["label"], 512), url=url,
            source_column=r["source_column"], status=status,
            failure_reason=None if status == "downloaded" else (reason_by_resource.get(r["id"]) or None),
            document_id=doc.id if doc else None,
        ))
        resources += 1
        linked += 1 if doc else 0
    db.commit()
    con.close()
    return {"imported": entries, "entries": entries, "resources": resources, "resources_linked_to_pdf": linked,
            "documents": len(docs), "new_documents": new_docs}


def _pdftotext(path: Path) -> tuple[str, int]:
    """Văn bản + số trang của một PDF, bằng `pdftotext -layout` (poppler). pypdf bị bỏ vì xuống dòng sau MỖI từ."""
    exe = shutil.which("pdftotext")
    if not exe:
        raise RuntimeError("Cần poppler-utils (lệnh pdftotext). Container `workspace` đã có sẵn.")
    r = subprocess.run([exe, "-layout", "-enc", "UTF-8", str(path), "-"], capture_output=True, timeout=180)
    text = r.stdout.decode("utf-8", "replace").replace("\x00", "")
    pages = text.count("\f") or 1
    return text.replace("\f", "\n").strip(), pages


def extract_outline_texts(db: Session, data_dir: Path, *, limit: int | None = None, workers: int = 4,
                          force: bool = False) -> dict:
    """Trích văn bản từ PDF đề cương. PDF gần như không có chữ → `needs_ocr` (OCR Tesseract `vie`: bước riêng)."""
    q = select(OutlineDocument)
    if not force:
        q = q.where(OutlineDocument.text_status == "pending")
    if limit:
        q = q.limit(limit)
    docs = list(db.scalars(q).all())

    def work(d: OutlineDocument):
        try:
            return d.id, _pdftotext(data_dir / d.rel_path), None
        except Exception as e:  # noqa: BLE001 - PDF hỏng/mã hóa/hết thời gian
            return d.id, None, str(e)[:200]

    by_id = {d.id: d for d in docs}
    done = needs_ocr = failed = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for doc_id, res, err in ex.map(work, docs):
            d = by_id[doc_id]
            if res is None:
                d.text_status, failed = "failed", failed + 1
                continue
            text, pages = res
            d.page_count, d.text_chars = pages, len(text)
            if len(re.sub(r"\s+", "", text)) < 300:
                d.text, d.text_status, needs_ocr = None, "needs_ocr", needs_ocr + 1
            else:
                d.text, d.text_status, d.text_method = text, "extracted", "pdf_text"
                d.extracted_at, done = datetime.now(timezone.utc), done + 1
    db.commit()
    return {"imported": done, "extracted": done, "needs_ocr": needs_ocr, "failed": failed}


# --------------------------------------------------------------------------- regulations
def import_regulation_catalog(db: Session, catalog_path: Path) -> dict:
    rows = json.loads(catalog_path.read_text(encoding="utf-8"))
    n = 0
    for r in rows:
        db.merge(RegulationDocument(
            id=r["doc_id"], title=r.get("title") or r["doc_id"], issuer=_s(r.get("issuer"), 256), decision_no=_s(r.get("decision_no"), 64),
            issued_date=_d(r.get("issued_date")), effective_from=_d(r.get("effective_from")), effective_to=_d(r.get("effective_to")),
            status=_s(r.get("status"), 16) or "active", superseded_by=_s(r.get("superseded_by"), 128), supersedes=r.get("supersedes"),
            applies_to_cohorts=r.get("applies_to_cohorts"), topics=r.get("topics"), source_url=r.get("source_url"),
            file=_s(r.get("file"), 512), verified=bool(r.get("verified")), notes=r.get("notes"),
        ))
        n += 1
    db.commit()
    return {"imported": n}


def link_outlines_to_modules(db: Session) -> dict:
    """Điền outline_module_links từ outline_resources -> program_catalog_entries.module_code; bổ sung mã còn thiếu cho outline_courses."""
    from sqlalchemy import func

    from app.models import OutlineCourse, OutlineModuleLink

    existing = {(l.document_id, l.module_code) for l in db.scalars(select(OutlineModuleLink))}
    rows = db.execute(
        select(OutlineResource.document_id, ProgramCatalogEntry.module_code)
        .join(ProgramCatalogEntry, ProgramCatalogEntry.id == OutlineResource.entry_id)
        .where(OutlineResource.document_id.is_not(None), ProgramCatalogEntry.module_code.is_not(None))
        .distinct()
    ).all()
    new = 0
    for doc_id, code in rows:
        code = re.sub(r"\s+", "", code).upper()
        if (doc_id, code) not in existing:
            db.add(OutlineModuleLink(document_id=doc_id, module_code=code))
            existing.add((doc_id, code))
            new += 1
    db.flush()
    # outline_courses chưa có mã (vd đề cương để trống ô "Mã học phần"): lấy mã nếu tài liệu chỉ gắn với MỘT mã.
    filled = 0
    single = db.execute(select(OutlineModuleLink.document_id, func.min(OutlineModuleLink.module_code))
                        .group_by(OutlineModuleLink.document_id).having(func.count() == 1)).all()
    for doc_id, code in single:
        oc = db.get(OutlineCourse, doc_id)
        if oc is not None and not oc.course_code_norm:
            oc.course_code_norm, filled = code, filled + 1
    db.commit()
    return {"imported": new, "links": len(existing), "codes_filled": filled}