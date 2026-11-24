"""Trình đọc và nạp đề cương học phần từ file Word (.docx) theo Brief D5.

Hỗ trợ:
  1. Đọc file .docx bằng python-docx (đoạn văn + bảng, giữ thứ tự);
  2. Tái dùng pipeline nhận dạng mục/bảng từ outline_parse.py;
  3. Trích đủ: thông tin chung, mô tả, mục tiêu CO, chuẩn đầu ra CLO, đánh giá, kế hoạch tuần, tài liệu;
  4. Ghi đè mã môn bằng mã đích từ tên file / manifest (không tin placeholder BEE40XX trong file);
  5. Áp dụng quy tắc khoa/bộ môn: Bộ môn Ngoại ngữ -> Phòng Bảo đảm chất lượng, và faculty_overrides.tsv;
  6. Xử lý bản thay thế BFF4009_K25.docx cho năm 2025;
  7. Bỏ qua và liệt kê file .doc cũ; xuất danh sách chan-quyen từ manifest 2023.
"""

from __future__ import annotations

import csv
import io
import re
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, BinaryIO

import docx
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import (
    Module,
    OutlineAssessment,
    OutlineClo,
    OutlineCourse,
    OutlineDocument,
    OutlineMaterial,
    OutlineModuleLink,
    OutlineObjective,
    OutlineScheduleItem,
    OutlineSection,
)
from app.services.faculty_names import SEED_OVERRIDES_TSV, canonical_faculty_vi, is_year_or_cohort_label
from app.services.lineage import file_sha256
from app.services.outline_parse import (
    _KINDS,
    _NUM_HEAD,
    _collect_table,
    _finish_tables,
    best_materials,
    cell_text,
    clean,
    fold,
    normalize_text,
    outline_status,
    parse_general,
    save_parsed,
    split_sections,
    tables_to_records,
)


def _load_overrides() -> dict[str, tuple[str, str]]:
    """Đọc faculty_overrides.tsv nếu có: code -> (faculty, department)."""
    overrides: dict[str, tuple[str, str]] = {}
    if SEED_OVERRIDES_TSV.is_file():
        with SEED_OVERRIDES_TSV.open("r", encoding="utf-8") as f:
            reader = csv.DictReader(f, delimiter="\t")
            for r in reader:
                cd = (r.get("code") or "").strip().upper()
                if cd:
                    overrides[cd] = (r.get("faculty") or "").strip(), (r.get("department") or "").strip()
    return overrides


def extract_docx_content(docx_source: str | Path | BinaryIO) -> tuple[str, list[list[list[str]]]]:
    """Đọc nội dung file docx: trả về (toàn văn bản nối theo thứ tự đoạn + bảng, danh sách ma trận bảng)."""
    doc = docx.Document(docx_source)
    text_parts: list[str] = []
    tables_data: list[list[list[str]]] = []
    heading_numbers: Counter[int] = Counter()

    # Duyệt theo thứ tự phần tử trong body
    for child in doc.element.body:
        tag = child.tag
        if tag.endswith("}p"):
            p = docx.text.paragraph.Paragraph(child, doc)
            txt = clean(p.text)
            if txt:
                # Word lưu số mục tự động trong thuộc tính đoạn, tách khỏi phần văn bản.
                num = p._p.pPr.numPr if p._p.pPr is not None else None
                if (
                    num is not None
                    and num.numId is not None
                    and num.numId.val > 0
                    and (num.ilvl is None or num.ilvl.val == 0)
                    and not _NUM_HEAD.match(txt)
                    and any(pattern.match(fold(txt)) for _, pattern in _KINDS)
                ):
                    list_id = num.numId.val
                    heading_numbers[list_id] += 1
                    txt = f"{heading_numbers[list_id]}. {txt}"
                text_parts.append(txt)
        elif tag.endswith("}tbl"):
            tbl = docx.table.Table(child, doc)
            tbl_matrix: list[list[str]] = []
            for row in tbl.rows:
                seen_tcs = set()
                row_cells: list[str] = []
                for c in row.cells:
                    if c._tc not in seen_tcs:
                        seen_tcs.add(c._tc)
                        row_cells.append(cell_text(c.text))
                if any(row_cells):
                    tbl_matrix.append(row_cells)
                    # Định dạng hàng bảng vào dòng văn bản (dùng \t để regex _kv nhận diện nhãn -> giá trị)
                    text_parts.append("\t".join(row_cells))
            if tbl_matrix:
                tables_data.append(tbl_matrix)

    full_text = "\n".join(text_parts)
    return full_text, tables_data


def _is_faculty_label(raw_label: str) -> bool:
    """Nhãn bảng có phải 'Khoa' (đơn vị quản lý) không.

    Không dùng `fold()` ở đây: bỏ dấu sẽ biến 'Khóa học' (khóa/niên khóa) thành 'khoa hoc'
    và bị nhận nhầm là khoa. 'Khoa học' không dấu cũng bị loại vì gần như luôn là 'Khóa học'.
    """
    s = unicodedata.normalize("NFC", raw_label or "").strip().lower()
    if "faculty" in s:
        return True
    return bool(re.match(r"^khoa\b(?!\s*h[oọ]c)", s))


def _faculty_from_header(full_text: str) -> str | None:
    """Tên khoa ở tiêu đề trang ('KHOA QTKD', 'KHOA QUẢN TRỊ KINH DOANH'); chỉ nhận nếu ánh xạ được khoa chuẩn."""
    head = full_text[:2500]
    # Điểm dừng: bắt đầu phần bộ môn, chú thích đánh số '[2]', hoặc hết dòng/ô.
    stop = r"(?=[ \t]+B[ỘO][ \t]+M[ÔO]N|[ \t]+DEPARTMENT\b|[ \t]*\[\d+\]|[\n\t|]|$)"
    for prefix, pattern in (
        ("KHOA ", r"\bKHOA[ \t]+(.{2,80}?)" + stop),
        ("FACULTY OF ", r"\bFACULTY[ \t]+OF[ \t]+(.{2,80}?)" + stop),
    ):
        for m in re.finditer(pattern, head):
            canon = canonical_faculty_vi(prefix + m.group(1).strip())
            if canon:
                return canon
    return None


def _extract_general_from_tables(tables: list[list[list[str]]]) -> dict[str, str]:
    """Bổ sung trích xuất thông tin chung từ các bảng dạng 2 cột (Nhãn: Giá trị)."""
    info: dict[str, str] = {}
    for matrix in tables:
        for row in matrix:
            if len(row) >= 2:
                label = fold(row[0])
                val = clean(row[1])
                if not val:
                    continue
                if "ten hoc phan" in label or "ten mon hoc" in label or "course title" in label:
                    if "tieng viet" in label or "vietnamese" in label:
                        info.setdefault("name_vi", val)
                    elif "tieng anh" in label or "english" in label:
                        info.setdefault("name_en", val)
                    else:
                        info.setdefault("name_vi", val)
                elif "ma hoc phan" in label or "ma mon hoc" in label or "course code" in label:
                    info.setdefault("course_code", val)
                elif "so tin chi" in label or "credits" in label:
                    m = re.search(r"\d+(?:[.,]\d+)?", val)
                    if m:
                        info.setdefault("credits", m.group(0).replace(",", "."))
                elif _is_faculty_label(row[0]):
                    if not is_year_or_cohort_label(val):
                        info.setdefault("faculty", val)
                elif "bo mon" in label or "department" in label:
                    info.setdefault("department", val)
                elif "giang vien" in label or "lecturer" in label or "instructor" in label:
                    info.setdefault("lecturers", val)
                elif "ngon ngu" in label or "language" in label:
                    info.setdefault("teaching_language", val)
    return info


def parse_docx_document(docx_source: str | Path | BinaryIO, target_code: str | None = None) -> dict:
    """Phân tích một đề cương Word (.docx) sang cấu trúc dữ liệu chuẩn của hệ thống."""
    full_text, raw_tables = extract_docx_content(docx_source)
    norm_text = normalize_text(full_text)
    sections = split_sections(norm_text)
    kinds = {s["kind"] for s in sections}
    body = {s["kind"]: s["text"] for s in sections}
    front = body.get("front", "")

    if "general" in kinds:
        heading = next(s["heading"] for s in sections if s["kind"] == "general")
        doc_type = "syllabus_vi" if re.search(r"thong tin tong quat|thong tin chung", fold(heading)) else "syllabus_en"
    elif "clo_report" in kinds:
        doc_type = "clo_report"
    else:
        doc_type = "syllabus_vi" if ("objectives" in kinds or "clos" in kinds or "assessment" in kinds) else "other"

    # Trích thông tin tổng quát từ văn bản
    course = parse_general(body.get("general", norm_text[:3000]), front) if doc_type.startswith("syllabus") else {}

    # Bổ sung từ bảng 2 cột nếu văn bản chưa bắt được
    tab_info = _extract_general_from_tables(raw_tables)
    for k in ("name_vi", "name_en", "faculty", "department", "teaching_language"):
        if not course.get(k) and tab_info.get(k):
            course[k] = tab_info[k]
    if not course.get("credits") and tab_info.get("credits"):
        try:
            course["credits"] = float(tab_info["credits"])
        except ValueError:
            pass

    # Năm/khóa ('2023', '2023-2027', 'K25', '5') không phải tên khoa: bỏ, rồi thử lấy từ tiêu đề trang.
    if is_year_or_cohort_label(course.get("faculty")):
        course["faculty"] = None
    if doc_type.startswith("syllabus") and not course.get("faculty"):
        course["faculty"] = _faculty_from_header(full_text)

    # Ghi đè mã học phần bằng target_code (không tin placeholder BEE40XX trong file)
    if target_code:
        clean_code = re.sub(r"\s+", "", target_code).upper()
        course["course_code"] = target_code
        course["course_code_norm"] = clean_code
    elif course.get("course_code"):
        course["course_code_norm"] = re.sub(r"\s+", "", course["course_code"]).upper()

    # Xử lý quy tắc khoa / bộ môn
    norm_code = course.get("course_code_norm") or ""
    overrides = _load_overrides()
    if norm_code in overrides:
        fac_ov, dept_ov = overrides[norm_code]
        if fac_ov:
            course["faculty"] = fac_ov
        if dept_ov:
            course["department"] = dept_ov
    else:
        dept = course.get("department") or ""
        fac = course.get("faculty") or ""
        if "ngoại ngữ" in dept.lower() or "foreign language" in dept.lower() or "ngoại ngữ" in fac.lower():
            course["faculty"] = "Phòng Bảo đảm chất lượng"
            course["department"] = "Bộ môn Ngoại ngữ"
        elif course.get("faculty"):
            canon = canonical_faculty_vi(course["faculty"])
            if canon:
                course["faculty"] = canon

    # Mô tả môn học
    desc = body.get("description")
    if desc:
        course["description"] = clean(desc)

    # Tài liệu
    materials = best_materials(sections, norm_text) if doc_type.startswith("syllabus") else []

    # Bảng cấu trúc: CO, CLO, Đánh giá, Lịch giảng dạy
    found_tables: dict[str, dict] = {}
    for pno, matrix in enumerate(raw_tables, 1):
        _collect_table(found_tables, matrix, pno)
    finish_tabs = _finish_tables(found_tables)
    records = tables_to_records(finish_tabs)

    # Đánh giá độ đầy đủ và trạng thái
    missing = []
    if doc_type.startswith("syllabus"):
        if not (course.get("name_vi") or course.get("name_en")):
            missing.append("name")
        for k in ("course_code", "credits"):
            if not course.get(k):
                missing.append(k)
        for k in ("objectives", "clos", "assessments", "schedule"):
            if not records.get(k):
                missing.append(k)
        if not materials:
            missing.append("materials")

    wsum = round(sum(a["weight_pct"] or 0 for a in records.get("assessments", [])), 1)
    detail = {
        "sections": sorted(kinds),
        "counts": {k: len(records.get(k, [])) for k in ("objectives", "clos", "assessments", "schedule")},
        "materials": len(materials),
        "missing": missing,
        "weight_sum": wsum,
        "tables_failed": False,
    }
    status = outline_status(doc_type, missing)

    return {
        "doc_type": doc_type,
        "course": course,
        "sections": sections,
        "materials": materials,
        **records,
        "detail": detail,
        "status": status,
        "full_text": norm_text,
    }


def export_chan_quyen_csv(manifest_path: Path, out_path: Path) -> int:
    """Xuất danh sách đề cương bị chặn quyền hoặc tải lỗi ra CSV để chủ dự án tải tay."""
    if not manifest_path.is_file():
        return 0
    out_path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    rows_out: list[dict[str, str]] = []

    with manifest_path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            status = (r.get("status") or "").strip()
            if status != "ok":
                rows_out.append({
                    "ma_mon": (r.get("code") or "").strip(),
                    "url": (r.get("url") or "").strip(),
                    "ly_do": status,
                })
                count += 1

    with out_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["ma_mon", "url", "ly_do"])
        writer.writeheader()
        writer.writerows(rows_out)

    return count


def import_docx_outlines(
    db: Session,
    docx_dir: Path,
    ctdt_year: int,
    *,
    manifest_path: Path | None = None,
    dry_run: bool = False,
    source_label: str = "docx_import",
) -> dict[str, Any]:
    """Nạp hàng loạt file .docx vào DB: dedupe sha256, lưu outline_documents, parse và gắn outline_module_links."""
    stats = {
        "found": 0,
        "imported": 0,
        "skipped_doc": 0,
        "skipped_duplicate": 0,
        "errors": 0,
        "error_files": [],
        "links_created": 0,
    }
    if not docx_dir.is_dir():
        return stats

    manifest_map: dict[str, dict[str, str]] = {}
    if manifest_path and manifest_path.is_file():
        with manifest_path.open("r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for r in reader:
                fname = (r.get("file") or "").strip()
                if fname:
                    manifest_map[fname] = r

    parsed_doc_ids: set[int] = set()

    # Tập hợp các file docx/doc
    all_files = sorted(list(docx_dir.glob("*.docx")) + list(docx_dir.glob("*.doc")))
    stats["found"] = len(all_files)

    for p in all_files:
        if p.suffix.lower() == ".doc":
            stats["skipped_doc"] += 1
            continue

        mf = manifest_map.get(p.name, {})
        if mf and mf.get("status") and mf["status"] != "ok":
            continue

        # Xác định mã học phần từ manifest hoặc tên file
        code = (mf.get("code") or "").strip()
        if not code:
            m_code = re.match(r"^([A-Z]{3,4}\d{4}[A-Za-z]?)", p.stem)
            code = m_code.group(1) if m_code else p.stem.split("__")[0].split("_")[0]

        code = re.sub(r"\s+", "", code).upper()
        if not code:
            continue

        sha = file_sha256(p)
        size = p.stat().st_size
        rel = str(p.relative_to(p.parents[2])).replace("\\", "/") if len(p.parents) >= 3 else str(p).replace("\\", "/")

        try:
            parsed = parse_docx_document(p, target_code=code)
        except Exception as e:
            stats["errors"] += 1
            stats["error_files"].append(f"{p.name}: {e}")
            continue

        if dry_run:
            stats["imported"] += 1
            stats["links_created"] += 1
            continue

        # Tìm hoặc tạo OutlineDocument
        doc = db.scalar(select(OutlineDocument).where(OutlineDocument.sha256 == sha))
        if doc is None:
            doc = OutlineDocument(
                sha256=sha,
                file_name=p.name,
                rel_path=rel,
                size_bytes=size,
                ctdt_year=ctdt_year,
                source_format="docx",
                text_status="extracted",
                text=parsed.get("full_text"),
                extracted_at=datetime.now(timezone.utc),
            )
            db.add(doc)
            db.flush()
        # Cùng nội dung (sha256) đã nạp ở năm khác: giữ nguyên tài liệu và dữ liệu đã phân tích, chỉ thêm liên kết theo năm này.
        if doc.id not in parsed_doc_ids and db.get(OutlineCourse, doc.id) is None:
            doc.ctdt_year = doc.ctdt_year or ctdt_year
            doc.source_format = "docx"
            save_parsed(db, doc.id, parsed, method="docx-rules-1")
            db.flush()
        parsed_doc_ids.add(doc.id)

        # Gắn outline_module_links
        link = db.scalar(
            select(OutlineModuleLink).where(
                OutlineModuleLink.document_id == doc.id,
                OutlineModuleLink.module_code == code,
                OutlineModuleLink.ctdt_year == ctdt_year,
            )
        )
        if link is None:
            db.add(
                OutlineModuleLink(
                    document_id=doc.id,
                    module_code=code,
                    ctdt_year=ctdt_year,
                    source=source_label,
                )
            )
            stats["links_created"] += 1

        stats["imported"] += 1

    if not dry_run:
        db.commit()

    return stats


def repair_year_like_outline_faculty(
    db: Session,
    base_dir: Path,
    *,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Sửa các dòng `outline_courses.faculty` bị lưu nhầm năm/khóa ('2023', '2023-2027', 'K25', '5').

    Đọc lại đúng file Word nguồn của từng dòng bằng bộ đọc đã sửa và chỉ cập nhật cột `faculty`
    (không đụng cột khác, không đụng bảng `modules`). `base_dir` là thư mục `data/outlines_master`
    (cùng gốc với `outline_documents.rel_path`). Dòng không có file nguồn thì giữ nguyên và được báo cáo.
    """
    rows = db.execute(
        select(OutlineCourse, OutlineDocument.rel_path, OutlineDocument.source_format)
        .join(OutlineDocument, OutlineDocument.id == OutlineCourse.document_id)
        .where(OutlineCourse.faculty.is_not(None))
    ).all()

    stats: dict[str, Any] = {
        "bad_rows": 0,
        "fixed": 0,
        "cleared_no_faculty_found": 0,
        "missing_source": 0,
        "not_docx": 0,
        "errors": 0,
        "samples": [],
        "problems": [],
    }
    for oc, rel_path, source_format in rows:
        if not is_year_or_cohort_label(oc.faculty):
            continue
        stats["bad_rows"] += 1
        old = oc.faculty
        code = oc.course_code_norm or ""

        if source_format != "docx" or not rel_path or not rel_path.lower().endswith(".docx"):
            stats["not_docx"] += 1
            stats["problems"].append(f"{code}: không phải file Word ({rel_path})")
            continue
        src = base_dir / rel_path
        if not src.is_file():
            stats["missing_source"] += 1
            stats["problems"].append(f"{code}: thiếu file nguồn {rel_path}")
            continue
        try:
            new_fac = parse_docx_document(src, target_code=code or None)["course"].get("faculty") or None
        except Exception as e:  # noqa: BLE001 - báo cáo từng file, không dừng cả đợt
            stats["errors"] += 1
            stats["problems"].append(f"{code}: lỗi đọc {src.name}: {e}")
            continue

        if new_fac:
            stats["fixed"] += 1
        else:
            stats["cleared_no_faculty_found"] += 1
        if len(stats["samples"]) < 12:
            stats["samples"].append(f"{code}: {old!r} -> {new_fac!r}")
        if not dry_run:
            oc.faculty = new_fac

    if not dry_run:
        db.commit()
    return stats


def replace_bff4009_outline(db: Session, manual_file: Path, *, dry_run: bool = False) -> dict[str, Any]:
    """Thay hẳn đề cương năm 2025 của BFF4009 (và EFF4009) bằng bản manual/BFF4009_K25.docx."""
    if not manual_file.is_file():
        return {"ok": False, "error": f"Không tìm thấy file: {manual_file}"}

    parsed = parse_docx_document(manual_file, target_code="BFF4009")
    sha = file_sha256(manual_file)
    size = manual_file.stat().st_size
    rel = str(manual_file.relative_to(manual_file.parents[2])).replace("\\", "/") if len(manual_file.parents) >= 3 else str(manual_file).replace("\\", "/")

    if dry_run:
        return {"ok": True, "dry_run": True, "module": "BFF4009", "sha256": sha}

    # 1. Xóa liên kết cũ năm 2025 của BFF4009 và EFF4009
    db.execute(
        delete(OutlineModuleLink).where(
            OutlineModuleLink.module_code.in_(["BFF4009", "EFF4009"]),
            OutlineModuleLink.ctdt_year == 2025,
        )
    )

    # 2. Tạo hoặc nạp OutlineDocument mới
    doc = db.scalar(select(OutlineDocument).where(OutlineDocument.sha256 == sha))
    if doc is None:
        doc = OutlineDocument(
            sha256=sha,
            file_name=manual_file.name,
            rel_path=rel,
            size_bytes=size,
            ctdt_year=2025,
            source_format="docx",
            text_status="extracted",
            text=parsed.get("full_text"),
            extracted_at=datetime.now(timezone.utc),
        )
        db.add(doc)
        db.flush()
    else:
        doc.ctdt_year = 2025
        doc.source_format = "docx"

    # 3. Lưu dữ liệu phân tích chuẩn
    save_parsed(db, doc.id, parsed, method="manual-docx-k25")

    # 4. Gắn liên kết chuẩn cho BFF4009
    db.add(OutlineModuleLink(document_id=doc.id, module_code="BFF4009", ctdt_year=2025, source="manual"))

    # Kiểm tra nếu EFF4009 tồn tại trong DB, gắn luôn liên kết
    eff = db.get(Module, "EFF4009")
    if eff is not None:
        db.add(OutlineModuleLink(document_id=doc.id, module_code="EFF4009", ctdt_year=2025, source="manual"))

    db.commit()
    return {"ok": True, "document_id": doc.id, "module": "BFF4009", "status": parsed["status"]}


def export_chan_quyen_csv(manifest_path: Path, out_path: Path) -> int:
    """Xuất danh sách các đề cương bị chặn quyền truy cập / lỗi từ manifest ra CSV."""
    if not manifest_path.is_file():
        return 0
    out_path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with manifest_path.open("r", encoding="utf-8-sig") as f_in, out_path.open("w", encoding="utf-8-sig", newline="") as f_out:
        reader = csv.DictReader(f_in)
        fieldnames = list(reader.fieldnames or ["code", "link_kind", "which", "source_file", "id", "status", "bytes", "sha256", "file", "url"])
        writer = csv.DictWriter(f_out, fieldnames=fieldnames)
        writer.writeheader()
        for row in reader:
            status = (row.get("status") or "").strip().lower()
            if status != "ok":
                writer.writerow(row)
                count += 1
    return count

