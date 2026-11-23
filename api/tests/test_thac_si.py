"""Bộ test Pytest toàn diện cho Bậc đào tạo và nạp CTĐT Thạc sĩ (Brief D6):
1. Migration 0023: cấu trúc upgrade/downgrade và revision ID;
2. Model fields: cột degree trên Module và Program (mặc định 'dai_hoc');
3. Sheet filtering: bỏ qua Data, Kế toán (TS), và các sheet đại học lẫn trong file THS;
4. Branch splitting: tách nhánh NC (nghiên cứu) và UD (ứng dụng) thành 2 chương trình riêng;
5. Parsing: loại bỏ \xa0, đổi '3.00' -> 3, suggested_semester để None;
6. API GET /api/programs: mặc định chỉ trả đại học, degree=thac_si chỉ trả thạc sĩ;
7. API GET /api/modules & facets: lọc chính xác theo degree;
8. Idempotency & --dry-run: xuất preview CSV không sửa DB, chạy lặp lại không sinh rác.
"""

from __future__ import annotations

import csv
import importlib.util
from pathlib import Path
import tempfile
import pytest
import openpyxl
from sqlalchemy import func, select

from app.models import Module, ModuleAssessment, Program, ProgramModule
from app.services.ctdt_files_import import parse_credits_val
from app.services.ths_import import (
    clean_cell_str,
    detect_major_and_branch,
    detect_ths_columns,
    import_ths_curricula,
    is_master_sheet,
)


# ---------------------------------------------------------------------------
# 1. Test cấu trúc Migration 0023 & Models
# ---------------------------------------------------------------------------

def test_migration_0023_structure():
    """Kiểm tra migration 0023_degree_level.py kế thừa đúng từ 0022 và có đủ upgrade/downgrade."""
    mig_path = Path(__file__).resolve().parents[1] / "migrations" / "versions" / "0023_degree_level.py"
    assert mig_path.exists(), f"Không tìm thấy migration file tại {mig_path}"

    spec = importlib.util.spec_from_file_location("mig_0023", str(mig_path))
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    assert mod.revision == "0023"
    assert mod.down_revision == "0022"
    assert hasattr(mod, "upgrade") and callable(mod.upgrade)
    assert hasattr(mod, "downgrade") and callable(mod.downgrade)


def test_models_degree_column_defaults(db):
    """Kiểm tra trường degree trên Module và Program có giá trị mặc định 'dai_hoc'."""
    p = Program(id="TEST_PROG", name="Chương trình Test", cohort="K24")
    m = Module(code="TEST101", name="Môn học Test", credits=3)
    db.add(p)
    db.add(m)
    db.commit()

    db_p = db.scalar(select(Program).where(Program.id == "TEST_PROG"))
    db_m = db.scalar(select(Module).where(Module.code == "TEST101"))
    assert db_p.degree == "dai_hoc"
    assert db_m.degree == "dai_hoc"


# ---------------------------------------------------------------------------
# 2. Test Parser & Chuẩn hóa dữ liệu
# ---------------------------------------------------------------------------

def test_parse_credits_val_and_clean_str():
    """Kiểm tra xử lý chuỗi số tín chỉ '3.00' -> 3 và loại bỏ ký tự \xa0."""
    assert parse_credits_val("3.00") == 3
    assert parse_credits_val("3.0") == 3
    assert parse_credits_val("4") == 4
    assert parse_credits_val(" 2.00 \xa0") == 2
    assert parse_credits_val(None) is None

    assert clean_cell_str("  Mã\xa0học phần  ") == "Mã học phần"
    assert clean_cell_str("THẠC\xa0SĨ") == "THẠC SĨ"


# ---------------------------------------------------------------------------
# 3. Test Lọc Sheet Thạc sĩ
# ---------------------------------------------------------------------------

def test_is_master_sheet_filtering():
    """Kiểm tra quy tắc lọc: chỉ nhận sheet thạc sĩ, bỏ Data, TS, và sheet đại học."""
    # Sheet thạc sĩ hợp lệ
    assert is_master_sheet("1.603_KT&QLC_ThS-NC", "NGÀNH: KINH TẾ HỌC - CHƯƠNG TRÌNH: KINH TẾ VÀ QUẢN LÝ CÔNG - THẠC SĨ NGHIÊN CỨU")
    assert is_master_sheet("6.611_TMĐT_THS", "NGÀNH: THƯƠNG MẠI ĐIỆN TỬ - CHƯƠNG TRÌNH: THƯƠNG MẠI ĐIỆN TỬ - THẠC SĨ")
    assert is_master_sheet("1._Kế toán_THS", "NGÀNH: KẾ TOÁN - CHƯƠNG TRÌNH: CHUYÊN NGÀNH KẾ TOÁN - THẠC SĨ")

    # Sheet dữ liệu tổng -> Bỏ qua
    assert not is_master_sheet("Data tổng ", "Dữ liệu tổng hợp")
    assert not is_master_sheet("Data", "Data raw")

    # Sheet tiến sĩ -> Bỏ qua
    assert not is_master_sheet("Kế toán (TS)", "NGÀNH: KẾ TOÁN - BẬC TIẾN SĨ")

    # Sheet đại học nằm lẫn -> Bỏ qua
    assert not is_master_sheet("1.405-Kế toán", "NGÀNH: KẾ TOÁN - CHƯƠNG TRÌNH: CHUYÊN NGÀNH KẾ TOÁN")
    assert not is_master_sheet("2.405-Kiểm toán", "NGÀNH: KIỂM TOÁN")
    assert not is_master_sheet("2_408_KDQT_CT Chuẩn_myUEL", "Kinh doanh quốc tế")
    assert not is_master_sheet("1_402_KTQT_CT Chuẩn_myUEL", "Kinh tế quốc tế")


# ---------------------------------------------------------------------------
# 4. Test Tách Nhánh NC và UD (Branch Splitting)
# ---------------------------------------------------------------------------

def test_detect_major_and_branch():
    """Kiểm tra phát hiện mã ngành và tách nhánh NC (Nghiên cứu) / UD (Ứng dụng)."""
    # Ngành Kinh tế học (603)
    c1, b1, n1 = detect_major_and_branch("1.603_KT&QLC_ThS-NC", "THẠC SĨ NGHIÊN CỨU")
    assert c1 == "603"
    assert b1 == "NC"

    c2, b2, n2 = detect_major_and_branch("2.603_KT&QLC_ThS-UD", "THẠC SĨ ỨNG DỤNG")
    assert c2 == "603"
    assert b2 == "UD"

    # Ngành Kinh tế chính trị (601)
    c3, b3, n3 = detect_major_and_branch("3.601_KTCT_THS-NC", "THẠC SĨ NGHIÊN CỨU")
    assert c3 == "601"
    assert b3 == "NC"

    c4, b4, n4 = detect_major_and_branch("4.601_KTCT_THS-UD", "THẠC SĨ ỨNG DỤNG")
    assert c4 == "601"
    assert b4 == "UD"

    # Ngành Kế toán (605)
    c5, b5, n5 = detect_major_and_branch("1._Kế toán_THS", "CHUYÊN NGÀNH KẾ TOÁN - THẠC SĨ")
    assert c5 == "605"
    assert b5 == ""

    # Ngành Luật kinh tế (610)
    c6, b6, n6 = detect_major_and_branch("1.610_Luật kinh tế_NC", "THẠC SĨ NÂNG CAO")
    assert c6 == "610"
    assert b6 == "NC"


# ---------------------------------------------------------------------------
# 5. Test API Degree Filtering (/api/programs & /api/modules)
# ---------------------------------------------------------------------------

def test_api_programs_degree_filter(client, db):
    """Kiểm tra API /api/programs: mặc định chỉ trả đại học, chỉ trả thạc sĩ khi có degree=thac_si."""
    # Tạo chương trình đại học và thạc sĩ
    p_dh = Program(id="K24404", name="Tài chính - Ngân hàng K24", cohort="K24", faculty="Khoa Tài chính - Ngân hàng", degree="dai_hoc")
    p_ths_nc = Program(id="M601NC", name="Kinh tế chính trị - Thạc sĩ nghiên cứu", cohort="2025-2026", faculty="Khoa Kinh tế", degree="thac_si")
    p_ths_ud = Program(id="M601UD", name="Kinh tế chính trị - Thạc sĩ ứng dụng", cohort="2025-2026", faculty="Khoa Kinh tế", degree="thac_si")
    db.add_all([p_dh, p_ths_nc, p_ths_ud])
    db.commit()

    # 1. Mặc định (không truyền degree): chỉ nhận đại học
    res_def = client.get("/api/programs")
    assert res_def.status_code == 200
    ids_def = [it["program_id"] for it in res_def.json()]
    assert "K24404" in ids_def
    assert "M601NC" not in ids_def
    assert "M601UD" not in ids_def

    # 2. Truyền degree=thac_si: chỉ nhận thạc sĩ
    res_ths = client.get("/api/programs?degree=thac_si")
    assert res_ths.status_code == 200
    ids_ths = [it["program_id"] for it in res_ths.json()]
    assert "K24404" not in ids_ths
    assert "M601NC" in ids_ths
    assert "M601UD" in ids_ths

    # 3. Truyền degree=all: nhận tất cả
    res_all = client.get("/api/programs?degree=all")
    assert res_all.status_code == 200
    ids_all = [it["program_id"] for it in res_all.json()]
    assert "K24404" in ids_all
    assert "M601NC" in ids_all
    assert "M601UD" in ids_all


def test_api_modules_degree_filter(client, db):
    """Kiểm tra API /api/modules: mặc định chỉ trả đại học, chỉ trả thạc sĩ khi có degree=thac_si."""
    m_dh = Module(code="BAA2028", name="Kinh tế vi mô", credits=3, degree="dai_hoc")
    m_ths = Module(code="MEE6010", name="Kinh tế chính trị nâng cao", credits=3, degree="thac_si")
    db.add_all([m_dh, m_ths])
    db.commit()

    # 1. Mặc định: chỉ trả đại học
    res_def = client.get("/api/modules")
    assert res_def.status_code == 200
    codes_def = [it["code"] for it in res_def.json()["items"]]
    assert "BAA2028" in codes_def
    assert "MEE6010" not in codes_def

    # 2. degree=thac_si: chỉ trả thạc sĩ
    res_ths = client.get("/api/modules?degree=thac_si")
    assert res_ths.status_code == 200
    codes_ths = [it["code"] for it in res_ths.json()["items"]]
    assert "BAA2028" not in codes_ths
    assert "MEE6010" in codes_ths

    # 3. degree=all: trả cả hai
    res_all = client.get("/api/modules?degree=all")
    assert res_all.status_code == 200
    codes_all = [it["code"] for it in res_all.json()["items"]]
    assert "BAA2028" in codes_all
    assert "MEE6010" in codes_all


# ---------------------------------------------------------------------------
# 6. Test Dịch vụ Nạp Thạc sĩ (Dry-run & Idempotent)
# ---------------------------------------------------------------------------

def test_ths_curricula_import_service(db, tmp_path):
    """Kiểm tra import_ths_curricula chạy đúng với file Excel mẫu, hỗ trợ dry-run và idempotent."""
    wb_file = tmp_path / "THS_KinhTe.xlsx"
    wb = openpyxl.Workbook()

    # Tạo sheet thạc sĩ NC
    ws_nc = wb.active
    ws_nc.title = "3.601_KTCT_THS-NC"
    ws_nc.cell(row=1, column=1, value="NGÀNH: KINH TẾ CHÍNH TRỊ - CHƯƠNG TRÌNH: KINH TẾ CHÍNH TRỊ - THẠC SĨ NGHIÊN CỨU")

    # Dòng 8: tiêu đề chính
    headers_r8 = ["TT", "Mã học phần", "Tên học phần", "Số tín chỉ", "Quá trình", "Quá trình", "Cuối kỳ", "Cuối kỳ", "Thi", "Thời lượng thi", "Tài liệu chính"]
    for c_idx, val in enumerate(headers_r8, start=1):
        ws_nc.cell(row=8, column=c_idx, value=val)

    # Dòng 9: tiêu đề phụ
    headers_r9 = ["", "", "", "", "Tỉ lệ điểm", "Hình thức", "Tỉ lệ điểm", "Hình thức", "", "", ""]
    for c_idx, val in enumerate(headers_r9, start=1):
        ws_nc.cell(row=9, column=c_idx, value=val)

    # Dòng 10: Dữ liệu học phần 1 (dùng '3.00' và \xa0)
    ws_nc.cell(row=10, column=1, value=1)
    ws_nc.cell(row=10, column=2, value="MEE6011\xa0")
    ws_nc.cell(row=10, column=3, value="Triết học kinh tế\xa0")
    ws_nc.cell(row=10, column=4, value="3.00")
    ws_nc.cell(row=10, column=5, value="50%")
    ws_nc.cell(row=10, column=6, value="Tiểu luận")
    ws_nc.cell(row=10, column=7, value="50%")
    ws_nc.cell(row=10, column=8, value="Thi viết")
    ws_nc.cell(row=10, column=9, value="Tự luận")
    ws_nc.cell(row=10, column=10, value="90 phút")
    ws_nc.cell(row=10, column=11, value="Giáo trình Triết học kinh tế")

    # Sheet thạc sĩ UD
    ws_ud = wb.create_sheet(title="4.601_KTCT_THS-UD")
    ws_ud.cell(row=1, column=1, value="NGÀNH: KINH TẾ CHÍNH TRỊ - CHƯƠNG TRÌNH: KINH TẾ CHÍNH TRỊ - THẠC SĨ ỨNG DỤNG")
    for c_idx, val in enumerate(headers_r8, start=1):
        ws_ud.cell(row=8, column=c_idx, value=val)
    for c_idx, val in enumerate(headers_r9, start=1):
        ws_ud.cell(row=9, column=c_idx, value=val)
    ws_ud.cell(row=10, column=1, value=1)
    ws_ud.cell(row=10, column=2, value="MEE6012")
    ws_ud.cell(row=10, column=3, value="Kinh tế chính trị ứng dụng")
    ws_ud.cell(row=10, column=4, value="3.00")

    wb.save(str(wb_file))
    wb.close()

    preview_csv_path = tmp_path / "ths_preview.csv"

    # 1. Chạy với dry_run=True: kiểm tra xuất CSV preview và DB không bị thay đổi
    res_dry = import_ths_curricula(db, bdcl_dir=tmp_path, dry_run=True, preview_csv=preview_csv_path)
    assert res_dry["dry_run"] is True
    assert preview_csv_path.exists()
    assert res_dry["programs_count"] == 2  # M601NC và M601UD

    # DB vẫn rỗng
    assert db.scalar(select(func.count(Program.id)).where(Program.degree == "thac_si")) == 0
    assert db.scalar(select(func.count(Module.code)).where(Module.degree == "thac_si")) == 0

    # 2. Chạy thật với dry_run=False: nạp vào DB
    res_real = import_ths_curricula(db, bdcl_dir=tmp_path, dry_run=False, preview_csv=preview_csv_path)
    assert res_real["dry_run"] is False
    assert res_real["programs_count"] == 2

    # Kiểm tra Program đã nạp
    progs = list(db.scalars(select(Program).where(Program.degree == "thac_si").order_by(Program.id)))
    assert len(progs) == 2
    assert progs[0].id == "M601NC"
    assert progs[0].cohort == "2025-2026"
    assert progs[0].faculty == "Khoa Kinh tế"
    assert progs[1].id == "M601UD"

    # Kiểm tra Module đã nạp
    mod = db.scalar(select(Module).where(Module.code == "MEE6011"))
    assert mod is not None
    assert mod.name == "Triết học kinh tế"
    assert mod.credits == 3
    assert mod.degree == "thac_si"
    assert mod.final_assessment == "Thi viết"

    # Kiểm tra ProgramModule
    pm = db.scalar(select(ProgramModule).where(ProgramModule.program_id == "M601NC", ProgramModule.module_code == "MEE6011"))
    assert pm is not None
    assert pm.suggested_semester is None  # Để trống theo yêu cầu

    # Kiểm tra ModuleAssessment
    ass = db.scalar(select(ModuleAssessment).where(ModuleAssessment.module_code == "MEE6011"))
    assert ass is not None
    assert ass.process_ratio == 0.5
    assert ass.final_ratio == 0.5
    assert ass.final_assessment_kind == "Thi viết"

    # 3. Chạy lại lần 2 (Idempotency): không nhân đôi dữ liệu
    res_repeat = import_ths_curricula(db, bdcl_dir=tmp_path, dry_run=False, preview_csv=preview_csv_path)
    total_progs = db.scalar(select(func.count(Program.id)).where(Program.degree == "thac_si"))
    total_mods = db.scalar(select(func.count(Module.code)).where(Module.degree == "thac_si"))
    assert total_progs == 2
    assert total_mods == 2
