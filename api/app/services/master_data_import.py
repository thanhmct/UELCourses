"""Nạp Master_data.xlsx: khoa/bộ môn, hình thức đánh giá, link đề cương, giáo trình (Brief D4).

Thứ tự nguồn khoa/bộ môn (chủ dự án chốt 2026-11-22):
  1. api/seed/faculty_overrides.tsv — chỉ định tay, không ghi đè;
  2. Master_data.xlsx sheet Data_Course (cột Khoa/Tên Khoa-BM) — nguồn CAO NHẤT cho khoa/bộ môn,
     ô nào là #N/A hoặc trống thì GIỮ NGUYÊN giá trị hiện tại trong DB;
  3. Đề cương của chính môn;
  4. Đề cương của bản tương ứng Anh-Việt;
  5. Tiền tố mã học phần (prefix_to_faculty.tsv);
  6. Giữ nguyên giá trị cũ trong DB.

Quy tắc kèm theo:
  - Bộ môn Ngoại ngữ thuộc Phòng Bảo đảm chất lượng (khoa = Phòng Bảo đảm chất lượng).
  - Mâu thuẫn Master vs đề cương: theo Master và xuất data/processed/module_faculty_conflicts.csv.
  - Master_data áp dụng cho khóa 2025 và 2026.
"""

from __future__ import annotations

import csv
from datetime import datetime, timezone
from pathlib import Path
import re
from typing import Any

import openpyxl
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Module, ModuleAssessment, ModuleTextbook, OutlineCourse, OutlineModuleLink
from app.services.faculty_names import (
    CANONICAL_FACULTIES_VI,
    canonical_faculty_vi,
    clean_raw_text,
    load_faculty_overrides,
    normalize_department,
)
from app.services.language import classify_languages
from app.services.legacy import skip_legacy_code
from app.services.text import normalize_search
from app.services.module_name_overrides import MODULE_NAME_OVERRIDES

_REPO_ROOT = Path(__file__).resolve().parents[3]
_API_DIR = Path(__file__).resolve().parents[2]
_DATA_DIR = (_REPO_ROOT / "data") if (_REPO_ROOT / "data").exists() else (_API_DIR / "data")

DEFAULT_MASTER_DATA_FILE = _DATA_DIR / "raw" / "Master_data.xlsx"
DEFAULT_CONFLICTS_CSV = _DATA_DIR / "processed" / "module_faculty_conflicts.csv"
DEFAULT_PREVIEW_CSV = _DATA_DIR / "processed" / "master_import_preview.csv"

# Bảng ánh xạ mặc định bộ môn -> khoa chuẩn của UEL
DEPARTMENT_TO_FACULTY: dict[str, str] = {
    # Khoa Quản trị kinh doanh
    "quản trị": "Khoa Quản trị kinh doanh",
    "bộ môn quản trị": "Khoa Quản trị kinh doanh",
    "marketing": "Khoa Quản trị kinh doanh",
    "bộ môn marketing": "Khoa Quản trị kinh doanh",
    "quản lý công": "Khoa Quản trị kinh doanh",
    "bộ môn quản lý công": "Khoa Quản trị kinh doanh",
    # Khoa Hệ thống thông tin
    "hệ thống thông tin quản lý": "Khoa Hệ thống thông tin",
    "bộ môn hệ thống thông tin quản lý": "Khoa Hệ thống thông tin",
    "thương mại điện tử": "Khoa Hệ thống thông tin",
    "bộ môn thương mại điện tử": "Khoa Hệ thống thông tin",
    "phân tích dữ liệu": "Khoa Hệ thống thông tin",
    "bộ môn phân tích dữ liệu": "Khoa Hệ thống thông tin",
    # Khoa Tài chính - Ngân hàng
    "tài chính": "Khoa Tài chính - Ngân hàng",
    "bộ môn tài chính": "Khoa Tài chính - Ngân hàng",
    "ngân hàng": "Khoa Tài chính - Ngân hàng",
    "bộ môn ngân hàng": "Khoa Tài chính - Ngân hàng",
    "công nghệ tài chính": "Khoa Tài chính - Ngân hàng",
    "bộ môn công nghệ tài chính": "Khoa Tài chính - Ngân hàng",
    # Khoa Kế toán - Kiểm toán
    "kế toán": "Khoa Kế toán - Kiểm toán",
    "bộ môn kế toán": "Khoa Kế toán - Kiểm toán",
    "kiểm toán": "Khoa Kế toán - Kiểm toán",
    "bộ môn kiểm toán": "Khoa Kế toán - Kiểm toán",
    # Khoa Kinh tế
    "kinh tế học": "Khoa Kinh tế",
    "bộ môn kinh tế học": "Khoa Kinh tế",
    "kinh tế và quản lý công": "Khoa Kinh tế",
    "bộ môn kinh tế và quản lý công": "Khoa Kinh tế",
    # Khoa Kinh tế đối ngoại
    "kinh tế quốc tế": "Khoa Kinh tế đối ngoại",
    "bộ môn kinh tế quốc tế": "Khoa Kinh tế đối ngoại",
    "thương mại quốc tế": "Khoa Kinh tế đối ngoại",
    "bộ môn thương mại quốc tế": "Khoa Kinh tế đối ngoại",
    "kinh doanh quốc tế": "Khoa Kinh tế đối ngoại",
    "bộ môn kinh doanh quốc tế": "Khoa Kinh tế đối ngoại",
    # Khoa Toán kinh tế
    "toán kinh tế": "Khoa Toán kinh tế",
    "bộ môn toán kinh tế": "Khoa Toán kinh tế",
    "toán tài chính": "Khoa Toán kinh tế",
    "bộ môn toán tài chính": "Khoa Toán kinh tế",
    # Khoa Luật
    "luật dân sự": "Khoa Luật",
    "bộ môn luật dân sự": "Khoa Luật",
    "luật hành chính - nhà nước": "Khoa Luật",
    "bộ môn luật hành chính - nhà nước": "Khoa Luật",
    "luật quốc tế": "Khoa Luật",
    "bộ môn luật quốc tế": "Khoa Luật",
    # Khoa Luật Kinh tế
    "luật kinh doanh": "Khoa Luật Kinh tế",
    "bộ môn luật kinh doanh": "Khoa Luật Kinh tế",
    "luật tài chính - ngân hàng": "Khoa Luật Kinh tế",
    "bộ môn luật tài chính - ngân hàng": "Khoa Luật Kinh tế",
    "luật thương mại quốc tế": "Khoa Luật Kinh tế",
    "bộ môn luật thương mại quốc tế": "Khoa Luật Kinh tế",
    # Phòng Bảo đảm chất lượng
    "ngoại ngữ": "Phòng Bảo đảm chất lượng",
    "bộ môn ngoại ngữ": "Phòng Bảo đảm chất lượng",
}


def normalize_final_assessment(form: str | None) -> str | None:
    """Chuẩn hóa hình thức thi cuối kỳ về 6 nhóm chuẩn (đồng bộ với finalAssessment.ts):
    'Thi viết' | 'Thi trắc nghiệm' | 'Vấn đáp' | 'Đồ án' | 'Tiểu luận' | 'Thi' | 'Khác'.
    """
    if not form or not isinstance(form, str):
        return None
    s = form.strip().lower()
    if not s:
        return None

    # 1. Đồ án: project, dự án, đồ án, capstone, tiểu luận lớn
    if any(k in s for k in ("tiểu luận lớn", "tieu luan lon", "đồ án", "do an", "project", "dự án", "capstone")):
        return "Đồ án"

    # 2. Tiểu luận: essay, report, báo cáo, tiểu luận
    if any(k in s for k in ("tiểu luận", "tieu luan", "essay", "report", "báo cáo", "bao cao")):
        return "Tiểu luận"

    # 3. Thi trắc nghiệm: trắc nghiệm, multiple choice, mcq
    if any(k in s for k in ("trắc nghiệm", "trac nghiem", "multiple choice", "mcq")):
        return "Thi trắc nghiệm"

    # 4. Vấn đáp: vấn đáp, oral, phỏng vấn
    if any(k in s for k in ("vấn đáp", "van dap", "oral", "phỏng vấn")):
        return "Vấn đáp"

    # 5. Thi viết: tự luận, thi viết, written, bút thi
    if any(k in s for k in ("tự luận", "tu luan", "thi viết", "thi viet", "written", "bút thi")):
        return "Thi viết"

    # 6. Generic Thi: thi, exam, test, bài thi, hình thức thi
    if any(k in s for k in ("exam", "test", "thi", "bài thi", "hình thức thi")):
        return "Thi"

    return "Khác"


def parse_ratio(val: Any) -> float | None:
    """Chuyển đổi tỉ lệ điểm (phần trăm hoặc số thập phân) sang float từ 0.0 đến 1.0."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        f = float(val)
        return f / 100.0 if f > 1.0 else f
    if isinstance(val, str):
        s = val.strip().rstrip("%").strip()
        if not s:
            return None
        try:
            f = float(s)
            return f / 100.0 if f > 1.0 else f
        except ValueError:
            return None
    return None


def _is_invalid_excel_value(val: Any) -> bool:
    """Kiểm tra ô Excel có phải là giá trị lỗi (#N/A, #VALUE!, #REF!) hoặc rỗng."""
    if val is None:
        return True
    s = str(val).strip()
    if not s or s.startswith("#"):
        return True
    return False


def _clean_master_affiliation(value: Any) -> str:
    if _is_invalid_excel_value(value):
        return ""
    name = str(value).strip()
    if normalize_search(name) in {"n/a", "chua ro", "chua ro khoa", "khoa chua ro", "bo mon chua ro"}:
        return ""
    return name


def load_department_faculty_lookup(wb: openpyxl.Workbook) -> dict[str, str]:
    """Trích xuất bảng tra cứu bộ môn -> khoa từ Sheet7 (nếu có trong Master_data.xlsx)."""
    dept_map = dict(DEPARTMENT_TO_FACULTY)
    for sheet_name in wb.sheetnames:
        if "sheet7" in sheet_name.lower():
            ws = wb[sheet_name]
            # Quét các hàng từ hàng 2 đến hàng 120, tìm các cột bộ môn và khoa
            for row in ws.iter_rows(min_row=2, max_row=120, values_only=True):
                # Thử cặp cột N, O (index 13, 14) theo công thức $N$2:$O$32
                if len(row) > 14:
                    col_n = str(row[13] or "").strip()
                    col_o = str(row[14] or "").strip()
                    if col_n and col_o and not col_n.startswith("#") and not col_o.startswith("#"):
                        canon_fac = canonical_faculty_vi(col_o)
                        if canon_fac:
                            clean_k = col_n.lower().strip()
                            dept_map[clean_k] = canon_fac
                            if clean_k.startswith("bộ môn "):
                                dept_map[clean_k[len("bộ môn "):].strip()] = canon_fac
                # Thử quét bất kỳ 2 ô kề nhau có dạng 'Bộ môn X' và 'Khoa Y'
                for i in range(len(row) - 1):
                    c1 = str(row[i] or "").strip()
                    c2 = str(row[i + 1] or "").strip()
                    if c1.lower().startswith("bộ môn") and c2:
                        canon_fac = canonical_faculty_vi(c2)
                        if canon_fac:
                            clean_k = c1.lower().strip()
                            dept_map[clean_k] = canon_fac
                            dept_map[clean_k[len("bộ môn "):].strip()] = canon_fac
            break
    return dept_map


def infer_faculty_from_dept(dept_str: str | None, dept_map: dict[str, str]) -> str | None:
    """Suy khoa từ Tên Khoa / BM khi cột Khoa là #N/A hoặc trống."""
    if not dept_str or not isinstance(dept_str, str):
        return None
    s = dept_str.strip()
    if not s or _is_invalid_excel_value(s):
        return None

    # Quy tắc đặc thù: Bộ môn Ngoại ngữ thuộc Phòng Bảo đảm chất lượng
    if "ngoại ngữ" in s.lower() or "foreign language" in s.lower():
        return "Phòng Bảo đảm chất lượng"

    # Nếu chuỗi bắt đầu bằng 'Khoa '
    if s.lower().startswith("khoa "):
        canon = canonical_faculty_vi(s)
        if canon:
            return canon

    # Nếu chuỗi bắt đầu bằng 'Bộ môn ' hoặc là tên bộ môn
    norm_k = s.lower().strip()
    if norm_k in dept_map:
        return dept_map[norm_k]
    if norm_k.startswith("bộ môn "):
        core = norm_k[len("bộ môn "):].strip()
        if core in dept_map:
            return dept_map[core]

    # Thử bóc tách và tra cứu theo chuẩn hóa
    norm_d = normalize_department(s)
    if norm_d:
        dk = norm_d.lower().strip()
        if dk in dept_map:
            return dept_map[dk]
        if dk.startswith("bộ môn "):
            core = dk[len("bộ môn "):].strip()
            if core in dept_map:
                return dept_map[core]

    return None


def resolve_master_course_faculty(
    dept_raw: Any,
    khoa_raw: Any,
    dept_map: dict[str, str],
) -> tuple[str | None, str | None]:
    """Xác định khoa và bộ môn từ dòng Data_Course.

    Trả về (faculty_chuẩn, department_chuẩn).
    Nếu cột Khoa là #N/A hoặc trống thì suy từ Tên Khoa / BM.
    Nếu vẫn không ra thì trả về None ở khoa.
    """
    clean_dept_raw = _clean_master_affiliation(dept_raw)
    clean_khoa_raw = _clean_master_affiliation(khoa_raw)

    # Bộ môn chuẩn hóa
    dept_chuẩn = normalize_department(clean_dept_raw) if clean_dept_raw else None
    if not dept_chuẩn and clean_dept_raw.lower().startswith("bộ môn"):
        dept_chuẩn = clean_dept_raw

    # Quy tắc đặc thù: Bộ môn Ngoại ngữ thuộc Phòng Bảo đảm chất lượng
    if (clean_dept_raw and "ngoại ngữ" in clean_dept_raw.lower()) or (dept_chuẩn and "ngoại ngữ" in dept_chuẩn.lower()):
        return "Phòng Bảo đảm chất lượng", "Bộ môn Ngoại ngữ"

    fac_chuẩn: str | None = None
    if clean_khoa_raw:
        fac_chuẩn = canonical_faculty_vi(clean_khoa_raw)
        if not fac_chuẩn and clean_khoa_raw in CANONICAL_FACULTIES_VI:
            fac_chuẩn = clean_khoa_raw

    if not fac_chuẩn and clean_dept_raw:
        fac_chuẩn = infer_faculty_from_dept(clean_dept_raw, dept_map)

    return fac_chuẩn, dept_chuẩn


def load_master_data_courses(file_path: Path | str | None = None) -> dict[str, dict]:
    """Đọc sheet Data_Course từ Master_data.xlsx và trả về dict[code, dict]."""
    raw_dir = get_settings().raw_data_dir
    default_path = Path(raw_dir) / DEFAULT_MASTER_DATA_FILE.name if raw_dir else DEFAULT_MASTER_DATA_FILE
    p = Path(file_path) if file_path else default_path
    if not p.exists():
        return {}

    wb = openpyxl.load_workbook(str(p), data_only=True)
    dept_map = load_department_faculty_lookup(wb)

    sheet_name = None
    for s in wb.sheetnames:
        if s.lower() == "data_course":
            sheet_name = s
            break
    if not sheet_name:
        wb.close()
        return {}

    ws = wb[sheet_name]
    header_row = [cell for cell in next(ws.iter_rows(min_row=1, max_row=1, values_only=True))]
    header_map = {str(h).strip().lower(): idx for idx, h in enumerate(header_row) if h}

    col_code = header_map.get("mã môn", 0)
    col_name = header_map.get("tên môn", 1)
    col_name_en = header_map.get("tên tiếng anh", 2)
    col_dept = header_map.get("tên khoa / bm", 4)
    col_lecturer = header_map.get("gv phụ trách", 5)
    col_khoa = header_map.get("khoa", 6)

    courses: dict[str, dict] = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or len(row) <= col_code or not row[col_code]:
            continue
        c_code = str(row[col_code]).strip().upper()
        if not c_code or _is_invalid_excel_value(c_code):
            continue
        if skip_legacy_code(c_code):  # mã hệ cũ 4 ký tự (AA01, KT99…): dự án đã bỏ từ 21/11, không nạp lại
            continue

        c_name =str(row[col_name]).strip() if len(row) > col_name and row[col_name] else ""
        c_name_en = str(row[col_name_en]).strip() if len(row) > col_name_en and row[col_name_en] and not _is_invalid_excel_value(row[col_name_en]) else None
        dept_raw = row[col_dept] if len(row) > col_dept else None
        khoa_raw = row[col_khoa] if len(row) > col_khoa else None
        lecturer = str(row[col_lecturer]).strip() if len(row) > col_lecturer and row[col_lecturer] and not _is_invalid_excel_value(row[col_lecturer]) else None

        fac_chuẩn, dept_chuẩn = resolve_master_course_faculty(dept_raw, khoa_raw, dept_map)

        courses[c_code] = {
            "code": c_code,
            "name": c_name,
            "name_en": c_name_en,
            "faculty": fac_chuẩn,
            "department": dept_chuẩn,
            "head_lecturer": lecturer,
            "raw_dept": dept_raw,
            "raw_khoa": khoa_raw,
        }

    wb.close()
    return courses


def master_course_affiliation(course: dict) -> tuple[str | None, str | None]:
    """Trả về các giá trị có thể ghi từ các ô tương ứng của Data_Course."""
    faculty = _clean_master_affiliation(course.get("faculty")) or None
    department = _clean_master_affiliation(course.get("department")) or None
    if "raw_khoa" in course and not _clean_master_affiliation(course["raw_khoa"]):
        faculty = None
    if "raw_dept" in course and not _clean_master_affiliation(course["raw_dept"]):
        department = None
    return faculty, department


def write_faculty_conflicts_csv(conflicts: list[dict], out_path: Path | str | None = None) -> str:
    """Ghi danh sách mâu thuẫn giữa Master_data và đề cương ra file CSV (Brief D4)."""
    p = Path(out_path) if out_path else DEFAULT_CONFLICTS_CSV
    p.parent.mkdir(parents=True, exist_ok=True)
    cols = [
        "code",
        "name",
        "faculty_master",
        "faculty_outline",
        "department_master",
        "department_outline",
        "ghi_chu",
    ]
    with p.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        writer.writeheader()
        for c in conflicts:
            writer.writerow({k: (c.get(k) or "") for k in cols})
    return str(p)


def _read_sheet1(wb: openpyxl.Workbook) -> dict[str, dict]:
    sheet1_name = next((s for s in wb.sheetnames if s.lower() == "sheet1"), None)
    assessments_by_code: dict[str, dict] = {}
    if sheet1_name:
        ws_sheet1 = wb[sheet1_name]
        header_s1 = [cell for cell in next(ws_sheet1.iter_rows(min_row=1, max_row=1, values_only=True))]
        header_map_s1 = {str(h).strip().lower(): idx for idx, h in enumerate(header_s1) if h}

        col_s1_code = header_map_s1.get("mã học phần", 0)
        col_s1_credits = header_map_s1.get("số tín chỉ", 2)
        col_s1_qt_ratio = header_map_s1.get("quá trình_tỉ lệ điểm", 3)
        col_s1_qt_form = header_map_s1.get("quá trình_hình thức", 4)
        col_s1_gk_ratio = header_map_s1.get("giữa kỳ_tỉ lệ điểm", 5)
        col_s1_gk_form = header_map_s1.get("giữa kỳ_hình thức", 6)
        col_s1_ck_ratio = header_map_s1.get("cuối kỳ_tỉ lệ điểm", 7)
        col_s1_ck_form = header_map_s1.get("cuối kỳ_hình thức", 8)
        col_s1_nc_ratio = header_map_s1.get("nâng cao_tỉ lệ điểm", 9)
        col_s1_nc_form = header_map_s1.get("nâng cao_hình thức", 10)
        col_s1_exam_type = header_map_s1.get("loại thi", 11)
        col_s1_exam_dur = header_map_s1.get("thời lượng thi", 12)
        col_s1_textbook = header_map_s1.get("tài liệu chính", 13)
        col_s1_outline_url = header_map_s1.get("link đề cương", 14)
        col_s1_doc_url = header_map_s1.get("link tài liệu", 15)
        col_s1_doc_code = header_map_s1.get("mã tài liệu", header_map_s1.get("mã tài liệu_hiển thị ctdt", 16))
        col_s1_note = header_map_s1.get("ghi chú", 17)
        col_s1_lecturer = header_map_s1.get("gv phụ trách", 20)

        for row in ws_sheet1.iter_rows(min_row=2, values_only=True):
            if not row or len(row) <= col_s1_code or not row[col_s1_code]:
                continue
            s1_code = str(row[col_s1_code]).strip().upper()
            if not s1_code or _is_invalid_excel_value(s1_code):
                continue

            # Tín chỉ
            cred_val = None
            if len(row) > col_s1_credits and row[col_s1_credits] is not None and not _is_invalid_excel_value(row[col_s1_credits]):
                try:
                    cred_val = int(float(row[col_s1_credits]))
                except (ValueError, TypeError):
                    cred_val = None

            # Đánh giá
            qt_ratio = parse_ratio(row[col_s1_qt_ratio]) if len(row) > col_s1_qt_ratio else None
            qt_form = str(row[col_s1_qt_form]).strip() if len(row) > col_s1_qt_form and row[col_s1_qt_form] and not _is_invalid_excel_value(row[col_s1_qt_form]) else None
            gk_ratio = parse_ratio(row[col_s1_gk_ratio]) if len(row) > col_s1_gk_ratio else None
            gk_form = str(row[col_s1_gk_form]).strip() if len(row) > col_s1_gk_form and row[col_s1_gk_form] and not _is_invalid_excel_value(row[col_s1_gk_form]) else None
            ck_ratio = parse_ratio(row[col_s1_ck_ratio]) if len(row) > col_s1_ck_ratio else None
            ck_form = str(row[col_s1_ck_form]).strip() if len(row) > col_s1_ck_form and row[col_s1_ck_form] and not _is_invalid_excel_value(row[col_s1_ck_form]) else None
            nc_ratio = parse_ratio(row[col_s1_nc_ratio]) if len(row) > col_s1_nc_ratio else None
            nc_form = str(row[col_s1_nc_form]).strip() if len(row) > col_s1_nc_form and row[col_s1_nc_form] and not _is_invalid_excel_value(row[col_s1_nc_form]) else None
            exam_type = str(row[col_s1_exam_type]).strip() if len(row) > col_s1_exam_type and row[col_s1_exam_type] and not _is_invalid_excel_value(row[col_s1_exam_type]) else None
            exam_dur = str(row[col_s1_exam_dur]).strip() if len(row) > col_s1_exam_dur and row[col_s1_exam_dur] and not _is_invalid_excel_value(row[col_s1_exam_dur]) else None

            # Tài liệu & Link đề cương
            tb_name = str(row[col_s1_textbook]).strip() if len(row) > col_s1_textbook and row[col_s1_textbook] and not _is_invalid_excel_value(row[col_s1_textbook]) else None
            outline_url = str(row[col_s1_outline_url]).strip() if len(row) > col_s1_outline_url and row[col_s1_outline_url] and not _is_invalid_excel_value(row[col_s1_outline_url]) else None
            doc_url = str(row[col_s1_doc_url]).strip() if len(row) > col_s1_doc_url and row[col_s1_doc_url] and not _is_invalid_excel_value(row[col_s1_doc_url]) else None
            doc_code = str(row[col_s1_doc_code]).strip() if len(row) > col_s1_doc_code and row[col_s1_doc_code] and not _is_invalid_excel_value(row[col_s1_doc_code]) else None
            note = str(row[col_s1_note]).strip() if len(row) > col_s1_note and row[col_s1_note] and not _is_invalid_excel_value(row[col_s1_note]) else None
            lecturer = str(row[col_s1_lecturer]).strip() if len(row) > col_s1_lecturer and row[col_s1_lecturer] and not _is_invalid_excel_value(row[col_s1_lecturer]) else None

            final_kind = normalize_final_assessment(ck_form)

            assessments_by_code[s1_code] = {
                "credits": cred_val,
                "process_ratio": qt_ratio,
                "process_form": qt_form,
                "midterm_ratio": gk_ratio,
                "midterm_form": gk_form,
                "final_ratio": ck_ratio,
                "final_form": ck_form,
                "advanced_ratio": nc_ratio,
                "advanced_form": nc_form,
                "exam_type": exam_type,
                "exam_duration": exam_dur,
                "final_assessment_kind": final_kind,
                "textbook_name": tb_name,
                "outline_url": outline_url if (outline_url and outline_url.startswith("http")) else None,
                "document_url": doc_url if (doc_url and doc_url.startswith("http")) else None,
                "document_code": doc_code,
                "note": note,
                "head_lecturer": lecturer,
            }

    return assessments_by_code


def import_master_module_details(db: Session, file_path: Path | str, *, dry_run: bool = False) -> dict[str, Any]:
    """Synchronize assessment and textbook records for existing module codes."""
    workbook = openpyxl.load_workbook(file_path, data_only=True, read_only=True)
    try:
        records = _read_sheet1(workbook)
    finally:
        workbook.close()

    assessment_fields = (
        "process_ratio", "process_form", "midterm_ratio", "midterm_form",
        "final_ratio", "final_form", "advanced_ratio", "advanced_form",
        "exam_type", "exam_duration", "final_assessment_kind",
    )
    # Limit queries and writes to the columns and tables this import manages.
    modules = dict(db.execute(select(Module.code, Module.final_assessment)).all())
    assessments = {row.module_code: row for row in db.scalars(select(ModuleAssessment))}
    textbooks = {}
    for row in db.scalars(select(ModuleTextbook).where(ModuleTextbook.is_main.is_(True)).order_by(ModuleTextbook.id)):
        textbooks.setdefault(row.module_code, row)
    updated_assessments = updated_textbooks = 0

    for code in sorted(modules.keys() & records.keys()):
        record = records[code]
        values = {field: record[field] for field in assessment_fields if record[field] is not None}
        if values:
            assessment = assessments.get(code)
            kind = values.get("final_assessment_kind")
            changed_kind = kind is not None and kind != modules[code]
            changed_assessment = assessment is None or any(getattr(assessment, field) != value for field, value in values.items())
            if changed_kind or changed_assessment:
                updated_assessments += 1
                if not dry_run:
                    if assessment is None:
                        db.add(ModuleAssessment(module_code=code, source="master_data", **values))
                    else:
                        for field, value in values.items():
                            setattr(assessment, field, value)
                        assessment.source = "master_data"
                    if changed_kind:
                        db.execute(Module.__table__.update().where(Module.code == code).values(final_assessment=kind))

        material = {
            "name": record["textbook_name"], "url": record["document_url"], "document_code": record["document_code"],
        }
        material = {field: value for field, value in material.items() if value}
        if material:
            textbook = textbooks.get(code)
            if textbook is None or any(getattr(textbook, field) != value for field, value in material.items()):
                updated_textbooks += 1
                if not dry_run:
                    if textbook is None:
                        db.add(ModuleTextbook(module_code=code, is_main=True, **material))
                    else:
                        for field, value in material.items():
                            setattr(textbook, field, value)

    if not dry_run:
        db.commit()
    return {"status": "ok", "dry_run": dry_run, "assessment_updates": updated_assessments, "textbook_updates": updated_textbooks}


def import_master_data(
    db: Session,
    file_path: Path | str | None = None,
    *,
    dry_run: bool = False,
    preview_out: Path | str | None = None,
    conflicts_out: Path | str | None = None,
) -> dict[str, Any]:
    """Lệnh import-master-data: nạp toàn bộ học phần, khoa/bộ môn, đánh giá, link đề cương, giáo trình từ Master_data.xlsx.

    Idempotent. Khi dry_run=True, không sửa DB mà xuất master_import_preview.csv.
    """
    p = Path(file_path) if file_path else DEFAULT_MASTER_DATA_FILE
    if not p.exists():
        raise FileNotFoundError(f"Không tìm thấy file Master_data tại: {p}")

    wb = openpyxl.load_workbook(str(p), data_only=True)
    dept_map = load_department_faculty_lookup(wb)
    overrides = load_faculty_overrides()

    # 1. Đọc sheet Data_Course (2971 mã môn)
    sheet_course_name = next((s for s in wb.sheetnames if s.lower() == "data_course"), None)
    if not sheet_course_name:
        wb.close()
        raise ValueError(f"File {p.name} không có sheet 'Data_Course'!")

    ws_course = wb[sheet_course_name]
    header_course = [cell for cell in next(ws_course.iter_rows(min_row=1, max_row=1, values_only=True))]
    header_map_c = {str(h).strip().lower(): idx for idx, h in enumerate(header_course) if h}

    col_code = header_map_c.get("mã môn", 0)
    col_name = header_map_c.get("tên môn", 1)
    col_name_en = header_map_c.get("tên tiếng anh", 2)
    col_dept = header_map_c.get("tên khoa / bm", 4)
    col_lecturer = header_map_c.get("gv phụ trách", 5)
    col_khoa = header_map_c.get("khoa", 6)

    master_courses: dict[str, dict] = {}
    for row in ws_course.iter_rows(min_row=2, values_only=True):
        if not row or len(row) <= col_code or not row[col_code]:
            continue
        c_code = str(row[col_code]).strip().upper()
        if not c_code or _is_invalid_excel_value(c_code):
            continue
        if skip_legacy_code(c_code):  # mã hệ cũ 4 ký tự (AA01, KT99…): dự án đã bỏ từ 21/11, không nạp lại
            continue

        c_name =str(row[col_name]).strip() if len(row) > col_name and row[col_name] else ""
        c_name_en = str(row[col_name_en]).strip() if len(row) > col_name_en and row[col_name_en] and not _is_invalid_excel_value(row[col_name_en]) else None
        dept_raw = row[col_dept] if len(row) > col_dept else None
        khoa_raw = row[col_khoa] if len(row) > col_khoa else None
        lecturer = str(row[col_lecturer]).strip() if len(row) > col_lecturer and row[col_lecturer] and not _is_invalid_excel_value(row[col_lecturer]) else None

        fac_chuẩn, dept_chuẩn = resolve_master_course_faculty(dept_raw, khoa_raw, dept_map)

        master_courses[c_code] = {
            "code": c_code,
            "name": c_name,
            "name_en": c_name_en,
            # Chỉ ghi khoa khi cột Khoa có dữ liệu, kể cả khi có thể suy từ bộ môn.
            "faculty": fac_chuẩn if _clean_master_affiliation(khoa_raw) else None,
            "department": dept_chuẩn,
            "head_lecturer": lecturer,
        }

    assessments_by_code = _read_sheet1(wb)
    wb.close()

    # 3. Lấy dữ liệu đề cương để đối chiếu mâu thuẫn
    outline_courses = db.execute(
        select(
            OutlineCourse.course_code_norm,
            OutlineCourse.faculty,
            OutlineCourse.department,
        ).where(OutlineCourse.faculty.is_not(None))
    ).all()
    outline_fac_map: dict[str, tuple[str, str | None]] = {}
    for code_norm, f_raw, d_raw in outline_courses:
        if code_norm:
            c_norm = code_norm.strip().upper()
            cf = canonical_faculty_vi(clean_raw_text(f_raw))
            if cf:
                outline_fac_map[c_norm] = (cf, d_raw)

    # Thêm bản đề cương liên kết qua catalog entry
    link_courses = db.execute(
        select(
            OutlineModuleLink.module_code,
            OutlineCourse.faculty,
            OutlineCourse.department,
        )
        .join(OutlineCourse, OutlineCourse.document_id == OutlineModuleLink.document_id)
        .where(OutlineCourse.faculty.is_not(None))
    ).all()
    for m_code, f_raw, d_raw in link_courses:
        if m_code:
            c_norm = m_code.strip().upper()
            cf = canonical_faculty_vi(clean_raw_text(f_raw))
            if cf and c_norm not in outline_fac_map:
                outline_fac_map[c_norm] = (cf, d_raw)

    # 4. Truy vấn toàn bộ modules hiện có trong DB
    db_modules = {m.code: m for m in db.scalars(select(Module)).all()}
    db_module_codes = set(db_modules.keys())
    master_codes = set(master_courses.keys())
    missing_in_master_codes = sorted(db_module_codes - master_codes)

    conflicts: list[dict] = []
    preview_rows: list[dict] = []
    now = datetime.now(timezone.utc)
    created_count = 0
    updated_count = 0

    # 5. Xử lý từng môn trong Master_data
    for code, m_data in sorted(master_courses.items(), key=lambda kv: kv[0]):
        name = m_data["name"]
        name_en = m_data["name_en"]
        name_override = MODULE_NAME_OVERRIDES.get(code)
        if name_override:
            name, name_en = name_override
        fac_master = m_data["faculty"]
        dept_master = m_data["department"]
        head_lecturer = m_data["head_lecturer"]

        s1_info = assessments_by_code.get(code, {})
        cred = s1_info.get("credits")
        outline_url_s1 = s1_info.get("outline_url")
        tb_name = s1_info.get("textbook_name")
        doc_url = s1_info.get("document_url")
        doc_code = s1_info.get("document_code")
        tb_note = s1_info.get("note")
        final_assessment_kind = s1_info.get("final_assessment_kind")
        if not head_lecturer and s1_info.get("head_lecturer"):
            head_lecturer = s1_info.get("head_lecturer")

        target_fac = fac_master
        target_dept = dept_master
        source = "master_data" if target_fac else None
        if code in overrides:
            target_fac, override_dept, _ = overrides[code]
            target_dept = override_dept or target_dept
            source = "admin"
        elif fac_master and code in outline_fac_map:
            # Kiểm tra mâu thuẫn với đề cương
            out_fac, out_dept = outline_fac_map[code]
            if out_fac != fac_master:
                conflicts.append({
                    "code": code,
                    "name": name,
                    "faculty_master": fac_master,
                    "faculty_outline": out_fac,
                    "department_master": dept_master or "",
                    "department_outline": out_dept or "",
                    "ghi_chu": f"Master: {fac_master} vs Đề cương: {out_fac}",
                })

        m_existing = db_modules.get(code)
        if m_existing is None:
            # Tạo môn mới
            created_count += 1
            action = "create"
            final_fac = target_fac
            final_dept = target_dept
            final_src = source
            is_en = code.startswith("E") or (name and "(E)" in name)
            lang_track = "en" if is_en else "vi"

            if not dry_run:
                new_m = Module(
                    code=code,
                    name=name,
                    name_en=name_en,
                    name_en_source="master_data" if name_en and not name_override else None,
                    credits=cred,
                    faculty=final_fac,
                    department=final_dept,
                    faculty_source=final_src,
                    head_lecturer=head_lecturer,
                    final_assessment=final_assessment_kind,
                    outline_url=outline_url_s1,
                    is_english=is_en,
                    language_track=lang_track,
                    language_basis="code_pattern" if is_en else "default",
                    is_sample=False,
                    search_text=normalize_search(f"{code} {name} {name_en or ''} {final_fac or ''} {final_dept or ''}"),
                    updated_at=now,
                )
                db.add(new_m)
                db_modules[code] = new_m

                # Đánh giá & giáo trình
                if s1_info:
                    new_ass = ModuleAssessment(
                        module_code=code,
                        process_ratio=s1_info.get("process_ratio"),
                        process_form=s1_info.get("process_form"),
                        midterm_ratio=s1_info.get("midterm_ratio"),
                        midterm_form=s1_info.get("midterm_form"),
                        final_ratio=s1_info.get("final_ratio"),
                        final_form=s1_info.get("final_form"),
                        advanced_ratio=s1_info.get("advanced_ratio"),
                        advanced_form=s1_info.get("advanced_form"),
                        exam_type=s1_info.get("exam_type"),
                        exam_duration=s1_info.get("exam_duration"),
                        final_assessment_kind=final_assessment_kind,
                        source="master_data",
                        updated_at=now,
                    )
                    db.add(new_ass)

                    if tb_name or doc_url or doc_code:
                        new_tb = ModuleTextbook(
                            module_code=code,
                            name=tb_name,
                            url=doc_url,
                            document_code=doc_code,
                            note=tb_note,
                            is_main=True,
                        )
                        db.add(new_tb)
        else:
            # Cập nhật môn đã có
            action = "unchanged"
            is_changed = False
            old_fac = m_existing.faculty
            old_dept = m_existing.department

            # Không ghi đè môn có faculty_source='admin' trừ khi nằm trong overrides
            can_update_faculty = getattr(m_existing, "faculty_source", None) != "admin" or code in overrides
            if can_update_faculty and target_fac is not None and target_fac != m_existing.faculty:
                m_existing.faculty = target_fac
                m_existing.faculty_source = source
                is_changed = True
            if target_dept is not None and target_dept != m_existing.department:
                m_existing.department = target_dept
                is_changed = True

            if name_override and m_existing.name != name:
                m_existing.name = name
                is_changed = True
            if name_override and (m_existing.name_en != name_en or m_existing.name_en_source is not None):
                m_existing.name_en = name_en
                m_existing.name_en_source = None
                is_changed = True
            elif name_en and not m_existing.name_en:
                m_existing.name_en = name_en
                m_existing.name_en_source = "master_data"
                is_changed = True

            if head_lecturer and not m_existing.head_lecturer:
                m_existing.head_lecturer = head_lecturer
                is_changed = True

            if cred and m_existing.credits is None:
                m_existing.credits = cred
                is_changed = True

            if final_assessment_kind and m_existing.final_assessment != final_assessment_kind:
                m_existing.final_assessment = final_assessment_kind
                is_changed = True

            if outline_url_s1 and not m_existing.outline_url:
                m_existing.outline_url = outline_url_s1
                is_changed = True

            # Xử lý assessment
            if s1_info:
                if not m_existing.assessment:
                    if not dry_run:
                        new_ass = ModuleAssessment(
                            module_code=code,
                            process_ratio=s1_info.get("process_ratio"),
                            process_form=s1_info.get("process_form"),
                            midterm_ratio=s1_info.get("midterm_ratio"),
                            midterm_form=s1_info.get("midterm_form"),
                            final_ratio=s1_info.get("final_ratio"),
                            final_form=s1_info.get("final_form"),
                            advanced_ratio=s1_info.get("advanced_ratio"),
                            advanced_form=s1_info.get("advanced_form"),
                            exam_type=s1_info.get("exam_type"),
                            exam_duration=s1_info.get("exam_duration"),
                            final_assessment_kind=final_assessment_kind,
                            source="master_data",
                            updated_at=now,
                        )
                        db.add(new_ass)
                    is_changed = True
                else:
                    ass = m_existing.assessment
                    ass.process_ratio = s1_info.get("process_ratio")
                    ass.process_form = s1_info.get("process_form")
                    ass.midterm_ratio = s1_info.get("midterm_ratio")
                    ass.midterm_form = s1_info.get("midterm_form")
                    ass.final_ratio = s1_info.get("final_ratio")
                    ass.final_form = s1_info.get("final_form")
                    ass.advanced_ratio = s1_info.get("advanced_ratio")
                    ass.advanced_form = s1_info.get("advanced_form")
                    ass.exam_type = s1_info.get("exam_type")
                    ass.exam_duration = s1_info.get("exam_duration")
                    ass.final_assessment_kind = final_assessment_kind
                    ass.updated_at = now
                    is_changed = True

                # Xử lý textbooks
                if (tb_name or doc_url or doc_code) and not dry_run:
                    main_tb = next((t for t in m_existing.textbooks if t.is_main), None)
                    if not main_tb:
                        new_tb = ModuleTextbook(
                            module_code=code,
                            name=tb_name,
                            url=doc_url,
                            document_code=doc_code,
                            note=tb_note,
                            is_main=True,
                        )
                        db.add(new_tb)
                    else:
                        main_tb.name = tb_name
                        main_tb.url = doc_url
                        main_tb.document_code = doc_code
                        main_tb.note = tb_note

            if is_changed:
                updated_count += 1
                action = "update"
                if not dry_run:
                    m_existing.search_text = normalize_search(
                        f"{m_existing.code} {m_existing.name} {m_existing.name_en or ''} "
                        f"{m_existing.faculty or ''} {m_existing.department or ''}"
                    )
                    m_existing.updated_at = now

        preview_rows.append({
            "code": code,
            "name": name,
            "faculty": target_fac or (m_existing.faculty if m_existing else ""),
            "department": target_dept or (m_existing.department if m_existing else ""),
            "name_en": name_en or "",
            "credits": cred or (m_existing.credits if m_existing else ""),
            "final_assessment": final_assessment_kind or (m_existing.final_assessment if m_existing else ""),
            "action": action,
        })

    # Xuất file mâu thuẫn
    conflicts_csv_file = write_faculty_conflicts_csv(conflicts, conflicts_out)

    if dry_run:
        # Xuất file preview
        p_preview = Path(preview_out) if preview_out else DEFAULT_PREVIEW_CSV
        p_preview.parent.mkdir(parents=True, exist_ok=True)
        with p_preview.open("w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(
                f,
                fieldnames=["code", "name", "faculty", "department", "name_en", "credits", "final_assessment", "action"],
                extrasaction="ignore",
            )
            writer.writeheader()
            for r in preview_rows:
                writer.writerow(r)
        preview_csv_file = str(p_preview)
        db.rollback()
    else:
        preview_csv_file = None
        classify_languages(db)
        db.commit()

    # Thống kê độ phủ
    total_db_modules = db.scalar(select(func.count(Module.code))) or len(db_modules)
    with_fac = db.scalar(select(func.count(Module.code)).where(Module.faculty.is_not(None), Module.faculty != "")) or 0
    with_dept = db.scalar(select(func.count(Module.code)).where(Module.department.is_not(None), Module.department != "")) or 0
    with_name_en = db.scalar(select(func.count(Module.code)).where(Module.name_en.is_not(None), Module.name_en != "")) or 0
    with_outline_url = db.scalar(select(func.count(Module.code)).where(Module.outline_url.is_not(None), Module.outline_url != "")) or 0
    with_final_ass = db.scalar(select(func.count(Module.code)).where(Module.final_assessment.is_not(None), Module.final_assessment != "")) or 0

    return {
        "status": "ok",
        "dry_run": dry_run,
        "total_modules": total_db_modules,
        "created_modules": created_count,
        "updated_modules": updated_count,
        "applied_changes": 0 if dry_run else (created_count + updated_count),
        "modules_with_faculty": with_fac,
        "modules_with_department": with_dept,
        "modules_with_name_en": with_name_en,
        "modules_with_outline_url": with_outline_url,
        "modules_with_final_assessment": with_final_ass,
        "conflicts_count": len(conflicts),
        "conflicts_csv": conflicts_csv_file,
        "preview_csv": preview_csv_file,
        "missing_in_master_count": len(missing_in_master_codes),
        "missing_in_master_codes": missing_in_master_codes,
    }
