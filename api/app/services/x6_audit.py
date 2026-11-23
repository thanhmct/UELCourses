"""Báo cáo khoảng trống đề cương và kiểm toán tên tiếng Anh (Brief X6).

Lệnh chỉ ghi các CSV/Markdown trong ``data/processed``. DB chỉ thay đổi khi
``apply_names=True``; khi đó chỉ điền tên còn trống hoặc sửa khác biệt hình thức.
"""

from __future__ import annotations

import csv
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import openpyxl
from sqlalchemy import func, select
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
    Program,
    ProgramCatalogEntry,
    ProgramModule,
)
from app.services.english_names import SEED_TSV, is_clean_english, load_seed_table, normalize_vi
from app.services.text import normalize_search


GAP_FIELDS = [
    "thong_tin_chung",
    "mo_ta_vi_en",
    "tin_chi_gio_hoc",
    "muc_tieu_co",
    "clo",
    "danh_gia",
    "giao_trinh_tham_khao",
    "ke_hoach_tuan",
    "giang_vien_phu_trach",
    "nam_ctdt",
]


def _ctdt_year(cohort: str | None) -> int | None:
    match = re.fullmatch(r"K(\d{2})", (cohort or "").upper())
    if not match:
        return None
    year = int(match.group(1))
    if year in (23, 24):
        return 2023
    if year in (25, 26):
        return 2025
    if year in (27, 28):
        return 2027
    return None


def _count_by_document(db: Session, model: type) -> dict[int, int]:
    return dict(db.execute(select(model.document_id, func.count()).group_by(model.document_id)).all())


def _load_protected_missing(path: Path | None) -> dict[str, dict[str, str]]:
    if not path or not path.is_file():
        return {}
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return {row.get("ma_mon", "").strip().upper(): row for row in csv.DictReader(handle) if row.get("ma_mon")}


def _write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def _best_outline(
    links: list[OutlineModuleLink],
    docs: dict[int, OutlineDocument],
    courses: dict[int, OutlineCourse],
    child_counts: dict[str, dict[int, int]],
    module: Module | None,
    year: int,
) -> tuple[OutlineModuleLink | None, list[str]]:
    best: tuple[int, OutlineModuleLink, list[str]] | None = None
    for link in links:
        doc = docs.get(link.document_id)
        course = courses.get(link.document_id)
        if doc is None:
            continue
        missing: list[str] = []
        if course is None or not (course.name_vi or course.name_en):
            missing.append("thong_tin_chung")
        if not ((course and course.description) or (module and (module.description or module.description_en))):
            missing.append("mo_ta_vi_en")
        if not ((course and (course.credits is not None or course.hours_lecture is not None or course.hours_practice is not None)) or (module and module.credits is not None)):
            missing.append("tin_chi_gio_hoc")
        for label, key in (
            ("muc_tieu_co", "objectives"),
            ("clo", "clos"),
            ("danh_gia", "assessments"),
            ("giao_trinh_tham_khao", "materials"),
            ("ke_hoach_tuan", "schedule"),
        ):
            if child_counts[key].get(link.document_id, 0) == 0:
                missing.append(label)
        if not ((course and course.lecturers) or (module and module.head_lecturer)):
            missing.append("giang_vien_phu_trach")
        if (link.ctdt_year or doc.ctdt_year) != year:
            missing.append("nam_ctdt")
        status_score = 2 if doc.text_status == "extracted" else 1 if doc.text_status not in {"failed", "needs_ocr"} else 0
        score = status_score * 100 + (len(GAP_FIELDS) - len(missing))
        if best is None or score > best[0]:
            best = (score, link, missing)
    return (best[1], best[2]) if best else (None, list(GAP_FIELDS))


def build_outline_gap(
    db: Session,
    *,
    processed_dir: Path,
    missing_2023_csv: Path | None = None,
) -> dict[str, Any]:
    modules = {item.code: item for item in db.scalars(select(Module)).all()}
    expected: dict[tuple[str, int], set[str]] = defaultdict(set)
    for code, program_id, cohort in db.execute(
        select(ProgramModule.module_code, Program.id, Program.cohort).join(Program, Program.id == ProgramModule.program_id)
    ).all():
        year = _ctdt_year(cohort)
        if year in {2023, 2025}:
            expected[(code, year)].add(program_id)

    all_links = db.scalars(select(OutlineModuleLink).order_by(OutlineModuleLink.document_id.desc())).all()
    links_by_pair: dict[tuple[str, int], list[OutlineModuleLink]] = defaultdict(list)
    for link in all_links:
        if link.ctdt_year in {2023, 2025}:
            links_by_pair[(link.module_code, int(link.ctdt_year))].append(link)
    docs = {item.id: item for item in db.scalars(select(OutlineDocument)).all()}
    courses = {item.document_id: item for item in db.scalars(select(OutlineCourse)).all()}
    child_counts = {
        "objectives": _count_by_document(db, OutlineObjective),
        "clos": _count_by_document(db, OutlineClo),
        "assessments": _count_by_document(db, OutlineAssessment),
        "materials": _count_by_document(db, OutlineMaterial),
        "schedule": _count_by_document(db, OutlineScheduleItem),
    }
    protected = _load_protected_missing(missing_2023_csv)
    matrix: list[dict[str, Any]] = []
    manual: list[dict[str, Any]] = []
    statuses: Counter[str] = Counter()

    for (code, year), programs in sorted(expected.items()):
        selected, missing = _best_outline(links_by_pair.get((code, year), []), docs, courses, child_counts, modules.get(code), year)
        doc = docs.get(selected.document_id) if selected else None
        protected_row = protected.get(code) if year == 2023 else None
        if doc is None:
            status = "chan_quyen" if protected_row else "chua_co_de_cuong"
        elif doc.text_status == "needs_ocr":
            status = "can_nhap_tay"
        elif doc.text_status == "failed":
            status = "file_loi"
        elif missing:
            status = "thieu_truong"
        else:
            status = "du"
        statuses[status] += 1
        row = {
            "module_code": code,
            "ctdt_year": year,
            "has_doc": bool(doc),
            "doc_id": doc.id if doc else "",
            "source_file": doc.file_name if doc else "",
            "text_status": doc.text_status if doc else "",
            "thiếu_trường": ";".join(missing if doc else GAP_FIELDS),
            "trạng_thái": status,
        }
        matrix.append(row)
        if status != "du":
            module = modules.get(code)
            reason = (protected_row or {}).get("ly_do") or (";".join(missing) if missing else status)
            manual.append({
                "module_code": code,
                "tên_vi": module.name if module else (protected_row or {}).get("ten_vi", ""),
                "tên_en": module.name_en if module else (protected_row or {}).get("ten_en_db", ""),
                "ctdt_year": year,
                "chương_trình_khóa": ";".join(sorted(programs)),
                "số_chương_trình": len(programs),
                "lý_do_thiếu": reason,
                "link_drive": (protected_row or {}).get("link", ""),
                "chu_du_an_dien": "",
            })

    # Bảo toàn đủ danh sách 63 mã thiếu thật; không đọc/ghi file export chặn quyền cũ.
    manual_keys = {(row["module_code"], row["ctdt_year"]) for row in manual}
    for code, source in protected.items():
        if (code, 2023) in manual_keys:
            continue
        module = modules.get(code)
        programs = expected.get((code, 2023), set())
        manual.append({
            "module_code": code,
            "tên_vi": module.name if module else source.get("ten_vi", ""),
            "tên_en": module.name_en if module else source.get("ten_en_db", ""),
            "ctdt_year": 2023,
            "chương_trình_khóa": ";".join(sorted(programs)),
            "số_chương_trình": len(programs),
            "lý_do_thiếu": source.get("ly_do", "chan_quyen"),
            "link_drive": source.get("link", ""),
            "chu_du_an_dien": "",
        })
    manual.sort(key=lambda row: (-int(row["số_chương_trình"]), row["module_code"], row["ctdt_year"]))

    matrix_path = processed_dir / "outline_gap_matrix.csv"
    manual_path = processed_dir / "outline_can_nhap_tay.csv"
    report_path = processed_dir / "outline_gap_report.md"
    _write_csv(matrix_path, ["module_code", "ctdt_year", "has_doc", "doc_id", "source_file", "text_status", "thiếu_trường", "trạng_thái"], matrix)
    _write_csv(manual_path, ["module_code", "tên_vi", "tên_en", "ctdt_year", "chương_trình_khóa", "số_chương_trình", "lý_do_thiếu", "link_drive", "chu_du_an_dien"], manual)
    mapping = [
        ("Tên VI/EN", "modules.name/name_en; outline_courses.name_vi/name_en"),
        ("Mô tả VI/EN", "modules.description/description_en; outline_courses.description"),
        ("Tín chỉ/giờ", "modules.credits; outline_courses.credits/hours_*"),
        ("Tiên quyết/học trước", "program_modules.prereq_raw/previous_raw; outline_courses.*_raw"),
        ("Mục tiêu (CO)", "outline_objectives"),
        ("CLO", "outline_clos"),
        ("Đánh giá", "outline_assessments"),
        ("Giáo trình/tham khảo", "outline_materials"),
        ("Kế hoạch tuần", "outline_schedule"),
        ("Giảng viên", "outline_courses.lecturers; modules.head_lecturer"),
        ("Năm CTĐT", "outline_module_links.ctdt_year; outline_documents.ctdt_year"),
    ]
    lines = ["# Báo cáo khoảng trống đề cương (X6)", "", "## Trường UI và nguồn DB", "", "| Trường UI | Bảng/cột |", "|---|---|"]
    lines += [f"| {label} | `{source}` |" for label, source in mapping]
    lines += ["", "## Tổng hợp", "", f"- Tổng cặp (môn, năm CTĐT): {len(matrix)}."]
    lines += [f"- `{key}`: {value}." for key, value in sorted(statuses.items())]
    lines += [f"- Danh sách cần chủ dự án xử lý: {len(manual)} dòng (đã gộp {len(protected)} mã thiếu thật năm 2023, không đưa lại 89 mã đã có đề cương).", ""]
    report_path.write_text("\n".join(lines), encoding="utf-8")
    return {"pairs": len(matrix), "statuses": dict(statuses), "manual_rows": len(manual), "protected_2023": len(protected), "matrix": str(matrix_path), "manual": str(manual_path), "report": str(report_path)}


def _normalize_en(value: str | None) -> str:
    text = (value or "").replace("&", " and ")
    text = re.sub(r"\(\s*e\s*\)", " ", text, flags=re.I)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(char for char in text if not unicodedata.combining(char)).casefold()
    return " ".join(re.findall(r"[a-z0-9]+", text))


_EN_SMALL_WORDS = {"a", "an", "and", "as", "at", "by", "for", "from", "in", "of", "on", "or", "the", "to", "with", "via", "vs"}


def _tidy_en(value: str | None, reference: str = "") -> str:
    """Gộp khoảng trắng/xuống dòng; tên viết HOA toàn bộ thì chuyển Title Case (giữ từ viết tắt đã có trong tên hiện tại)."""
    text = " ".join((value or "").split())
    if not text or not text.isupper():
        return text
    acronyms = {w for w in re.findall(r"[A-Za-z0-9&]+", reference) if len(w) >= 2 and w.isupper()}
    out: list[str] = []
    for index, word in enumerate(text.split(" ")):
        if word in acronyms or re.fullmatch(r"[IVX]+", word):
            out.append(word)
        elif index and word.lower() in _EN_SMALL_WORDS:
            out.append(word.lower())
        else:
            out.append("-".join(part.capitalize() for part in word.split("-")))
    return " ".join(out)


def _master_names(path: Path | None) -> dict[str, str]:
    if not path or not path.is_file():
        return {}
    workbook = openpyxl.load_workbook(path, data_only=True, read_only=True)
    try:
        sheet_name = next((name for name in workbook.sheetnames if name.casefold() == "data_course"), None)
        if not sheet_name:
            return {}
        sheet = workbook[sheet_name]
        headers = [str(value or "").strip().casefold() for value in next(sheet.iter_rows(values_only=True))]
        code_col, en_col = headers.index("mã môn"), headers.index("tên tiếng anh")
        result: dict[str, str] = {}
        for row in sheet.iter_rows(min_row=2, values_only=True):
            code = str(row[code_col] or "").strip().upper()
            name = str(row[en_col] or "").strip()
            if code and is_clean_english(name):
                result[code] = name
        return result
    finally:
        workbook.close()


def build_english_name_audit(
    db: Session,
    *,
    processed_dir: Path,
    master_file: Path | None = None,
    seed_file: Path = SEED_TSV,
    apply_names: bool = False,
) -> dict[str, Any]:
    outline: dict[str, str] = {}
    for code, name in db.execute(
        select(OutlineModuleLink.module_code, OutlineCourse.name_en)
        .join(OutlineCourse, OutlineCourse.document_id == OutlineModuleLink.document_id)
        .where(OutlineCourse.name_en.is_not(None))
        .order_by(OutlineModuleLink.ctdt_year.desc(), OutlineModuleLink.document_id.desc())
    ).all():
        if code not in outline and is_clean_english(name):
            outline[code] = name.strip()
    master = _master_names(master_file)
    excel: dict[str, str] = {}
    for code, name in db.execute(
        select(ProgramCatalogEntry.module_code, ProgramCatalogEntry.module_name_en)
        .where(ProgramCatalogEntry.module_code.is_not(None), ProgramCatalogEntry.module_name_en.is_not(None))
        .order_by(ProgramCatalogEntry.id)
    ).all():
        code = (code or "").strip().upper()
        if code and code not in excel and is_clean_english(name):
            excel[code] = name.strip()
    seed = load_seed_table(seed_file)
    used_by: dict[str, set[str]] = defaultdict(set)
    for code, program_id in db.execute(select(ProgramModule.module_code, ProgramModule.program_id)).all():
        used_by[code].add(program_id)

    rows: list[dict[str, Any]] = []
    missing_rows: list[dict[str, Any]] = []
    counts: Counter[str] = Counter()
    applied = 0
    for module in db.scalars(select(Module).order_by(Module.code)).all():
        seed_name = seed.get(normalize_vi(module.name), "")
        reference = module.name_en or ""
        outline_name = _tidy_en(outline.get(module.code, ""), reference)
        master_name = _tidy_en(master.get(module.code, ""), reference)
        candidates = [
            (outline_name, "outline"),
            (master_name, "master_data"),
            (excel.get(module.code, ""), "catalog"),
            (seed_name, "seed_table"),
        ]
        proposal, proposal_source = next(((name, source) for name, source in candidates if name), ("", ""))
        if not proposal:
            conclusion = "khong_co_nguon"
        elif not module.name_en:
            conclusion = "db_thieu_co_nguon"
        elif module.name_en == proposal:
            conclusion = "khop"
        elif _normalize_en(module.name_en) == _normalize_en(proposal):
            conclusion = "khac_chi_hoa_thuong"
        else:
            conclusion = "khac_noi_dung"
        counts[conclusion] += 1
        rows.append({
            "module_code": module.code,
            "name_vi": module.name,
            "name_en_db": module.name_en or "",
            "name_en_source_db": module.name_en_source or "",
            "name_en_outline": outline_name,
            "name_en_master": master_name,
            "name_en_excel": excel.get(module.code, ""),
            "name_en_seed": seed_name,
            "kết_luận": conclusion,
            "name_en_de_xuat": proposal,
            "nguon_de_xuat": proposal_source,
        })
        # Chủ dự án (23/11): khác nội dung thì lấy theo đề cương gốc; môn không có đề cương lấy Master_data.
        overwrite_by_source = conclusion == "khac_noi_dung" and proposal_source in {"outline", "master_data"}
        if apply_names and (conclusion in {"db_thieu_co_nguon", "khac_chi_hoa_thuong"} or overwrite_by_source):
            module.name_en = proposal
            module.name_en_source = proposal_source
            module.search_text = normalize_search(f"{module.code} {module.name} {proposal} {module.faculty or ''} {module.department or ''}")
            applied += 1
        if not module.name_en and not proposal:
            missing_rows.append({
                "module_code": module.code,
                "name_vi": module.name,
                "chương_trình_khóa": ";".join(sorted(used_by.get(module.code, set()))),
                "chu_du_an_dien": "",
            })
    if apply_names:
        db.commit()

    audit_path = processed_dir / "english_name_audit.csv"
    missing_path = processed_dir / "english_name_missing.csv"
    _write_csv(audit_path, ["module_code", "name_vi", "name_en_db", "name_en_source_db", "name_en_outline", "name_en_master", "name_en_excel", "name_en_seed", "kết_luận", "name_en_de_xuat", "nguon_de_xuat"], rows)
    _write_csv(missing_path, ["module_code", "name_vi", "chương_trình_khóa", "chu_du_an_dien"], missing_rows)
    return {"modules": len(rows), "conclusions": dict(counts), "applied": applied, "missing": len(missing_rows), "audit": str(audit_path), "missing_csv": str(missing_path)}


def run_x6_audit(
    db: Session,
    *,
    processed_dir: Path,
    missing_2023_csv: Path | None = None,
    master_file: Path | None = None,
    seed_file: Path = SEED_TSV,
    apply_names: bool = False,
) -> dict[str, Any]:
    return {
        "outline_gap": build_outline_gap(db, processed_dir=processed_dir, missing_2023_csv=missing_2023_csv),
        "english_names": build_english_name_audit(db, processed_dir=processed_dir, master_file=master_file, seed_file=seed_file, apply_names=apply_names),
    }
