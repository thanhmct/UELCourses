"""Catalog reading + full ingest pipeline (catalog.json + raw files -> RagIndex)."""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

from .index import RagIndex, embeddings_available
from .loader import load_document
from .models import RegulationDoc, parse_date
from .segmenter import build_chunks, segment
from .validity import infer_applies_from, is_cohort_specific, normalize_cohort, refresh_statuses

REPO_ROOT = Path(__file__).resolve().parents[3]
API_ROOT = Path(__file__).resolve().parents[2]
SUPPORTED_EXT = {".pdf", ".docx", ".html", ".htm", ".txt", ".md"}


def regulations_dir() -> Path:
    return Path(os.getenv("REGULATIONS_DIR") or (REPO_ROOT / "regulations"))


def index_dir() -> Path:
    return Path(os.getenv("RAG_INDEX_DIR") or (API_ROOT / "data" / "rag_index"))


_ALIASES = {
    "doc_id": ("doc_id", "id", "code", "ma"),
    "title": ("title", "name", "ten", "tieu_de"),
    "decision_no": ("decision_no", "decision_number", "so_quyet_dinh", "number"),
    "issued_date": ("issued_date", "issue_date", "ngay_ban_hanh", "signed_date"),
    "effective_from": ("effective_from", "effective_date", "hieu_luc_tu"),
    "effective_to": ("effective_to", "expiry_date", "expired_date", "hieu_luc_den"),
    "status": ("status", "trang_thai"),
    "superseded_by": ("superseded_by", "replaced_by", "bi_thay_the_boi"),
    "supersedes": ("supersedes", "replaces", "thay_the"),
    "applies_to_cohorts": ("applies_to_cohorts", "cohorts", "ap_dung_khoa"),
    "source_url": ("source_url", "url", "source"),
    "file": ("file", "files", "path", "local_file"),
}


def _get(entry: dict[str, Any], key: str) -> Any:
    for k in _ALIASES[key]:
        if k in entry and entry[k] not in (None, ""):
            return entry[k]
    return None


def _date_str(v: Any) -> str | None:
    d = parse_date(v)
    return d.isoformat() if d else (str(v) if v else None)


def read_catalog(reg_dir: Path) -> list[dict[str, Any]]:
    path = reg_dir / "catalog.json"
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    if isinstance(data, dict):
        for key in ("documents", "docs", "items", "regulations"):
            if isinstance(data.get(key), list):
                return data[key]
        raise ValueError("catalog.json: không tìm thấy danh sách văn bản (documents/docs/items)")
    if not isinstance(data, list):
        raise ValueError("catalog.json phải là danh sách hoặc object có khóa 'documents'")
    return data


def catalog_entry_to_doc(entry: dict[str, Any]) -> RegulationDoc:
    doc_id = str(_get(entry, "doc_id") or "").strip()
    if not doc_id:
        raise ValueError(f"Mục catalog thiếu doc_id: {entry}")
    cohorts = _get(entry, "applies_to_cohorts")
    if cohorts is None:
        cohorts = ["all"]
    if isinstance(cohorts, str):
        cohorts = [c for c in re.split(r"[,;]\s*", cohorts) if c]
    norm = []
    for c in cohorts:
        c = str(c).strip()
        # keep ranges / "K48+" specs verbatim, normalise single cohorts
        norm.append(c if re.search(r"[-–+]|từ", c) else (normalize_cohort(c) or c))
    supersedes = _get(entry, "supersedes") or []
    if isinstance(supersedes, str):
        supersedes = [supersedes]
    file_val = _get(entry, "file") or ""
    if isinstance(file_val, list):
        file_val = ";".join(str(f) for f in file_val)
    title = str(_get(entry, "title") or doc_id)
    return RegulationDoc(
        doc_id=doc_id,
        title=title,
        decision_no=str(_get(entry, "decision_no") or ""),
        issued_date=_date_str(_get(entry, "issued_date")),
        effective_from=_date_str(_get(entry, "effective_from")),
        effective_to=_date_str(_get(entry, "effective_to")),
        superseded_by=_get(entry, "superseded_by"),
        supersedes=list(supersedes),
        applies_to_cohorts=norm,
        source_url=_get(entry, "source_url"),
        file=str(file_val),
        catalog_status=_get(entry, "status"),
        is_sample=bool(entry.get("is_sample") or entry.get("sample") or "MẪU" in title.upper()),
        issuer=entry.get("issuer"),
        topics=[str(t) for t in (entry.get("topics") or [])],
        verified=entry.get("verified") if isinstance(entry.get("verified"), bool) else None,
        notes=entry.get("notes"),
        applies_from_cohort=normalize_cohort(entry.get("applies_from_cohort")) if entry.get("applies_from_cohort") else None,
        applies_from_source="catalog" if entry.get("applies_from_cohort") else None,
        amends=_as_list(entry.get("amends")),
        guides=_as_list(entry.get("guides") or entry.get("implements")),
    )


def _as_list(v: Any) -> list[str]:
    if not v:
        return []
    return [str(x) for x in v] if isinstance(v, list) else [str(v)]


def resolve_files(reg_dir: Path, doc: RegulationDoc) -> list[Path]:
    """Resolve catalog `file` (may be ';'-separated) against regulations/, raw/, manual/."""
    out = []
    for name in [f.strip() for f in doc.file.split(";") if f.strip()]:
        cand = [Path(name), reg_dir / name, reg_dir / "raw" / name, reg_dir / "manual" / name]
        found = next((c for c in cand if c.is_file()), None)
        out.append(found or (reg_dir / "raw" / name))
    return out


def manual_override(reg_dir: Path, doc: RegulationDoc, files: list[Path]) -> Path | None:
    """A hand-transcribed text in regulations/manual/ (<doc_id>.* or <file stem>.*) replaces scans."""
    mdir = reg_dir / "manual"
    if not mdir.is_dir():
        return None
    stems = {doc.doc_id.lower()} | {f.stem.lower() for f in files}
    for p in sorted(mdir.iterdir()):
        if p.is_file() and p.suffix.lower() in SUPPORTED_EXT and p.stem.lower() in stems:
            if all(p.resolve() != f.resolve() for f in files if f.exists()):
                return p
    return None


@dataclass
class IngestReport:
    n_docs: int = 0
    n_articles: int = 0
    n_clauses: int = 0
    n_points: int = 0
    n_chunks: int = 0
    errors: list[dict[str, str]] = field(default_factory=list)
    needs_ocr: list[dict[str, str]] = field(default_factory=list)
    warnings: list[dict[str, str]] = field(default_factory=list)
    uncataloged_files: list[str] = field(default_factory=list)
    no_file: list[str] = field(default_factory=list)  # catalog entries without any file (file=null)
    per_doc: list[dict[str, Any]] = field(default_factory=list)
    embeddings: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return self.__dict__.copy()


def build_index(reg_dir: Path | str | None = None, today: date | None = None,
                with_embeddings: bool = False) -> tuple[RagIndex, IngestReport]:
    reg_dir = Path(reg_dir) if reg_dir else regulations_dir()
    today = today or date.today()
    report = IngestReport()
    docs: list[RegulationDoc] = []
    all_chunks = []
    articles: dict[str, list[dict[str, Any]]] = {}
    used_files: set[Path] = set()

    for entry in read_catalog(reg_dir):
        try:
            doc = catalog_entry_to_doc(entry)
        except ValueError as exc:
            report.errors.append({"doc_id": "?", "file": "", "error": str(exc)})
            continue
        files = resolve_files(reg_dir, doc)
        used_files.update(f.resolve() for f in files if f.exists())
        if not files and manual_override(reg_dir, doc, files) is None:
            report.no_file.append(doc.doc_id)
        override = manual_override(reg_dir, doc, files)
        pages: list[tuple[int, str]] = []
        loaded_any = False
        for f in files:
            ld = load_document(f)
            for w in ld.warnings:
                report.warnings.append({"doc_id": doc.doc_id, "file": f.name, "warning": w})
            if ld.error:
                report.errors.append({"doc_id": doc.doc_id, "file": str(f), "error": ld.error})
                continue
            if ld.needs_ocr and override is None:
                report.needs_ocr.append({"doc_id": doc.doc_id, "file": str(f), "reason": ld.ocr_reason or "scan"})
                continue
            if not ld.needs_ocr:
                pages += ld.pages
                loaded_any = True
        if override is not None and not loaded_any:
            ld = load_document(override)
            used_files.add(override.resolve())
            if ld.error:
                report.errors.append({"doc_id": doc.doc_id, "file": str(override), "error": ld.error})
            else:
                pages += ld.pages
                loaded_any = True
                report.warnings.append({"doc_id": doc.doc_id, "file": override.name,
                                        "warning": "Dùng bản chép tay trong manual/ thay cho file gốc."})
        parsed = segment(pages) if loaded_any else None
        if parsed is not None:
            if not doc.decision_no and parsed.decision_no:
                doc.decision_no = parsed.decision_no
            if not doc.issued_date and parsed.issued_date:
                doc.issued_date = parsed.issued_date
            for w in parsed.warnings:
                report.warnings.append({"doc_id": doc.doc_id, "file": doc.file, "warning": w})
        if not doc.applies_from_cohort and (is_cohort_specific(doc) or not doc.applies_to_cohorts):
            scope_text = "\n".join([doc.title, doc.notes or ""] + (
                [parsed.preamble] + [a.full_text() for a in parsed.articles[:2]] if parsed else []))
            inferred = infer_applies_from(scope_text)
            if inferred:
                doc.applies_from_cohort, doc.applies_from_source = inferred, "text"
        doc.indexed = bool(parsed and parsed.articles)
        docs.append(doc)
        counts = parsed.counts() if parsed else {"articles": 0, "clauses": 0, "points": 0}
        report.per_doc.append({"doc_id": doc.doc_id, "loaded": loaded_any, **counts})
        if parsed is None:
            continue
        report.n_articles += counts["articles"]
        report.n_clauses += counts["clauses"]
        report.n_points += counts["points"]
        articles[doc.doc_id] = [a.to_api() for a in parsed.articles]
        all_chunks.extend(build_chunks(doc, parsed))

    refresh_statuses(docs, today)
    status_of = {d.doc_id: d for d in docs}
    for c in all_chunks:
        c.status = status_of[c.doc_id].status
        c.decision_no = status_of[c.doc_id].decision_no
    report.n_docs = len(docs)
    report.n_chunks = len(all_chunks)

    for sub in ("raw", "manual"):
        d = reg_dir / sub
        if d.is_dir():
            for p in sorted(d.rglob("*")):
                if p.is_file() and p.suffix.lower() in SUPPORTED_EXT | {".doc"} and p.resolve() not in used_files:
                    if sub == "manual" and any(p.stem.lower() == x.doc_id.lower() for x in docs):
                        continue
                    report.uncataloged_files.append(str(p.relative_to(reg_dir)))

    index = RagIndex(docs, all_chunks, articles, stats=report.to_dict())
    if with_embeddings:
        if embeddings_available():
            try:
                index.add_embeddings()
                report.embeddings = index.embedder.model_name if index.embedder else None
            except Exception as exc:  # noqa: BLE001 - model download/runtime problems
                report.warnings.append({"doc_id": "*", "file": "", "warning": f"Không bật được embeddings: {exc}"})
        else:
            report.warnings.append({"doc_id": "*", "file": "",
                                    "warning": "Chưa cài fastembed/numpy — chỉ dùng BM25."})
        index.stats = report.to_dict()
    return index, report
