"""Dịch vụ chuẩn hóa mã và tên chương trình đào tạo (Brief W31, W31b, D8).

Quy tắc đã chốt:
1. Quy tắc mã:
   - Đại học: K<khóa><mã ngành số>[hậu tố]
     Hậu tố chỉ là một trong: E (tiếng Anh), H (Coop), T (CN tài năng), TE (tài năng tiếng Anh);
     Không dùng -V2, -V3.
   - Thạc sĩ: M<mã ngành 6xx>[NC|UD] (chương trình), C<khóa><ngành 6xx>[-đợt][-NC/-UD] (lớp)
   - Tiến sĩ: N<khóa><ngành 7xx>[-đợt] (lớp)
2. Quy tắc tên đại học:
   <Tên ngành> [– Hệ tiếng Anh | – Coop | – Cử nhân tài năng | – Cử nhân tài năng tiếng Anh] Khóa NN
3. Quy tắc tên thạc sĩ:
   <Tên ngành> – Thạc sĩ [nghiên cứu|ứng dụng] (chữ thường, viết hoa chữ cái đầu, giữ nguyên viết tắt AI, CNTC, TMĐT...)
"""

from __future__ import annotations

import re
from typing import Any

PROGRAM_ALIASES: dict[str, str] = {
    # 1. Công nghệ tài chính Coop (H)
    "K25414-V2": "K25414H",
    "K26414-V2": "K26414H",
    # 2. Kế toán hệ tiếng Anh (E)
    "K25405-V3": "K25405E",
    "K26405-V3": "K26405E",
    # 3. Thương mại điện tử hệ tiếng Anh (E)
    "K25411-V2": "K25411E",
    "K26411-V2": "K26411E",
    # 4. Kế toán và Phân tích dữ liệu (ngành riêng 422)
    "K25405-V2": "K25422",
    "K26405-V2": "K26422",
    # 5. Luật thương mại quốc tế (502) & Luật kinh doanh (501)
    "K25LKT-V2": "K25502",
    "K26LKT-V2": "K26502",
    "K25LKT": "K25501",
    "K26LKT": "K26501",
    # 6. Các bản trùng lặp gộp vào mã chuẩn
    "K25409-V2": "K25409",
    "K26409-V2": "K26409",
    "K25418-V2": "K25418",
    "K26418-V2": "K26418",
}

PRESERVED_ACRONYMS: set[str] = {
    "ai",
    "cntc",
    "tmdt",
    "cntt",
    "erp",
    "mis",
    "kdqt",
    "kts",
    "htttql",
    "qtkd",
    "tcnh",
    "kds",
    "ptdl",
}


def resolve_program_alias(program_id: str) -> str:
    """Ánh xạ mã chương trình cũ (-V2, -V3, LKT...) sang mã chính thức chuẩn."""
    if not program_id:
        return ""
    clean = program_id.strip()
    return PROGRAM_ALIASES.get(clean, clean)


def normalize_master_program_name(raw_name: str, branch: str = "") -> str:
    """Chuẩn hóa tên chương trình thạc sĩ theo Brief W31b và D8.

    Quy tắc:
    - Hạ toàn bộ về chữ thường rồi viết hoa chữ cái đầu câu.
    - Giữ nguyên các từ viết tắt hợp lệ: AI, CNTC, TMĐT, CNTT...
    - Bỏ tiền tố thừa: 'Chuyên ngành', 'Ngành', 'CHƯƠNG TRÌNH:'...
    - Bỏ hậu tố thạc sĩ/nhánh cũ thừa.
    - Định dạng cuối cùng: `<Tên chương trình> – Thạc sĩ [nghiên cứu|ứng dụng]` (dấu gạch giữa '–').
    - Idempotent: chạy nhiều lần ra cùng một kết quả.
    """
    if not raw_name:
        return ""

    s = raw_name.replace("\xa0", " ").strip()

    # Nhận diện nhánh từ chuỗi nếu chưa truyền vào
    b_upper = (branch or "").upper().strip()
    if not b_upper:
        if re.search(r"\b(?:nghiên\s*cứu|nc)\b", s, re.IGNORECASE):
            b_upper = "NC"
        elif re.search(r"\b(?:ứng\s*dụng|ud)\b", s, re.IGNORECASE):
            b_upper = "UD"

    # 1. Bỏ tiền tố thừa
    s = re.sub(r"^(?:NGÀNH|CHƯƠNG TRÌNH)\s*:\s*", "", s, flags=re.IGNORECASE).strip()
    s = re.sub(r"^(?:Chuyên\s*ngành|Nganh|Ngành)\s*:?\s*", "", s, flags=re.IGNORECASE).strip()

    # 2. Bỏ hậu tố thạc sĩ và nhánh cũ
    s = re.sub(r"\s*[-–—]\s*thạc\s*sĩ.*$", "", s, flags=re.IGNORECASE).strip()
    s = re.sub(r"\s*[-–—]\s*ths.*$", "", s, flags=re.IGNORECASE).strip()
    s = re.sub(r"\s*\(?(?:nghiên\s*cứu|ứng\s*dụng)\)?$", "", s, flags=re.IGNORECASE).strip()
    s = re.sub(r"\s*\(?ths\)?$", "", s, flags=re.IGNORECASE).strip()

    # 3. Phân tách từ và chuẩn hóa chữ hoa/thường
    words = s.split()
    if not words:
        return ""

    norm_words: list[str] = []
    for i, w in enumerate(words):
        w_clean = w.strip()
        w_lower = w_clean.lower()
        if w_lower in PRESERVED_ACRONYMS:
            norm_words.append(w_lower.upper())
        elif i == 0:
            norm_words.append(w_lower.capitalize())
        else:
            norm_words.append(w_lower)

    base_name = " ".join(norm_words)

    # 4. Gắn nhãn nhánh đào tạo
    if b_upper == "NC":
        suffix = " – Thạc sĩ nghiên cứu"
    elif b_upper == "UD":
        suffix = " – Thạc sĩ ứng dụng"
    else:
        suffix = " – Thạc sĩ"

    return f"{base_name}{suffix}"


def format_undergrad_program_name(major_name: str, cohort: str, variant: str = "") -> str:
    """Tạo tên chuẩn cho CTĐT đại học theo Brief W31:
    <Tên ngành> [– Hệ tiếng Anh | – Coop | – Cử nhân tài năng | – Cử nhân tài năng tiếng Anh] Khóa NN
    """
    clean_major = major_name.replace("\xa0", " ").strip()
    clean_major = re.sub(r"\s+(?:khóa|khoá)\s*\d+$", "", clean_major, flags=re.IGNORECASE).strip()
    clean_major = re.sub(r"\s*[-–—]\s*dlg\b.*$", "", clean_major, flags=re.IGNORECASE).strip()

    c_digits = re.sub(r"\D", "", cohort)
    cohort_label = f"Khóa {c_digits}" if c_digits else cohort

    v = (variant or "").upper().strip()
    if v == "E":
        track = " – Hệ tiếng Anh"
    elif v == "H":
        track = " – Coop"
    elif v == "T":
        track = " – Cử nhân tài năng"
    elif v == "TE":
        track = " – Cử nhân tài năng tiếng Anh"
    elif v == "CLC":
        track = " – Chất lượng cao"
    else:
        track = ""

    return f"{clean_major}{track} {cohort_label}".strip()


def parse_class_code(code: str) -> dict[str, Any] | None:
    """Phân tích mã lớp học phần theo Brief D8:
    - K...: Đại học (K<khóa><ngành 3 số>[hậu tố])
    - C...: Thạc sĩ (C<khóa><ngành 6xx>[-đợt][-NC/-UD])
    - N...: Tiến sĩ (N<khóa><ngành 7xx>[-đợt])
    - B...: Đại học (B<khóa>50x<chữ>)
    """
    if not code:
        return None
    raw = code.strip().upper()
    aliased = PROGRAM_ALIASES.get(raw, raw)

    # 1. Thạc sĩ: C + 2 số khóa + 3 số ngành 6xx + hậu tố tùy chọn
    m_c = re.match(r"^C(\d{2})(\d{3})(?:-(\d+))?(?:-(NC|UD))?$", aliased)
    if m_c:
        year, major, batch, branch = m_c.groups()
        branch_str = branch or ""
        return {
            "degree": "thac_si",
            "cohort": f"C{year}",
            "year": f"20{year}",
            "major": major,
            "batch": batch or "",
            "branch": branch_str,
            "kind": "research" if branch_str == "NC" else ("applied" if branch_str == "UD" else "standard"),
            "program_id": f"M{major}{branch_str}",
            "code": aliased,
        }

    # Tổng quát hơn cho C... nếu có thêm tiền tố/hậu tố
    m_c_gen = re.match(r"^C(\d{2})(\d{3})(.*)$", aliased)
    if m_c_gen:
        year = m_c_gen.group(1)
        major = m_c_gen.group(2)
        rest = m_c_gen.group(3)
        branch_str = "NC" if "NC" in rest else ("UD" if "UD" in rest else "")
        return {
            "degree": "thac_si",
            "cohort": f"C{year}",
            "year": f"20{year}",
            "major": major,
            "batch": "",
            "branch": branch_str,
            "kind": "research" if branch_str == "NC" else ("applied" if branch_str == "UD" else "standard"),
            "program_id": f"M{major}{branch_str}",
            "code": aliased,
        }

    # 2. Tiến sĩ: N + 2 số khóa + 3 số ngành 7xx + hậu tố tùy chọn
    m_n = re.match(r"^N(\d{2})(\d{3})(?:-(.+))?$", aliased)
    if m_n:
        year, major, suffix = m_n.groups()
        return {
            "degree": "tien_si",
            "cohort": f"N{year}",
            "year": f"20{year}",
            "major": major,
            "suffix": suffix or "",
            "kind": "other",
            "program_id": f"N{major}",
            "code": aliased,
        }

    # 3. B50x: Đại học (liên thông / văn bằng 2 theo Brief D8 mục 5)
    m_b = re.match(r"^B(\d{2})(\d{3})([A-Z\d]*)$", aliased)
    if m_b:
        year, major, suffix = m_b.groups()
        return {
            "degree": "dai_hoc",
            "cohort": f"B{year}",
            "year": f"20{year}",
            "major": major,
            "suffix": suffix or "",
            "kind": "standard",
            "program_id": f"K{year}{major}",
            "code": aliased,
        }

    # 4. Đại học: K + 2 số khóa + 3 số ngành + hậu tố (hoặc chỉ 5 số)
    m_k = re.match(r"^K?(\d{2})(\d{3})([A-Z\d]*)?$", aliased)
    if m_k:
        year, major, suffix = m_k.groups()
        sfx = suffix or ""
        first = sfx[0] if sfx else ""
        if first == "H":
            kind = "coop"
        elif first == "T":
            kind = "talent"
        elif first == "E":
            kind = "english"
        elif first in ("A", "B", "C"):
            kind = "standard"
        else:
            kind = "other" if sfx else "standard"

        base_id = f"K{year}{major}"
        if kind == "english":
            ctx_id = f"{base_id}E"
        elif kind == "coop":
            ctx_id = f"{base_id}H"
        elif kind == "talent" and "TE" in sfx:
            ctx_id = f"{base_id}TE"
        elif kind == "talent":
            ctx_id = f"{base_id}T"
        else:
            ctx_id = base_id

        return {
            "degree": "dai_hoc",
            "cohort": f"K{year}",
            "year": f"20{year}",
            "major": major,
            "suffix": sfx,
            "kind": kind,
            "program_id": base_id,
            "contextual_program_id": ctx_id,
            "code": aliased,
        }

    return None
