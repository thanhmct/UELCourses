"""Bộ test Pytest toàn diện cho tính năng Nạp CTĐT từ các file (Brief D3):
- semester_id_for: quy tắc đếm 3 học kỳ/năm, 10 học kỳ/4 năm liên tiếp (mốc 1, 3, 4, 6, 7, 9, 10);
- detect_columns: dò cột theo từ khóa tiếng Việt / tiếng Anh và hoán vị vị trí;
- parse_ctdt_filename & parse_bdcl_sheet_name: phân loại file, hậu tố, cohort override;
- Quy tắc khóa: CTĐT 2023 -> K23 & K24, CTĐT 2025 -> K25 & K26;
- Quy tắc 1a: K23 tiếng Việt không tạo từ Excel 2023 (chờ X2), xuất ctdt2023_vs_db.csv, hệ E/H/T của K23 vẫn nạp;
- Quy tắc 1b: Nguồn Excel BĐCL và Drive khoa, sửa lỗi gõ BRE4038 -> BRB4038;
- Quy tắc 3b: Điền suggested_semester cho K25/K26 còn thiếu, môn không có kỳ để trống;
- Quy tắc B6 & D19: Không ghi đè khoa/bộ môn;
- --dry-run xuất CSV xem trước và không sửa DB;
- Idempotent: chạy nhiều lần không nhân đôi dữ liệu.
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path
import pytest
import openpyxl
from sqlalchemy import func, select

from app.models import Module, ModuleRelation, Program, ProgramModule
from app.services.ctdt_files_import import (
    backfill_2025_suggested_semesters,
    cohorts_for_curriculum_year,
    compare_k23_excel_vs_db,
    compute_coverage_report,
    detect_columns,
    import_ctdt_files,
    parse_bdcl_sheet_name,
    parse_ctdt_filename,
    read_xlsx_file,
    semester_id_for,
)


# ---------------------------------------------------------------------------
# 1. Test semester_id_for (Quy tắc 3b)
# ---------------------------------------------------------------------------

def test_semester_id_for_k25_milestones():
    """Kiểm chứng đầy đủ các mốc học kỳ quy định tại Brief 3b cho khóa K25."""
    # HK1, HK2, HK3 -> năm thứ nhất
    assert semester_id_for(2025, 1) == "2025-2026-1"
    assert semester_id_for(2025, 2) == "2025-2026-2"
    assert semester_id_for(2025, 3) == "2025-2026-3"

    # HK4, HK5, HK6 -> năm thứ hai
    assert semester_id_for(2025, 4) == "2026-2027-1"
    assert semester_id_for(2025, 5) == "2026-2027-2"
    assert semester_id_for(2025, 6) == "2026-2027-3"

    # HK7, HK8, HK9 -> năm thứ ba
    assert semester_id_for(2025, 7) == "2027-2028-1"
    assert semester_id_for(2025, 8) == "2027-2028-2"
    assert semester_id_for(2025, 9) == "2027-2028-3"

    # HK10 -> kỳ 1 năm thứ tư
    assert semester_id_for(2025, 10) == "2028-2029-1"


def test_semester_id_for_various_cohort_formats():
    """Hỗ trợ nhiều định dạng cohort khác nhau: 'K25', '25', '2025', 25, 2025."""
    assert semester_id_for("K25", 1) == "2025-2026-1"
    assert semester_id_for("k25", 4) == "2026-2027-1"
    assert semester_id_for("25", 10) == "2028-2029-1"
    assert semester_id_for(25, 7) == "2027-2028-1"
    assert semester_id_for("K23", 1) == "2023-2024-1"
    assert semester_id_for("K24", 4) == "2025-2026-1"
    assert semester_id_for("K26", 10) == "2029-2030-1"

    # Định dạng n là chuỗi
    assert semester_id_for("K25", "HK01") == "2025-2026-1"
    assert semester_id_for("K25", "HK 10") == "2028-2029-1"
    assert semester_id_for("K25", "4") == "2026-2027-1"

    # Trường hợp không hợp lệ
    assert semester_id_for("K25", 0) is None
    assert semester_id_for("K25", -1) is None
    assert semester_id_for(None, 1) is None
    assert semester_id_for("K25", None) is None
    assert semester_id_for("ABC", 1) is None


# ---------------------------------------------------------------------------
# 2. Test detect_columns (Dò cột theo từ khóa tiếng Việt & tiếng Anh)
# ---------------------------------------------------------------------------

def test_detect_columns_vietnamese():
    headers = [
        "STT", "Mã học phần", "Tên môn học", "Tên tiếng Anh",
        "Số tín chỉ", "Loại môn học", "Học kỳ", "Khối kiến thức",
        "Tiên quyết", "Học trước", "Song hành", "Tương đương",
    ]
    col_map = detect_columns(headers)
    assert col_map["code"] == 1
    assert col_map["name"] == 2
    assert col_map["name_en"] == 3
    assert col_map["credits"] == 4
    assert col_map["required"] == 5
    assert col_map["semester"] == 6
    assert col_map["block"] == 7
    assert col_map["prereq"] == 8
    assert col_map["previous"] == 9
    assert col_map["coreq"] == 10
    assert col_map["equivalent"] == 11


def test_detect_columns_english():
    headers = [
        "No.", "Course Code", "Course Name", "Credits",
        "Type", "Semester", "Knowledge Block", "Prerequisite",
    ]
    col_map = detect_columns(headers)
    assert col_map["code"] == 1
    assert col_map["name"] == 2
    assert col_map["credits"] == 3
    assert col_map["required"] == 4
    assert col_map["semester"] == 5
    assert col_map["block"] == 6
    assert col_map["prereq"] == 7


def test_detect_columns_permuted_order():
    """Dò đúng cột khi thứ tự cột bị đảo lộn."""
    headers = ["Khối kiến thức", "Số tín chỉ", "Tên môn học", "Mã môn học", "Học kỳ"]
    col_map = detect_columns(headers)
    assert col_map["block"] == 0
    assert col_map["credits"] == 1
    assert col_map["name"] == 2
    assert col_map["code"] == 3
    assert col_map["semester"] == 4


# ---------------------------------------------------------------------------
# 3. Test quy tắc khóa và phân loại tên file
# ---------------------------------------------------------------------------

def test_cohorts_for_curriculum_year():
    assert cohorts_for_curriculum_year(2023) == ["K23", "K24"]
    assert cohorts_for_curriculum_year(2025) == ["K25", "K26"]
    assert cohorts_for_curriculum_year(2021) == ["K21", "K22"]
    assert cohorts_for_curriculum_year(2027) == ["K27", "K28"]


def test_parse_ctdt_filename():
    # File hợp lệ
    f1 = parse_ctdt_filename("CTDT2023_KinhTe.pdf")
    assert f1["status"] == "ok"
    assert f1["year"] == 2023
    assert f1["major_code"] == "401"
    assert f1["variant"] == ""

    f2 = parse_ctdt_filename("CTDT2025_HTTTQL.pdf")
    assert f2["status"] == "ok"
    assert f2["year"] == 2025
    assert f2["major_code"] == "406"
    assert f2["variant"] == ""

    f3 = parse_ctdt_filename("CTDT2023_KinhTeQuocTe_EN.xlsx")
    assert f3["status"] == "ok"
    assert f3["year"] == 2023
    assert f3["major_code"] == "402"
    assert f3["variant"] == "E"

    f4 = parse_ctdt_filename("CTDT2025_Luat_VI.xls")
    assert f4["status"] == "ok"
    assert f4["year"] == 2025
    assert f4["variant"] == ""

    f5 = parse_ctdt_filename("CTDT2025_TMDT_CNTN.docx")
    assert f5["status"] == "ok"
    assert f5["year"] == 2025
    assert f5["major_code"] == "411"
    assert f5["variant"] == "T"

    # File bị loại trừ
    assert parse_ctdt_filename("LichThi2025_HK1.xlsx")["status"] == "excluded"
    assert parse_ctdt_filename("GHICHU_ApDung.pdf")["status"] == "excluded"
    assert parse_ctdt_filename("CTDT2025_QD_BanHanh.pdf")["status"] == "excluded"
    assert parse_ctdt_filename("CTDT2025_HTTTQL_ChuanDauRa.pdf")["status"] == "excluded"

    # File chưa đủ dữ liệu
    assert parse_ctdt_filename("CTDT2025_KeToan_MoTa.docx")["status"] == "insufficient_data"
    assert parse_ctdt_filename("CTDT2025_KiemToan_MoTa.docx")["status"] == "insufficient_data"


@pytest.mark.parametrize(("sheet", "major", "variant"), [
    ("2_408_KDQT_CT Chuẩn_myUEL", "408", ""),
    ("4_408E_KDQT_MyUEL", "408", "E"),
    ("5.408T_KDQT_ĐH-CNTN_MyUEL", "408", "T"),
    ("6.408TE_KDQT_ĐH-CNTN-English-My", "408", "TE"),
    ("1_402_KTQT_CT Chuẩn_myUEL", "402", ""),
    ("2_402T_KTQT_CNTN-MyUEL", "402", "T"),
    ("1.413-TUDTKT_QT_TC", "413", ""),
    ("2.413E-TUDTKT_QT_TC(E)", "413", "E"),
    ("5_420_KDQT_MyUel", "420", ""),
    ("4.411-TMĐT(E)", "411", ""),
    ("408 E", "408", ""),
    ("408-E", "408", ""),
    ("408_E", "408", ""),
])
def test_sheet_suffix_comes_from_identifier(sheet, major, variant):
    parsed = parse_bdcl_sheet_name(sheet)
    assert (parsed["major_code"], parsed["variant"]) == (major, variant)


def test_parse_bdcl_sheet_name():
    # Sheet chuẩn
    s1 = parse_bdcl_sheet_name("1.406-HTTTQL")
    assert s1["major_code"] == "406"
    assert s1["variant"] == ""
    assert s1["cohort_override"] is None

    # Sheet có cohort override
    s2 = parse_bdcl_sheet_name("2.406H-HTTTQL(COOP)-K25")
    assert s2["major_code"] == "406"
    assert s2["variant"] == "H"
    assert s2["cohort_override"] == "K25"

    s3 = parse_bdcl_sheet_name("2.406H-HTTTQL(COOP)-K26")
    assert s3["major_code"] == "406"
    assert s3["variant"] == "H"
    assert s3["cohort_override"] == "K26"

    # Sheet tiếng Anh / Tài năng
    s4 = parse_bdcl_sheet_name("6.411E-TMĐT(E)")
    assert s4["major_code"] == "411"
    assert s4["variant"] == "E"

    s5 = parse_bdcl_sheet_name("5.411T-TMĐT(T)")
    assert s5["major_code"] == "411"
    assert s5["variant"] == "T"

    s6 = parse_bdcl_sheet_name("7.411TE-TMĐT(TE)")
    assert s6["major_code"] == "411"
    assert s6["variant"] == "TE"

    # Sheet Kiểm toán đặc biệt
    s7 = parse_bdcl_sheet_name("2.405-Kiểm toán")
    assert s7["major_code"] == "409"
    assert s7["variant"] == ""

    # Bỏ qua sheet dữ liệu gốc / tra cứu
    assert parse_bdcl_sheet_name("1. Dữ liệu gốc") is None
    assert parse_bdcl_sheet_name("Data") is None
    assert parse_bdcl_sheet_name("Trang tính11") is None


# ---------------------------------------------------------------------------
# 4. Helper tạo file fixture Excel mẫu
# ---------------------------------------------------------------------------

def _create_sample_excel_fixture(path: Path, year: int = 2025) -> Path:
    wb = openpyxl.Workbook()
    # Sheet 1: Chuẩn 406
    ws1 = wb.active
    ws1.title = "1.406-HTTTQL"
    ws1.append(["STT", "Mã môn học", "Tên môn học", "Số tín chỉ", "Loại môn học", "Học kỳ", "Khối kiến thức", "Tiên quyết"])
    ws1.append([1, "BAA2028", "Nguyên lý kế toán", 3, "Bắt buộc", 1, "Cơ sở khối ngành", ""])
    ws1.append([2, "BIM1001", "Nhập môn HTTT", 3, "Bắt buộc", 2, "Cơ sở ngành", "BAA2028"])
    ws1.append([3, "BIT2002", "Cơ sở dữ liệu", 3, "Bắt buộc", 4, "Chuyên ngành", "BIM1001"])
    ws1.append([4, "BDG1014", "Giáo dục quốc phòng", 0, "Bắt buộc", "", "Điều kiện", ""])

    # Sheet 2: Hệ tiếng Anh 411E
    ws2 = wb.create_sheet(title="6.411E-TMĐT(E)")
    ws2.append(["STT", "Mã môn học", "Tên môn học", "Số tín chỉ", "Loại môn học", "Học kỳ", "Khối kiến thức", "Tiên quyết"])
    ws2.append([1, "EAA2028", "Principles of Accounting", 3, "Bắt buộc", 1, "Cơ sở khối ngành", ""])
    ws2.append([2, "EIM1001", "Intro to MIS", 3, "Bắt buộc", 2, "Cơ sở ngành", "EAA2028"])

    # Sheet 3: Bỏ qua sheet Data
    ws3 = wb.create_sheet(title="Data")
    ws3.append(["Lookup", "Value"])
    ws3.append(["A", "1"])

    wb.save(path)
    wb.close()
    return path


def _create_sample_2023_excel_fixture(path: Path) -> Path:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "404 TCNH"
    ws.append(["STT", "Mã HP", "Tên HP", "Tín chỉ", "Bắt buộc", "Học kỳ", "Tiên quyết"])
    ws.append([1, "BAA2028", "Nguyên lý kế toán", 3, "Bắt buộc", 1, ""])
    ws.append([2, "BFF2044", "Nguyên lý thị trường tài chính", 3, "Bắt buộc", 2, "BAA2028"])
    ws.append([3, "BFF4029", "Phân tích chứng khoán", 3, "Bắt buộc", 4, "BFF2044"])

    # Sheet tiếng Anh của 2023
    ws_en = wb.create_sheet(title="404E TCNH-E")
    ws_en.append(["STT", "Mã HP", "Tên HP", "Tín chỉ", "Bắt buộc", "Học kỳ", "Tiên quyết"])
    ws_en.append([1, "EAA2028", "Principles of Accounting", 3, "Bắt buộc", 1, ""])
    ws_en.append([2, "EFF2044", "Principles of Financial Markets", 3, "Bắt buộc", 2, "EAA2028"])

    wb.save(path)
    wb.close()
    return path


# ---------------------------------------------------------------------------
# 5. Test nạp và CSDL (Idempotent, Quy tắc khóa, Quy tắc B6, Dry-run)
# ---------------------------------------------------------------------------

def test_dry_run_does_not_modify_db(db, tmp_path):
    excel_path = _create_sample_excel_fixture(tmp_path / "DH_HeThongThongTin.xlsx")
    preview_csv = tmp_path / "preview.csv"

    res = import_ctdt_files(
        db,
        bdcl_dir=tmp_path,
        dry_run=True,
        preview_csv=preview_csv,
    )

    assert res["dry_run"] is True
    assert res["files_ok"] == 1
    # DB không có chương trình nào được tạo
    assert db.scalar(select(func.count(Program.id))) == 0
    assert preview_csv.exists()

    with open(preview_csv, "r", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
        assert len(rows) >= 2
        # Sheet 406 và sheet 411E
        pids = [r["chuong_trinh_dich"] for r in rows]
        assert any("K25406" in p for p in pids)
        assert any("K25411E" in p for p in pids)


def test_import_ctdt_files_2025_rule_and_idempotency(db, tmp_path):
    """File CTĐT 2025 sinh ra cả hai khóa K25 và K26; chạy lại không nhân đôi."""
    excel_path = _create_sample_excel_fixture(tmp_path / "DH_HeThongThongTin.xlsx")

    # Lần 1: Chạy thật
    res1 = import_ctdt_files(db, bdcl_dir=tmp_path, dry_run=False)
    assert res1["dry_run"] is False
    assert res1["programs_created"] == 4  # K25406, K26406, K25411E, K26411E

    # Kiểm tra chương trình được tạo
    p_k25_406 = db.get(Program, "K25406")
    p_k26_406 = db.get(Program, "K26406")
    p_k25_411e = db.get(Program, "K25411E")
    p_k26_411e = db.get(Program, "K26411E")

    assert p_k25_406 is not None
    assert p_k26_406 is not None
    assert p_k25_411e is not None
    assert p_k26_411e is not None

    assert p_k25_406.cohort == "K25"
    assert p_k26_406.cohort == "K26"
    assert p_k25_406.faculty == "Khoa Hệ thống thông tin"

    # Kiểm tra môn học và học kỳ gợi ý
    pm_k25 = {
        pm.module_code: pm
        for pm in db.scalars(select(ProgramModule).where(ProgramModule.program_id == "K25406")).all()
    }
    assert "BAA2028" in pm_k25
    assert "BIM1001" in pm_k25
    assert "BIT2002" in pm_k25
    assert "BDG1014" in pm_k25

    # HK1 của K25 -> 2025-2026-1; HK2 -> 2025-2026-2; HK4 -> 2026-2027-1
    assert pm_k25["BAA2028"].suggested_semester == "2025-2026-1"
    assert pm_k25["BIM1001"].suggested_semester == "2025-2026-2"
    assert pm_k25["BIT2002"].suggested_semester == "2026-2027-1"
    # GDQP không có học kỳ -> suggested_semester để trống
    assert pm_k25["BDG1014"].suggested_semester is None

    # Quan hệ tiên quyết được tạo đúng
    rel = db.scalar(
        select(ModuleRelation).where(
            ModuleRelation.program_id == "K25406",
            ModuleRelation.source == "BAA2028",
            ModuleRelation.target == "BIM1001",
        )
    )
    assert rel is not None
    assert rel.type == "prereq"

    # Lần 2: Idempotent - chạy lại không làm nhân đôi bản ghi
    res2 = import_ctdt_files(db, bdcl_dir=tmp_path, dry_run=False)
    assert db.scalar(select(func.count(Program.id))) == 4
    # Số lượng program_modules của K25406 vẫn đúng 4
    count_pm = db.scalar(select(func.count(ProgramModule.id)).where(ProgramModule.program_id == "K25406"))
    assert count_pm == 4


def test_rule_1a_k23_vietnamese_not_created_diff_reported(db, tmp_path):
    """Quy tắc 1a: K23 tiếng Việt KHÔNG tạo từ Excel 2023 (chờ X2), xuất báo cáo đối chiếu.
    Hệ E của K23 VẪN nạp bình thường; K24 tiếng Việt VẪN nạp bình thường."""
    excel_path = _create_sample_2023_excel_fixture(tmp_path / "14. Đề cương ngành TCNH 2023_404.xlsx")
    vs_csv = tmp_path / "ctdt2023_vs_db.csv"

    # Giả sử DB đã có K23404 do X2 tạo từ trước (có BAA2028 và BFF2044, nhưng thiếu BFF4029)
    p_k23 = Program(id="K23404", name="Tài chính - Ngân hàng Khóa 23", cohort="K23", faculty="Khoa Tài chính - Ngân hàng", source="derived_from_K24")
    db.add(p_k23)
    db.add_all([Module(code="BAA2028", name="Kế toán"), Module(code="BFF2044", name="Tài chính")])
    db.flush()
    db.add(ProgramModule(program_id="K23404", module_code="BAA2028", required=True))
    db.add(ProgramModule(program_id="K23404", module_code="BFF2044", required=True))
    db.commit()

    res = import_ctdt_files(
        db,
        excel_2023_dir=tmp_path,
        dry_run=False,
        vs_db_csv=vs_csv,
    )

    # K23 tiếng Việt (K23404) KHÔNG bị ghi đè: số môn vẫn giữ nguyên 2 môn ban đầu
    p_k23_after = db.get(Program, "K23404")
    assert p_k23_after.source == "derived_from_K24"
    count_k23 = db.scalar(select(func.count(ProgramModule.id)).where(ProgramModule.program_id == "K23404"))
    assert count_k23 == 2

    # K23 hệ E (K23404E) VÀ K24 hệ chuẩn (K24404) ĐƯỢC TẠO
    assert db.get(Program, "K23404E") is not None
    assert db.get(Program, "K24404") is not None
    assert db.get(Program, "K24404E") is not None

    # File đối chiếu chênh lệch ctdt2023_vs_db.csv ghi nhận chênh lệch môn BFF4029
    assert vs_csv.exists()
    with open(vs_csv, "r", encoding="utf-8-sig") as f:
        diff_rows = list(csv.DictReader(f))
        assert len(diff_rows) >= 1
        found_diff = any(r["ma_hp_excel"] == "BFF4029" and r["ma_ctdt"] == "K23404" for r in diff_rows)
        assert found_diff is True


def test_rule_b6_faculty_not_overwritten(db, tmp_path):
    """Quy tắc B6 & D19: Không bao giờ ghi đè khoa/bộ môn từ file CTĐT."""
    # Module đã có khoa chuẩn từ đề cương / Master_data
    mod = Module(code="BAA2028", name="Nguyên lý kế toán", faculty="Khoa Kế toán - Kiểm toán", department="Bộ môn Kế toán tài chính")
    db.add(mod)
    db.commit()

    excel_path = _create_sample_excel_fixture(tmp_path / "DH_HeThongThongTin.xlsx")
    import_ctdt_files(db, bdcl_dir=tmp_path, dry_run=False)

    # Khoa và bộ môn của BAA2028 giữ nguyên
    mod_after = db.get(Module, "BAA2028")
    assert mod_after.faculty == "Khoa Kế toán - Kiểm toán"
    assert mod_after.department == "Bộ môn Kế toán tài chính"

    # Môn mới tạo BIT2002 có khoa để trống (chờ Master_data hoặc đề cương điền)
    mod_new = db.get(Module, "BIT2002")
    assert mod_new is not None
    assert mod_new.faculty is None


def test_backfill_2025_suggested_semesters(db):
    """Kiểm tra điền suggested_semester cho các môn thuộc CTĐT 2025 còn trống."""
    p_k25 = Program(id="K25404", name="TCNH K25", cohort="K25")
    db.add(p_k25)
    db.add_all([Module(code=code, name=code) for code in ("M01", "M02", "M03")])
    db.flush()

    # Môn có suggested_order = 1 -> kỳ 2025-2026-1
    pm1 = ProgramModule(program_id="K25404", module_code="M01", suggested_order=1, suggested_semester=None)
    # Môn có suggested_term = 'HK04' -> kỳ 2026-2027-1
    pm2 = ProgramModule(program_id="K25404", module_code="M02", suggested_term="HK04", suggested_semester=None)
    # Môn không có kỳ (GDQP) -> để trống
    pm3 = ProgramModule(program_id="K25404", module_code="M03", suggested_semester=None)
    db.add_all([pm1, pm2, pm3])
    db.commit()

    updated = backfill_2025_suggested_semesters(db)
    assert updated == 2
    assert pm1.suggested_semester == "2025-2026-1"
    assert pm2.suggested_semester == "2026-2027-1"
    assert pm3.suggested_semester is None


def test_coverage_report(db):
    """Kiểm tra cấu trúc và tính đúng đắn của báo cáo độ phủ compute_coverage_report."""
    db.add(Program(id="K23406", cohort="K23"))
    db.add(Program(id="K24404", cohort="K24"))
    db.add(Program(id="K25406", cohort="K25"))
    db.add(Program(id="K25414", cohort="K25"))
    db.commit()

    cov = compute_coverage_report(db)
    assert "K23" in cov and "K24" in cov and "K25" in cov and "K26" in cov
    assert "406" in cov["K23"]["majors_present"]
    assert "404" in cov["K24"]["majors_present"]
    assert "406" in cov["K25"]["majors_present"]
    assert "414" in cov["K25"]["majors_present"]
    assert cov["K26"]["majors_present_count"] == 0


def _write_workbook(path, tables):
    workbook = openpyxl.Workbook()
    workbook.remove(workbook.active)
    for title, rows in tables.items():
        sheet = workbook.create_sheet(title)
        for row in rows:
            sheet.append(row)
    workbook.save(path)
    workbook.close()


def _preview_rows(path):
    with path.open(encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def test_numbered_bdcl_source_wins_for_each_target(db, tmp_path):
    bdcl = tmp_path / "bdcl"
    bdcl.mkdir()
    header = ["Mã HP", "Tên HP", "Tín chỉ"]
    secondary = [header, ["BAA2028", "Bản phụ", 3]]
    primary = [header, ["BIM1001", "Bản chính", 3], ["BIM1002", "Bản chính", 3]]
    auxiliaries = [
        "1. Dữ liệu gốc", "Data", "Trang tính11", "Sheet1", "Sheet2",
        "2. Thương mại điện tử (TA)", "3. Thương mại điện tử (TV)",
        "4.Thương mại điện tử (CNTN)", "CN thương mại điện tử (E)",
    ]
    _write_workbook(bdcl / "DH_A.xlsx", {
        **dict.fromkeys(auxiliaries, secondary),
        "Thương mại điện tử": secondary,
        "4.411-TMĐT": primary,
        "5.411T": primary,
        "6.411E-TMĐT(E)": primary,
    })
    _write_workbook(tmp_path / "CTDT2025_TMDT_EN.xlsx", {"Bản từ khoa": secondary})

    preview = tmp_path / "preview.csv"
    result = import_ctdt_files(db, bdcl_dir=bdcl, dir_path=tmp_path, dry_run=True, preview_csv=preview)
    rows = _preview_rows(preview)
    selected = [row for row in rows if row["chuong_trinh_dich"]]
    assert [row["chuong_trinh_dich"] for row in selected] == [
        "K25411, K26411", "K25411T, K26411T", "K25411E, K26411E",
    ]
    assert all(row["so_hoc_phan_doc_duoc"] == "2" for row in selected)
    assert result["programs_planned"] == 6
    skipped = {
        row["file"].split(" / ")[-1]: row["ly_do_bo_qua"]
        for row in rows if not row["chuong_trinh_dich"]
    }
    assert all(skipped[name] for name in auxiliaries)
    assert "4.411-TMĐT" in skipped["Thương mại điện tử"]
    assert "6.411E-TMĐT(E)" in skipped["Bản từ khoa"]


def test_coop_uses_the_cohort_on_each_numbered_sheet(db, tmp_path):
    course = [["Mã HP", "Tên HP"], ["BIM1001", "Học phần Coop"]]
    sheets = {
        "2.406H-HTTTQL(COOP)-K25": "K25406H",
        "2.406H-HTTTQL(COOP)-K26": "K26406H",
        "4.414H-CNTC(CO-OP)-K25": "K25414H",
        "5.414H-CNTC(CO-OP)-K26": "K26414H",
    }
    _write_workbook(tmp_path / "DH_Coop.xlsx", {
        "1.406H-HTTTQL(COOP)": course,
        **dict.fromkeys(sheets, course),
    })
    preview = tmp_path / "preview.csv"
    import_ctdt_files(db, bdcl_dir=tmp_path, dry_run=True, preview_csv=preview)
    assert {
        row["file"].split(" / ")[-1]: row["chuong_trinh_dich"]
        for row in _preview_rows(preview) if row["chuong_trinh_dich"]
    } == sheets


def test_law_2023_splits_rows_and_preserves_portal_programs(db, tmp_path):
    _write_workbook(tmp_path / "CTDT2023_Luat_VI.xlsx", {
        "rpt_Sch_ChuongTrinhDaoTao_HocKy": [
            ["Mã HP", "Tên HP", "Tín chỉ", "Mã ngành", "Tên ngành"],
            ["BLU1001", "Môn chung", 3, 503, "Luật Dân sự"],
            ["BLU1001", "Môn chung", 3, None, "Luật Tài chính - Ngân hàng"],
            ["BLU1002", "Môn riêng", 3, 505, None],
            ["BLU1003", "Môn riêng", 3, None, "Luật và Công nghệ"],
            ["BLU1004", "Chưa rõ ngành", 3, "LUAT", "Luật"],
            ["BLU1005", "Mã và tên mâu thuẫn", 3, 503, "Luật và Công nghệ"],
        ],
    })
    db.add(Program(id="K24503", cohort="K24", name="Bản cổng trường", source="portal"))
    db.commit()

    preview = tmp_path / "preview.csv"
    import_ctdt_files(db, dir_path=tmp_path, dry_run=False, preview_csv=preview)
    assert set(db.scalars(select(Program.id))) == {"K24503", "K24504", "K24505", "K24506"}
    assert db.get(Program, "K24503").source == "portal"
    assert set(db.scalars(select(Module.code))) == {"BLU1001", "BLU1002", "BLU1003"}
    reports = _preview_rows(preview)
    assert any("K24503: đã có trong DB" in row["ly_do_bo_qua"] for row in reports)
    assert any(
        "Không xác định được ngành Luật" in row["ly_do_bo_qua"] and row["so_hoc_phan_doc_duoc"] == "2"
        for row in reports
    )


def test_law_2023_uses_specialization_in_printed_report(db, tmp_path):
    _write_workbook(tmp_path / "CTDT2023_Luat_VI.xlsx", {
        "rpt_Sch_ChuongTrinhDaoTao_HocKy": [
            ["Chương trình đào tạo", None, ":  Luật Khóa 23"],
            ["Chuyên ngành đào tạo", None, ":  Luật Dân sự"],
            ["Mã HP", "Tên HP", "Tín chỉ"],
            ["BLU1001", "Luật dân sự", 3],
        ],
        "Không ghi chuyên ngành": [
            ["Chương trình đào tạo", None, ":  Luật Khóa 23"],
            ["Mã HP", "Tên HP", "Tín chỉ"],
            ["BLU1002", "Chưa rõ ngành", 3],
        ],
    })
    preview = tmp_path / "preview.csv"
    result = import_ctdt_files(db, dir_path=tmp_path, dry_run=True, preview_csv=preview)
    assert result["programs_planned"] == 1
    reports = _preview_rows(preview)
    assert [r["chuong_trinh_dich"] for r in reports if r["chuong_trinh_dich"]] == ["K24503"]
    assert any("Không xác định được ngành Luật" in r["ly_do_bo_qua"] for r in reports)


def test_standard_source_for_2022_cannot_create_k23(db, tmp_path):
    _write_workbook(tmp_path / "CTDT2022_503_VI.xlsx", {
        "503 LDS": [["Mã HP", "Tên HP"], ["BLU1001", "Luật dân sự"]],
    })
    preview = tmp_path / "preview.csv"
    import_ctdt_files(db, dir_path=tmp_path, dry_run=True, preview_csv=preview)
    reports = _preview_rows(preview)
    assert [r["chuong_trinh_dich"] for r in reports if r["chuong_trinh_dich"]] == ["K22503"]
    assert any("K23503: hệ tiếng Việt do X2 xử lý" in r["ly_do_bo_qua"] for r in reports)


def test_cli_ctdt_dry_run_skips_all_write_hooks(db, tmp_path, monkeypatch):
    from app import cli
    from app.services import faculty_names

    def unexpected_write(*args, **kwargs):
        pytest.fail("CTĐT dry-run called a database write hook")

    _create_sample_excel_fixture(tmp_path / "DH_HeThongThongTin.xlsx")
    monkeypatch.setattr(cli, "init_db", unexpected_write)
    monkeypatch.setattr(cli, "classify_languages", unexpected_write)
    monkeypatch.setattr(cli, "log_run", unexpected_write)
    monkeypatch.setattr(faculty_names, "apply_outline_faculties", unexpected_write)
    monkeypatch.setattr(sys, "argv", [
        "app.cli", "import-ctdt-files", "--dry-run", "--bdcl-dir", str(tmp_path),
        "--dir", str(tmp_path / "unused"), "--excel-2023-dir", str(tmp_path / "unused"),
        "--preview-out", str(tmp_path / "preview.csv"), "--vs-db-out", str(tmp_path / "compare.csv"),
    ])
    assert cli.main() == 0
    assert db.scalar(select(func.count(Program.id))) == 0
    assert (tmp_path / "preview.csv").is_file()
