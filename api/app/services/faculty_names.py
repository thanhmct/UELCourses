"""Ánh xạ tên khoa, bộ môn tiếng Anh sang tiếng Việt và ngược lại.

Tài liệu hóa bảng ánh xạ trong `api/seed/faculty_names_en.tsv`.
Hỗ trợ chuẩn hóa chuỗi hoa/thường, bỏ tiền tố ("Faculty of", "Department of", "Khoa", "Bộ môn"),
xử lý ký tự gạch nối, dấu và.
"""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import Module, OutlineCourse, OutlineModuleLink
from app.services.text import normalize_search

SEED_FACULTY_TSV = Path(__file__).resolve().parents[2] / "seed" / "faculty_names_en.tsv"

_VI_CHARS = re.compile(r"[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]", re.I)

# Bảng tĩnh dự phòng (đồng bộ với web/src/i18n/names.ts)
STATIC_FACULTY_EN_TO_VI: dict[str, str] = {
    "Faculty of Business Administration": "Khoa Quản trị kinh doanh",
    "Faculty of Information Systems": "Khoa Hệ thống thông tin",
    "Faculty of Finance and Banking": "Khoa Tài chính - Ngân hàng",
    "Faculty of Finance & Banking": "Khoa Tài chính - Ngân hàng",
    "Faculty of Economics": "Khoa Kinh tế",
    "Faculty of Mathematical Economics": "Khoa Toán kinh tế",
    "Faculty of International Economic Relations": "Khoa Kinh tế đối ngoại",
    "Faculty of Accounting and Auditing": "Khoa Kế toán - Kiểm toán",
    "Faculty of Accounting & Auditing": "Khoa Kế toán - Kiểm toán",
    "Faculty of Law": "Khoa Luật",
    "School of Law": "Khoa Luật",
    "Faculty of Business Law": "Khoa Luật Kinh tế",
    "University of Economics and Law": "Trường Đại học Kinh tế - Luật",
    "Academic Affairs Office": "Phòng Đào tạo",
    "UEL International Institute": "Viện Quốc tế UEL",
    "Center for Foreign Languages and Informatics": "Trung tâm Ngoại ngữ - Tin học",
    "Department of Foreign Languages": "Bộ môn Ngoại ngữ",
}

STATIC_DEPARTMENT_EN_TO_VI: dict[str, str] = {
    "Department of Finance": "Bộ môn Tài chính",
    "Department of Marketing": "Bộ môn Marketing",
    "Department of Management": "Bộ môn Quản trị",
    "Department of Public Management": "Bộ môn Quản lý công",
    "Department of Data Analytics": "Bộ môn Phân tích dữ liệu",
    "Department of Management Information Systems": "Bộ môn Hệ thống thông tin quản lý",
    "Department of E-Commerce": "Bộ môn Thương mại điện tử",
    "Department of Auditing": "Bộ môn Kiểm toán",
    "Department of Economics": "Bộ môn Kinh tế học",
    "Department of International Business": "Bộ môn Kinh doanh quốc tế",
    "Department of Economics and Public Management": "Bộ môn Kinh tế và Quản lý công",
    "Department of International Economics": "Bộ môn Kinh tế quốc tế",
    "Department of Banking": "Bộ môn Ngân hàng",
    "Department of Mathematical Economics": "Bộ môn Toán kinh tế",
    "Department of International Commercial Law": "Bộ môn Luật Thương mại quốc tế",
    "Department of Accounting": "Bộ môn Kế toán",
    "Department of Financial and Banking Law": "Bộ môn Luật Tài chính - Ngân hàng",
    "Department of Business Law": "Bộ môn Luật Kinh doanh",
    "Department of Civil Law": "Bộ môn Luật Dân sự",
    "Department of Administrative and State Law": "Bộ môn Luật Hành chính - Nhà nước",
    "Department of Foreign Languages": "Bộ môn Ngoại ngữ",
}

STATIC_FACULTY_VI_TO_EN: dict[str, str] = {
    "quản trị kinh doanh": "Faculty of Business Administration",
    "hệ thống thông tin": "Faculty of Information Systems",
    "tài chính - ngân hàng": "Faculty of Finance and Banking",
    "kinh tế": "Faculty of Economics",
    "toán kinh tế": "Faculty of Mathematical Economics",
    "kinh tế đối ngoại": "Faculty of International Economic Relations",
    "kế toán - kiểm toán": "Faculty of Accounting and Auditing",
    "luật": "Faculty of Law",
    "luật kinh tế": "Faculty of Business Law",
    "trường đại học kinh tế - luật": "University of Economics and Law",
    "phòng đào tạo": "Academic Affairs Office",
    "viện quốc tế uel": "UEL International Institute",
    "trung tâm ngoại ngữ - tin học": "Center for Foreign Languages and Informatics",
    "bộ môn ngoại ngữ": "Department of Foreign Languages",
}

STATIC_DEPARTMENT_VI_TO_EN: dict[str, str] = {
    "tài chính": "Department of Finance",
    "marketing": "Department of Marketing",
    "quản trị": "Department of Management",
    "quản lý công": "Department of Public Management",
    "phân tích dữ liệu": "Department of Data Analytics",
    "hệ thống thông tin quản lý": "Department of Management Information Systems",
    "thương mại điện tử": "Department of E-Commerce",
    "kiểm toán": "Department of Auditing",
    "kinh tế học": "Department of Economics",
    "kinh doanh quốc tế": "Department of International Business",
    "kinh tế và quản lý công": "Department of Economics and Public Management",
    "kinh tế quốc tế": "Department of International Economics",
    "ngân hàng": "Department of Banking",
    "toán kinh tế": "Department of Mathematical Economics",
    "luật thương mại quốc tế": "Department of International Commercial Law",
    "kế toán": "Department of Accounting",
    "luật tài chính - ngân hàng": "Department of Financial and Banking Law",
    "luật kinh doanh": "Department of Business Law",
    "luật dân sự": "Department of Civil Law",
    "luật hành chính - nhà nước": "Department of Administrative and State Law",
    "ngoại ngữ": "Department of Foreign Languages",
}


def _norm_key(s: str) -> str:
    t = s.strip().replace("–", "-").replace("—", "-").replace("&", "and")
    t = re.sub(r"\s+", " ", t).lower()
    return t


def _load_tsv_maps(path: Path = SEED_FACULTY_TSV) -> tuple[dict[str, str], dict[str, str]]:
    en_to_vi: dict[str, str] = {}
    vi_to_en: dict[str, str] = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines()[1:]:
            parts = line.split("\t")
            if len(parts) >= 2:
                en = parts[0].strip()
                vi = parts[1].strip()
                if en and vi:
                    en_to_vi[_norm_key(en)] = vi
                    vi_to_en[_norm_key(vi)] = en
    # Gộp cùng static maps nếu TSV thiếu
    for k, v in STATIC_FACULTY_EN_TO_VI.items():
        en_to_vi.setdefault(_norm_key(k), v)
    for k, v in STATIC_DEPARTMENT_EN_TO_VI.items():
        en_to_vi.setdefault(_norm_key(k), v)
    return en_to_vi, vi_to_en


_EN_TO_VI, _VI_TO_EN = _load_tsv_maps()


def is_vietnamese(text: str | None) -> bool:
    if not text:
        return False
    return bool(_VI_CHARS.search(text))


def faculty_vi(en: str | None) -> str | None:
    """Chuyển tên khoa (hoặc bộ môn) tiếng Anh sang tên tiếng Việt chuẩn của UEL.

    Ví dụ: 'FACULTY OF FINANCE AND BANKING' -> 'Khoa Tài chính - Ngân hàng'.
    Nếu chuỗi đã là tiếng Việt có dấu, trả lại nguyên văn.
    """
    if not en or not en.strip():
        return None
    s = en.strip()
    if is_vietnamese(s):
        return s

    k = _norm_key(s)
    if k in _EN_TO_VI:
        return _EN_TO_VI[k]

    # Thử bỏ tiền tố "faculty of " hoặc "department of " hoặc "school of "
    k_noprefix = re.sub(r"^(faculty of|department of|school of)\s+", "", k)
    if k_noprefix in _EN_TO_VI:
        return _EN_TO_VI[k_noprefix]

    for en_key, vi_val in _EN_TO_VI.items():
        if k == en_key or k == re.sub(r"^(faculty of|department of|school of)\s+", "", en_key):
            return vi_val

    # Thử tra theo static maps
    for orig_en, vi_val in STATIC_FACULTY_EN_TO_VI.items():
        if _norm_key(orig_en) == k:
            return vi_val
    for orig_en, vi_val in STATIC_DEPARTMENT_EN_TO_VI.items():
        if _norm_key(orig_en) == k:
            return vi_val

    return None


def department_vi(en: str | None) -> str | None:
    """Chuyển tên bộ môn tiếng Anh sang tiếng Việt."""
    if not en or not en.strip():
        return None
    s = en.strip()
    if is_vietnamese(s):
        return s
    k = _norm_key(s)
    for orig_en, vi_val in STATIC_DEPARTMENT_EN_TO_VI.items():
        if _norm_key(orig_en) == k:
            return vi_val
    return faculty_vi(en)


def faculty_en(vi: str | None) -> str | None:
    """Chuyển tên khoa tiếng Việt sang tiếng Anh.

    Ví dụ: 'Khoa Tài chính - Ngân hàng' -> 'Faculty of Finance and Banking'.
    """
    if not vi or not vi.strip():
        return None
    s = vi.strip()
    if not is_vietnamese(s):
        # Đã là tiếng Anh (vd 'Faculty of Finance and Banking')
        k = _norm_key(s)
        for orig_en in STATIC_FACULTY_EN_TO_VI:
            if _norm_key(orig_en) == k:
                return orig_en
        for orig_en in STATIC_DEPARTMENT_EN_TO_VI:
            if _norm_key(orig_en) == k:
                return orig_en
        return s

    k = _norm_key(s)
    # Thử bỏ tiền tố "khoa ", "bộ môn ", "trường ", "viện "
    k_core = re.sub(r"^(khoa|bộ môn|trường|viện|phòng|trung tâm)\s+", "", k)
    if k_core in STATIC_FACULTY_VI_TO_EN:
        return STATIC_FACULTY_VI_TO_EN[k_core]
    if k in STATIC_FACULTY_VI_TO_EN:
        return STATIC_FACULTY_VI_TO_EN[k]
    if k_core in STATIC_DEPARTMENT_VI_TO_EN:
        return STATIC_DEPARTMENT_VI_TO_EN[k_core]
    if k in _VI_TO_EN:
        return _VI_TO_EN[k]
    if k_core in _VI_TO_EN:
        return _VI_TO_EN[k_core]

    return None


def department_en(vi: str | None) -> str | None:
    """Chuyển tên bộ môn tiếng Việt sang tiếng Anh."""
    if not vi or not vi.strip():
        return None
    s = vi.strip()
    if not is_vietnamese(s):
        k = _norm_key(s)
        for orig_en in STATIC_DEPARTMENT_EN_TO_VI:
            if _norm_key(orig_en) == k:
                return orig_en
        for orig_en in STATIC_FACULTY_EN_TO_VI:
            if _norm_key(orig_en) == k:
                return orig_en
        return s
    k = _norm_key(s)
    k_core = re.sub(r"^(bộ môn|khoa)\s+", "", k)
    if k_core in STATIC_DEPARTMENT_VI_TO_EN:
        return STATIC_DEPARTMENT_VI_TO_EN[k_core]
    if k in _VI_TO_EN:
        return _VI_TO_EN[k]
    if k_core in _VI_TO_EN:
        return _VI_TO_EN[k_core]
    return faculty_en(vi)


def fill_faculties(db: Session) -> dict[str, int]:
    """Điền modules.faculty và modules.department khi rỗng/không khớp.

    Nguồn:
      1. outline_courses.faculty / department (liên kết qua outline_module_links hoặc course_code_norm),
         đặc biệt là bản tiếng Anh chuyển qua faculty_vi / department_vi.
      2. Chép từ bản tương ứng Anh <-> Việt (counterpart_code).
    Idempotent.
    """
    mods = {m.code: m for m in db.scalars(select(Module)).all()}

    # 1. Thu thập faculty/department từ outline_courses
    outline_facs: dict[str, tuple[str | None, str | None]] = {}  # code -> (faculty, department)
    # Ưu tiên qua OutlineModuleLink
    for code, fac, dept, doc_type in db.execute(
        select(
            OutlineModuleLink.module_code,
            OutlineCourse.faculty,
            OutlineCourse.department,
            OutlineCourse.doc_type,
        )
        .join(OutlineCourse, OutlineCourse.document_id == OutlineModuleLink.document_id)
        .where(or_(OutlineCourse.faculty.is_not(None), OutlineCourse.department.is_not(None)))
    ).all():
        if code and code not in outline_facs:
            outline_facs[code] = (fac, dept)

    # Bổ sung từ course_code_norm nếu chưa có
    for code, fac, dept in db.execute(
        select(OutlineCourse.course_code_norm, OutlineCourse.faculty, OutlineCourse.department)
        .where(
            OutlineCourse.course_code_norm.is_not(None),
            or_(OutlineCourse.faculty.is_not(None), OutlineCourse.department.is_not(None)),
        )
    ).all():
        if code and code not in outline_facs:
            outline_facs[code] = (fac, dept)

    filled_faculty = 0
    filled_department = 0

    # Bước 1: Áp dụng từ đề cương cho chính module
    for code, m in mods.items():
        # Chuẩn hóa nếu m.faculty đang lưu tiếng Anh
        if m.faculty and not is_vietnamese(m.faculty):
            vi = faculty_vi(m.faculty)
            if vi:
                m.faculty = vi
                filled_faculty += 1
        if m.department and not is_vietnamese(m.department):
            vi = department_vi(m.department)
            if vi:
                m.department = vi
                filled_department += 1

        need_faculty = not m.faculty or m.faculty.strip().lower() in ("chưa rõ khoa", "chưa rõ", "unknown")
        need_department = not m.department

        if (need_faculty or need_department) and code in outline_facs:
            oc_fac, oc_dept = outline_facs[code]
            if need_faculty and oc_fac:
                mapped_fac = faculty_vi(oc_fac) or (oc_fac if is_vietnamese(oc_fac) else None)
                if mapped_fac:
                    m.faculty = mapped_fac
                    need_faculty = False
                    filled_faculty += 1
            if need_department and oc_dept:
                mapped_dept = department_vi(oc_dept) or (oc_dept if is_vietnamese(oc_dept) else None)
                if mapped_dept:
                    m.department = mapped_dept
                    need_department = False
                    filled_department += 1

    # Bước 2: Chép từ bản tương ứng Anh <-> Việt (counterpart_code)
    for code, m in mods.items():
        need_faculty = not m.faculty or m.faculty.strip().lower() in ("chưa rõ khoa", "chưa rõ", "unknown")
        need_department = not m.department
        if not (need_faculty or need_department):
            continue

        other = mods.get(m.counterpart_code) if m.counterpart_code else None
        if other is not None:
            if need_faculty and other.faculty:
                m.faculty = other.faculty
                filled_faculty += 1
            if need_department and other.department:
                m.department = other.department
                filled_department += 1

    # Cập nhật search_text cho các module có thay đổi
    for m in mods.values():
        m.search_text = normalize_search(f"{m.code} {m.name} {m.faculty or ''} {m.department or ''}")

    db.commit()
    return {"filled_faculty": filled_faculty, "filled_department": filled_department}
