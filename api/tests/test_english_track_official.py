"""Tests for Brief D7: Official English Track from BĐCL sheets vs old derived mapping.

Yêu cầu kiểm chứng theo Brief D7:
1. pytest: chương trình 410E lấy từ sheet có đúng 58 mã (50 E + 8 B), không chứa BBM5023;
2. track=en của chương trình có sheet E thật trả track_source="official";
3. chương trình không có sheet E (vd 414 Công nghệ tài chính) trả 404;
4. cách suy ra cũ chỉ dùng khi chưa nạp, kèm cờ derived;
5. Báo cáo đối chiếu english_track_diff.csv ghi nhận 6 môn thừa của 410E và thống kê các ngành không có hệ E.
"""

from __future__ import annotations

import csv
from pathlib import Path
import pytest
import openpyxl

from app.models import ClassSection, Module, ModuleRelation, Program, ProgramModule
from app.services.ctdt_files_import import extract_rows_from_table, read_xlsx_file
from app.services.english_track_diff import generate_english_track_diff
from app.services.program_tracks import (
    clear_valid_groups_cache,
    get_program_track_codes,
    resolve_program_and_track,
)


# 50 mã môn hệ E chính thức của Marketing 410E
SAMPLE_410E_CODES = [
    "EAA2028", "EBA3001", "EBB1067", "EBB1068", "EBB2001",
    "EBB2002", "EBB3001", "EBB4001", "EBB4002", "EBB5008",
    "EBB5047", "EBM1001", "EBM2001", "EBM2002", "EBM2003",
    "EBM3001", "EBM3002", "EBM3003", "EBM3004", "EBM3005",
    "EBM3006", "EBM3007", "EBM3008", "EBM3009", "EBM3010",
    "EBM4001", "EBM4002", "EBM4003", "EBM4004", "EBM4005",
    "EBM4006", "EBM4007", "EBM4008", "EBM4009", "EBM4010",
    "EBM5001", "EBM5002", "EBM5004", "EBM5005", "EBM5006",
    "EBM5007", "EBM5008", "EBM5009", "EBM5010", "EBM5011",
    "EBM5012", "EBM5013", "EBM5014", "EBM5015", "EBM5016",
]

# 8 mã môn B tiếng Việt hợp lệ trong hệ E (Bộ GD&ĐT bắt buộc)
VALID_410_B_CODES = [
    "BDG1001", "BDG1003", "BDG1004", "BDG1005",
    "BDG1012", "BDG1013", "BDG1014", "BEE1002",
]

# 6 mã môn thừa do thuật toán cũ tự sinh (bản VI có nhưng không có bản E, bản chính thức 410E KHÔNG có)
SURPLUS_VI_CODES = [
    "BBM4086", "BBM5003", "BBM5017", "BBM5022", "BBM5023", "BBM5057",
]


def _create_410e_sample_workbook(path: Path) -> Path:
    """Tạo workbook giả lập sheet 6. 410E-Marketing(E) chuẩn xác."""
    wb = openpyxl.Workbook()
    # Sheet 1: Bản tiếng Việt 410 (64 môn)
    ws_vi = wb.active
    ws_vi.title = "1. 410-Marketing"
    ws_vi.append(["STT", "Mã môn học", "Tên môn học", "Số tín chỉ", "Loại môn học", "Học kỳ", "Khối kiến thức", "Tiên quyết"])
    # 50 môn tương ứng tiếng Việt
    idx = 1
    for c in SAMPLE_410E_CODES:
        vi_c = "B" + c[1:]
        ws_vi.append([idx, vi_c, f"Môn tiếng Việt của {c}", 3, "Bắt buộc", 1, "Cơ sở ngành", ""])
        idx += 1
    # 8 môn B chung
    for c in VALID_410_B_CODES:
        ws_vi.append([idx, c, f"Môn B {c}", 3, "Bắt buộc", 1, "Đại cương", ""])
        idx += 1
    # 6 môn thừa chỉ có trong bản VI
    for c in SURPLUS_VI_CODES:
        ws_vi.append([idx, c, f"Môn thừa {c}", 3, "Bắt buộc", 3, "Chuyên ngành", ""])
        idx += 1

    # Sheet 6: Bản chính thức 410E (58 môn: 50 E + 8 B)
    ws_e = wb.create_sheet(title="6. 410E-Marketing(E)")
    ws_e.append(["STT", "Mã môn học", "Tên môn học", "Số tín chỉ", "Loại môn học", "Học kỳ", "Khối kiến thức", "Tiên quyết"])
    idx = 1
    for c in SAMPLE_410E_CODES:
        ws_e.append([idx, c, f"English course {c}", 3, "Bắt buộc", 1, "Cơ sở ngành", ""])
        idx += 1
    for c in VALID_410_B_CODES:
        ws_e.append([idx, c, f"Môn đại cương B {c}", 3, "Bắt buộc", 1, "Đại cương", ""])
        idx += 1

    wb.save(path)
    wb.close()
    return path


def test_410e_from_sheet_has_58_codes_and_no_bbm5023(tmp_path):
    """Yêu cầu 1 & 5: Chương trình 410E lấy từ sheet chính thức có đúng 58 mã (50 E + 8 B),
    tuyệt đối không chứa BBM5023 (cùng 5 môn thừa khác)."""
    # 1. Thử đọc từ file thật nếu có sẵn trong data/raw/ctdt_bdcl/
    real_file = Path("data/raw/ctdt_bdcl/DH_QuanTriKinhDoanh.xlsx")
    if real_file.exists():
        sheets_data = read_xlsx_file(real_file)
        target_sheet = None
        for sname, rows in sheets_data.items():
            if "410E" in sname:
                target_sheet = rows
                break
        if target_sheet is not None:
            codes = {r.module_code for r in target_sheet}
            assert len(codes) == 58
            e_codes = {c for c in codes if c.startswith("E")}
            b_codes = {c for c in codes if c.startswith("B")}
            assert len(e_codes) == 50
            assert len(b_codes) == 8
            assert "BBM5023" not in codes
            for surplus in SURPLUS_VI_CODES:
                assert surplus not in codes
            return

    # 2. Kiểm chứng qua workbook fixture chuẩn
    wb_path = _create_410e_sample_workbook(tmp_path / "DH_QuanTriKinhDoanh.xlsx")
    sheets_data = read_xlsx_file(wb_path)
    rows_e = sheets_data["6. 410E-Marketing(E)"]
    codes = {r.module_code for r in rows_e}

    assert len(codes) == 58
    e_codes = {c for c in codes if c.startswith("E")}
    b_codes = {c for c in codes if c.startswith("B")}
    assert len(e_codes) == 50
    assert len(b_codes) == 8
    assert b_codes == set(VALID_410_B_CODES)
    assert "BBM5023" not in codes
    for surplus in SURPLUS_VI_CODES:
        assert surplus not in codes


def test_track_en_with_official_e_returns_official(client, db):
    """Yêu cầu 2 & 5: Khi tồn tại CTĐT hệ E thật trong DB:
    - GET /api/programs/K25410?track=en trả track_source='official';
    - GET /api/programs/K25410E trả track_source='official';
    - Danh sách môn có đúng 58 mã, không chứa BBM5023;
    - 8 môn B có cờ is_vietnamese_track=True và không bị gắn cảnh báo thiếu counterpart giả."""
    clear_valid_groups_cache()

    # Tạo các Module
    mods_to_add = []
    for c in SAMPLE_410E_CODES:
        mods_to_add.append(Module(code=c, name=f"Course {c}", credits=3, language_track="en"))
    for c in VALID_410_B_CODES:
        mods_to_add.append(Module(code=c, name=f"Môn {c}", credits=3, language_track="vi"))
    # Môn thừa BBM5023 của bản VI
    mod_surplus = Module(code="BBM5023", name="Marketing nội dung", credits=3, language_track="vi")
    mods_to_add.append(mod_surplus)
    db.add_all(mods_to_add)

    # Tạo CTĐT bản tiếng Việt K25410 (64 môn)
    prog_vi = Program(id="K25410", name="Marketing Khóa 25", cohort="K25", faculty="Khoa Quản trị kinh doanh")
    # Tạo CTĐT hệ E thật K25410E (58 môn chính thức)
    prog_e = Program(
        id="K25410E",
        name="Marketing (tiếng Anh) Khóa 25",
        cohort="K25",
        faculty="Khoa Quản trị kinh doanh",
        source="bdcl_excel",
    )
    db.add_all([prog_vi, prog_e])
    db.flush()

    # Gán môn cho K25410E (58 môn: 50 E + 8 B)
    for c in SAMPLE_410E_CODES:
        db.add(ProgramModule(program_id="K25410E", module_code=c, block="Cơ sở ngành", required=True))
    for c in VALID_410_B_CODES:
        db.add(ProgramModule(program_id="K25410E", module_code=c, block="Đại cương", required=True))

    # Gán môn cho K25410 bản VI (có cả BBM5023)
    db.add(ProgramModule(program_id="K25410", module_code="BBM5023", block="Chuyên ngành", required=True))
    db.commit()

    # 1. Gọi GET /api/programs/K25410?track=en
    res1 = client.get("/api/programs/K25410?track=en")
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["track_source"] == "official"
    assert data1["program"]["track_source"] == "official"
    assert data1["program"]["program_id"] == "K25410E"

    codes1 = [m["code"] for b in data1["blocks"] for m in b["modules"]]
    assert len(codes1) == 58
    assert "BBM5023" not in codes1

    # Kiểm tra các môn B có is_vietnamese_track=True và không bị gắn thông báo thiếu counterpart giả
    b_mods = [m for b in data1["blocks"] for m in b["modules"] if m["code"] in VALID_410_B_CODES]
    assert len(b_mods) == 8
    for m in b_mods:
        assert m["is_vietnamese_track"] is True
        assert "Chưa có mã học phần tương ứng" not in (m["note"] or "")

    # 2. Gọi GET /api/programs/K25410E
    res2 = client.get("/api/programs/K25410E")
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["track_source"] == "official"
    assert data2["program"]["track_source"] == "official"
    codes2 = [m["code"] for b in data2["blocks"] for m in b["modules"]]
    assert len(codes2) == 58
    assert "BBM5023" not in codes2

    # 3. Graph endpoint cũng giữ cờ track_source='official'
    res_graph = client.get("/api/programs/K25410E/graph")
    assert res_graph.status_code == 200
    assert res_graph.json()["track_source"] == "official"


def test_program_without_e_sheet_returns_404(client, db):
    """Yêu cầu 2 & 5: Chương trình không có sheet E chính thức (vd 414 Công nghệ tài chính)
    phải trả 404, TUYỆT ĐỐI KHÔNG tự sinh."""
    clear_valid_groups_cache()

    prog_414 = Program(
        id="K25414",
        name="Công nghệ tài chính Khóa 25",
        cohort="K25",
        faculty="Khoa Tài chính - Ngân hàng",
    )
    db.add(prog_414)
    db.add(Module(code="BFF2044", name="Môn Công nghệ tài chính", language_track="vi"))
    db.flush()
    db.add(ProgramModule(program_id="K25414", module_code="BFF2044", required=True))
    db.commit()

    # 1. Gọi track=en trên chương trình 414
    res1 = client.get("/api/programs/K25414?track=en")
    assert res1.status_code == 404
    assert "Chương trình này không có hệ tiếng Anh" in res1.json()["detail"]

    # 2. Gọi mã có hậu tố E: K25414E
    res2 = client.get("/api/programs/K25414E")
    assert res2.status_code == 404
    assert "Chương trình này không có hệ tiếng Anh" in res2.json()["detail"]


def test_fallback_derived_when_e_not_yet_imported(client, db):
    """Yêu cầu 2 & 5: Chỉ khi chương trình có hệ E nhưng CHƯA NẠP vào DB mới tạm rơi
    về cách ánh xạ cũ, và bắt buộc gắn cờ rõ track_source='derived'."""
    clear_valid_groups_cache()

    # Ngành 409 (Kiểm toán) có hệ E hợp lệ, nhưng DB chỉ mới có bản VI K26409, CHƯA có K26409E
    p_vi = Program(id="K26409", name="Kiểm toán Khóa 26", cohort="K26", faculty="Khoa Kế toán - Kiểm toán")
    cs = ClassSection(class_code="261BIM502201", module_code="BIM5022", student_groups=["K26409E"])

    m_vi = Module(code="BAU4019", name="Lý thuyết kiểm toán", counterpart_code="EAU4019", language_track="vi")
    m_en = Module(code="EAU4019", name="Principles of Auditing", counterpart_code="BAU4019", language_track="en")
    class_module = Module(code="BIM5022", name="Môn có lớp K26409E", language_track="vi")
    db.add_all([p_vi, m_vi, m_en, class_module])
    db.flush()

    db.add(cs)
    db.add(ProgramModule(program_id="K26409", module_code="BAU4019", required=True))
    db.commit()

    # Gọi GET /api/programs/K26409E
    res = client.get("/api/programs/K26409E")
    assert res.status_code == 200
    data = res.json()

    # Bắt buộc gắn cờ 'derived'
    assert data["track_source"] == "derived"
    assert data["program"]["track_source"] == "derived"

    # Môn BAU4019 được ánh xạ sang EAU4019
    codes = [m["code"] for b in data["blocks"] for m in b["modules"]]
    assert "EAU4019" in codes
    assert "BAU4019" not in codes


def test_get_program_track_codes_filters_correctly(db):
    """Kiểm tra get_program_track_codes dùng cho lọc /api/modules?program_id=...
    - K25410E trả đúng 58 mã môn chính thức, không chứa BBM5023."""
    clear_valid_groups_cache()

    prog_e = Program(id="K25410E", name="Marketing (tiếng Anh) Khóa 25", cohort="K25")
    db.add(prog_e)
    db.add_all(Module(code=c, name=f"Course {c}", language_track="en") for c in SAMPLE_410E_CODES)
    db.add_all(Module(code=c, name=f"Môn {c}", language_track="vi") for c in VALID_410_B_CODES)
    db.flush()

    for c in SAMPLE_410E_CODES:
        db.add(ProgramModule(program_id="K25410E", module_code=c, required=True))
    for c in VALID_410_B_CODES:
        db.add(ProgramModule(program_id="K25410E", module_code=c, required=True))
    db.commit()

    codes = get_program_track_codes(db, "K25410E")
    assert len(codes) == 58
    assert "BBM5023" not in codes
    assert "BDG1001" in codes
    assert "EAA2028" in codes


def test_english_track_diff_generation_and_csv(db, tmp_path):
    """Yêu cầu 4 & 5: Lệnh tạo báo cáo đối chiếu english_track_diff.csv xuất đầy đủ:
    - 410E có 58 môn chính thức, 64 môn cũ, 6 môn thừa (chứa BBM5023);
    - Danh sách các ngành không có hệ E (chứa 414 Công nghệ tài chính);
    - File CSV xuất ra data/processed/english_track_diff.csv hợp lệ."""
    out_csv = tmp_path / "english_track_diff.csv"
    res = generate_english_track_diff(db, bdcl_dir=tmp_path / "non_existent", out_csv=out_csv)

    assert out_csv.exists()
    assert res["total_programs_e"] >= 10
    assert "414" in res["majors_without_e"]

    # Đọc đối chứng file CSV
    with open(out_csv, "r", encoding="utf-8-sig") as f:
        reader = list(csv.DictReader(f))
        assert len(reader) >= 10
        r_410 = next((r for r in reader if r["ma_nganh"] == "410"), None)
        assert r_410 is not None
        assert int(r_410["so_mon_chinh_thuc"]) == 58
        assert int(r_410["so_mon_cu"]) == 64
        assert int(r_410["so_mon_thua"]) == 6
        assert "BBM5023" in r_410["danh_sach_thua"]
        assert int(r_410["so_mon_thieu"]) == 0
