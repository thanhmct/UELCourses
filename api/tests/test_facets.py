"""Tests for Brief W18: Faceted search logic with program context.

1. API facets receives full context: program_id/program_ids, q, and active filters.
2. Disjunctive faceting (multi-select): counts for facet group A ignore filter A.
3. Total matches filtered count.
4. Program context limits all facet counts to modules in that program.
5. Canonical faculty normalization & grouping.
6. Zero-count items are excluded.
"""

from app.models import ClassSection, Module, Program, ProgramModule


def test_module_search_and_facets_match_english_names_on_existing_rows(client, db):
    db.add(Module(
        code="BMA2045", name="Nhập môn Phân tích dữ liệu", name_en="Introduction to Data Analytics",
        search_text="bma2045 nhap mon phan tich du lieu", credits=2,
    ))
    db.commit()
    for query in ("DATA Analytics", "BMA2045 data", "phan tich", "PHÂN TÍCH"):
        modules = client.get("/api/modules", params={"q": query}).json()
        assert [m["code"] for m in modules["items"]] == ["BMA2045"]
        assert client.get("/api/module-facets", params={"q": query}).json()["total"] == 1


def test_facets_global_and_program_context(client, db):
    # Setup test modules
    db.add_all([
        Module(code="MOD101", name="Nhập môn tài chính", credits=3, faculty="Khoa Tài chính - Ngân hàng", language_track="vi", type="Bắt buộc", search_text="nhap mon tai chinh"),
        Module(code="MOD102", name="Kinh tế vi mô", credits=3, faculty="Kinh tế", language_track="vi", type="Bắt buộc", search_text="kinh te vi mo"),
        Module(code="MOD103", name="Financial Modeling (E)", credits=4, faculty="Khoa Tài chính - Ngân hàng", language_track="en", is_english=True, type="Tự chọn", search_text="financial modeling e"),
        Module(code="MOD104", name="Luật kinh doanh", credits=2, faculty="Luật", language_track="vi", type="Bắt buộc", search_text="luat kinh doanh"),
    ])
    # Program PROG_FIN contains only MOD101 and MOD103
    db.add(Program(id="PROG_FIN", name="Công nghệ tài chính", cohort="K24"))
    db.flush()
    db.add_all([
        ProgramModule(program_id="PROG_FIN", module_code="MOD101", required=True),
        ProgramModule(program_id="PROG_FIN", module_code="MOD103", required=False),
    ])
    db.commit()

    # 1. Global facets (no program filter)
    res_global = client.get("/api/module-facets")
    assert res_global.status_code == 200
    data_global = res_global.json()
    assert data_global["total"] == 4
    # All 4 modules have credits (2, 3, 4)
    credits_map = {item["value"]: item["count"] for item in data_global["credits"]}
    assert credits_map["2"] == 1
    assert credits_map["3"] == 2
    assert credits_map["4"] == 1

    # 2. Program facets (program_id="PROG_FIN", only 2 modules)
    res_prog = client.get("/api/module-facets?program_id=PROG_FIN")
    assert res_prog.status_code == 200
    data_prog = res_prog.json()
    assert data_prog["total"] == 2
    prog_credits = {item["value"]: item["count"] for item in data_prog["credits"]}
    assert "2" not in prog_credits  # 0 count is excluded
    assert prog_credits["3"] == 1
    assert prog_credits["4"] == 1
    # Faculty in program: only Khoa Tài chính - Ngân hàng
    prog_facs = {item["value"]: item["count"] for item in data_prog["faculty"]}
    assert "Khoa Tài chính - Ngân hàng" in prog_facs
    assert prog_facs["Khoa Tài chính - Ngân hàng"] == 2
    assert "Khoa Kinh tế" not in prog_facs
    assert "Khoa Luật" not in prog_facs


def test_disjunctive_faceting_group_a_ignores_filter_a(client, db):
    db.add_all([
        Module(code="ACC1", name="Kế toán tài chính 1", credits=3, faculty="Khoa Kế toán - Kiểm toán", language_track="vi", search_text="ke toan tai chinh 1"),
        Module(code="ACC2", name="Kế toán tài chính 2", credits=4, faculty="Khoa Kế toán - Kiểm toán", language_track="vi", search_text="ke toan tai chinh 2"),
        Module(code="ACC3", name="Kế toán quốc tế (E)", credits=4, faculty="Khoa Kế toán - Kiểm toán", language_track="en", is_english=True, search_text="ke toan quoc te e"),
    ])
    db.commit()

    # When user filters by credits_in=3:
    # - total should be 1 (only ACC1)
    # - credits facet should STILL show both 3 TC (1) and 4 TC (2) because credits filter is ignored for credits facet
    # - language facet should ONLY count modules with credits=3 (1 vi, 0 en)
    res = client.get("/api/module-facets?credits_in=3")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1

    # Credits facet ignores credits filter:
    cred_map = {item["value"]: item["count"] for item in data["credits"]}
    assert cred_map["3"] == 1
    assert cred_map["4"] == 2  # ACC2 and ACC3 are visible as other options!

    # Language facet DOES apply credits filter:
    lang_map = {item["value"]: item["count"] for item in data["language"]}
    assert lang_map.get("vi") == 1
    assert "en" not in lang_map  # ACC3 has credits=4, so it is filtered out of language facet


def test_faculty_canonicalization_and_grouping(client, db):
    # Two modules with different raw aliases of Faculty of Business Administration
    db.add_all([
        Module(code="MGT1", name="Quản trị học", credits=3, faculty="Quản trị kinh doanh", search_text="quan tri hoc"),
        Module(code="MGT2", name="Quản trị học nâng cao", credits=3, faculty="Khoa Quản trị kinh doanh", search_text="quan tri hoc nang cao"),
        Module(code="LAW1", name="Pháp luật đại cương", credits=2, faculty="Luật", search_text="phap luat dai cuong"),
    ])
    db.commit()

    res = client.get("/api/module-facets")
    assert res.status_code == 200
    data = res.json()
    fac_map = {item["value"]: item["count"] for item in data["faculty"]}

    # Raw aliases 'Quản trị kinh doanh' and 'Khoa Quản trị kinh doanh' are merged into canonical 'Khoa Quản trị kinh doanh'
    assert "Khoa Quản trị kinh doanh" in fac_map
    assert fac_map["Khoa Quản trị kinh doanh"] == 2
    assert "Quản trị kinh doanh" not in fac_map

    # 'Luật' is canonicalized to 'Khoa Luật'
    assert "Khoa Luật" in fac_map
    assert fac_map["Khoa Luật"] == 1
    assert "Luật" not in fac_map


def test_faculty_facets_includes_qa_and_academic_affairs(client, db):
    """Brief W29: 'Phòng Bảo đảm chất lượng' và 'Phòng Đào tạo' được chuẩn hóa vào danh sách khoa chuẩn
    và xuất hiện trong kết quả module-facets."""
    db.add_all([
        Module(code="QA1", name="Tiếng Anh 1", credits=3, faculty="Phòng Bảo đảm chất lượng", search_text="tieng anh 1"),
        Module(code="QA2", name="Tiếng Anh 2", credits=3, faculty="Bảo đảm chất lượng", search_text="tieng anh 2"),
        Module(code="AA1", name="Kỹ năng mềm", credits=2, faculty="Phòng Đào tạo", search_text="ky nang mem"),
    ])
    db.commit()

    res = client.get("/api/module-facets")
    assert res.status_code == 200
    data = res.json()
    fac_map = {item["value"]: item["count"] for item in data["faculty"]}

    # Cả QA1 và QA2 (alias 'Bảo đảm chất lượng') gộp vào 'Phòng Bảo đảm chất lượng'
    assert "Phòng Bảo đảm chất lượng" in fac_map
    assert fac_map["Phòng Bảo đảm chất lượng"] == 2
    assert "Bảo đảm chất lượng" not in fac_map

    # 'Phòng Đào tạo' có trong danh sách khoa chuẩn
    assert "Phòng Đào tạo" in fac_map
    assert fac_map["Phòng Đào tạo"] == 1

