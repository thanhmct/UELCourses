"""Dịch vụ nạp chương trình đào tạo từ các file PDF/Excel/Word đã thu thập (Brief D3).

Tuân thủ nghiêm ngặt các quy tắc đã chốt:
1. Quy tắc khóa:
   - CTĐT ban hành năm Y áp dụng cho HAI khóa liên tiếp:
     CTĐT 2023 -> K23 và K24; CTĐT 2025 -> K25 và K26; CTĐT 2021 -> K21, K22; CTĐT 2027 -> K27, K28.
   - Ngoại lệ K23 tiếng Việt (Brief 1a / X2): K23 hệ tiếng Việt do Codex (X2) sao chép từ K24,
     D3 BỎ phần tạo K23 tiếng Việt từ 17 Excel, chỉ đối chiếu chênh lệch xuất ra ctdt2023_vs_db.csv.
     K23 hệ E / Coop (H) / CNTN (T / TE) VẪN nạp bình thường.
2. Nguồn chuẩn (Brief 1b):
   - Excel của Phòng BĐCL (data/raw/ctdt_bdcl/DH_*.xlsx) và Drive khoa (ctdt2023_excel/) ưu tiên hơn PDF.
   - Tên sheet là nguồn sự thật về hệ nào có thật (406, 406H, 411E, 411T, 411TE, 404, 414...).
   - Kinh tế đối ngoại: ưu tiên khuôn MyUEL 7 cột trong THS_KinhTeDoiNgoai.xlsx và DH_Luat.xlsx;
     bản chép tay TSV bổ sung; suggested_semester để trống.
     14 mã môn mới tạo tối thiểu; BRE4038 là lỗi gõ của BRB4038 ở sheet 1.
3. Học kỳ gợi ý (Brief 3b):
   - 3 học kỳ/năm, 10 học kỳ/4 năm liên tiếp (HK1..3 năm 1, HK4..6 năm 2, HK7..9 năm 3, HK10 năm 4).
   - Hàm semester_id_for(cohort_year, n).
   - Điền suggested_semester còn trống cho CTĐT 2025 (K25/K26).
4. Quy tắc B6 & D19:
   - KHÔNG ghi đè khoa/bộ môn của học phần từ file CTĐT.
   - Môn mới chưa có trong bảng modules tạo bản ghi tối thiểu (mã, tên, số tín chỉ), để trống khoa/bộ môn.
5. Idempotent & --dry-run:
   - --dry-run xuất data/processed/ctdt_import_preview.csv không sửa DB.
"""

from __future__ import annotations

import csv
import re
import unicodedata
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import Module, ModuleRelation, Program, ProgramModule
from app.services.ctdt_import import parse_equivalent_codes
from app.services.importer import ImportContext, clip, to_int
from app.services.legacy import skip_legacy_code
from app.services.program_names import format_undergrad_program_name
from app.services.requirements import parse_requirement, tree_codes
from app.services.text import normalize_search

# ---------------------------------------------------------------------------
# Bảng ánh xạ mã ngành, tên ngành và khoa
# ---------------------------------------------------------------------------

MAJOR_CODE_MAP: dict[str, str] = {
    # 401: Kinh tế / Kinh tế học
    "kinh te": "401", "kinh te hoc": "401", "kth": "401", "kt": "401",
    # 402: Kinh tế quốc tế / Kinh tế đối ngoại
    "kinh te quoc te": "402", "kinh te doi ngoai": "402", "ktqt": "402", "ktdn": "402",
    # 403: Kinh tế và Quản lý công
    "kinh te va quan ly cong": "403", "kt&qlc": "403", "ktqlc": "403",
    # 404: Tài chính - Ngân hàng
    "tai chinh - ngan hang": "404", "tai chinh ngan hang": "404", "tcnh": "404",
    # 405: Kế toán
    "ke toan": "405",
    # 406: Hệ thống thông tin quản lý
    "he thong thong tin quan ly": "406", "htttql": "406", "mis": "406",
    # 407: Quản trị kinh doanh
    "quan tri kinh doanh": "407", "qtkd": "407",
    # 408: Kinh doanh quốc tế
    "kinh doanh quoc te": "408", "kdqt": "408",
    # 409: Kiểm toán
    "kiem toan": "409",
    # 410: Marketing
    "marketing": "410", "mkt": "410",
    # 411: Thương mại điện tử
    "thuong mai dien tu": "411", "tmdt": "411",
    # 413: Toán kinh tế / Toán ứng dụng
    "toan kinh te": "413", "toan ung dung trong kinh te, quan tri va tai chinh": "413",
    "toan ung dung": "413", "tudtkt_qt_tc": "413",
    # 414: Công nghệ tài chính
    "cong nghe tai chinh": "414", "cntc": "414", "fintech": "414",
    # 415: Quản trị dịch vụ du lịch và lữ hành
    "quan tri dich vu du lich va lu hanh": "415", "quan tri du lich va lu hanh": "415",
    "du lich va lu hanh": "415", "dllh": "415",
    # 416: Kinh doanh số và Trí tuệ nhân tạo
    "kinh doanh so va tri tue nhan tao": "416", "kinh doanh so & tri tue nhan tao": "416",
    "kinh doanh so": "416", "kds_ai": "416", "kds&ai": "416",
    # 417: Digital Marketing
    "digital marketing": "417",
    # 418: Quản lý công
    "quan ly cong": "418", "qlc": "418",
    # 419: Phân tích dữ liệu
    "phan tich du lieu": "419", "ptdl": "419",
    # 420: Kinh doanh thương mại quốc tế / Logistics
    "kinh doanh thuong mai quoc te": "420", "logistics": "420",
    # 421: Kinh tế số
    "kinh te so": "421", "kts": "421",
    # 422: Kế toán & Phân tích dữ liệu
    "ke toan & phan tich du lieu": "422", "ke toan va phan tich du lieu": "422",
    "ke toan&ptdl": "422",
    # 430: Kinh doanh thương mại Hàn Quốc
    "kinh doanh thuong mai dien tu va dich vu": "430", "kdtmhq": "430",
    # Luật
    "luat kinh doanh": "501", "lkd": "501",
    "luat thuong mai quoc te": "502", "ltmqt": "502",
    "luat dan su": "503", "lds": "503",
    "luat tai chinh - ngan hang": "504", "luat tai chinh ngan hang": "504", "ltcnh": "504",
    "luat va chinh sach cong": "505", "l&csc": "505",
    "luat va cong nghe": "506", "l&cn": "506",
    "luat": "LUAT",
    "luat kinh te": "LKT",
    # Ngành mới khác
    "kinh doanh nong nghiep so": "KDNNS", "kdnns": "KDNNS",
    "kinh te dat dai": "KTDD", "ktdd": "KTDD",
}

MAJOR_NAMES: dict[str, str] = {
    "401": "Kinh tế",
    "402": "Kinh tế quốc tế",
    "403": "Kinh tế và Quản lý công",
    "404": "Tài chính - Ngân hàng",
    "405": "Kế toán",
    "406": "Hệ thống thông tin quản lý",
    "407": "Quản trị kinh doanh",
    "408": "Kinh doanh quốc tế",
    "409": "Kiểm toán",
    "410": "Marketing",
    "411": "Thương mại điện tử",
    "413": "Toán ứng dụng trong kinh tế, quản trị và tài chính",
    "414": "Công nghệ tài chính",
    "415": "Quản trị du lịch và lữ hành",
    "416": "Kinh doanh số và Trí tuệ nhân tạo",
    "417": "Digital Marketing",
    "418": "Quản lý công",
    "419": "Phân tích dữ liệu",
    "420": "Logistics và Quản lý chuỗi cung ứng",
    "421": "Kinh tế số",
    "422": "Kế toán và Phân tích dữ liệu",
    "430": "Kinh doanh thương mại Hàn Quốc",
    "501": "Luật kinh doanh",
    "502": "Luật thương mại quốc tế",
    "503": "Luật dân sự",
    "504": "Luật tài chính - ngân hàng",
    "505": "Luật và Chính sách công",
    "506": "Luật và Công nghệ",
    "LUAT": "Luật",
    "LKT": "Luật kinh tế",
    "KDNNS": "Kinh doanh nông nghiệp số",
    "KTDD": "Kinh tế đất đai",
}

MAJOR_FACULTIES: dict[str, str] = {
    "401": "Khoa Kinh tế", "403": "Khoa Kinh tế", "421": "Khoa Kinh tế",
    "KDNNS": "Khoa Kinh tế", "KTDD": "Khoa Kinh tế",
    "402": "Khoa Kinh tế đối ngoại", "408": "Khoa Kinh tế đối ngoại", "420": "Khoa Kinh tế đối ngoại",
    "404": "Khoa Tài chính - Ngân hàng", "414": "Khoa Tài chính - Ngân hàng",
    "405": "Khoa Kế toán - Kiểm toán", "409": "Khoa Kế toán - Kiểm toán", "422": "Khoa Kế toán - Kiểm toán",
    "406": "Khoa Hệ thống thông tin", "411": "Khoa Hệ thống thông tin", "416": "Khoa Hệ thống thông tin",
    "407": "Khoa Quản trị kinh doanh", "410": "Khoa Quản trị kinh doanh", "415": "Khoa Quản trị kinh doanh",
    "417": "Khoa Quản trị kinh doanh", "418": "Khoa Quản trị kinh doanh", "430": "Khoa Quản trị kinh doanh",
    "413": "Khoa Toán kinh tế", "419": "Khoa Toán kinh tế",
    "503": "Khoa Luật", "504": "Khoa Luật", "505": "Khoa Luật", "506": "Khoa Luật", "LUAT": "Khoa Luật",
    "501": "Khoa Luật Kinh tế", "502": "Khoa Luật Kinh tế", "LKT": "Khoa Luật Kinh tế",
}

# 14 mã môn học mới của Kinh tế đối ngoại (Brief 1b)
KT_DOI_NGOAI_14_NEW_MODULES = {
    "ERB4022", "ERB4037", "ERB4038", "ERB4039", "ERB5041",
    "ERBT017", "ERBT022", "ERBT038", "ERE3033", "ERET002",
    "ERET013", "EUUT021", "EUUT023",
}

# Lỗi gõ trong sheet 1 của Kinh tế đối ngoại: BRE4038 -> BRB4038
TYPO_CODE_CORRECTIONS = {
    "BRE4038": "BRB4038",
}


# ---------------------------------------------------------------------------
# 3b. Hàm thuần tính mã học kỳ theo quy tắc 3 kỳ/năm
# ---------------------------------------------------------------------------

def semester_id_for(cohort_year: int | str | None, n: int | str | None) -> str | None:
    """Tính mã học kỳ (vd 2025-2026-1) theo quy tắc 3 học kỳ/năm (10 học kỳ/4 năm liên tiếp).

    Quy tắc đếm:
    - HK1, HK2, HK3 -> năm 1
    - HK4, HK5, HK6 -> năm 2
    - HK7, HK8, HK9 -> năm 3
    - HK10          -> kỳ 1 năm 4

    Mốc kiểm chứng:
    - K25, n=1  -> 2025-2026-1
    - K25, n=3  -> 2025-2026-3
    - K25, n=4  -> 2026-2027-1
    - K25, n=6  -> 2026-2027-3
    - K25, n=7  -> 2027-2028-1
    - K25, n=9  -> 2027-2028-3
    - K25, n=10 -> 2028-2029-1
    """
    if cohort_year is None or n is None:
        return None

    # Chuẩn hóa cohort_year
    cy_str = str(cohort_year).strip().upper()
    m_cy = re.search(r"(\d{2,4})", cy_str)
    if not m_cy:
        return None
    cy_val = int(m_cy.group(1))
    if cy_val < 100:
        cy_val += 2000

    # Chuẩn hóa n
    n_str = str(n).strip()
    m_n = re.search(r"(-?\d+)", n_str)
    if not m_n:
        return None
    n_val = int(m_n.group(1))
    if n_val < 1:
        return None

    year_offset = (n_val - 1) // 3
    term = ((n_val - 1) % 3) + 1
    start_year = cy_val + year_offset
    end_year = start_year + 1
    return f"{start_year}-{end_year}-{term}"


def cohorts_for_curriculum_year(year: int | str) -> list[str]:
    """Quy tắc khóa: CTĐT ban hành năm Y áp dụng cho HAI khóa liên tiếp:
    - 2023 -> K23, K24
    - 2025 -> K25, K26
    - 2021 -> K21, K22
    - 2027 -> K27, K28
    """
    m = re.search(r"(\d{4})", str(year))
    if not m:
        return []
    y = int(m.group(1))
    c1 = y % 100
    c2 = c1 + 1
    return [f"K{c1:02d}", f"K{c2:02d}"]


# ---------------------------------------------------------------------------
# Phân loại và bóc tách tên file
# ---------------------------------------------------------------------------

_EXCLUDED_PATTERNS = [
    re.compile(r"^LichThi", re.I),
    re.compile(r"^GHICHU_", re.I),
    re.compile(r"QD_BanHanh", re.I),
    re.compile(r"_(?:ChuanDauRa|ChuoiMonHoc|ThongTinMonHoc)\b", re.I),
]

_INSUFFICIENT_DATA_FILES = {
    "CTDT2025_KeToan_MoTa.docx",
    "CTDT2025_KiemToan_MoTa.docx",
}


def normalize_token(s: str | None) -> str:
    """Chuẩn hóa chuỗi tìm kiếm không dấu, chữ thường."""
    if not s:
        return ""
    text = unicodedata.normalize("NFD", str(s).replace("đ", "d").replace("Đ", "D"))
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = re.sub(r"[_\-\s/]+", " ", text).strip().lower()
    return text


def parse_ctdt_filename(filename: str) -> dict[str, Any]:
    """Phân loại và bóc tách thông tin từ tên file CTĐT chuẩn hóa.

    Định dạng: CTDT{năm}_{TenNganh}[_EN|_VI|_CNTN|_CLC][_phụ lục].{pdf|xls|xlsx|docx}
    """
    stem = Path(filename).stem
    ext = Path(filename).suffix.lower()

    for rx in _EXCLUDED_PATTERNS:
        if rx.search(stem):
            return {"status": "excluded", "filename": filename, "reason": "Tiền tố/phụ lục bị loại"}

    if filename in _INSUFFICIENT_DATA_FILES or stem in _INSUFFICIENT_DATA_FILES:
        return {"status": "insufficient_data", "filename": filename, "reason": "Bản mô tả tóm tắt, chưa đủ danh sách HP"}

    m_year = re.search(r"CTDT(\d{4})", stem, re.I)
    if not m_year:
        # Hỗ trợ thêm tên file như DH_*.xlsx hoặc tên có năm
        m_year_alt = re.search(r"(20\d{2})", stem)
        year = int(m_year_alt.group(1)) if m_year_alt else None
    else:
        year = int(m_year.group(1))

    # Phát hiện biến thể
    variant = ""
    stem_upper = stem.upper()
    if re.search(r"(?:_TE|\(TE\)|CNTN_E)(?:_|$)", stem_upper):
        variant = "TE"
    elif re.search(r"(?:_EN|\(E\)|_E)(?:_|$)", stem_upper):
        variant = "E"
    elif re.search(r"(?:_CNTN|\(T\)|_T)(?:_|$)", stem_upper):
        variant = "T"
    elif re.search(r"(?:_COOP|\(H\)|_H)(?:_|$)", stem_upper):
        variant = "H"
    elif re.search(r"(?:_CLC|\(CLC\))(?:_|$)", stem_upper):
        variant = "CLC"
    elif re.search(r"(?:_VI|\(VI\))(?:_|$)", stem_upper):
        variant = ""

    # Dò mã ngành từ stem
    major_code = None
    # Thử tìm số ngành 3 số 4xx/5xx
    m_code = re.search(r"(?<!\d)(4\d{2}|5\d{2})(?!\d)", stem)
    if m_code:
        major_code = m_code.group(1)
    else:
        # Dò qua từ khóa tên ngành
        norm_stem = normalize_token(stem)
        for name_key, code in sorted(MAJOR_CODE_MAP.items(), key=lambda kv: len(kv[0]), reverse=True):
            aliases = {name_key, name_key.replace(" ", "")}
            if any(re.search(rf"(?<!\w){re.escape(alias)}(?!\w)", norm_stem) for alias in aliases):
                major_code = code
                break

    return {
        "status": "ok",
        "filename": filename,
        "year": year,
        "major_code": major_code,
        "major_name": MAJOR_NAMES.get(major_code or "", major_code or ""),
        "variant": variant,
        "ext": ext,
    }


_SHEET_NUMBER = r"\d+[._-]\s*"
_SHEET_ID = re.compile(
    rf"^(?P<number>{_SHEET_NUMBER})?(?P<major>[45]\d{{2}})(?P<variant>TE|E|T|H)?(?=$|[-_\s.(])",
    re.I,
)
_LAW_2023_MAJORS = {"503", "504", "505", "506"}


def _sheet_skip_reason(sheet_name: str) -> str:
    label = re.sub(rf"^{_SHEET_NUMBER}", "", sheet_name.strip())
    normalized = normalize_token(label)
    if re.match(r"^(?:du lieu goc|data\b|trang tinh|sheet\d+$)", normalized):
        return "Sheet dữ liệu gốc hoặc bảng phụ"
    if re.search(r"\bths\b", normalized):
        return "Chương trình thạc sĩ"
    if re.fullmatch(r"(?:cn )?thuong mai dien tu \((?:ta|tv|cntn|e)\)", normalized):
        return "Sheet TMĐT phụ theo tên mô tả, ưu tiên sheet BĐCL có mã ngành"
    return ""


def parse_bdcl_sheet_name(sheet_name: str, default_major: str | None = None) -> dict[str, Any] | None:
    """Tách định danh đứng đầu sheet và hậu tố liền với mã ngành."""
    name = sheet_name.strip()
    if _sheet_skip_reason(name):
        return None

    identifier = _SHEET_ID.match(name)
    if identifier:
        major_code = identifier["major"]
        variant = (identifier["variant"] or "").upper()
        # Hai sheet Kiểm toán BĐCL ghi mã 405; chương trình Kiểm toán là 409.
        if major_code == "405" and "kiem toan" in normalize_token(name[identifier.end():]):
            major_code = "409"
    else:
        label = normalize_token(re.sub(rf"^{_SHEET_NUMBER}", "", name))
        major_code = MAJOR_CODE_MAP.get(label) or default_major
        variant = ""

    if not major_code:
        return None
    cohorts = set(re.findall(r"(?<![A-Z0-9])K(?:25|26)(?![A-Z0-9])", name.upper()))
    return {
        "major_code": major_code,
        "major_name": MAJOR_NAMES.get(major_code, major_code),
        "variant": variant,
        "cohort_override": cohorts.pop() if len(cohorts) == 1 else None,
        "sheet_name": name,
        "has_identifier": identifier is not None,
        "numbered": bool(identifier and identifier["number"]),
    }


# ---------------------------------------------------------------------------
# Dò cột theo từ khóa tiếng Việt & tiếng Anh
# ---------------------------------------------------------------------------

_COL_PATTERNS: dict[str, list[str]] = {
    "code": [
        "ma mon hoc", "ma hoc phan", "ma hp", "ma mon", "course code",
        "module code", "subject code", "course id", "code", "ma_hp", "ma_mon",
    ],
    "name_en": [
        "ten tieng anh", "tieng anh", "english name", "course name in english",
        "course title in english", "ten en", "tieng anh (en)", "english", "ten_en",
    ],
    "name": [
        "ten mon hoc", "ten hoc phan", "ten hp", "ten mon", "course name",
        "module name", "subject name", "course title", "title", "name", "ten_hp", "ten_mon",
    ],
    "credits": [
        "so tin chi", "tin chi", "stc", "credits", "credit", "cr", "so_tc", "tin_chi",
    ],
    "required": [
        "loai mon hoc", "loai hoc phan", "loai mon", "loai hp", "bat buoc",
        "course type", "compulsory", "elective", "type", "loai", "nhom",
    ],
    "semester": [
        "hoc ky k23/k24", "hoc ky k23", "hoc ky k24", "hoc ky k25", "hoc ky k26",
        "hoc ky", "ky", "semester", "term", "hoc_ky",
    ],
    "block": [
        "khoi kien thuc", "khoi", "knowledge block", "block", "khoi_kt",
    ],
    "prereq": [
        "tien quyet", "hoc phan tien quyet", "prerequisite", "prereq", "tien_quyet",
    ],
    "previous": [
        "hoc truoc", "hoc phan hoc truoc", "previous", "prev", "hoc_truoc",
    ],
    "coreq": [
        "song hanh", "hoc phan song hanh", "corequisite", "coreq", "song_hanh",
    ],
    "equivalent": [
        "tuong duong", "hoc phan tuong duong", "equivalent", "tuong_duong",
    ],
}


def detect_columns(headers: list[Any]) -> dict[str, int]:
    """Dò vị trí các cột theo từ khóa tiếng Việt và tiếng Anh.

    Không phụ thuộc vào vị trí cố định của cột.
    """
    out: dict[str, int] = {}
    normalized_headers = [normalize_token(str(h or "")) for h in headers]

    # Ưu tiên các trường đặc thù trước để tránh nhầm
    # (vd name_en trước name, prereq/prev/coreq trước các trường khác)
    field_order = [
        "name_en", "code", "credits", "required", "semester",
        "prereq", "previous", "coreq", "equivalent", "block", "name",
    ]

    used_indices: set[int] = set()

    for fld in field_order:
        patterns = _COL_PATTERNS[fld]
        for idx, h in enumerate(normalized_headers):
            if idx in used_indices or not h:
                continue
            # Khớp chính xác hoặc chứa từ khóa
            matched = False
            for pat in patterns:
                # Nếu từ khóa ngắn (<=3 ký tự như 'cr', 'stc', 'ky'), dùng word boundary
                if len(pat) <= 3:
                    if re.search(r"\b" + re.escape(pat) + r"\b", h):
                        matched = True
                        break
                else:
                    if pat in h:
                        matched = True
                        break
            if matched:
                out[fld] = idx
                used_indices.add(idx)
                break

    return out


def is_valid_module_code(code: str | None) -> bool:
    """Kiểm tra mã học phần hợp lệ của UEL (thường 6-10 ký tự, có tiền tố chữ + số)."""
    if not code:
        return False
    c = str(code).strip().upper()
    if skip_legacy_code(c):
        return False
    # Định dạng chuẩn UEL: 3-4 chữ + 3-5 số/chữ, vd BAA2028, ERB4022, BFF4029, BDG1014
    return bool(re.match(r"^[A-Z]{2,4}\d{3,5}[A-Z0-9]*$", c))


def parse_credits_val(val: Any) -> int | None:
    """Chuyển đổi số tín chỉ từ float, int hoặc string '3.00'."""
    if val is None or val == "":
        return None
    if isinstance(val, (int, float)):
        return int(round(val))
    s = str(val).strip().replace("\xa0", " ")
    m = re.search(r"(\d+(?:\.\d+)?)", s)
    if m:
        return int(round(float(m.group(1))))
    return None


def parse_is_required(val: Any) -> bool:
    """Xác định học phần có bắt buộc hay không."""
    if val is None or val == "":
        return True  # Mặc định trong CTĐT là bắt buộc trừ khi ghi tự chọn
    s = normalize_token(str(val))
    if any(k in s for k in ("tu chon", "elective", "optional", "0", "false")):
        return False
    return True


# ---------------------------------------------------------------------------
# Trích xuất dữ liệu học phần từ các bảng (Row objects)
# ---------------------------------------------------------------------------

@dataclass
class ParsedModuleRow:
    module_code: str
    name: str
    name_en: str | None = None
    credits: int | None = None
    required: bool = True
    suggested_term_raw: str | None = None
    suggested_order: int | None = None
    block: str | None = None
    prereq_raw: str | None = None
    previous_raw: str | None = None
    coreq_raw: str | None = None
    equivalent_raw: str | None = None
    note: str | None = None
    major_code: str | None = None


def _law_major(value: Any) -> str | None:
    token = normalize_token(str(value or "").strip(" :"))
    if token in _LAW_2023_MAJORS:
        return token
    if re.fullmatch(r"50[3-6]\.0", token):
        return token[:3]
    code = MAJOR_CODE_MAP.get(token)
    return code if code in _LAW_2023_MAJORS else None


def extract_rows_from_table(
    raw_rows: list[list[Any]], sheet_name: str = "", *, split_law_2023: bool = False,
) -> list[ParsedModuleRow]:
    """Tìm dòng tiêu đề và trích xuất danh sách học phần từ ma trận dòng ô."""
    if not raw_rows:
        return []

    # Tìm dòng tiêu đề tốt nhất trong 15 dòng đầu
    best_row_idx = -1
    best_score = -1
    best_col_map: dict[str, int] = {}

    for i, r in enumerate(raw_rows[:15]):
        col_map = detect_columns(r)
        # Điểm số dựa trên các cột cốt lõi
        score = sum(1 for k in ("code", "name", "credits", "required", "semester") if k in col_map)
        if "code" in col_map and ("name" in col_map or "credits" in col_map) and score > best_score:
            best_score = score
            best_row_idx = i
            best_col_map = col_map

    if best_row_idx < 0 or "code" not in best_col_map:
        return []

    code_idx = best_col_map["code"]
    name_idx = best_col_map.get("name")
    name_en_idx = best_col_map.get("name_en")
    cre_idx = best_col_map.get("credits")
    req_idx = best_col_map.get("required")
    sem_idx = best_col_map.get("semester")
    blk_idx = best_col_map.get("block")
    pre_idx = best_col_map.get("prereq")
    prev_idx = best_col_map.get("previous")
    co_idx = best_col_map.get("coreq")
    eq_idx = best_col_map.get("equivalent")

    law_columns = []
    report_major = None
    if split_law_2023:
        law_headers = {
            "nganh", "ma nganh", "ten nganh", "nganh dao tao", "ma nganh dao tao",
            "ten nganh dao tao", "ma chuyen nganh", "ten chuyen nganh",
            "chuyen nganh", "chuyen nganh dao tao",
        }
        law_columns = [
            i for i, cell in enumerate(raw_rows[best_row_idx])
            if normalize_token(cell) in law_headers
        ]
        if not law_columns:
            # Báo cáo MyUEL dạng in ghi chuyên ngành ở phần thông tin trước bảng.
            majors = set()
            for row in raw_rows[:best_row_idx]:
                values = [cell for cell in row if cell is not None and str(cell).strip()]
                if len(values) == 2 and normalize_token(values[0]) == "chuyen nganh dao tao":
                    majors.add(_law_major(values[1]))
            if len(majors) == 1:
                report_major = majors.pop()

    current_block = None
    out: list[ParsedModuleRow] = []
    seen_codes: set[tuple[str | None, str]] = set()

    for r in raw_rows[best_row_idx + 1:]:
        if not r or not any(r):
            continue

        raw_code = str(r[code_idx]).strip().replace("\xa0", "") if code_idx < len(r) and r[code_idx] is not None else ""
        raw_name = str(r[name_idx]).strip().replace("\xa0", " ") if name_idx is not None and name_idx < len(r) and r[name_idx] is not None else ""

        # Kiểm tra tiêu đề khối (nếu không có mã mà có chữ ở cột tên)
        if not raw_code and raw_name:
            if re.match(r"^(?:[I|V|X]+|\d+)\.?\s*(?:Kiến thức|Khối)", raw_name, re.I):
                current_block = raw_name
            continue

        # Sửa lỗi gõ BRE4038 -> BRB4038 nếu gặp
        if raw_code in TYPO_CODE_CORRECTIONS:
            raw_code = TYPO_CODE_CORRECTIONS[raw_code]

        if not is_valid_module_code(raw_code):
            continue

        code = raw_code.upper()
        major_code = report_major
        if law_columns:
            majors = {_law_major(r[i]) for i in law_columns if i < len(r)} - {None}
            major_code = majors.pop() if len(majors) == 1 else None
        row_key = (major_code, code)
        if row_key in seen_codes:
            continue
        seen_codes.add(row_key)

        name_en = str(r[name_en_idx]).strip().replace("\xa0", " ") if name_en_idx is not None and name_en_idx < len(r) and r[name_en_idx] is not None else None
        credits_val = parse_credits_val(r[cre_idx]) if cre_idx is not None and cre_idx < len(r) else None
        required_val = parse_is_required(r[req_idx]) if req_idx is not None and req_idx < len(r) else True

        raw_sem = str(r[sem_idx]).strip().replace("\xa0", "") if sem_idx is not None and sem_idx < len(r) and r[sem_idx] is not None else None
        order = None
        if raw_sem:
            m_term = re.search(r"(\d+)", raw_sem)
            if m_term:
                order = int(m_term.group(1))

        row_block = str(r[blk_idx]).strip().replace("\xa0", " ") if blk_idx is not None and blk_idx < len(r) and r[blk_idx] is not None else None
        block = row_block or current_block

        prereq = str(r[pre_idx]).strip() if pre_idx is not None and pre_idx < len(r) and r[pre_idx] is not None else None
        previous = str(r[prev_idx]).strip() if prev_idx is not None and prev_idx < len(r) and r[prev_idx] is not None else None
        coreq = str(r[co_idx]).strip() if co_idx is not None and co_idx < len(r) and r[co_idx] is not None else None
        eq = str(r[eq_idx]).strip() if eq_idx is not None and eq_idx < len(r) and r[eq_idx] is not None else None

        out.append(ParsedModuleRow(
            module_code=code,
            name=name_or_fallback(raw_name, code),
            name_en=name_en or None,
            credits=credits_val,
            required=required_val,
            suggested_term_raw=raw_sem or None,
            suggested_order=order,
            block=block,
            prereq_raw=prereq or None,
            previous_raw=previous or None,
            coreq_raw=coreq or None,
            equivalent_raw=eq or None,
            major_code=major_code,
        ))

    return out


def name_or_fallback(name: str, code: str) -> str:
    cleaned = re.sub(r"\s+", " ", name).strip()
    return cleaned if cleaned else code


# ---------------------------------------------------------------------------
# Trình đọc các định dạng tệp: .xlsx, .xls, .docx, .pdf, .tsv
# ---------------------------------------------------------------------------

def read_xlsx_file(
    path: Path, *, include_empty: bool = False, split_law_2023: bool = False,
) -> dict[str, list[ParsedModuleRow]]:
    """Đọc tệp Excel .xlsx bằng openpyxl."""
    import openpyxl

    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    out: dict[str, list[ParsedModuleRow]] = {}
    try:
        for sheet_name in wb.sheetnames:
            if include_empty and _sheet_skip_reason(sheet_name):
                out[sheet_name] = []
                continue
            ws = wb[sheet_name]
            raw_rows = [list(row) for row in ws.iter_rows(values_only=True)]
            parsed = extract_rows_from_table(raw_rows, sheet_name=sheet_name, split_law_2023=split_law_2023)
            if parsed or include_empty:
                out[sheet_name] = parsed
    finally:
        wb.close()
    return out


def read_xls_file(path: Path) -> tuple[dict[str, list[ParsedModuleRow]], str | None]:
    """Đọc tệp Excel .xls cũ bằng xlrd nếu có."""
    try:
        import xlrd
    except ImportError:
        return {}, "Cần cài đặt xlrd để đọc định dạng .xls cũ (pip install xlrd==2.0.1)"

    try:
        wb = xlrd.open_workbook(str(path))
    except Exception as e:
        return {}, f"Lỗi đọc .xls: {e}"

    out: dict[str, list[ParsedModuleRow]] = {}
    for sheet_idx in range(wb.nsheets):
        ws = wb.sheet_by_index(sheet_idx)
        raw_rows = []
        for r_idx in range(ws.nrows):
            raw_rows.append(ws.row_values(r_idx))
        parsed = extract_rows_from_table(raw_rows, sheet_name=ws.name)
        if parsed:
            out[ws.name] = parsed
    return out, None


def read_docx_file(path: Path) -> dict[str, list[ParsedModuleRow]]:
    """Đọc bảng từ tệp Word .docx."""
    try:
        from docx import Document
    except ImportError:
        return {}

    try:
        doc = Document(str(path))
    except Exception:
        return {}

    all_raw: list[list[str]] = []
    for table in doc.tables:
        for row in table.rows:
            all_raw.append([cell.text.strip() for cell in row.cells])

    parsed = extract_rows_from_table(all_raw, sheet_name=path.stem)
    return {path.stem: parsed} if parsed else {}


def read_tsv_file(path: Path) -> list[ParsedModuleRow]:
    """Đọc tệp TSV (như bản chép tay Kinh tế đối ngoại hoặc parse sẵn)."""
    with open(path, "r", encoding="utf-8-sig", errors="ignore") as f:
        reader = csv.reader(f, delimiter="\t")
        raw_rows = [row for row in reader]
    return extract_rows_from_table(raw_rows, sheet_name=path.stem)


def read_pdf_file(path: Path) -> dict[str, list[ParsedModuleRow]]:
    """Đọc bảng từ tệp PDF bằng pymupdf hoặc kiểm tra TSV đối chứng đã có."""
    # Kiểm tra xem có file TSV đã parse sẵn trong data/ctdt_khoa_2023_2025/parsed/ không
    stem = path.stem
    candidate_tsv = path.parent.parent / "ctdt_khoa_2023_2025" / "parsed" / f"{stem}.tsv"
    if candidate_tsv.exists():
        rows = read_tsv_file(candidate_tsv)
        if rows:
            return {stem: rows}

    try:
        import pymupdf
    except ImportError:
        return {}

    try:
        doc = pymupdf.open(str(path))
    except Exception:
        return {}

    all_raw_rows: list[list[str]] = []
    try:
        for page in doc:
            # Table extraction needs text. Scanned pages without it have no readable cells.
            if not page.get_text().strip():
                continue
            tabs = page.find_tables().tables
            for tab in tabs:
                extracted = tab.extract()
                if extracted:
                    all_raw_rows.extend(extracted)
    finally:
        doc.close()

    parsed = extract_rows_from_table(all_raw_rows, sheet_name=stem)
    return {stem: parsed} if parsed else {}


# ---------------------------------------------------------------------------
# Cập nhật suggested_semester cho CTĐT 2025 (K25/K26)
# ---------------------------------------------------------------------------

def backfill_2025_suggested_semesters(db: Session) -> int:
    """Điền suggested_semester cho các CTĐT 2025 (K25/K26) còn trống theo quy tắc đếm 3 kỳ/năm.

    Môn không gắn học kỳ (tự chọn tự do, ngoại ngữ, GDTC, GDQP) thì để trống, không đoán.
    Các CTĐT K24 portal giữ nguyên, không sửa.
    """
    rows = db.scalars(
        select(ProgramModule)
        .join(Program, Program.id == ProgramModule.program_id)
        .where(
            Program.cohort.in_(["K25", "K26"]),
            ProgramModule.suggested_semester.is_(None),
        )
    ).all()

    updated = 0
    for pm in rows:
        cohort = pm.program.cohort  # "K25" hoặc "K26"
        order = pm.suggested_order
        if order is None and pm.suggested_term:
            m = re.search(r"HK\s*0*(\d+)", pm.suggested_term, re.I)
            if m:
                order = int(m.group(1))
                pm.suggested_order = order

        if order is not None and 1 <= order <= 10:
            sem = semester_id_for(cohort, order)
            if sem:
                pm.suggested_semester = sem
                updated += 1

    if updated:
        db.flush()
    return updated


# ---------------------------------------------------------------------------
# Đối chiếu K23 Excel với DB (Quy tắc 1a)
# ---------------------------------------------------------------------------

def compare_k23_excel_vs_db(
    db: Session,
    excel_k23_data: dict[str, list[ParsedModuleRow]],
    out_csv: Path | None = None,
) -> list[dict[str, Any]]:
    """So sánh danh sách học phần CTĐT 2023 hệ tiếng Việt trong Excel với CSDL.

    Ghi chênh lệch vào file ctdt2023_vs_db.csv. Tuyệt đối không sửa CSDL theo chênh lệch.
    """
    diff_records: list[dict[str, Any]] = []

    for major_code, excel_rows in excel_k23_data.items():
        pid = f"K23{major_code}"
        prog = db.scalar(select(Program.id).where(Program.id == pid))
        if not prog:
            diff_records.append({
                "ma_nganh": major_code,
                "ma_ctdt": pid,
                "ma_hp_excel": "",
                "ma_hp_db": "",
                "tinh_trang": "chua_co_trong_db",
                "ghi_chu": "chưa có, chờ X2",
            })
            continue

        db_modules = set(db.scalars(select(ProgramModule.module_code).where(ProgramModule.program_id == pid)))
        excel_modules = {r.module_code: r for r in excel_rows}

        # Môn chỉ có trong Excel
        for code, r in excel_modules.items():
            if code not in db_modules:
                diff_records.append({
                    "ma_nganh": major_code,
                    "ma_ctdt": pid,
                    "ma_hp_excel": code,
                    "ma_hp_db": "",
                    "tinh_trang": "chi_co_trong_excel",
                    "ghi_chu": f"Môn {r.name} ({r.credits or 0} TC) trong Excel 2023 chưa có trong DB",
                })

        # Môn chỉ có trong DB
        for code in sorted(db_modules):
            if code not in excel_modules:
                diff_records.append({
                    "ma_nganh": major_code,
                    "ma_ctdt": pid,
                    "ma_hp_excel": "",
                    "ma_hp_db": code,
                    "tinh_trang": "chi_co_trong_db",
                    "ghi_chu": f"Môn {code} có trong DB nhưng không có trong Excel 2023",
                })

    if out_csv:
        out_csv.parent.mkdir(parents=True, exist_ok=True)
        with open(out_csv, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(
                f,
                fieldnames=["ma_nganh", "ma_ctdt", "ma_hp_excel", "ma_hp_db", "tinh_trang", "ghi_chu"],
            )
            writer.writeheader()
            writer.writerows(diff_records)

    return diff_records


# ---------------------------------------------------------------------------
# Báo cáo độ phủ theo khóa (Mục 4)
# ---------------------------------------------------------------------------

def compute_coverage_report(db: Session) -> dict[str, Any]:
    """Thống kê với mỗi khóa K23–K26 có bao nhiêu ngành đã có CTĐT, ngành nào còn thiếu."""
    all_majors = sorted(MAJOR_NAMES.keys())
    standard_majors = [m for m in all_majors if m.isdigit()]

    coverage: dict[str, Any] = {}
    for cohort in ("K23", "K24", "K25", "K26"):
        program_ids = db.scalars(select(Program.id).where(Program.cohort == cohort)).all()
        existing_majors = set()
        for program_id in program_ids:
            # Rút mã ngành từ id, vd K24404 -> 404
            m = re.match(r"^K\d{2}([A-Za-z0-9]+?)(?:[EHT]|TE|CLC)?$", program_id)
            if m:
                existing_majors.add(m.group(1))

        present = sorted(existing_majors)
        missing = [m for m in standard_majors if m not in existing_majors]
        coverage[cohort] = {
            "total_programs": len(program_ids),
            "majors_present_count": len(present),
            "majors_present": present,
            "majors_missing_count": len(missing),
            "majors_missing": missing,
        }
    return coverage


# ---------------------------------------------------------------------------
# Dịch vụ chính: import_ctdt_files
# ---------------------------------------------------------------------------

@dataclass
class CurriculumSheet:
    label: str
    year: int
    major_code: str
    variant: str
    rows: list[ParsedModuleRow]
    source: str
    cohorts: list[str]
    priority: tuple[int, bool, bool]

    def program_id(self, cohort: str) -> str:
        return f"{cohort}{self.major_code}{self.variant}"


def import_ctdt_files(
    db: Session,
    *,
    dir_path: Path | None = None,
    bdcl_dir: Path | None = None,
    excel_2023_dir: Path | None = None,
    dry_run: bool = False,
    only_pattern: str | None = None,
    preview_csv: Path | None = None,
    vs_db_csv: Path | None = None,
) -> dict[str, Any]:
    """Quét các nguồn file CTĐT, bóc tách học phần và nạp vào DB theo quy tắc khóa."""
    existing_modules = set(db.scalars(select(Module.code)))
    existing_k24 = set(db.scalars(select(Program.id).where(Program.id.like("K24%"))))
    preview_rows: list[dict[str, Any]] = []
    candidates: list[CurriculumSheet] = []
    programs_to_import: dict[str, CurriculumSheet] = {}
    k23_excel_comparison: dict[str, list[ParsedModuleRow]] = {}

    files_scanned = 0
    files_ok = 0
    files_failed = 0
    files_skipped = 0

    def report(label, *, year=None, major="", variant="", rows=(), targets=(), reason=""):
        matched = sum(row.module_code in existing_modules for row in rows)
        preview_rows.append({
            "file": label,
            "nam": year,
            "nganh": major,
            "bien_the": variant or ("chuẩn" if major else ""),
            "so_hoc_phan_doc_duoc": len(rows),
            "so_hoc_phan_khop_db": matched,
            "so_hoc_phan_la": len(rows) - matched,
            "chuong_trinh_dich": ", ".join(targets),
            "ly_do_bo_qua": reason,
        })

    sources = (
        (bdcl_dir, "DH_*.xlsx", "bdcl_excel", 2025, 2),
        (excel_2023_dir, "*.xlsx", "ctdt2023_excel", 2023, 1),
        (dir_path, "*", "", None, 0),
    )
    for directory, pattern, source, source_year, source_priority in sources:
        if not directory or not directory.exists():
            continue
        for path in sorted(directory.glob(pattern)):
            if not path.is_file() or path.name.startswith("~$"):
                continue
            if only_pattern and not re.search(only_pattern, path.name, re.I):
                continue

            info = parse_ctdt_filename(path.name)
            if info["status"] != "ok":
                files_skipped += 1
                report(path.name, reason=info["reason"])
                continue

            files_scanned += 1
            year = source_year or info["year"]
            if not year:
                files_skipped += 1
                report(path.name, reason="Không xác định được năm ban hành CTĐT")
                continue
            default_major = None if source == "bdcl_excel" else info["major_code"]
            ext = info["ext"]
            split_law_2023 = year == 2023 and default_major == "LUAT" and ext == ".xlsx"
            read_error = None
            if ext == ".xlsx":
                sheets = read_xlsx_file(path, include_empty=True, split_law_2023=split_law_2023)
            elif ext == ".xls":
                sheets, read_error = read_xls_file(path)
            elif ext == ".docx":
                sheets = read_docx_file(path)
            elif ext == ".pdf":
                sheets = read_pdf_file(path)
            elif ext == ".tsv":
                sheets = {path.stem: read_tsv_file(path)}
            else:
                sheets = {}

            if any(sheets.values()):
                files_ok += 1
            else:
                files_failed += 1
            if not sheets:
                report(path.name, year=year, reason=read_error or "Không đọc được danh sách học phần")
                continue

            for sheet_name, rows in sheets.items():
                label = f"{path.name} / {sheet_name}"
                reason = _sheet_skip_reason(sheet_name)
                if reason or not rows:
                    report(label, year=year, reason=reason or "Không đọc được danh sách học phần")
                    continue

                parsed = parse_bdcl_sheet_name(sheet_name, default_major=default_major)
                variant = ""
                if parsed and parsed["has_identifier"]:
                    variant = parsed["variant"]
                elif source != "bdcl_excel":
                    variant = info["variant"]

                rows_by_major = defaultdict(list)
                if split_law_2023:
                    for row in rows:
                        rows_by_major[row.major_code].append(row)
                else:
                    rows_by_major[parsed["major_code"] if parsed else None] = rows

                cohort_override = parsed["cohort_override"] if parsed and year == 2025 else None
                cohorts = [cohort_override] if cohort_override else cohorts_for_curriculum_year(year)

                numbered = bool(parsed and parsed["numbered"])
                priority = (source_priority, numbered, cohort_override is not None)
                for major, major_rows in rows_by_major.items():
                    if not major or not re.fullmatch(r"[45]\d{2}", major):
                        report(
                            label, year=year, major=major or "", rows=major_rows,
                            reason="Không xác định được ngành Luật 503–506" if split_law_2023
                            else "Không xác định được mã ngành",
                        )
                        continue
                    candidates.append(CurriculumSheet(
                        label, year, major, variant, major_rows,
                        source or f"file_{ext.lstrip('.')}", cohorts, priority,
                    ))

    for sheet in sorted(candidates, key=lambda item: item.priority, reverse=True):
        meta = dict(year=sheet.year, major=sheet.major_code, variant=sheet.variant, rows=sheet.rows)
        targets = []
        skipped = []
        if sheet.year == 2023 and not sheet.variant:
            k23_excel_comparison.setdefault(sheet.major_code, sheet.rows)

        for cohort in sheet.cohorts:
            pid = sheet.program_id(cohort)
            if cohort == "K23" and not sheet.variant:
                skipped.append(f"{pid}: hệ tiếng Việt do X2 xử lý")
            elif pid in existing_k24:
                skipped.append(f"{pid}: đã có trong DB, ưu tiên dữ liệu cổng trường")
            elif pid in programs_to_import:
                skipped.append(f"{pid}: ưu tiên {programs_to_import[pid].label}")
            else:
                programs_to_import[pid] = sheet
                targets.append(pid)

        if targets:
            report(sheet.label, targets=targets, **meta)
        if skipped:
            report(sheet.label, reason=" | ".join(skipped), **meta)

    # Xuất preview CSV
    if preview_csv:
        preview_csv.parent.mkdir(parents=True, exist_ok=True)
        with open(preview_csv, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(
                f,
                fieldnames=[
                    "file", "nam", "nganh", "bien_the",
                    "so_hoc_phan_doc_duoc", "so_hoc_phan_khop_db", "so_hoc_phan_la",
                    "chuong_trinh_dich", "ly_do_bo_qua",
                ],
            )
            writer.writeheader()
            writer.writerows(preview_rows)

    # Đối chiếu K23 tiếng Việt (Quy tắc 1a)
    diff_records = compare_k23_excel_vs_db(db, k23_excel_comparison, out_csv=vs_db_csv)

    # Nếu là Dry-run: kết thúc sớm, không sửa DB
    if dry_run:
        coverage = compute_coverage_report(db)
        return {
            "dry_run": True,
            "files_scanned": files_scanned,
            "files_ok": files_ok,
            "files_failed": files_failed,
            "files_skipped": files_skipped,
            "programs_planned": len(programs_to_import),
            "preview_csv": str(preview_csv) if preview_csv else None,
            "k23_diff_count": len(diff_records),
            "coverage": coverage,
        }

    # THỰC HIỆN GHI CSDL THẬT
    ctx = ImportContext(db, is_sample=False, source="ctdt_files")
    programs_created = 0
    modules_created = 0
    relations_created = 0

    for pid, sheet in programs_to_import.items():
        cohort = pid[:3]
        major_code = sheet.major_code
        variant = sheet.variant
        rows = sheet.rows

        prog = db.get(Program, pid)
        if prog is not None and cohort == "K24":
            continue
        if prog is None:
            prog = Program(id=pid)
        if prog not in db:
            db.add(prog)

        major_display_name = MAJOR_NAMES.get(major_code, major_code)
        prog_name = format_undergrad_program_name(major_display_name, cohort, variant)
        prog.name = clip(prog_name, 512)
        prog.cohort = cohort
        prog.faculty = MAJOR_FACULTIES.get(major_code, prog.faculty)
        prog.search_text = normalize_search(f"{pid} {prog.name} {prog.faculty or ''}")
        prog.source = sheet.source
        db.flush()

        # Idempotent: xóa các quan hệ và môn của chương trình này trước khi nạp lại
        db.execute(delete(ModuleRelation).where(ModuleRelation.program_id == pid))
        db.execute(delete(ProgramModule).where(ProgramModule.program_id == pid))
        db.flush()

        seen_pm: dict[str, ProgramModule] = {}
        relations: set[tuple[str, str, str]] = set()

        for r in rows:
            code = r.module_code
            if not code or skip_legacy_code(code):
                continue

            # Quy tắc B6 & D19: KHÔNG ghi đè khoa/bộ môn
            mod = ctx.module(
                code,
                name=clip(r.name, 512),
                credits=r.credits,
                overwrite_faculty=False,
                overwrite_department=False,
            )
            if code not in existing_modules:
                existing_modules.add(code)
                modules_created += 1

            # Tính suggested_semester theo quy tắc 3 học kỳ/năm
            suggested_sem = None
            if r.suggested_order and 1 <= r.suggested_order <= 10:
                suggested_sem = semester_id_for(cohort, r.suggested_order)
            elif r.suggested_term_raw:
                m_t = re.search(r"HK\s*0*(\d+)", r.suggested_term_raw, re.I)
                if m_t:
                    suggested_sem = semester_id_for(cohort, int(m_t.group(1)))

            pm = ProgramModule(
                program_id=pid,
                module_code=code,
                block=clip(r.block, 512),
                required=r.required,
                suggested_term=clip(r.suggested_term_raw, 128),
                suggested_semester=suggested_sem,
                suggested_order=r.suggested_order,
                prereq_raw=clip(r.prereq_raw, 512),
                previous_raw=clip(r.previous_raw, 512),
                coreq_raw=clip(r.coreq_raw, 512),
                equivalent_raw=clip(r.equivalent_raw, 512),
                note=clip(r.note, 2000),
            )

            # Cây điều kiện tiên quyết, học trước, song hành
            for field_name, rel_type, raw_val in (
                ("prereq", "prereq", r.prereq_raw),
                ("previous", "previous", r.previous_raw),
                ("coreq", "coreq", r.coreq_raw),
            ):
                if raw_val:
                    tree = parse_requirement(raw_val)
                    setattr(pm, f"{field_name}_tree", tree)
                    for src in tree_codes(tree):
                        if src != code:
                            relations.add((src, code, rel_type))

            # Học phần tương đương
            if r.equivalent_raw:
                for eq_code in parse_equivalent_codes(r.equivalent_raw):
                    if eq_code != code and not skip_legacy_code(eq_code):
                        relations.add((eq_code, code, "equivalent"))

            db.add(pm)
            seen_pm[code] = pm

        for src, tgt, rel_type in sorted(relations):
            db.add(ModuleRelation(source=src[:64], target=tgt[:64], type=rel_type, program_id=pid))
            relations_created += 1

        programs_created += 1
        db.flush()

    # Bổ sung điền suggested_semester cho các CTĐT 2025 có sẵn trong DB (Mục 3b)
    backfilled_count = backfill_2025_suggested_semesters(db)

    db.commit()

    coverage = compute_coverage_report(db)
    return {
        "dry_run": False,
        "files_scanned": files_scanned,
        "files_ok": files_ok,
        "files_failed": files_failed,
        "files_skipped": files_skipped,
        "programs_created": programs_created,
        "modules_created": modules_created,
        "relations_created": relations_created,
        "backfilled_2025_semesters": backfilled_count,
        "k23_diff_count": len(diff_records),
        "coverage": coverage,
    }
