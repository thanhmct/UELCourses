"""Ánh xạ tên khoa, bộ môn tiếng Anh sang tiếng Việt và ngược lại.
Chuẩn hóa tên khoa/bộ môn lấy từ đề cương về danh sách khoa chuẩn (Brief B6h/B6i).

Quy tắc nguồn sự thật:
  - Khoa và bộ môn của một học phần lấy theo thứ tự:
    (a) Đề cương của chính mã đó (outline_courses qua outline_module_links hoặc course_code_norm);
    (b) Nếu không có, đề cương của bản tương ứng Anh↔Việt (counterpart_code, lấy từ đề cương của bản kia,
        không dùng giá trị khoa đang lưu trong bảng modules, không bắc cầu);
    (c) Tiền tố mã học phần [B|E][XX] (chỉ khi môn chưa có khoa từ (a)/(b) VÀ tiền tố nằm trong bảng prefix_to_faculty.tsv).
        Chỉ điền chỗ trống; nếu môn đã có khoa hiện tại khác khoa tiền tố thì không ghi đè, báo mâu thuẫn tiền tố cần duyệt;
    (d) Giữ nguyên giá trị cũ trong DB (kể cả trống).
    Nguồn ghi trong cột 'nguồn' của CSV: 'outline', 'counterpart_outline', 'prefix'.
  - Môn không có nguồn nào:
    KHÔNG ghi "Phòng Đào tạo", KHÔNG đổi gì — giữ nguyên giá trị khoa/bộ môn đang có trong DB (kể cả trống).
    Trong CSV ghi kết luận 'giữ nguyên'. Đánh dấu 'không có đề cương – chưa kiểm chứng' nếu hiện tại có giá trị.
  - Đề cương mâu thuẫn nhau: giữ nguyên giá trị theo quy tắc B6e (ưu tiên bản đúng mã, mới nhất, parse_status=ok,
    đánh dấu 'cần duyệt').
  - Danh sách khoa chuẩn (9 khoa + Phòng Đào tạo = 10 nhãn):
    Khoa Quản trị kinh doanh, Khoa Tài chính - Ngân hàng, Khoa Kế toán - Kiểm toán,
    Khoa Hệ thống thông tin, Khoa Kinh tế, Khoa Kinh tế đối ngoại, Khoa Toán kinh tế,
    Khoa Luật, Khoa Luật Kinh tế, Phòng Đào tạo.
  - Chuẩn hóa so khớp: bỏ dấu + chữ thường + gộp gạch/khoảng trắng + bỏ tiền tố "Khoa/Faculty of/Department of";
    cắt đuôi rác (tiêu ngữ, dấu chấm, ký tự thừa) trước khi so khớp.
  - Bộ môn: chuẩn hóa về "Bộ môn X" (VI). Nếu một "tên khoa" trong đề cương thực chất là bộ môn
    (vd "ADMINISTRATIVE LAW - STATE"), ghi nhận là bộ môn nếu department đề cương trống,
    còn khoa để "cần duyệt" -> "Phòng Đào tạo" (không đoán khoa). Tên bộ môn không bao giờ gán thành khoa.
  - Idempotent; không ghi đè khoa đã đúng; cập nhật search_text.
"""

from __future__ import annotations

import csv
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import re
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import Module, OutlineCourse, OutlineModuleLink
from app.services.text import normalize_search, unaccent

SEED_FACULTY_TSV = Path(__file__).resolve().parents[2] / "seed" / "faculty_names_en.tsv"
SEED_CANONICAL_TSV = Path(__file__).resolve().parents[2] / "seed" / "faculty_canonical.tsv"
SEED_PREFIX_TSV = Path(__file__).resolve().parents[2] / "seed" / "prefix_to_faculty.tsv"
SEED_OVERRIDES_TSV = Path(__file__).resolve().parents[2] / "seed" / "faculty_overrides.tsv"
DEFAULT_CONFLICTS_CSV = Path(__file__).resolve().parents[2] / "data" / "processed" / "module_faculty_prefix_conflicts.csv"

_VI_CHARS = re.compile(r"[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]", re.I)

CANONICAL_FACULTIES_VI: list[str] = [
    "Khoa Quản trị kinh doanh",
    "Khoa Tài chính - Ngân hàng",
    "Khoa Kế toán - Kiểm toán",
    "Khoa Hệ thống thông tin",
    "Khoa Kinh tế",
    "Khoa Kinh tế đối ngoại",
    "Khoa Toán kinh tế",
    "Khoa Luật",
    "Khoa Luật Kinh tế",
    "Phòng Đào tạo",
    "Phòng Bảo đảm chất lượng",
]

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
    "Faculty of Economic Law": "Khoa Luật Kinh tế",
    "University of Economics and Law": "Trường Đại học Kinh tế - Luật",
    "Academic Affairs Office": "Phòng Đào tạo",
    "Quality Assurance Office": "Phòng Bảo đảm chất lượng",
    "Quality Assurance and Testing Center": "Phòng Bảo đảm chất lượng",
    "Department of Quality Assurance": "Phòng Bảo đảm chất lượng",
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

STATIC_DEPT_ALIASES: dict[str, str] = {
    "administrative and state law": "Bộ môn Luật Hành chính - Nhà nước",
    "administrative law state": "Bộ môn Luật Hành chính - Nhà nước",
    "administrative law": "Bộ môn Luật Hành chính - Nhà nước",
    "state administrative law": "Bộ môn Luật Hành chính - Nhà nước",
    "civil law and civil": "Bộ môn Luật Dân sự",
    "civil law": "Bộ môn Luật Dân sự",
    "international trade law": "Bộ môn Luật Thương mại quốc tế",
    "international commercial law": "Bộ môn Luật Thương mại quốc tế",
    "financial and banking law": "Bộ môn Luật Tài chính - Ngân hàng",
    "finance and banking law": "Bộ môn Luật Tài chính - Ngân hàng",
    "law on finance and banking": "Bộ môn Luật Tài chính - Ngân hàng",
    "data analysis": "Bộ môn Phân tích dữ liệu",
    "data analytics": "Bộ môn Phân tích dữ liệu",
    "management information": "Bộ môn Hệ thống thông tin quản lý",
    "management is": "Bộ môn Hệ thống thông tin quản lý",
    "management information systems": "Bộ môn Hệ thống thông tin quản lý",
    "public management": "Bộ môn Quản lý công",
    "e commerce": "Bộ môn Thương mại điện tử",
    "international business": "Bộ môn Kinh doanh quốc tế",
    "international economics": "Bộ môn Kinh tế quốc tế",
    "economics and public management": "Bộ môn Kinh tế và Quản lý công",
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
    "phòng bảo đảm chất lượng": "Department of Quality Assurance",
    "bảo đảm chất lượng": "Department of Quality Assurance",
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


def clean_raw_text(text: str | None) -> str:
    """Cắt rác, tiêu ngữ, dấu chấm, ký tự thừa ở chuỗi khoa/bộ môn từ đề cương."""
    if not text or not isinstance(text, str):
        return ""
    s = text.strip()
    # Cắt tiêu ngữ quốc gia (Independence – Liberty - Happiness / Độc lập – Tự do – Hạnh phúc)
    s = re.sub(r"(?i)\bIndependence\s*[-–—]\s*(?:Liberty|Freedom)\s*[-–—]\s*Happiness\b", "", s)
    s = re.sub(r"(?i)\bĐộc\s*lập\s*[-–—]\s*Tự\s*do\s*[-–—]\s*Hạnh\s*phúc\b", "", s)
    s = re.sub(r"(?i)\bCộng\s*hòa\s*xã\s*hội\s*chủ\s*nghĩa\s*Việt\s*Nam\b", "", s)
    s = re.sub(r"(?i)\bSocialist\s*Republic\s*of\s*Viet\s*nam\b", "", s)
    # Cắt chuỗi dấu chấm, dấu chấm lửng, gạch dưới liên tiếp
    s = re.sub(r"\.{2,}|…+|_+", " ", s)
    # Cắt ký tự đặc biệt ở đầu/cuối
    s = re.sub(r"^[\s\-–—:;.,/|\\]+", "", s)
    s = re.sub(r"[\s\-–—:;.,/|\\]+$", "", s)
    # Gộp khoảng trắng
    s = re.sub(r"\s+", " ", s).strip()
    # Nếu không còn chữ/số nào thì coi như rác rỗng
    if not re.search(r"[\w\d]", s):
        return ""
    return s


_FRAME_PREFIX_PATTERN = re.compile(
    r"^(?:khoa|faculty(?:\s+of)?|department(?:\s+of)?|school(?:\s+of)?|division(?:\s+of)?|"
    r"bộ\s+môn|bo\s+mon|phòng|phong|ban|viện|vien|trung\s+tâm|trung\s+tam)\b[\s\-–—:;.,/|\\]*",
    re.IGNORECASE,
)


def extract_core_name(text: str | None) -> str:
    """Loại bỏ các tiền tố / từ khung (Khoa, Bộ môn, Faculty of, Department of...).

    Nếu sau khi bỏ tiền tố mà không còn tên riêng thực sự thì trả về chuỗi rỗng (Brief B6g).
    """
    if not text or not isinstance(text, str):
        return ""
    cleaned = clean_raw_text(text)
    if not cleaned:
        return ""

    curr = cleaned
    for _ in range(1000):
        m = _FRAME_PREFIX_PATTERN.match(curr)
        if not m:
            break
        rest = curr[m.end():].strip()
        if rest == curr:
            break
        curr = rest

    # Cắt các ký tự đặc biệt thừa ở đầu/cuối sau khi bóc tách
    curr = re.sub(r"^[\s\-–—:;.,/|\\]+", "", curr)
    curr = re.sub(r"[\s\-–—:;.,/|\\]+$", "", curr).strip()

    # Nếu phần còn lại không có ký tự chữ hoặc số -> rỗng
    if not re.search(r"[\w\d]", curr):
        return ""
    return curr


def has_core_name(text: str | None) -> bool:
    """Kiểm tra chuỗi có chứa tên riêng thực sự ngoài các từ khung/tiền tố hay không."""
    return bool(extract_core_name(text))


def _norm_key(s: str) -> str:
    t = clean_raw_text(s)
    t = t.replace("–", "-").replace("—", "-").replace("&", "and")
    t = re.sub(r"\s+", " ", t).lower()
    return t


def faculty_norm_key(s: str | None) -> str:
    """Chuẩn hóa khóa so khớp khoa: bỏ dấu, chữ thường, gộp gạch/khoảng trắng, bỏ tiền tố."""
    if not s:
        return ""
    t = clean_raw_text(s)
    if not t:
        return ""
    if not has_core_name(t):
        return ""
    t = unaccent(t).lower()
    t = t.replace("&", " and ")
    t = re.sub(r"[-–—/]", " ", t)
    t = re.sub(r"^(khoa|faculty\s+of|department\s+of|school\s+of)\s+", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def department_norm_key(s: str | None) -> str:
    """Chuẩn hóa khóa so khớp bộ môn: bỏ dấu, chữ thường, gộp gạch, bỏ tiền tố."""
    if not s:
        return ""
    t = clean_raw_text(s)
    if not t:
        return ""
    if not has_core_name(t):
        return ""
    t = unaccent(t).lower()
    t = t.replace("&", " and ")
    t = re.sub(r"[-–—/]", " ", t)
    t = re.sub(r"^(bo\s+mon|department\s+of)\s+", "", t)
    t = re.sub(r"\s+", " ", t).strip()
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
    for k, v in STATIC_FACULTY_EN_TO_VI.items():
        en_to_vi.setdefault(_norm_key(k), v)
    for k, v in STATIC_DEPARTMENT_EN_TO_VI.items():
        en_to_vi.setdefault(_norm_key(k), v)
    return en_to_vi, vi_to_en


def _load_canonical_map(path: Path = SEED_CANONICAL_TSV) -> dict[str, tuple[str, str]]:
    """Tải danh sách khoa chuẩn và ánh xạ alias từ file TSV."""
    lookup: dict[str, tuple[str, str]] = {}
    if path.exists():
        lines = path.read_text(encoding="utf-8").splitlines()
        for line in lines[1:]:
            parts = line.split("\t")
            if len(parts) >= 2:
                fac_vi = parts[0].strip()
                fac_en = parts[1].strip()
                aliases_raw = parts[2].strip() if len(parts) > 2 else ""
                val = (fac_vi, fac_en)
                lookup[faculty_norm_key(fac_vi)] = val
                lookup[faculty_norm_key(fac_en)] = val
                for a in aliases_raw.split(","):
                    alias = a.strip()
                    if alias:
                        lookup[faculty_norm_key(alias)] = val

    # Đảm bảo các khoa chuẩn và alias B6d được nạp đầy đủ
    defaults: list[tuple[str, str, list[str]]] = [
        ("Khoa Quản trị kinh doanh", "Faculty of Business Administration", ["Quản trị kinh doanh", "QUẢN TRỊ KINH DOANH", "QTKD", "Business Administration", "BAA"]),
        ("Khoa Tài chính - Ngân hàng", "Faculty of Finance and Banking", ["Tài chính - Ngân hàng", "Tài chính Ngân hàng", "BANKING AND FINANCE", "FINANCE AND BANKING", "Finance and Banking", "Finance & Banking", "TCNH"]),
        ("Khoa Kế toán - Kiểm toán", "Faculty of Accounting and Auditing", ["Kế toán - Kiểm toán", "Kế toán – Kiểm toán", "Kế toán Kiểm toán", "ACCOUNTING – AUDITING", "Accounting and Auditing", "Accounting & Auditing", "KTKT"]),
        ("Khoa Hệ thống thông tin", "Faculty of Information Systems", ["Hệ thống thông tin", "MIS", "Information Systems", "HTTT"]),
        ("Khoa Kinh tế", "Faculty of Economics", ["Kinh tế", "Economics", "KT"]),
        ("Khoa Kinh tế đối ngoại", "Faculty of International Economic Relations", ["Kinh tế đối ngoại", "ECONOMIC RELATION", "ECONOMIC RELATIONS", "International Economic Relations", "KTĐN", "KTDN"]),
        ("Khoa Toán kinh tế", "Faculty of Mathematical Economics", ["Toán kinh tế", "ECONOMIC MATHEMATICS", "MATHEMATICAL ECONOMICS", "Mathematical Economics", "TKT"]),
        ("Khoa Luật", "Faculty of Law", ["Luật", "Law", "School of Law"]),
        ("Khoa Luật Kinh tế", "Faculty of Business Law", ["Luật Kinh tế", "LUẬT KINH TẾ", "ECONOMIC LAW", "Business Law", "Economic Law", "Faculty of Economic Law", "LKT"]),
        ("Phòng Đào tạo", "Academic Affairs Office", ["Đào tạo", "Academic Affairs"]),
        ("Phòng Bảo đảm chất lượng", "Department of Quality Assurance", ["Bảo đảm chất lượng", "Quality Assurance", "Quality Assurance Office", "QA"]),
    ]
    for fac_vi, fac_en, aliases in defaults:
        val = (fac_vi, fac_en)
        lookup.setdefault(faculty_norm_key(fac_vi), val)
        lookup.setdefault(faculty_norm_key(fac_en), val)
        for a in aliases:
            lookup.setdefault(faculty_norm_key(a), val)

    return lookup


_EN_TO_VI, _VI_TO_EN = _load_tsv_maps()
_CANONICAL_MAP = _load_canonical_map()


@dataclass
class PrefixEntry:
    prefix: str
    faculty_chuẩn: str
    sample_count: int
    ratio: float
    note: str = ""


_MODULE_PREFIX_PATTERN = re.compile(r"^[BE]([A-Za-z]{2})")


def extract_module_prefix(code: str | None) -> str | None:
    """Trích xuất 2 chữ cái mã đơn vị sau ký tự B (chuẩn) hoặc E (tiếng Anh) (Brief B6i).
    Ví dụ: BBB1068 -> 'BB', EFF2045 -> 'FF', BEE1050 -> 'EE', EBMT065 -> 'BM'.
    Nếu không khớp dạng [B|E][XX], trả về None.
    """
    if not code:
        return None
    c = code.strip().upper()
    m = _MODULE_PREFIX_PATTERN.match(c)
    if m:
        return m.group(1)
    return None


DEFAULT_PREFIX_ENTRIES: list[tuple[str, str, int, float, str]] = [
    ("AA", "Khoa Kế toán - Kiểm toán", 20, 1.0, "20/20 (100.0%)"),
    ("AU", "Khoa Kế toán - Kiểm toán", 29, 1.0, "29/29 (100.0%)"),
    ("BB", "Khoa Quản trị kinh doanh", 50, 1.0, "50/50 (100.0%)"),
    ("BM", "Khoa Quản trị kinh doanh", 75, 1.0, "75/75 (100.0%)"),
    ("BU", "Khoa Quản trị kinh doanh", 19, 1.0, "19/19 (100.0%)"),
    ("EE", "Khoa Kinh tế", 29, 1.0, "29/29 (100.0%)"),
    ("EM", "Khoa Kinh tế", 10, 1.0, "10/10 (100.0%)"),
    ("FB", "Khoa Tài chính - Ngân hàng", 29, 1.0, "29/29 (100.0%)"),
    ("FF", "Khoa Tài chính - Ngân hàng", 75, 1.0, "75/75 (100.0%)"),
    ("IE", "Khoa Hệ thống thông tin", 49, 46 / 49, "46 Khoa Hệ thống thông tin, 3 Khoa Quản trị kinh doanh"),
    ("IM", "Khoa Hệ thống thông tin", 49, 1.0, "49/49 (100.0%)"),
    ("KB", "Khoa Luật Kinh tế", 48, 1.0, "48/48 (100.0%)"),
    ("KT", "Khoa Luật Kinh tế", 39, 1.0, "39/39 (100.0%)"),
    ("LB", "Khoa Luật", 38, 1.0, "38/38 (100.0%)"),
    ("LC", "Khoa Luật", 33, 1.0, "33/33 (100.0%)"),
    ("LD", "Khoa Luật", 7, 1.0, "7/7 (100.0%)"),
    ("MA", "Khoa Toán kinh tế", 39, 1.0, "39/39 (100.0%)"),
    ("MM", "Khoa Toán kinh tế", 9, 1.0, "9/9 (100.0%)"),
    ("RB", "Khoa Kinh tế đối ngoại", 34, 1.0, "34/34 (100.0%)"),
    ("RE", "Khoa Kinh tế đối ngoại", 22, 1.0, "22/22 (100.0%)"),
]


def load_prefix_table(path: Path | str | None = None) -> dict[str, PrefixEntry]:
    """Tải bảng ánh xạ tiền tố -> khoa chuẩn từ file TSV (mặc định: api/seed/prefix_to_faculty.tsv).
    Nếu file chưa tồn tại, nạp bảng mặc định đã được kiểm chứng từ DB.
    """
    p = Path(path) if path else SEED_PREFIX_TSV
    result: dict[str, PrefixEntry] = {}
    if p.exists():
        lines = p.read_text(encoding="utf-8").splitlines()
        if lines:
            header_line = lines[0].strip()
            headers = [h.strip().lower().replace(" ", "_") for h in header_line.split("\t")]
            col_map = {h: i for i, h in enumerate(headers)}
            pref_idx = col_map.get("prefix", 0)
            fac_idx = col_map.get("faculty_chuẩn", col_map.get("faculty", 1))
            samples_idx = col_map.get("số_mẫu", col_map.get("sample_count", 2))
            ratio_idx = col_map.get("tỷ_lệ", col_map.get("ratio", 3))
            note_idx = col_map.get("ghi_chú", col_map.get("note", 4))

            for line in lines[1:]:
                parts = line.split("\t")
                if len(parts) > max(pref_idx, fac_idx):
                    pref = parts[pref_idx].strip().upper()
                    fac = parts[fac_idx].strip()
                    if not pref or not fac:
                        continue
                    samples = 0
                    if len(parts) > samples_idx and parts[samples_idx].strip():
                        try:
                            samples = int(parts[samples_idx].strip())
                        except ValueError:
                            samples = 0
                    ratio = 1.0
                    if len(parts) > ratio_idx and parts[ratio_idx].strip():
                        r_str = parts[ratio_idx].strip().rstrip("%")
                        try:
                            r_val = float(r_str)
                            ratio = r_val / 100.0 if r_val > 1.0 else r_val
                        except ValueError:
                            ratio = 1.0
                    note = parts[note_idx].strip() if len(parts) > note_idx else ""
                    result[pref] = PrefixEntry(
                        prefix=pref,
                        faculty_chuẩn=fac,
                        sample_count=samples,
                        ratio=ratio,
                        note=note,
                    )
    if not result:
        for pref, fac, samples, ratio, note in DEFAULT_PREFIX_ENTRIES:
            result[pref] = PrefixEntry(
                prefix=pref,
                faculty_chuẩn=fac,
                sample_count=samples,
                ratio=ratio,
                note=note,
            )
    return result


def load_faculty_overrides(path: Path | str | None = None) -> dict[str, tuple[str, str, str]]:
    """Tải bảng chỉ định tay khoa/bộ môn từ file TSV (mặc định: api/seed/faculty_overrides.tsv).
    Trả về dict: code -> (faculty, department, ghi_chú).
    Ưu tiên cao nhất (Brief W29).
    """
    p = Path(path) if path else SEED_OVERRIDES_TSV
    result: dict[str, tuple[str, str, str]] = {}
    if p.exists():
        lines = p.read_text(encoding="utf-8").splitlines()
        for line in lines[1:]:
            parts = line.split("\t")
            if len(parts) >= 2:
                code = parts[0].strip().upper()
                fac = parts[1].strip()
                dept = parts[2].strip() if len(parts) > 2 else ""
                note = parts[3].strip() if len(parts) > 3 else ""
                if code and fac:
                    result[code] = (fac, dept, note)
    return result


def is_vietnamese(text: str | None) -> bool:
    if not text:
        return False
    return bool(_VI_CHARS.search(text))


def is_compound_or_needs_review_faculty(text: str | None) -> tuple[bool, str]:
    """Kiểm tra tên ghép hoặc tên chưa chắc chắn cần đưa vào danh sách 'cần duyệt'."""
    if not text:
        return False, ""
    cleaned = clean_raw_text(text)
    k = faculty_norm_key(cleaned)
    if not k:
        return False, ""

    # Yêu cầu 1: "QUẢN LÝ KINH DOANH" không tự ánh xạ mà đưa vào "cần duyệt"
    if k in ("quan ly kinh doanh", "business management"):
        return True, "tên khoa chưa chắc chắn (QUẢN LÝ KINH DOANH)"

    # Tên ghép: Toán Kinh tế & Hệ thống thông tin, MIS & Mathematical Economics...
    if "toan kinh te" in k and ("he thong thong tin" in k or "mis" in k):
        return True, "tên ghép khoa/bộ môn (Toán Kinh tế & Hệ thống thông tin)"
    if "mathematical economics" in k and ("information systems" in k or "mis" in k):
        return True, "tên ghép khoa/bộ môn (Mathematical Economics & Information Systems)"
    if "data analysis" in k and ("management information" in k or "mis" in k):
        return True, "tên ghép bộ môn (Data Analysis & MIS)"

    return False, ""


def is_department(text: str | None) -> tuple[bool, str | None]:
    """Kiểm tra một chuỗi có thực chất là bộ môn (chứ không phải khoa).

    Nếu đúng, trả về (True, tên_bộ_môn_VI_chuẩn).
    """
    if not text:
        return False, None
    cleaned = clean_raw_text(text)
    if not cleaned:
        return False, None

    # Chuỗi chỉ gồm tiền tố/từ khung mà không có tên thật -> không phải bộ môn (Brief B6g)
    if not has_core_name(cleaned):
        return False, None

    # Tiền tố "Bộ môn" hoặc "Department of" rõ ràng
    if re.match(r"(?i)^(bộ\s+môn|bo\s+mon|department\s+of)\s+", cleaned):
        mapped = department_vi(cleaned)
        return True, (mapped or cleaned)

    # Không tính các khoa chuẩn
    can_k = faculty_norm_key(cleaned)
    if can_k in _CANONICAL_MAP:
        return False, None

    k_dept = department_norm_key(cleaned)

    if k_dept in STATIC_DEPT_ALIASES:
        return True, STATIC_DEPT_ALIASES[k_dept]

    for orig_en, vi_val in STATIC_DEPARTMENT_EN_TO_VI.items():
        if department_norm_key(orig_en) == k_dept or department_norm_key(vi_val) == k_dept:
            return True, vi_val

    return False, None


def canonical_faculty_vi(text: str | None) -> str | None:
    """So khớp chuỗi khoa (bỏ dấu, chữ thường, tiền tố, alias) với danh sách khoa chuẩn.

    Kết quả luôn là tên VI chuẩn có tiền tố 'Khoa' (hoặc 'Phòng Đào tạo').
    Nếu chuỗi là tên ghép hoặc bộ môn, trả về None.
    """
    if not text:
        return None
    cleaned = clean_raw_text(text)
    if not cleaned:
        return None

    # Chuỗi chỉ gồm tiền tố/từ khung mà không có tên thật -> None (Brief B6g)
    if not has_core_name(cleaned):
        return None

    # Tên ghép hoặc cần duyệt -> không tự ánh xạ
    is_ambig, _ = is_compound_or_needs_review_faculty(cleaned)
    if is_ambig:
        return None

    # Tên thực chất là bộ môn -> không ánh xạ thành khoa
    is_dept, _ = is_department(cleaned)
    if is_dept:
        return None

    k = faculty_norm_key(cleaned)
    if k in _CANONICAL_MAP:
        return _CANONICAL_MAP[k][0]

    return None


def normalize_department(dept: str | None) -> str | None:
    """Chuẩn hóa bộ môn về 'Bộ môn X' (VI) từ đề cương. Chuỗi rác thì NULL."""
    if not dept:
        return None
    cleaned = clean_raw_text(dept)
    if not cleaned:
        return None
    if not re.search(r"[\w\d]", cleaned):
        return None

    # Chuỗi chỉ gồm tiền tố/từ khung mà không có tên thật -> None (Brief B6g)
    if not has_core_name(cleaned):
        return None

    mapped = department_vi(cleaned)
    if mapped:
        if not mapped.startswith("Bộ môn ") and not mapped.startswith("Khoa ") and not mapped.startswith("Phòng "):
            return f"Bộ môn {mapped}"
        return mapped

    if re.match(r"(?i)^(bộ\s+môn|bo\s+mon)\s+", cleaned):
        core = re.sub(r"(?i)^(bộ\s+môn|bo\s+mon)\s+", "", cleaned).strip()
        return f"Bộ môn {core}"

    dept_k = department_norm_key(cleaned)
    for orig_en, vi_val in STATIC_DEPARTMENT_EN_TO_VI.items():
        if department_norm_key(orig_en) == dept_k:
            return vi_val

    return cleaned


def faculty_vi(en: str | None) -> str | None:
    """Chuyển tên khoa (hoặc bộ môn) tiếng Anh sang tên tiếng Việt chuẩn của UEL.

    Ví dụ: 'FACULTY OF FINANCE AND BANKING' -> 'Khoa Tài chính - Ngân hàng'.
    Nếu chuỗi đã là tiếng Việt có dấu, trả lại nguyên văn hoặc tên chuẩn.
    """
    if not en or not en.strip():
        return None
    cleaned = clean_raw_text(en)
    if not cleaned:
        return None

    # Chuẩn hóa sau khi bỏ tiền tố mà chuỗi rỗng -> None (Brief B6g)
    if not has_core_name(cleaned):
        return None

    # Thử danh sách chuẩn trước
    can = canonical_faculty_vi(cleaned)
    if can:
        return can

    k = _norm_key(cleaned)
    if k in _EN_TO_VI:
        return _EN_TO_VI[k]

    k_noprefix = re.sub(r"^(faculty of|department of|school of)\s+", "", k)
    if k_noprefix in _EN_TO_VI:
        return _EN_TO_VI[k_noprefix]

    for orig_en, vi_val in STATIC_FACULTY_EN_TO_VI.items():
        if _norm_key(orig_en) == k:
            return vi_val
    for orig_en, vi_val in STATIC_DEPARTMENT_EN_TO_VI.items():
        if _norm_key(orig_en) == k:
            return vi_val

    if is_vietnamese(cleaned) and has_core_name(cleaned):
        return cleaned

    return None


def department_vi(en: str | None) -> str | None:
    """Chuyển tên bộ môn tiếng Anh sang tiếng Việt.

    Tuyệt đối không gọi ngược sang faculty_vi để tránh vòng lặp đệ quy (Brief B6f).
    Nếu không ánh xạ được, trả về cleaned (nếu là tiếng Việt) hoặc None.
    """
    if not en or not en.strip():
        return None
    cleaned = clean_raw_text(en)
    if not cleaned:
        return None

    # Chuẩn hóa sau khi bỏ tiền tố mà chuỗi rỗng -> None (Brief B6g)
    if not has_core_name(cleaned):
        return None

    k_dept = department_norm_key(cleaned)
    if k_dept in STATIC_DEPT_ALIASES:
        return STATIC_DEPT_ALIASES[k_dept]

    for orig_en, vi_val in STATIC_DEPARTMENT_EN_TO_VI.items():
        if department_norm_key(orig_en) == k_dept or department_norm_key(vi_val) == k_dept:
            return vi_val

    k = _norm_key(cleaned)
    if k in _EN_TO_VI:
        return _EN_TO_VI[k]

    if is_vietnamese(cleaned) and has_core_name(cleaned):
        return cleaned

    return None


def faculty_en(vi: str | None) -> str | None:
    """Chuyển tên khoa tiếng Việt sang tiếng Anh.

    Ví dụ: 'Phòng Đào tạo' -> 'Academic Affairs Office'.
           'Khoa Tài chính - Ngân hàng' -> 'Faculty of Finance and Banking'.
    """
    if not vi or not vi.strip():
        return None
    cleaned = clean_raw_text(vi)
    if not cleaned:
        return None

    # Chuẩn hóa sau khi bỏ tiền tố mà chuỗi rỗng -> None (Brief B6g)
    if not has_core_name(cleaned):
        return None

    can_k = faculty_norm_key(cleaned)
    if can_k in _CANONICAL_MAP:
        return _CANONICAL_MAP[can_k][1]

    if not is_vietnamese(cleaned):
        k = _norm_key(cleaned)
        for orig_en in STATIC_FACULTY_EN_TO_VI:
            if _norm_key(orig_en) == k:
                return orig_en
        for orig_en in STATIC_DEPARTMENT_EN_TO_VI:
            if _norm_key(orig_en) == k:
                return orig_en
        return cleaned

    k = _norm_key(cleaned)
    if k in STATIC_FACULTY_VI_TO_EN:
        return STATIC_FACULTY_VI_TO_EN[k]
    k_core = re.sub(r"^(khoa|bộ môn|trường|viện|phòng|trung tâm)\s+", "", k)
    if k_core in STATIC_FACULTY_VI_TO_EN:
        return STATIC_FACULTY_VI_TO_EN[k_core]
    if k in STATIC_DEPARTMENT_VI_TO_EN:
        return STATIC_DEPARTMENT_VI_TO_EN[k]
    if k_core in STATIC_DEPARTMENT_VI_TO_EN:
        return STATIC_DEPARTMENT_VI_TO_EN[k_core]
    if k in _VI_TO_EN:
        return _VI_TO_EN[k]
    if k_core in _VI_TO_EN:
        return _VI_TO_EN[k_core]

    return None


def department_en(vi: str | None) -> str | None:
    """Chuyển tên bộ môn tiếng Việt sang tiếng Anh.

    Tuyệt đối không gọi ngược sang faculty_en để tránh đệ quy (Brief B6f).
    """
    if not vi or not vi.strip():
        return None
    cleaned = clean_raw_text(vi)
    if not cleaned:
        return None

    # Chuẩn hóa sau khi bỏ tiền tố mà chuỗi rỗng -> None (Brief B6g)
    if not has_core_name(cleaned):
        return None

    if not is_vietnamese(cleaned):
        k = _norm_key(cleaned)
        for orig_en in STATIC_DEPARTMENT_EN_TO_VI:
            if _norm_key(orig_en) == k:
                return orig_en
        for orig_en in STATIC_FACULTY_EN_TO_VI:
            if _norm_key(orig_en) == k:
                return orig_en
        return cleaned

    k = _norm_key(cleaned)
    if k in STATIC_DEPARTMENT_VI_TO_EN:
        return STATIC_DEPARTMENT_VI_TO_EN[k]
    k_core = re.sub(r"^(bộ môn|khoa|phòng|trung tâm)\s+", "", k)
    if k_core in STATIC_DEPARTMENT_VI_TO_EN:
        return STATIC_DEPARTMENT_VI_TO_EN[k_core]
    if k in _VI_TO_EN:
        return _VI_TO_EN[k]
    if k_core in _VI_TO_EN:
        return _VI_TO_EN[k_core]

    return None


@dataclass
class _OutlineCandidate:
    document_id: int
    course_code_norm: str | None
    faculty: str | None
    department: str | None
    doc_type: str | None
    parse_status: str | None
    parsed_at: Any | None
    is_exact_code: bool


def _load_module_outline_candidates(db: Session) -> dict[str, dict[int, _OutlineCandidate]]:
    """Tải toàn bộ đề cương liên kết với các mã học phần trong DB (Brief B6h).
    Nguồn đề cương cho một học phần là HỢP của:
      1. outline_module_links của mã đó -> outline_courses theo document_id
      2. outline_courses khớp trực tiếp course_code_norm hoặc course_code
    """
    module_candidates: dict[str, dict[int, _OutlineCandidate]] = {}

    for code, doc_id, ccn, fac, dept, dtype, pstatus, pat in db.execute(
        select(
            OutlineModuleLink.module_code,
            OutlineCourse.document_id,
            OutlineCourse.course_code_norm,
            OutlineCourse.faculty,
            OutlineCourse.department,
            OutlineCourse.doc_type,
            OutlineCourse.parse_status,
            OutlineCourse.parsed_at,
        ).join(OutlineCourse, OutlineCourse.document_id == OutlineModuleLink.document_id)
    ).all():
        if code:
            c_code = code.strip().upper()
            if c_code not in module_candidates:
                module_candidates[c_code] = {}
            ccn_clean = ccn.strip().upper() if ccn else None
            module_candidates[c_code][doc_id] = _OutlineCandidate(
                document_id=doc_id,
                course_code_norm=ccn_clean,
                faculty=fac.strip() if fac and fac.strip() else None,
                department=dept.strip() if dept and dept.strip() else None,
                doc_type=dtype,
                parse_status=pstatus,
                parsed_at=pat,
                is_exact_code=(ccn_clean == c_code if ccn_clean else False),
            )

    for cc, ccn, doc_id, fac, dept, dtype, pstatus, pat in db.execute(
        select(
            OutlineCourse.course_code,
            OutlineCourse.course_code_norm,
            OutlineCourse.document_id,
            OutlineCourse.faculty,
            OutlineCourse.department,
            OutlineCourse.doc_type,
            OutlineCourse.parse_status,
            OutlineCourse.parsed_at,
        ).where(or_(OutlineCourse.course_code_norm.is_not(None), OutlineCourse.course_code.is_not(None)))
    ).all():
        codes_to_add = set()
        if ccn and ccn.strip():
            codes_to_add.add(ccn.strip().upper())
        if cc and cc.strip():
            norm_cc = re.sub(r"\s+", "", cc).strip().upper()
            if norm_cc:
                codes_to_add.add(norm_cc)
        for c_code in codes_to_add:
            if c_code not in module_candidates:
                module_candidates[c_code] = {}
            if doc_id not in module_candidates[c_code]:
                module_candidates[c_code][doc_id] = _OutlineCandidate(
                    document_id=doc_id,
                    course_code_norm=c_code,
                    faculty=fac.strip() if fac and fac.strip() else None,
                    department=dept.strip() if dept and dept.strip() else None,
                    doc_type=dtype,
                    parse_status=pstatus,
                    parsed_at=pat,
                    is_exact_code=True,
                )
            else:
                module_candidates[c_code][doc_id].is_exact_code = True

    return module_candidates


def _candidate_rank_key(c: _OutlineCandidate, target_code: str):
    """Tiêu chí ưu tiên đề cương khi một môn có nhiều đề cương:
      1. Khớp chính xác mã học phần (course_code_norm == code)
      2. Đề cương có ghi khoa (faculty sau khi cắt rác không rỗng)
      3. Đề cương có ghi bộ môn (department sau khi cắt rác không rỗng)
      4. Trạng thái parse_status: ok > partial > khác
      5. Loại văn bản: syllabus_vi > syllabus_en > khác
      6. parsed_at mới nhất
      7. document_id lớn nhất
    """
    exact = 1 if (c.course_code_norm and c.course_code_norm == target_code) else 0
    clean_f = clean_raw_text(c.faculty)
    has_fac = 1 if (clean_f and has_core_name(clean_f)) else 0
    clean_d = clean_raw_text(c.department)
    has_dept = 1 if (clean_d and has_core_name(clean_d)) else 0
    status_score = 3 if c.parse_status == "ok" else (2 if c.parse_status == "partial" else 1)
    type_score = 2 if c.doc_type == "syllabus_vi" else (1 if c.doc_type == "syllabus_en" else 0)
    pat_str = str(c.parsed_at) if c.parsed_at else ""
    return (exact, has_fac, has_dept, status_score, type_score, pat_str, c.document_id)


def build_prefix_table_from_db(
    db: Session,
    min_samples: int = 5,
    min_ratio: float = 0.90,
    mods: dict[str, Module] | None = None,
) -> list[PrefixEntry]:
    """Dựng bảng tiền tố -> khoa chuẩn từ các học phần đã có khoa xác nhận từ đề cương
    (nguồn outline hoặc counterpart_outline, qua outline_module_links như B6h).
    Chỉ đưa vào bảng khi số mẫu >= min_samples và tỷ lệ cùng 1 khoa >= min_ratio (Brief B6i).
    """
    if mods is None:
        mods = {m.code: m for m in db.scalars(select(Module)).all()}

    module_candidates = _load_module_outline_candidates(db)
    prefix_stats: dict[str, Counter[str]] = {}

    for code, m in sorted(mods.items(), key=lambda kv: kv[0]):
        c_code = code.strip().upper()
        pref = extract_module_prefix(c_code)
        if not pref:
            continue

        candidates = list(module_candidates.get(c_code, {}).values())
        valid_own = [c for c in candidates if clean_raw_text(c.faculty) and has_core_name(c.faculty)]

        cp_code = (m.counterpart_code or "").strip().upper() if m.counterpart_code else None
        cp_candidates = list(module_candidates.get(cp_code, {}).values()) if cp_code else []
        valid_cp = [c for c in cp_candidates if clean_raw_text(c.faculty) and has_core_name(c.faculty)] if cp_code else []

        chosen = valid_own if valid_own else (valid_cp if valid_cp else [])
        if not chosen:
            continue

        eval_code = c_code if valid_own else cp_code
        best = max(chosen, key=lambda c: _candidate_rank_key(c, eval_code))
        raw_f = clean_raw_text(best.faculty)
        can_f = canonical_faculty_vi(raw_f)
        if not can_f or can_f not in CANONICAL_FACULTIES_VI or can_f == "Phòng Đào tạo":
            continue

        if pref not in prefix_stats:
            prefix_stats[pref] = Counter()
        prefix_stats[pref][can_f] += 1

    entries: list[PrefixEntry] = []
    for pref in sorted(prefix_stats.keys()):
        counts = prefix_stats[pref]
        total = sum(counts.values())
        if total < min_samples:
            continue
        best_fac, best_count = counts.most_common(1)[0]
        ratio = best_count / total
        if ratio < min_ratio:
            continue

        if len(counts) == 1:
            note = f"{best_count}/{total} (100.0%)"
        else:
            breakdown = ", ".join(f"{c} {f}" for f, c in counts.most_common())
            note = breakdown

        entries.append(PrefixEntry(
            prefix=pref,
            faculty_chuẩn=best_fac,
            sample_count=total,
            ratio=ratio,
            note=note,
        ))

    return entries


def save_prefix_table_tsv(entries: list[PrefixEntry], tsv_path: Path | str | None = None) -> str:
    """Lưu danh sách PrefixEntry vào file TSV (mặc định: api/seed/prefix_to_faculty.tsv)."""
    p = Path(tsv_path) if tsv_path else SEED_PREFIX_TSV
    p.parent.mkdir(parents=True, exist_ok=True)
    lines = ["prefix\tfaculty_chuẩn\tsố_mẫu\ttỷ_lệ\tghi_chú"]
    for e in entries:
        pct_str = f"{e.ratio * 100:.1f}%"
        lines.append(f"{e.prefix}\t{e.faculty_chuẩn}\t{e.sample_count}\t{pct_str}\t{e.note}")
    p.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return str(p)


def rebuild_prefix_table(
    db: Session,
    tsv_path: Path | str | None = None,
    min_samples: int = 5,
    min_ratio: float = 0.90,
    *,
    mods: dict[str, Module] | None = None,
) -> dict[str, PrefixEntry]:
    """Tạo lại bảng tiền tố từ DB, lưu vào TSV và trả về dict[prefix, PrefixEntry]."""
    entries = build_prefix_table_from_db(db, min_samples=min_samples, min_ratio=min_ratio, mods=mods)
    save_prefix_table_tsv(entries, tsv_path=tsv_path)
    return {e.prefix: e for e in entries}


def _prefix_table_for_command(db: Session, rebuild: bool) -> dict[str, PrefixEntry]:
    return rebuild_prefix_table(db) if rebuild else load_prefix_table()


def write_prefix_conflicts_csv(conflict_rows: list[dict], csv_path: Path | str | None = None) -> str:
    """Xuất danh sách các ca mâu thuẫn tiền tố ra CSV để chủ dự án duyệt hàng loạt (Brief B6i)."""
    p = Path(csv_path) if csv_path else DEFAULT_CONFLICTS_CSV
    p.parent.mkdir(parents=True, exist_ok=True)
    cols = [
        "code",
        "name",
        "faculty_hiện_tại",
        "department_hiện_tại",
        "prefix",
        "faculty_theo_tiền_tố",
        "tỷ_lệ_tiền_tố",
        "kết_luận",
        "lý do",
    ]
    with p.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        writer.writeheader()
        for r in conflict_rows:
            writer.writerow({k: (r.get(k) or "") for k in cols})
    return str(p)


def audit_module_faculties_with_unmapped(
    db: Session,
    mods: dict[str, Module] | None = None,
    prefix_table: dict[str, PrefixEntry] | None = None,
    rebuild_prefix_table_flag: bool = False,
    overrides: dict[str, tuple[str, str, str]] | None = None,
    master_courses: dict[str, dict] | None = None,
    conflicts_list: list[dict] | None = None,
) -> tuple[list[dict], list[str]]:
    """Rà soát khoa/bộ môn của toàn bộ học phần theo quy tắc Brief B6h/B6i, W29 và D4.

    Thứ tự nguồn xác định khoa:
      (1) Ghi đè thủ công từ file faculty_overrides.tsv (Ưu tiên 1 cao nhất - Brief W29);
      (2) Master_data.xlsx sheet Data_Course (nguồn chính cho khóa 2025/2026, #N/A hoặc trống giữ nguyên DB cũ);
      (a) Đề cương của chính mã đó (outline_courses qua outline_module_links hoặc course_code_norm);
      (b) Nếu không có, đề cương của bản tương ứng Anh↔Việt (counterpart_code, không bắc cầu);
      (c) Tiền tố mã học phần [B|E][XX] (chỉ khi môn chưa có khoa từ (a)/(b) VÀ tiền tố nằm trong bảng prefix_to_faculty.tsv).
          Chỉ điền chỗ trống; nếu môn đã có khoa hiện tại khác khoa tiền tố thì không ghi đè, báo mâu thuẫn tiền tố cần duyệt;
      (d) Giữ nguyên giá trị cũ trong DB (kể cả trống).
    """
    if mods is None:
        mods = {m.code: m for m in db.scalars(select(Module)).all()}

    if overrides is None:
        overrides = load_faculty_overrides()

    from app.services.master_data_import import load_master_data_courses, master_course_affiliation

    if master_courses is None:
        master_courses = load_master_data_courses()

    if rebuild_prefix_table_flag:
        prefix_table = rebuild_prefix_table(db, mods=mods)
    elif prefix_table is None:
        prefix_table = load_prefix_table()

    module_candidates = _load_module_outline_candidates(db)
    unmapped_names_set: set[str] = set()
    audit_rows: list[dict] = []

    for code, m in sorted(mods.items(), key=lambda kv: kv[0]):
        c_code = code.strip().upper()
        candidates = list(module_candidates.get(c_code, {}).values())
        has_own_outline = len(candidates) > 0

        # Lọc đề cương của chính môn có trường faculty có chữ thực chất (sau khi cắt rác và tiền tố trơn)
        valid_own_fac_candidates: list[_OutlineCandidate] = [
            c for c in candidates if clean_raw_text(c.faculty) and has_core_name(c.faculty)
        ]
        has_faculty_in_own_outline = len(valid_own_fac_candidates) > 0

        # Kiểm tra counterpart (chỉ 1 bước, không bắc cầu)
        cp_code = (m.counterpart_code or "").strip().upper() if m.counterpart_code else None
        cp_candidates = list(module_candidates.get(cp_code, {}).values()) if cp_code else []
        valid_cp_fac_candidates: list[_OutlineCandidate] = [
            c for c in cp_candidates if clean_raw_text(c.faculty) and has_core_name(c.faculty)
        ] if cp_code else []
        has_faculty_in_cp_outline = len(valid_cp_fac_candidates) > 0

        cur_fac = m.faculty or ""
        cur_dept = m.department or ""

        target_fac: str
        target_dept: str | None = None
        raw_fac_for_row: str = ""
        source_type: str = ""
        needs_review: bool = False
        lý_do: str = ""
        issue_reasons: list[str] = []
        is_prefix_conflict: bool = False

        pref = extract_module_prefix(c_code)
        pref_entry = prefix_table.get(pref) if pref else None

        if c_code in overrides:
            ov_fac, ov_dept, ov_note = overrides[c_code]
            source_type = "override"
            target_fac = ov_fac
            target_dept = ov_dept or None
            target_dept_str = ov_dept or ""
            raw_fac_for_row = ""
            needs_review = False
            is_changed = (cur_fac != target_fac) or (cur_dept != target_dept_str)
            kết_luận = "chỉ định tay"
            lý_do = f"chỉ định tay ({ov_note})" if ov_note else "chỉ định tay"
            vấn_đề = "chỉ định tay"
            faculty_theo_dc = ""
            dept_theo_dc = ""
            fac_chuan = target_fac
        elif getattr(m, "faculty_source", None) == "admin":
            source_type = "admin"
            target_fac = cur_fac
            target_dept = m.department
            target_dept_str = cur_dept
            raw_fac_for_row = ""
            needs_review = False
            is_changed = False
            kết_luận = "giữ nguyên"
            lý_do = "nguồn admin (đã chỉnh tay)"
            vấn_đề = "nguồn admin (đã chỉnh tay)"
            faculty_theo_dc = ""
            dept_theo_dc = ""
            can_cur = canonical_faculty_vi(cur_fac) if cur_fac else None
            fac_chuan = can_cur or cur_fac
        elif c_code in master_courses or m.faculty_source == "master_data":
            # Mỗi ô thiếu dữ liệu giữ nguyên giá trị DB của trường tương ứng.
            master_fac, master_dept = master_course_affiliation(master_courses.get(c_code, {}))
            target_fac = master_fac or cur_fac
            target_dept = master_dept or m.department
            target_dept_str = target_dept or ""
            source_type = "master_data"
            raw_fac_for_row = ""
            needs_review = False
            is_changed = (cur_fac != target_fac) or (cur_dept != target_dept_str)
            kết_luận = "đổi" if is_changed else "giữ nguyên"
            lý_do = "nguồn Master_data"
            vấn_đề = ""
            fac_chuan = canonical_faculty_vi(target_fac) or target_fac
            faculty_theo_dc = ""
            dept_theo_dc = ""

            # Kiểm tra mâu thuẫn với đề cương
            chosen_cands = valid_own_fac_candidates or valid_cp_fac_candidates
            if master_fac and chosen_cands:
                best_dc = max(chosen_cands, key=lambda c: _candidate_rank_key(c, c_code if valid_own_fac_candidates else cp_code))
                can_dc = canonical_faculty_vi(clean_raw_text(best_dc.faculty))
                if can_dc and can_dc != target_fac:
                    faculty_theo_dc = can_dc
                    dept_theo_dc = clean_raw_text(best_dc.department) if best_dc.department else ""
                    lý_do = f"theo Master_data (mâu thuẫn đề cương: {can_dc})"
                    vấn_đề = f"mâu thuẫn Master vs đề cương: {target_fac} vs {can_dc}"
                    if conflicts_list is not None:
                        conflicts_list.append({
                            "code": m.code,
                            "name": m.name or "",
                            "faculty_master": target_fac,
                            "faculty_outline": can_dc,
                            "department_master": target_dept_str,
                            "department_outline": dept_theo_dc,
                            "ghi_chu": f"Master: {target_fac} vs Đề cương: {can_dc}",
                        })
        elif has_faculty_in_own_outline:
            source_type = "outline"
            chosen_candidates = valid_own_fac_candidates
            eval_code = c_code
        elif has_faculty_in_cp_outline:
            source_type = "counterpart_outline"
            chosen_candidates = valid_cp_fac_candidates
            eval_code = cp_code  # type: ignore
        else:
            chosen_candidates = []
            eval_code = c_code

        if c_code in overrides or getattr(m, "faculty_source", None) == "admin" or source_type == "master_data":
            pass
        elif chosen_candidates:
            # Thu thập các khoa chuẩn hóa từ các bản đề cương
            distinct_canonical: set[str] = set()
            for c in chosen_candidates:
                cf = clean_raw_text(c.faculty)
                can = canonical_faculty_vi(cf)
                if can:
                    distinct_canonical.add(can)

            is_multi_conflict = len(distinct_canonical) > 1

            best = max(chosen_candidates, key=lambda c: _candidate_rank_key(c, eval_code))
            raw_fac = (best.faculty or "").strip()
            raw_dept = (best.department or "").strip() if best.department else None
            raw_fac_for_row = raw_fac
            clean_fac = clean_raw_text(raw_fac)
            clean_dept = clean_raw_text(raw_dept) if raw_dept else None

            # 1. Kiểm tra tên ghép hoặc tên chưa chắc chắn (cần duyệt)
            is_ambig, ambig_desc = is_compound_or_needs_review_faculty(clean_fac)

            # 2. Kiểm tra tên khoa thực chất là bộ môn
            is_dept, mapped_dept = is_department(clean_fac)

            # 3. Ánh xạ khoa chuẩn
            can_fac = canonical_faculty_vi(clean_fac)

            if is_ambig:
                needs_review = True
                target_fac = "Phòng Đào tạo"
                target_dept = normalize_department(clean_dept)
                lý_do = f"mâu thuẫn tên chuẩn hóa: {ambig_desc}"
                issue_reasons.append(f"cần duyệt: {ambig_desc}")

            elif is_dept:
                needs_review = True
                target_fac = "Phòng Đào tạo"  # Không gán bộ môn thành khoa, không đoán khoa
                if not clean_dept:
                    target_dept = mapped_dept
                else:
                    target_dept = normalize_department(clean_dept)
                lý_do = f"mâu thuẫn tên chuẩn hóa: tên khoa thực chất là bộ môn ({raw_fac})"
                issue_reasons.append(f"cần duyệt: tên khoa thực chất là bộ môn ({raw_fac})")

            elif can_fac:
                target_fac = can_fac
                target_dept = normalize_department(clean_dept)
                if is_multi_conflict:
                    needs_review = True
                    conf_str = ", ".join(sorted(distinct_canonical))
                    prefix_note = f"đề cương bản tương ứng ({cp_code})" if source_type == "counterpart_outline" else "đề cương"
                    lý_do = f"{prefix_note} mâu thuẫn bản khác của cùng môn ({conf_str})"
                    issue_reasons.append(f"cần duyệt: {prefix_note} mâu thuẫn khoa ({conf_str})")
                else:
                    needs_review = False
                    lý_do = f"lấy từ đề cương bản tương ứng ({cp_code})" if source_type == "counterpart_outline" else ""

            else:
                # Tên khoa chưa ánh xạ được
                target_fac = raw_fac
                target_dept = normalize_department(clean_dept)
                needs_review = True
                unmapped_names_set.add(raw_fac)
                lý_do = f"mâu thuẫn tên chuẩn hóa: tên khoa chưa ánh xạ ({raw_fac})"
                issue_reasons.append(f"tên khoa chưa ánh xạ: {raw_fac}")

            target_dept_str = target_dept or ""
            is_changed = (cur_fac != target_fac) or (cur_dept != target_dept_str)
            if is_changed and not issue_reasons and not needs_review:
                if source_type == "counterpart_outline":
                    issue_reasons.append(f"khoa/bộ môn khác đề cương bản tương ứng ({cp_code})")
                else:
                    issue_reasons.append("khoa/bộ môn khác đề cương")

            vấn_đề = "; ".join(issue_reasons)

            if needs_review:
                kết_luận = "cần duyệt"
            elif is_changed:
                kết_luận = "đổi"
            else:
                kết_luận = "giữ nguyên"

            faculty_theo_dc = target_fac
            dept_theo_dc = target_dept_str
            fac_chuan = target_fac

        elif pref_entry:
            # (c) Nguồn thứ ba: tiền tố mã học phần [B|E][XX] (Brief B6i)
            pref_fac = pref_entry.faculty_chuẩn
            ratio_str = f"{pref_entry.ratio * 100:.1f}%"
            can_cur = canonical_faculty_vi(cur_fac) if cur_fac else ""

            if not cur_fac:
                # Điền chỗ trống theo tiền tố
                target_fac = pref_fac
                target_dept = m.department
                target_dept_str = cur_dept
                raw_fac_for_row = ""
                source_type = "prefix"
                needs_review = False
                is_changed = True
                kết_luận = "đổi"
                lý_do = f"điền theo tiền tố {pref} ({ratio_str})"
                vấn_đề = f"điền theo tiền tố {pref}"
                faculty_theo_dc = ""
                dept_theo_dc = ""
                fac_chuan = pref_fac
            elif can_cur != pref_fac and cur_fac != pref_fac:
                # Mâu thuẫn tiền tố: KHÔNG ghi đè, đưa vào danh sách mâu thuẫn để duyệt
                target_fac = cur_fac
                target_dept = m.department
                target_dept_str = cur_dept
                raw_fac_for_row = ""
                source_type = ""
                needs_review = True
                is_changed = False
                kết_luận = "cần duyệt"
                lý_do = f"mâu thuẫn tiền tố – cần duyệt: hiện tại là '{cur_fac}', tiền tố {pref} là '{pref_fac}' ({ratio_str})"
                vấn_đề = f"mâu thuẫn tiền tố: {cur_fac} vs {pref_fac} ({pref})"
                faculty_theo_dc = ""
                dept_theo_dc = ""
                fac_chuan = can_cur or cur_fac
                is_prefix_conflict = True
            else:
                # Đã có khoa cũ và khớp với tiền tố: giữ nguyên giá trị DB cũ
                target_fac = cur_fac
                target_dept = m.department
                target_dept_str = cur_dept
                raw_fac_for_row = ""
                source_type = ""
                needs_review = False
                is_changed = False
                kết_luận = "giữ nguyên"
                lý_do = "không có đề cương – chưa kiểm chứng"
                vấn_đề = "không có đề cương – chưa kiểm chứng"
                faculty_theo_dc = ""
                dept_theo_dc = ""
                fac_chuan = can_cur or cur_fac

        else:
            # (d) Môn không có đề cương của mình lẫn của bản tương ứng hay tiền tố -> giữ nguyên giá trị DB cũ
            target_fac = cur_fac
            target_dept = m.department
            target_dept_str = cur_dept
            raw_fac_for_row = ""
            source_type = ""
            needs_review = False
            is_changed = False
            kết_luận = "giữ nguyên"
            faculty_theo_dc = ""
            dept_theo_dc = ""
            can_cur = canonical_faculty_vi(cur_fac) if cur_fac else None
            fac_chuan = can_cur or cur_fac

            if cur_fac:
                lý_do = "không có đề cương – chưa kiểm chứng"
                vấn_đề = "không có đề cương – chưa kiểm chứng"
            else:
                lý_do = "không có đề cương (trống)"
                vấn_đề = "không có đề cương"

        pref_fac_val = pref_entry.faculty_chuẩn if pref_entry else ""
        pref_ratio_val = f"{pref_entry.ratio * 100:.1f}%" if pref_entry else ""

        audit_rows.append({
            "code": m.code,
            "name": m.name or "",
            "faculty_hiện_tại": cur_fac,
            "department_hiện_tại": cur_dept,
            "faculty_gốc_đề_cương": raw_fac_for_row,
            "faculty_chuẩn": fac_chuan,
            "faculty_theo_đề_cương": faculty_theo_dc,
            "department_theo_đề_cương": dept_theo_dc,
            "có_đề_cương": "có" if has_own_outline else "không",
            "nguồn": source_type,
            "faculty_source": getattr(m, "faculty_source", None) or (source_type if source_type else None),
            "needs_review": "có" if needs_review else "không",
            "kết_luận": kết_luận,
            "lý do": lý_do,
            "vấn_đề": vấn_đề,
            "faculty_cũ": cur_fac,
            "faculty_mới": target_fac,
            "department_cũ": cur_dept,
            "department_mới": target_dept_str,
            "nguồn quyết định": source_type or "none",
            "is_changed": is_changed,
            "is_conflict": (kết_luận == "cần duyệt"),
            "has_outline": has_own_outline,
            "needs_review_bool": needs_review,
            "is_prefix_conflict": is_prefix_conflict,
            "prefix": pref or "",
            "faculty_theo_tiền_tố": pref_fac_val,
            "tỷ_lệ_tiền_tố": pref_ratio_val,
        })

    return audit_rows, sorted(unmapped_names_set)


def audit_module_faculties(
    db: Session,
    mods: dict[str, Module] | None = None,
    prefix_table: dict[str, PrefixEntry] | None = None,
) -> list[dict]:
    """Rà soát khoa/bộ môn của toàn bộ học phần trong DB (không sửa DB)."""
    rows, _ = audit_module_faculties_with_unmapped(db, mods=mods, prefix_table=prefix_table)
    return rows


def summarize_audit(
    rows: list[dict],
    unmapped: list[str] | None = None,
    prefix_table: dict[str, Any] | None = None,
) -> dict:
    """Tóm tắt số liệu từ kết quả rà soát khoa/bộ môn (Brief B6h/B6i)."""
    total = len(rows)
    with_outline = sum(1 for r in rows if r["có_đề_cương"] == "có")
    from_outline = sum(1 for r in rows if r.get("nguồn") == "outline")
    from_counterpart = sum(1 for r in rows if r.get("nguồn") == "counterpart_outline")
    from_prefix = sum(1 for r in rows if r.get("nguồn") == "prefix")
    from_master_data = sum(1 for r in rows if r.get("nguồn") == "master_data" or r.get("faculty_source") == "master_data")
    from_admin = sum(1 for r in rows if r.get("nguồn") == "admin" or r.get("faculty_source") == "admin")
    from_override = sum(1 for r in rows if r.get("nguồn") == "override" or r.get("kết_luận") == "chỉ định tay")
    prefix_conflicts = sum(1 for r in rows if r.get("is_prefix_conflict") or "mâu thuẫn tiền tố" in (r.get("lý do") or ""))
    no_source = sum(1 for r in rows if r.get("nguồn") not in ("outline", "counterpart_outline", "prefix", "override", "master_data", "admin"))
    changed = sum(1 for r in rows if r["is_changed"])
    conflicts = sum(1 for r in rows if "cần duyệt" in r["kết_luận"])

    # Số môn giữ nguyên
    kept_unchanged = sum(1 for r in rows if r["kết_luận"] == "giữ nguyên")
    kept_empty = sum(
        1 for r in rows
        if r["kết_luận"] == "giữ nguyên"
        and not (r.get("faculty_hiện_tại") or "").strip()
        and not (r.get("faculty_chuẩn") or "").strip()
    )
    kept_unverified = sum(
        1 for r in rows
        if r["kết_luận"] == "giữ nguyên"
        and (r.get("faculty_hiện_tại") or "").strip()
        and r.get("nguồn") not in ("outline", "counterpart_outline", "prefix", "override")
    )

    # Số khoa chuẩn sau chuẩn hóa (phải ≤ 10 nhãn: 9 khoa + Phòng Đào tạo, ngoài danh sách 'cần duyệt')
    canonical_rows = [r for r in rows if r["needs_review"] == "không" and r["faculty_chuẩn"]]
    by_faculty = dict(Counter(r["faculty_chuẩn"] for r in canonical_rows).most_common())
    canonical_faculty_count = len(by_faculty)

    # Danh sách 'cần duyệt' (tên gốc, số môn, mã môn mẫu)
    needs_review_rows = [r for r in rows if r["needs_review"] == "có"]
    needs_review_counter = Counter(
        (r["faculty_gốc_đề_cương"] or r["lý do"]) for r in needs_review_rows
    )
    needs_review_codes: dict[str, list[str]] = {}
    for r in needs_review_rows:
        key = r["faculty_gốc_đề_cương"] or r["lý do"]
        if key not in needs_review_codes:
            needs_review_codes[key] = []
        c = r.get("code")
        if c and c not in needs_review_codes[key] and len(needs_review_codes[key]) < 5:
            needs_review_codes[key].append(c)

    needs_review_list = [
        {
            "name": name,
            "count": count,
            "sample_codes": needs_review_codes.get(name, []),
        }
        for name, count in needs_review_counter.most_common()
    ]

    prefix_dict = {}
    pref_source = prefix_table if prefix_table is not None else load_prefix_table()
    for p, entry in pref_source.items():
        prefix_dict[p] = entry.faculty_chuẩn if hasattr(entry, "faculty_chuẩn") else str(entry)

    return {
        "total_modules": total,
        "with_outline": with_outline,
        "from_outline": from_outline,
        "from_counterpart": from_counterpart,
        "from_prefix": from_prefix,
        "from_master_data": from_master_data,
        "from_admin": from_admin,
        "from_override": from_override,
        "prefix_conflicts": prefix_conflicts,
        "no_source": no_source,
        "no_source_count": no_source,
        "changed": changed,
        "conflicts": conflicts,
        "kept_unchanged": kept_unchanged,
        "kept_empty": kept_empty,
        "kept_unverified": kept_unverified,
        "canonical_faculty_count": canonical_faculty_count,
        "by_faculty": by_faculty,
        "needs_review_count": len(needs_review_rows),
        "needs_review_list": needs_review_list,
        "unmapped_names": sorted(set(unmapped or [])),
        "prefix_table": prefix_dict,
        "used_prefix_table": prefix_dict,
    }


def write_audit_csv(rows: list[dict], csv_path: Path | str) -> str:
    """Xuất file CSV báo cáo rà soát chuẩn hóa khoa/bộ môn theo đúng định dạng Brief B6h/B6i."""
    p = Path(csv_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    cols = [
        "code",
        "name",
        "faculty_hiện_tại",
        "department_hiện_tại",
        "faculty_gốc_đề_cương",
        "faculty_chuẩn",
        "faculty_theo_đề_cương",
        "department_theo_đề_cương",
        "có_đề_cương",
        "nguồn",
        "needs_review",
        "kết_luận",
        "lý do",
        "vấn_đề",
    ]
    with p.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        writer.writeheader()
        for r in rows:
            writer.writerow({k: (r.get(k) or "") for k in cols})
    return str(p)


def apply_outline_faculties(
    db: Session,
    *,
    mods: dict[str, Module] | None = None,
    prefix_table: dict[str, PrefixEntry] | None = None,
    conflicts_csv_path: Path | str | None = None,
    overrides: dict[str, tuple[str, str, str]] | None = None,
    master_courses: dict[str, dict] | None = None,
    master_conflicts_csv_path: Path | str | None = None,
) -> dict:
    """Hàm áp dụng thuần + idempotent quy tắc khoa/bộ môn (Brief B6h/B6i, W29 và D4):
      - Khoa/bộ môn lấy theo thứ tự:
        (1) Chỉ định tay từ faculty_overrides.tsv (Ưu tiên 1 cao nhất);
        (2) Master_data sheet Data_Course (nguồn cao nhất cho khóa 2025/2026, #N/A hoặc trống giữ nguyên DB cũ);
        (a) Đề cương của chính mã đó;
        (b) Đề cương của bản tương ứng Anh↔Việt (counterpart_code, không bắc cầu);
        (c) Tiền tố mã học phần [B|E][XX] (chỉ điền chỗ trống, không ghi đè ca mâu thuẫn);
        (d) Giữ nguyên giá trị đang có trong DB.
      - Cập nhật modules.search_text khi có thay đổi.
      - Idempotent: chạy nhiều lần kết quả không đổi.
    """
    if prefix_table is None:
        prefix_table = load_prefix_table()
    if overrides is None:
        overrides = load_faculty_overrides()
    master_conflicts: list[dict] = []
    rows, unmapped = audit_module_faculties_with_unmapped(
        db, mods=mods, prefix_table=prefix_table, overrides=overrides,
        master_courses=master_courses, conflicts_list=master_conflicts,
    )
    if mods is None:
        mods = {m.code: m for m in db.scalars(select(Module)).all()}

    applied_count = 0
    for r in rows:
        if not r["is_changed"]:
            continue
        code = r["code"]
        target_fac = r["faculty_mới"]
        target_dept = r["department_mới"]
        m = mods.get(code)
        if not m:
            continue
        src = r.get("nguồn") or None
        if getattr(m, "faculty_source", None) == "admin" and src != "override":
            continue
        if getattr(m, "faculty_source", None) == "master_data" and src not in ("override", "master_data"):
            continue
        cur_fac = m.faculty or ""
        cur_dept = m.department or ""
        if cur_fac != target_fac or cur_dept != target_dept:
            if cur_fac != target_fac:
                m.faculty = target_fac or None
            if cur_dept != target_dept:
                m.department = target_dept or None
            if src in ("outline", "counterpart_outline", "prefix", "master_data"):
                m.faculty_source = src
            elif src == "override":
                m.faculty_source = "admin"
            m.search_text = normalize_search(f"{m.code} {m.name} {m.name_en or ''} {m.faculty or ''} {m.department or ''}")
            applied_count += 1

    if applied_count > 0:
        db.commit()

    conflict_rows = [r for r in rows if r.get("is_prefix_conflict")]
    if conflicts_csv_path or conflict_rows:
        try:
            target_conflicts_path = conflicts_csv_path or DEFAULT_CONFLICTS_CSV
            write_prefix_conflicts_csv(conflict_rows, target_conflicts_path)
        except Exception:
            pass

    if master_conflicts:
        try:
            from app.services.master_data_import import write_faculty_conflicts_csv
            target_master_conflicts = master_conflicts_csv_path or (Path(__file__).resolve().parents[2] / "data" / "processed" / "module_faculty_conflicts.csv")
            write_faculty_conflicts_csv(master_conflicts, target_master_conflicts)
        except Exception:
            pass

    summary = summarize_audit(rows, unmapped, prefix_table=prefix_table)
    summary["applied_changes"] = applied_count
    return summary


def audit_faculty_command(
    db: Session,
    *,
    csv_path: Path | str | None = None,
    rebuild_prefix_table: bool = False,
    conflicts_csv_path: Path | str | None = None,
) -> dict:
    """Lệnh audit-faculty: kiểm tra độc lập, không sửa DB, xuất CSV và tóm tắt (Brief B6i)."""
    pref_tbl = _prefix_table_for_command(db, rebuild_prefix_table)
    rows, unmapped = audit_module_faculties_with_unmapped(db, prefix_table=pref_tbl)
    written_csv = None
    if csv_path:
        written_csv = write_audit_csv(rows, csv_path)

    conflict_rows = [r for r in rows if r.get("is_prefix_conflict")]
    written_conflicts_csv = None
    if conflicts_csv_path or conflict_rows:
        try:
            target_conflicts_path = conflicts_csv_path or DEFAULT_CONFLICTS_CSV
            written_conflicts_csv = write_prefix_conflicts_csv(conflict_rows, target_conflicts_path)
        except Exception:
            written_conflicts_csv = None

    summary = summarize_audit(rows, unmapped, prefix_table=pref_tbl)
    summary["csv_path"] = written_csv
    summary["conflicts_csv_path"] = written_conflicts_csv
    return summary


def fix_module_faculties(
    db: Session,
    *,
    dry_run: bool = False,
    csv_path: Path | str | None = None,
    rebuild_prefix_table: bool = False,
    conflicts_csv_path: Path | str | None = None,
) -> dict:
    """Lệnh fix-module-faculty [--dry-run]:
    Nếu dry_run=True: chỉ xuất báo cáo CSV, không sửa DB.
    Nếu dry_run=False: ghi báo cáo CSV và cập nhật DB (apply_outline_faculties).
    """
    from app.services.master_data_import import load_master_data_courses

    pref_tbl = _prefix_table_for_command(db, rebuild_prefix_table)
    master_courses = load_master_data_courses()
    rows, unmapped = audit_module_faculties_with_unmapped(db, prefix_table=pref_tbl, master_courses=master_courses)
    written_csv = None
    if csv_path:
        written_csv = write_audit_csv(rows, csv_path)

    conflict_rows = [r for r in rows if r.get("is_prefix_conflict")]
    written_conflicts_csv = None
    if conflicts_csv_path or conflict_rows:
        try:
            target_conflicts_path = conflicts_csv_path or DEFAULT_CONFLICTS_CSV
            written_conflicts_csv = write_prefix_conflicts_csv(conflict_rows, target_conflicts_path)
        except Exception:
            written_conflicts_csv = None

    summary = summarize_audit(rows, unmapped, prefix_table=pref_tbl)
    summary["dry_run"] = dry_run
    summary["csv_path"] = written_csv
    summary["conflicts_csv_path"] = written_conflicts_csv

    if not dry_run:
        res = apply_outline_faculties(
            db, prefix_table=pref_tbl, conflicts_csv_path=conflicts_csv_path, master_courses=master_courses,
        )
        summary["applied_changes"] = res.get("applied_changes", 0)
    else:
        summary["applied_changes"] = 0

    return summary


def fill_faculties(db: Session) -> dict[str, int]:
    """Điền khoa/bộ môn từ đề cương và tiền tố theo quy tắc của chủ dự án (Brief B6i). Idempotent."""
    res = apply_outline_faculties(db)
    return {
        "total_modules": res.get("total_modules", 0),
        "applied_changes": res.get("applied_changes", 0),
        "with_outline": res.get("with_outline", 0),
        "from_outline": res.get("from_outline", 0),
        "from_counterpart": res.get("from_counterpart", 0),
        "from_prefix": res.get("from_prefix", 0),
        "prefix_conflicts": res.get("prefix_conflicts", 0),
        "no_source": res.get("no_source", 0),
        "kept_unchanged": res.get("kept_unchanged", 0),
    }


def resolve_module_faculty(
    db: Session,
    code: str,
    raw_faculty: str | None = None,
    raw_department: str | None = None,
    *,
    existing_mods: dict[str, Module] | None = None,
    prefix_table: dict[str, PrefixEntry] | None = None,
    overrides: dict[str, tuple[str, str, str]] | None = None,
) -> tuple[str, str | None]:
    """Tra cứu khoa/bộ môn của một học phần dựa vào file overrides, đề cương và tiền tố theo quy tắc B6i và W29:
      0. Ghi đè chỉ định tay từ faculty_overrides.tsv (Ưu tiên 1 cao nhất - Brief W29);
      1. Đề cương của chính mã đó;
      2. Nếu không có, đề cương của bản tương ứng Anh↔Việt (counterpart_code);
      3. Nếu không có, tiền tố mã học phần [B|E][XX] (chỉ điền chỗ trống, không ghi đè nếu mâu thuẫn);
      4. Nếu không có: giữ nguyên giá trị raw/hiện tại, KHÔNG ghi 'Phòng Đào tạo'.
    """
    c_code = code.strip().upper()
    if overrides is None:
        overrides = load_faculty_overrides()
    if c_code in overrides:
        ov_fac, ov_dept, _ = overrides[c_code]
        return ov_fac, ov_dept or None

    cur_m = existing_mods.get(c_code) if existing_mods else db.get(Module, c_code)
    if cur_m and getattr(cur_m, "faculty_source", None) == "admin":
        return cur_m.faculty or "", cur_m.department

    from app.services.master_data_import import load_master_data_courses, master_course_affiliation

    master_course = load_master_data_courses().get(c_code)
    if master_course is not None or (cur_m and cur_m.faculty_source == "master_data"):
        master_fac, master_dept = master_course_affiliation(master_course or {})
        return master_fac or (cur_m.faculty if cur_m else None) or "", master_dept or (cur_m.department if cur_m else None)

    def _get_outline_rows(cd: str):
        outline_row = db.execute(
            select(
                OutlineCourse.faculty,
                OutlineCourse.department,
                OutlineCourse.doc_type,
                OutlineCourse.parse_status,
                OutlineCourse.parsed_at,
                OutlineCourse.document_id,
                OutlineCourse.course_code_norm,
            )
            .join(OutlineModuleLink, OutlineModuleLink.document_id == OutlineCourse.document_id)
            .where(OutlineModuleLink.module_code == cd, OutlineCourse.faculty.is_not(None))
        ).all()

        norm_rows = db.execute(
            select(
                OutlineCourse.faculty,
                OutlineCourse.department,
                OutlineCourse.doc_type,
                OutlineCourse.parse_status,
                OutlineCourse.parsed_at,
                OutlineCourse.document_id,
                OutlineCourse.course_code_norm,
            )
            .where(
                or_(OutlineCourse.course_code_norm == cd, OutlineCourse.course_code == cd),
                OutlineCourse.faculty.is_not(None),
            )
        ).all()
        return list(outline_row) + [r for r in norm_rows if r not in outline_row]

    all_rows = _get_outline_rows(c_code)
    valid_rows = [r for r in all_rows if clean_raw_text(r[0]) and has_core_name(r[0])]

    if not valid_rows:
        # Thử tìm từ counterpart_code
        m = existing_mods.get(c_code) if existing_mods else db.get(Module, c_code)
        cp_code = (m.counterpart_code or "").strip().upper() if m and m.counterpart_code else None
        if cp_code:
            cp_rows = _get_outline_rows(cp_code)
            valid_rows = [r for r in cp_rows if clean_raw_text(r[0]) and has_core_name(r[0])]

    if valid_rows:
        def rank(r):
            exact = 1 if (r[6] and r[6].strip().upper() == c_code) else 0
            status_score = 3 if r[3] == "ok" else (2 if r[3] == "partial" else 1)
            type_score = 2 if r[2] == "syllabus_vi" else (1 if r[2] == "syllabus_en" else 0)
            pat_str = str(r[4]) if r[4] else ""
            clean_d = clean_raw_text(r[1])
            has_dept = 1 if (clean_d and has_core_name(clean_d)) else 0
            return (exact, has_dept, status_score, type_score, pat_str, r[5])

        best = max(valid_rows, key=rank)
        raw_f = best[0]
        raw_d = best[1]
        clean_f = clean_raw_text(raw_f)
        clean_d = clean_raw_text(raw_d) if raw_d else None

        is_ambig, _ = is_compound_or_needs_review_faculty(clean_f)
        is_dept, mapped_dept = is_department(clean_f)
        can_f = canonical_faculty_vi(clean_f)

        if is_ambig:
            dept_val = normalize_department(clean_d)
            return "Phòng Đào tạo", dept_val

        if is_dept:
            dept_val = mapped_dept if not clean_d else normalize_department(clean_d)
            return "Phòng Đào tạo", dept_val

        if can_f:
            dept_val = normalize_department(clean_d)
            return can_f, dept_val

        # Unmapped
        dept_val = normalize_department(clean_d)
        return raw_f.strip(), dept_val

    # (c) Nguồn thứ ba: Tiền tố mã học phần (Brief B6i)
    if prefix_table is None:
        prefix_table = load_prefix_table()
    pref = extract_module_prefix(c_code)
    cur_m = existing_mods.get(c_code) if existing_mods else db.get(Module, c_code)
    existing_fac = cur_m.faculty if cur_m and cur_m.faculty else (raw_faculty or "")
    existing_dept = cur_m.department if cur_m and cur_m.department else raw_department

    if not existing_fac and pref and pref in prefix_table:
        return prefix_table[pref].faculty_chuẩn, existing_dept

    # (d) Không có đề cương lẫn tiền tố: giữ nguyên giá trị raw hoặc DB hiện tại
    return existing_fac, existing_dept
