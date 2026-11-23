"""Tests for Brief B3:
1. Faculty/department EN -> VI mapping and faculty_en in ModuleSummary/ModuleDetail.
2. English outline syllabus_en descriptions into modules.description_en.
3. ModuleDetail required_in_programs, is_required_any, and optional ?program_id query parameter.
4. Program elective-groups endpoint GET /api/programs/{id}/elective-groups.
"""

from app.models import Module, OutlineCourse, OutlineDocument, OutlineModuleLink, Program, ProgramModule
from app.services.descriptions import fill_descriptions
from app.services.faculty_names import department_vi, faculty_en, faculty_vi, fill_faculties


def test_faculty_and_department_name_mappings():
    # EN -> VI
    assert faculty_vi("FACULTY OF FINANCE AND BANKING") == "Khoa Tài chính - Ngân hàng"
    assert faculty_vi("Faculty of Finance and Banking") == "Khoa Tài chính - Ngân hàng"
    assert faculty_vi("Faculty of Economics") == "Khoa Kinh tế"
    assert faculty_vi("Faculty of Law") == "Khoa Luật"
    assert faculty_vi("School of Law") == "Khoa Luật"
    assert department_vi("DEPARTMENT OF FINANCE") == "Bộ môn Tài chính"
    assert department_vi("Department of Marketing") == "Bộ môn Marketing"

    # VI -> EN
    assert faculty_en("Khoa Tài chính - Ngân hàng") == "Faculty of Finance and Banking"
    assert faculty_en("Khoa Kinh tế") == "Faculty of Economics"
    assert faculty_en("Khoa Luật") == "Faculty of Law"
    assert faculty_en("Faculty of Economics") == "Faculty of Economics"
    assert faculty_en(None) is None


def test_fill_faculties_from_outline_only_no_counterpart(db):
    # Case 1: Outline có faculty/department tiếng Anh -> ánh xạ sang tiếng Việt chuẩn
    db.add(Module(code="EFF4017", name="Khai thác dữ liệu trong tài chính (Data mining) (E)", faculty="Chưa rõ khoa"))
    db.add(OutlineDocument(id=101, sha256="1" * 64, file_name="101.pdf", rel_path="x/101.pdf", size_bytes=1))
    db.flush()
    db.add(
        OutlineCourse(
            document_id=101,
            doc_type="syllabus_en",
            faculty="FACULTY OF FINANCE AND BANKING",
            department="DEPARTMENT OF FINANCE",
            description="Course on financial data mining.",
            parse_status="ok",
        )
    )
    db.add(OutlineModuleLink(document_id=101, module_code="EFF4017", source="catalog"))

    # Case 2: Môn KHÔNG có đề cương của mình lẫn bản tương ứng và không có tiền tố -> giữ nguyên giá trị cũ (không gán "Phòng Đào tạo")
    db.add(Module(code="BZZ1001", name="Kinh tế vi mô", faculty="Khoa Kinh tế", department="Bộ môn Kinh tế học", counterpart_code="EZZ1001"))
    db.add(Module(code="EZZ1001", name="Microeconomics (E)", faculty=None, department=None, counterpart_code="BZZ1001"))
    db.commit()

    fill_faculties(db)

    eff = db.get(Module, "EFF4017")
    assert eff.faculty == "Khoa Tài chính - Ngân hàng"
    assert eff.department == "Bộ môn Tài chính"

    bzz = db.get(Module, "BZZ1001")
    assert bzz.faculty == "Khoa Kinh tế"
    assert bzz.department == "Bộ môn Kinh tế học"

    ezz = db.get(Module, "EZZ1001")
    assert ezz.faculty is None
    assert ezz.department is None


def test_module_detail_faculty_en_and_required_in_programs(client, db):
    db.add_all([
        Module(
            code="MKT3001",
            name="Marketing căn bản",
            credits=3,
            faculty="Khoa Quản trị kinh doanh",
            department="Bộ môn Marketing",
            search_text="mkt3001 marketing can ban",
        ),
        Program(id="K23406", name="Hệ thống thông tin quản lý K23"),
        Program(id="K24410", name="Marketing K24"),
    ])
    db.flush()

    # MKT3001 là bắt buộc trong K24410, nhưng là tự chọn trong K23406
    db.add(ProgramModule(program_id="K24410", module_code="MKT3001", required=True))
    db.add(ProgramModule(program_id="K23406", module_code="MKT3001", required=False))
    db.commit()

    # GET /api/modules/{code} không có program_id
    r = client.get("/api/modules/MKT3001")
    assert r.status_code == 200
    data = r.json()
    assert data["faculty"] == "Khoa Quản trị kinh doanh"
    assert data["faculty_en"] == "Faculty of Business Administration"
    assert data["is_required_any"] is True
    assert data["required"] is None
    pids = {p["program_id"]: p["required"] for p in data["required_in_programs"]}
    assert pids["K24410"] is True
    assert pids["K23406"] is False

    # GET /api/modules/{code}?program_id=K24410 -> required = True
    r_req = client.get("/api/modules/MKT3001", params={"program_id": "K24410"})
    assert r_req.status_code == 200
    assert r_req.json()["required"] is True

    # GET /api/modules/{code}?program_id=K23406 -> required = False
    r_elec = client.get("/api/modules/MKT3001", params={"program_id": "K23406"})
    assert r_elec.status_code == 200
    assert r_elec.json()["required"] is False

    # GET /api/modules/{code}?program_id=UNKNOWN -> required = None
    r_unk = client.get("/api/modules/MKT3001", params={"program_id": "UNKNOWN"})
    assert r_unk.status_code == 200
    assert r_unk.json()["required"] is None


def test_elective_groups_endpoint(client, db):
    db.add_all([
        Program(id="K24404", name="Tài chính K24", cohort="K24"),
        Module(code="FIN1", name="Tài chính doanh nghiệp nâng cao", credits=3, search_text="fin1"),
        Module(code="FIN2", name="Định giá tài sản", credits=3, search_text="fin2"),
        Module(code="FIN3", name="Thị trường tài chính", credits=3, search_text="fin3"),
        Module(code="REQ1", name="Kinh tế vi mô", credits=3, search_text="req1"),
    ])
    db.flush()

    # Môn bắt buộc
    db.add(ProgramModule(program_id="K24404", module_code="REQ1", block="Khối bắt buộc", required=True))

    # Môn tự chọn có quy định số tín chỉ trong tên block hoặc note
    db.add(ProgramModule(
        program_id="K24404",
        module_code="FIN1",
        block="Tự chọn chuyên ngành (6 TC)",
        required=False,
        note="Chọn 6 tín chỉ trong nhóm",
    ))
    db.add(ProgramModule(
        program_id="K24404",
        module_code="FIN2",
        block="Tự chọn chuyên ngành (6 TC)",
        required=False,
    ))
    db.add(ProgramModule(
        program_id="K24404",
        module_code="FIN3",
        block="Tự chọn chuyên ngành (6 TC)",
        required=False,
    ))

    # Chương trình không có dữ liệu số tín chỉ tự chọn
    db.add(Program(id="K24999", name="Chương trình thiếu dữ liệu tự chọn", cohort="K24"))
    db.flush()
    db.add(ProgramModule(program_id="K24999", module_code="FIN1", block="Tự chọn tự do", required=False, note="Môn tự chọn"))
    db.commit()

    # Test chương trình K24404 có nhóm tự chọn
    r = client.get("/api/programs/K24404/elective-groups")
    assert r.status_code == 200
    groups = r.json()
    assert len(groups) == 1
    g = groups[0]
    assert g["block"] == "Tự chọn chuyên ngành (6 TC)"
    assert g["required_credits"] == 6.0
    assert g["available_credits"] == 9.0  # FIN1 (3) + FIN2 (3) + FIN3 (3)
    codes = [m["code"] for m in g["modules"]]
    assert set(codes) == {"FIN1", "FIN2", "FIN3"}
    assert "REQ1" not in codes

    # Test chương trình không có quy định số tín chỉ tự chọn trong DB -> trả mảng rỗng [] (không bịa số)
    r_empty = client.get("/api/programs/K24999/elective-groups")
    assert r_empty.status_code == 200
    assert r_empty.json() == []

    # Test 404 cho chương trình không tồn tại
    r_404 = client.get("/api/programs/NONEXIST/elective-groups")
    assert r_404.status_code == 404
