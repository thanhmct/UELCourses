"""Test nạp dữ liệu Master_data.xlsx theo Brief D4 và chỉ đạo ngày 2026-11-22 của chủ dự án:
- Đọc công thức đã tính nhờ data_only=True; ô #N/A không bị coi là tên khoa;
- Suy khoa từ Tên Khoa / BM khi cột Khoa là #N/A;
- Chuẩn hóa "Hệ thống thông tin" -> "Khoa Hệ thống thông tin";
- Bộ môn Ngoại ngữ thuộc Phòng Bảo đảm chất lượng;
- Ưu tiên 1 cao nhất: faculty_overrides.tsv không bị ghi đè;
- Mâu thuẫn Master vs đề cương: theo Master và xuất module_faculty_conflicts.csv;
- Nạp môn mới và cập nhật môn cũ, idempotent;
- Master_data ghi đè khoa sai có sẵn (ca BBB1068 "Kỹ năng lãnh đạo");
- Hình thức đánh giá, link đề cương, giáo trình lưu và trả đúng qua API;
- --dry-run không đổi DB.
"""

from __future__ import annotations

import csv
from pathlib import Path
import pytest
import openpyxl

from app.models import Module, OutlineCourse, OutlineDocument, OutlineModuleLink
from app.services.master_data_import import (
    DEPARTMENT_TO_FACULTY,
    import_master_data,
    import_master_module_details,
    infer_faculty_from_dept,
    load_department_faculty_lookup,
    load_master_data_courses,
    normalize_final_assessment,
    parse_ratio,
    resolve_master_course_faculty,
)


def test_module_details_import_updates_assessments_and_books_only(db, tmp_path):
    path = _build_fixture_workbook(tmp_path / "master.xlsx")
    db.add(Module(code="BBB1068", name="Tên hiện có", faculty="Khoa hiện có"))
    db.commit()
    assert import_master_module_details(db, path, dry_run=True)["assessment_updates"] == 1
    assert db.get(Module, "BBB1068").assessment is None

    result = import_master_module_details(db, path)
    db.expire_all()
    module = db.get(Module, "BBB1068")
    assert module.name == "Tên hiện có"
    assert module.faculty == "Khoa hiện có"
    assert module.assessment.final_ratio == 0.5
    assert module.textbooks[0].name == "Giáo trình Kỹ năng lãnh đạo"
    assert result["textbook_updates"] == 1
    assert db.get(Module, "BIM1001") is None
    assert import_master_module_details(db, path)["assessment_updates"] == 0


def _build_fixture_workbook(path: Path) -> Path:
    """Tạo file Master_data mẫu nhỏ để kiểm thử."""
    wb = openpyxl.Workbook()
    # Sheet mặc định đổi tên thành Data_Course
    ws_course = wb.active
    ws_course.title = "Data_Course"
    ws_course.append(["Mã Môn", "Tên Môn", "Tên Tiếng Anh", "Mã Khoa / BM", "Tên Khoa / BM", "GV phụ trách", "Khoa"])
    ws_course.append(["BBB1068", "Kỹ năng lãnh đạo", "Leadership Skills", "BM01", "Bộ môn Quản trị", "TS. Nguyễn Văn A", "Quản trị kinh doanh"])
    ws_course.append(["BIM1001", "Nhập môn hệ thống thông tin", "Intro to MIS", "BM02", "Bộ môn Hệ thống thông tin quản lý", "ThS. Trần B", "#N/A"])
    ws_course.append(["BIT1002", "Khoa học máy tính", "Computer Science", "K01", "Khoa Hệ thống thông tin", "TS. Lê C", "Hệ thống thông tin"])
    ws_course.append(["EDG1050", "Tiếng Anh chuyên ngành", "ESP", "BM03", "Bộ môn Ngoại ngữ", "Cô D", "#N/A"])
    ws_course.append(["BDG1001", "Triết học Mác - Lênin", "Philosophy", "BM04", "Bộ môn LLCT", "Thầy F", "Khoa Lý luận chính trị"])
    ws_course.append(["CONFLICT1", "Môn Mâu Thuẫn", "Conflict Course", "BM05", "Bộ môn Tài chính", "Thầy G", "Tài chính - Ngân hàng"])
    ws_course.append(["NEW9999", "Môn Mới", "Brand New Course", "BM06", "Bộ môn Toán kinh tế", "Thầy H", "Toán kinh tế"])
    ws_course.append(["OLD0001", "Môn Giữ Nguyên", "Old Course", "BM07", "Bộ môn Chưa Rõ", "", "#N/A"])

    # Sheet Sheet1
    ws_s1 = wb.create_sheet(title="Sheet1")
    ws_s1.append([
        "Mã học phần", "Tên học phần", "Số tín chỉ",
        "Quá trình_Tỉ lệ điểm", "Quá trình_Hình thức",
        "Giữa kỳ_Tỉ lệ điểm", "Giữa kỳ_Hình thức",
        "Cuối kỳ_Tỉ lệ điểm", "Cuối kỳ_Hình thức",
        "Nâng cao_Tỉ lệ điểm", "Nâng cao_Hình thức",
        "Loại thi", "Thời lượng thi", "Tài liệu chính",
        "Link đề cương", "Link tài liệu", "Mã tài liệu",
        "Ghi chú", "Thẩm định", "Bộ môn/ Khoa", "GV phụ trách", "Khoa"
    ])
    ws_s1.append([
        "BBB1068", "Kỹ năng lãnh đạo", 3,
        "20%", "Điểm danh + phát biểu",
        "30%", "Kiểm tra trắc nghiệm",
        "50%", "Tự luận",
        None, None,
        "Thi giấy", "60'", "Giáo trình Kỹ năng lãnh đạo",
        "https://drive.google.com/file/d/test_bbb1068", "https://drive.google.com/file/d/book_bbb1068", "TL_BBB1068",
        "Không", "Đạt", "Bộ môn Quản trị", "TS. Nguyễn Văn A", "Quản trị kinh doanh"
    ])
    ws_s1.append([
        "BIM1001", "Nhập môn hệ thống thông tin", 3,
        "20%", "Chuyên cần",
        "30%", "Tự luận",
        "50%", "Trắc nghiệm",
        None, None,
        "Thi máy", "90'", "Giáo trình MIS",
        "https://drive.google.com/file/d/test_bim1001", None, None,
        None, None, None, None, None
    ])
    ws_s1.append([
        "BIT1002", "Khoa học máy tính", 4,
        "30%", "Bài tập lớn",
        None, None,
        "70%", "Đồ án",
        None, None,
        "Bảo vệ đồ án", "30'", "Computer Science Book",
        None, None, None,
        None, None, None, None, None
    ])
    ws_s1.append([
        "EDG1050", "Tiếng Anh chuyên ngành", 2,
        "30%", "Phát âm",
        "20%", "Viết",
        "50%", "Vấn đáp",
        None, None,
        "Thi nói", "15'", "ESP Textbook",
        "https://drive.google.com/file/d/test_edg1050", None, None,
        None, None, None, None, None
    ])
    ws_s1.append([
        "CONFLICT1", "Môn Mâu Thuẫn", 3,
        "20%", "Chuyên cần",
        "30%", "Kiểm tra",
        "50%", "Thi viết",
        None, None,
        "Thi giấy", "60'", "Tài liệu Tài chính",
        None, None, None,
        None, None, None, None, None
    ])

    # Sheet Sheet7: bảng tra cứu Bộ môn -> Khoa
    ws_s7 = wb.create_sheet(title="Sheet7")
    ws_s7.append([""] * 15)  # Hàng 1
    # Thêm cặp cột N, O tại hàng 2..5 (index 13, 14)
    r2 = [""] * 15
    r2[13] = "Bộ môn Quản trị"
    r2[14] = "Khoa Quản trị kinh doanh"
    ws_s7.append(r2)

    r3 = [""] * 15
    r3[13] = "Bộ môn Hệ thống thông tin quản lý"
    r3[14] = "Khoa Hệ thống thông tin"
    ws_s7.append(r3)

    r4 = [""] * 15
    r4[13] = "Bộ môn Tài chính"
    r4[14] = "Khoa Tài chính - Ngân hàng"
    ws_s7.append(r4)

    r5 = [""] * 15
    r5[13] = "Bộ môn Toán kinh tế"
    r5[14] = "Khoa Toán kinh tế"
    ws_s7.append(r5)

    path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(str(path))
    wb.close()
    return path


@pytest.fixture
def sample_master_file(tmp_path) -> Path:
    f = tmp_path / "Master_data_sample.xlsx"
    return _build_fixture_workbook(f)


def test_data_only_and_na_handling(sample_master_file):
    """Test 1: data_only=True đọc được file, ô #N/A không bị coi là tên khoa."""
    courses = load_master_data_courses(sample_master_file)
    assert "BIM1001" in courses
    bim = courses["BIM1001"]
    # Khoa là #N/A nhưng suy từ Bộ môn HTTTQL -> Khoa Hệ thống thông tin
    assert bim["faculty"] == "Khoa Hệ thống thông tin"
    assert bim["faculty"] != "#N/A"

    # OLD0001 có Khoa là #N/A và Bộ môn không rõ -> faculty là None (không bị gán '#N/A')
    assert "OLD0001" in courses
    old = courses["OLD0001"]
    assert old["faculty"] is None


def test_infer_faculty_from_department(sample_master_file):
    """Test 2: Suy khoa từ Tên Khoa / BM khi cột Khoa là #N/A."""
    wb = openpyxl.load_workbook(str(sample_master_file), data_only=True)
    dept_map = load_department_faculty_lookup(wb)
    wb.close()

    fac, dept = resolve_master_course_faculty("Bộ môn Hệ thống thông tin quản lý", "#N/A", dept_map)
    assert fac == "Khoa Hệ thống thông tin"
    assert dept == "Bộ môn Hệ thống thông tin quản lý"


def test_canonicalize_faculty_name(sample_master_file):
    """Test 3: Chuẩn hóa 'Hệ thống thông tin' -> 'Khoa Hệ thống thông tin'."""
    wb = openpyxl.load_workbook(str(sample_master_file), data_only=True)
    dept_map = load_department_faculty_lookup(wb)
    wb.close()

    fac, _ = resolve_master_course_faculty("Khoa Hệ thống thông tin", "Hệ thống thông tin", dept_map)
    assert fac == "Khoa Hệ thống thông tin"


def test_foreign_languages_department_belongs_to_qa(sample_master_file):
    """Test 4: Quy tắc đặc thù: Bộ môn Ngoại ngữ thuộc Phòng Bảo đảm chất lượng."""
    courses = load_master_data_courses(sample_master_file)
    edg = courses["EDG1050"]
    assert edg["faculty"] == "Phòng Bảo đảm chất lượng"
    assert edg["department"] == "Bộ môn Ngoại ngữ"


def test_overrides_priority_highest(db, sample_master_file, tmp_path):
    """Test 5: Ưu tiên 1 cao nhất: api/seed/faculty_overrides.tsv chỉ định tay không bị ghi đè."""
    # BDG1001 nằm trong faculty_overrides.tsv (Phòng Đào tạo)
    # Trong Master_data ghi "Khoa Lý luận chính trị"
    db.add(Module(
        code="BDG1001",
        name="Triết học Mác - Lênin",
        faculty="Phòng Đào tạo",
        department="Phòng Đào tạo",
        faculty_source="admin",
    ))
    db.commit()

    res = import_master_data(
        db,
        file_path=sample_master_file,
        dry_run=False,
        preview_out=tmp_path / "preview.csv",
        conflicts_out=tmp_path / "conflicts.csv",
    )

    m = db.get(Module, "BDG1001")
    assert m.faculty == "Phòng Đào tạo"
    assert m.department == "Phòng Đào tạo"


def test_master_vs_outline_conflict(db, sample_master_file, tmp_path):
    """Test 6: Mâu thuẫn Master vs đề cương: theo Master và xuất module_faculty_conflicts.csv."""
    # CONFLICT1 trong DB có đề cương ghi Khoa Luật
    # Nhưng Master_data ghi Tài chính - Ngân hàng
    db.add_all([
        Module(
            code="CONFLICT1",
            name="Môn Mâu Thuẫn",
            faculty="Khoa Luật",
            department="Bộ môn Luật Dân sự",
        ),
        OutlineDocument(id=999, sha256="999" * 16, file_name="conflict.pdf", rel_path="conflict.pdf", size_bytes=100),
    ])
    db.flush()
    db.add(OutlineCourse(
        document_id=999,
        course_code_norm="CONFLICT1",
        faculty="FACULTY OF LAW",
        department="DEPARTMENT OF LAW",
        parse_status="ok",
    ))
    db.add(OutlineModuleLink(document_id=999, module_code="CONFLICT1", source="catalog"))
    db.commit()

    conflicts_p = tmp_path / "conflicts.csv"
    res = import_master_data(
        db,
        file_path=sample_master_file,
        dry_run=False,
        conflicts_out=conflicts_p,
    )

    # Theo Master: khoa phải đổi thành Khoa Tài chính - Ngân hàng
    m = db.get(Module, "CONFLICT1")
    assert m.faculty == "Khoa Tài chính - Ngân hàng"
    assert m.faculty_source == "master_data"

    # Kiểm tra file CSV mâu thuẫn
    assert conflicts_p.exists()
    rows = list(csv.DictReader(conflicts_p.open(encoding="utf-8-sig")))
    conf_m = next((r for r in rows if r["code"] == "CONFLICT1"), None)
    assert conf_m is not None
    assert conf_m["faculty_master"] == "Khoa Tài chính - Ngân hàng"
    assert conf_m["faculty_outline"] == "Khoa Luật"


def test_bbb1068_overwrites_wrong_faculty(db, sample_master_file, tmp_path):
    """Test 7: Master_data ghi đè khoa sai có sẵn (ca BBB1068 'Kỹ năng lãnh đạo')."""
    # BBB1068 trước đó bị gán nhầm sang Khoa Kinh tế
    db.add(Module(
        code="BBB1068",
        name="Kỹ năng lãnh đạo",
        faculty="Khoa Kinh tế",
        department="Bộ môn Kinh tế học",
        faculty_source="prefix",
    ))
    db.commit()

    import_master_data(
        db,
        file_path=sample_master_file,
        dry_run=False,
        conflicts_out=tmp_path / "conflicts.csv",
    )

    m = db.get(Module, "BBB1068")
    assert m.faculty == "Khoa Quản trị kinh doanh"
    assert m.faculty_source == "master_data"


def test_na_or_empty_preserves_existing_db_faculty(db, sample_master_file, tmp_path):
    """Test 8: Master_data là #N/A hoặc trống thì GIỮ NGUYÊN giá trị hiện tại trong DB."""
    # OLD0001 đã có khoa là 'Khoa Luật' trong DB
    db.add(Module(
        code="OLD0001",
        name="Môn Giữ Nguyên",
        faculty="Khoa Luật",
        department="Bộ môn Luật Kinh doanh",
    ))
    db.commit()

    import_master_data(
        db,
        file_path=sample_master_file,
        dry_run=False,
        conflicts_out=tmp_path / "conflicts.csv",
    )

    m = db.get(Module, "OLD0001")
    # Giá trị DB cũ phải được giữ nguyên, không bị xóa thành None
    assert m.faculty == "Khoa Luật"
    assert m.department == "Bộ môn Luật Kinh doanh"


@pytest.mark.parametrize(
    "dept_cell, faculty_cell, imported_dept, imported_faculty",
    [
        ("Bộ môn Marketing", "#N/A", "Bộ môn Marketing", None),
        (None, "Tài chính - Ngân hàng", None, "Khoa Tài chính - Ngân hàng"),
        ("#N/A", None, None, None),
        ("Bộ môn Chưa Rõ", "Chưa rõ khoa", None, None),
    ],
)
def test_import_applies_only_present_affiliation_fields(
    db, tmp_path, dept_cell, faculty_cell, imported_dept, imported_faculty
):
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.title = "Data_Course"
    sheet.append(["Mã Môn", "Tên Môn", "Tên Tiếng Anh", "Mã Khoa / BM", "Tên Khoa / BM", "GV phụ trách", "Khoa"])
    for code in ("MISSING1", "MISSING2", "MISSING3"):
        sheet.append([code, "Môn mẫu", None, None, dept_cell, None, faculty_cell])
    workbook_path = tmp_path / "master.xlsx"
    workbook.save(workbook_path)
    workbook.close()

    db.add_all([
        Module(code="MISSING1", name="Môn mẫu", faculty="Khoa Luật", department="Bộ môn Luật Kinh doanh"),
        Module(code="MISSING2", name="Môn mẫu"),
    ])
    db.commit()

    import_master_data(db, file_path=workbook_path, conflicts_out=tmp_path / "conflicts.csv")

    populated = db.get(Module, "MISSING1")
    assert populated.faculty == (imported_faculty or "Khoa Luật")
    assert populated.department == (imported_dept or "Bộ môn Luật Kinh doanh")
    for code in ("MISSING2", "MISSING3"):
        module = db.get(Module, code)
        assert module.faculty == imported_faculty
        assert module.department == imported_dept


def test_idempotent_import_and_coverage_report(db, sample_master_file, tmp_path):
    """Test 9: Nạp idempotent (chạy 2 lần kết quả giống nhau), thống kê độ phủ chính xác."""
    res1 = import_master_data(
        db,
        file_path=sample_master_file,
        dry_run=False,
        conflicts_out=tmp_path / "conflicts.csv",
    )
    assert res1["status"] == "ok"
    assert res1["created_modules"] > 0
    total1 = res1["total_modules"]

    # Chạy lại lần 2
    res2 = import_master_data(
        db,
        file_path=sample_master_file,
        dry_run=False,
        conflicts_out=tmp_path / "conflicts.csv",
    )
    assert res2["created_modules"] == 0  # Không tạo trùng môn
    assert res2["total_modules"] == total1


def test_dry_run_leaves_db_unchanged(db, sample_master_file, tmp_path):
    """Test 10: --dry-run không sửa DB, xuất file master_import_preview.csv."""
    preview_file = tmp_path / "preview.csv"
    res = import_master_data(
        db,
        file_path=sample_master_file,
        dry_run=True,
        preview_out=preview_file,
        conflicts_out=tmp_path / "conflicts.csv",
    )

    assert res["dry_run"] is True
    assert res["applied_changes"] == 0
    assert preview_file.exists()

    # DB không có môn nào được tạo thật
    m = db.get(Module, "NEW9999")
    assert m is None


def test_api_module_detail_and_facets(db, client, sample_master_file, tmp_path):
    """Test 11: API GET /api/modules/{code} trả assessment, textbooks, head_lecturer;
    GET /api/modules/facets trả final_assessment.
    """
    import_master_data(
        db,
        file_path=sample_master_file,
        dry_run=False,
        conflicts_out=tmp_path / "conflicts.csv",
    )

    # 1. Kiểm tra chi tiết môn BBB1068
    resp = client.get("/api/modules/BBB1068")
    assert resp.status_code == 200
    data = resp.json()
    assert data["code"] == "BBB1068"
    assert data["faculty"] == "Khoa Quản trị kinh doanh"
    assert data["head_lecturer"] == "TS. Nguyễn Văn A"
    assert data["final_assessment"] == "Thi viết"
    assert data["outline_url"] == "https://drive.google.com/file/d/test_bbb1068"

    # Kiểm tra object assessment
    ass = data["assessment"]
    assert ass is not None
    assert ass["process_ratio"] == 0.2
    assert ass["process_form"] == "Điểm danh + phát biểu"
    assert ass["midterm_ratio"] == 0.3
    assert ass["midterm_form"] == "Kiểm tra trắc nghiệm"
    assert ass["final_ratio"] == 0.5
    assert ass["final_form"] == "Tự luận"
    assert ass["exam_type"] == "Thi giấy"
    assert ass["exam_duration"] == "60'"

    # Kiểm tra object textbooks
    tbs = data["textbooks"]
    assert len(tbs) == 1
    assert tbs[0]["name"] == "Giáo trình Kỹ năng lãnh đạo"
    assert tbs[0]["document_code"] == "TL_BBB1068"

    # 2. Kiểm tra facets có nhóm final_assessment
    resp_f = client.get("/api/modules/facets")
    assert resp_f.status_code == 200
    facets = resp_f.json()
    fa_counts = facets["final_assessment"]
    assert len(fa_counts) > 0
    kinds = [item["value"] for item in fa_counts]
    assert "Thi viết" in kinds or "Thi trắc nghiệm" in kinds or "Đồ án" in kinds
