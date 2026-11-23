"""Bộ test Pytest cho chuẩn hóa mã và tên chương trình (Brief W31, W31b, W31c, D8):
1. Migration 0024: cấu trúc kế thừa từ 0023, có đủ upgrade/downgrade;
2. Bảng ánh xạ PROGRAM_ALIASES và resolve_program_alias;
3. normalize_master_program_name với 7 chuỗi bắt buộc từ Brief D8/W31b, kiểm tra tính idempotent;
4. format_undergrad_program_name theo chuẩn tên W31;
5. parse_class_code với các mã thạc sĩ (C...), tiến sĩ (N...), đại học liên thông (B...) và đại học chuẩn (K...);
6. Tương thích ngược: resolve_program_and_track nhận mã cũ (-V2, -V3, LKT) trả về chương trình mới;
7. get_valid_groups trả về các mã chuẩn (K25414H, K26414H, C..., N...) và trường degree.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from app.models import Program
from app.services.program_names import (
    PROGRAM_ALIASES,
    format_undergrad_program_name,
    normalize_master_program_name,
    parse_class_code,
    resolve_program_alias,
)
from app.services.program_tracks import resolve_program_and_track


# ---------------------------------------------------------------------------
# 1. Cấu trúc Migration 0024
# ---------------------------------------------------------------------------

def test_migration_0024_structure():
    """Kiểm tra migration 0024 kế thừa đúng từ 0023 và có hàm upgrade/downgrade hợp lệ."""
    mig_path = (
        Path(__file__).resolve().parents[1]
        / "migrations"
        / "versions"
        / "0024_program_suffix_canonical_codes.py"
    )
    assert mig_path.exists(), f"Không tìm thấy migration file tại {mig_path}"

    spec = importlib.util.spec_from_file_location("mig_0024", str(mig_path))
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    assert mod.revision == "0024"
    assert mod.down_revision == "0023"
    assert hasattr(mod, "upgrade") and callable(mod.upgrade)
    assert hasattr(mod, "downgrade") and callable(mod.downgrade)

    migration_source = mig_path.read_text(encoding="utf-8")
    assert "(code, name, credits, degree, is_english, is_sample, search_text, updated_at)" in migration_source
    assert "(program_id, module_code, block, required, suggested_order)" in migration_source


# ---------------------------------------------------------------------------
# 2. Ánh xạ mã cũ sang mã mới (PROGRAM_ALIASES)
# ---------------------------------------------------------------------------

def test_program_aliases_mapping():
    """Kiểm tra toàn bộ bảng ánh xạ mã cũ sang mã chính thức chuẩn."""
    assert resolve_program_alias("K25414-V2") == "K25414H"
    assert resolve_program_alias("K26414-V2") == "K26414H"
    assert resolve_program_alias("K25405-V3") == "K25405E"
    assert resolve_program_alias("K26405-V3") == "K26405E"
    assert resolve_program_alias("K25411-V2") == "K25411E"
    assert resolve_program_alias("K26411-V2") == "K26411E"
    assert resolve_program_alias("K25405-V2") == "K25422"
    assert resolve_program_alias("K26405-V2") == "K26422"
    assert resolve_program_alias("K25LKT-V2") == "K25502"
    assert resolve_program_alias("K26LKT-V2") == "K26502"
    assert resolve_program_alias("K25LKT") == "K25501"
    assert resolve_program_alias("K26LKT") == "K26501"
    assert resolve_program_alias("K25409-V2") == "K25409"
    assert resolve_program_alias("K26409-V2") == "K26409"
    assert resolve_program_alias("K25418-V2") == "K25418"
    assert resolve_program_alias("K26418-V2") == "K26418"
    # Mã không đổi
    assert resolve_program_alias("K25405") == "K25405"
    assert resolve_program_alias("K24414") == "K24414"


# ---------------------------------------------------------------------------
# 3. Chuẩn hóa tên chương trình thạc sĩ (normalize_master_program_name)
# ---------------------------------------------------------------------------

def test_normalize_master_program_name_seven_required_strings():
    """Kiểm tra đúng 7 chuỗi đầu vào thực tế từ Brief D8 mục 1 và W31b."""
    test_cases = [
        ("Thương MẠI ĐIỆN TỬ - Thạc sĩ", "Thương mại điện tử – Thạc sĩ"),
        ("KINH TẾ Chính TRỊ - Thạc sĩ nghiên cứu", "Kinh tế chính trị – Thạc sĩ nghiên cứu"),
        ("QUẢN TRỊ KINH Doanh - Thạc sĩ ứng dụng", "Quản trị kinh doanh – Thạc sĩ ứng dụng"),
        ("TÀI Chính NGÂN HÀNG - Thạc sĩ", "Tài chính ngân hàng – Thạc sĩ"),
        ("CÔNG NGHỆ TÀI Chính - Thạc sĩ", "Công nghệ tài chính – Thạc sĩ"),
        (
            "PHÂN TÍCH DỮ LIỆU VÀ AI Trong KINH TẾ VÀ KINH Doanh - Thạc sĩ",
            "Phân tích dữ liệu và AI trong kinh tế và kinh doanh – Thạc sĩ",
        ),
        ("Chuyên Ngành KẾ TOÁN - Thạc sĩ", "Kế toán – Thạc sĩ"),
    ]

    for raw, expected in test_cases:
        res = normalize_master_program_name(raw)
        assert res == expected, f"Thất bại với đầu vào '{raw}': nhận '{res}', mong đợi '{expected}'"
        # Kiểm tra tính idempotent (chạy lặp lại không làm biến đổi kết quả)
        assert normalize_master_program_name(res) == expected


def test_normalize_master_program_name_branch_override():
    """Kiểm tra truyền branch='NC' hoặc 'UD' từ bên ngoài."""
    res_nc = normalize_master_program_name("Kinh tế quốc tế", branch="NC")
    assert res_nc == "Kinh tế quốc tế – Thạc sĩ nghiên cứu"

    res_ud = normalize_master_program_name("Kinh tế quốc tế", branch="UD")
    assert res_ud == "Kinh tế quốc tế – Thạc sĩ ứng dụng"


# ---------------------------------------------------------------------------
# 4. Tạo tên chuẩn cho CTĐT đại học (format_undergrad_program_name)
# ---------------------------------------------------------------------------

def test_format_undergrad_program_name():
    """Kiểm tra định dạng tên chuẩn đại học: <Tên ngành> [– Hệ ...] Khóa NN."""
    assert (
        format_undergrad_program_name("Công nghệ tài chính", "K25", "H")
        == "Công nghệ tài chính – Coop Khóa 25"
    )
    assert (
        format_undergrad_program_name("Kế toán", "K25", "E")
        == "Kế toán – Hệ tiếng Anh Khóa 25"
    )
    assert (
        format_undergrad_program_name("Kế toán và Phân tích dữ liệu", "K25")
        == "Kế toán và Phân tích dữ liệu Khóa 25"
    )
    assert (
        format_undergrad_program_name("Luật kinh doanh", "K26")
        == "Luật kinh doanh Khóa 26"
    )
    assert (
        format_undergrad_program_name("Luật thương mại quốc tế", "K25")
        == "Luật thương mại quốc tế Khóa 25"
    )


# ---------------------------------------------------------------------------
# 5. Phân tích mã lớp theo bậc đào tạo (parse_class_code)
# ---------------------------------------------------------------------------

def test_parse_class_code_master():
    """Kiểm tra nhận diện bậc thạc sĩ từ tiền tố C."""
    c1 = parse_class_code("C24601")
    assert c1 is not None
    assert c1["degree"] == "thac_si"
    assert c1["cohort"] == "C24"
    assert c1["major"] == "601"
    assert c1["program_id"] == "M601"
    assert c1["kind"] == "standard"

    c2 = parse_class_code("C25603-2-UD")
    assert c2 is not None
    assert c2["degree"] == "thac_si"
    assert c2["cohort"] == "C25"
    assert c2["major"] == "603"
    assert c2["batch"] == "2"
    assert c2["branch"] == "UD"
    assert c2["program_id"] == "M603UD"
    assert c2["kind"] == "applied"

    c3 = parse_class_code("C26657-1-UD")
    assert c3 is not None
    assert c3["degree"] == "thac_si"
    assert c3["cohort"] == "C26"
    assert c3["major"] == "657"
    assert c3["branch"] == "UD"
    assert c3["program_id"] == "M657UD"
    assert c3["kind"] == "applied"


def test_parse_class_code_doctoral():
    """Kiểm tra nhận diện bậc tiến sĩ từ tiền tố N."""
    n1 = parse_class_code("N25701-1")
    assert n1 is not None
    assert n1["degree"] == "tien_si"
    assert n1["cohort"] == "N25"
    assert n1["major"] == "701"
    assert n1["program_id"] == "N701"

    n2 = parse_class_code("N25704-DB")
    assert n2 is not None
    assert n2["degree"] == "tien_si"
    assert n2["cohort"] == "N25"
    assert n2["major"] == "704"


def test_parse_class_code_prefix_b():
    """Kiểm tra tiền tố B gán bậc dai_hoc (liên thông/VB2) theo Brief D8."""
    b1 = parse_class_code("B24501BDTH")
    assert b1 is not None
    assert b1["degree"] == "dai_hoc"
    assert b1["cohort"] == "B24"
    assert b1["major"] == "501"


def test_parse_class_code_undergrad_aliases():
    """Kiểm tra mã lớp có alias cũ tự động phân giải sang mã mới."""
    k_coop = parse_class_code("K25414-V2")
    assert k_coop is not None
    assert k_coop["degree"] == "dai_hoc"
    assert k_coop["cohort"] == "K25"
    assert k_coop["major"] == "414"
    assert k_coop["kind"] == "coop"
    assert k_coop["contextual_program_id"] == "K25414H"

    k_en = parse_class_code("K25405-V3")
    assert k_en is not None
    assert k_en["kind"] == "english"
    assert k_en["contextual_program_id"] == "K25405E"


# ---------------------------------------------------------------------------
# 6. Tương thích ngược resolve_program_and_track
# ---------------------------------------------------------------------------

def test_resolve_program_and_track_backward_compatibility(client, db):
    """Kiểm tra gọi resolve_program_and_track với mã cũ ra chương trình mới."""
    # Tạo chương trình chuẩn K25414H
    p_h = Program(
        id="K25414H",
        name="Công nghệ tài chính – Coop Khóa 25",
        cohort="K25",
        degree="dai_hoc",
    )
    db.add(p_h)
    db.commit()

    # Truy vấn bằng mã cũ K25414-V2
    resolved_p, is_english, contextual_id = resolve_program_and_track(db, "K25414-V2")
    assert resolved_p.id == "K25414H"
    assert is_english is False
    assert contextual_id == "K25414H"

    response = client.get("/api/programs/K25414-V2")
    assert response.status_code == 200
    assert response.json()["program"]["program_id"] == "K25414H"


# ---------------------------------------------------------------------------
# 7. get_valid_groups trả về các mã chuẩn và degree
# ---------------------------------------------------------------------------

def test_get_valid_groups_includes_canonical_and_degree(client, db):
    """Kiểm tra endpoint valid_groups trả về danh sách nhóm lớp có trường degree."""
    p_h = Program(
        id="K25414H",
        name="Công nghệ tài chính – Coop Khóa 25",
        cohort="K25",
        degree="dai_hoc",
    )
    p_ths = Program(
        id="M601NC",
        name="Kinh tế chính trị – Thạc sĩ nghiên cứu",
        cohort="2025-2026",
        degree="thac_si",
    )
    db.add(p_h)
    db.add(p_ths)
    db.commit()

    response = client.get("/api/programs/valid-groups")
    assert response.status_code == 200
    groups = {group["code"]: group for group in response.json()}
    assert "K25414-V2" not in groups
    assert groups["K25414H"]["degree"] == "dai_hoc"
    assert groups["K25414H"]["kind"] == "coop"
    assert groups["M601NC"]["degree"] == "thac_si"
