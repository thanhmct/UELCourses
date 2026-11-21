"""Tests for multi-select facet filters on /api/modules (credits_in, type_in, faculty_in)."""

from app.models import Module


def test_credits_multi_and_legacy_filter(client, db):
    m1 = Module(code="CR01", name="Môn 2 tín chỉ", credits=2, type="Lý thuyết", search_text="cr01 mon 2 tin chi")
    m2 = Module(code="CR02", name="Môn 3 tín chỉ", credits=3, type="Lý thuyết", search_text="cr02 mon 3 tin chi")
    m3 = Module(code="CR03", name="Môn 4 tín chỉ", credits=4, type="Thực hành", search_text="cr03 mon 4 tin chi")
    db.add_all([m1, m2, m3])
    db.commit()

    # Comma-separated credits_in
    res = client.get("/api/modules?credits_in=2,3")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 2
    codes = {m["code"] for m in data["items"]}
    assert codes == {"CR01", "CR02"}

    # Single credits (backward-compatibility)
    res = client.get("/api/modules?credits=4")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["items"][0]["code"] == "CR03"

    # Validation: > 60 credits or non-numeric must return 422
    assert client.get("/api/modules?credits_in=75").status_code == 422
    assert client.get("/api/modules?credits_in=invalid").status_code == 422


def test_type_multi_and_legacy_filter(client, db):
    m1 = Module(code="TY01", name="Môn LT", credits=3, type="Lý thuyết", search_text="ty01")
    m2 = Module(code="TY02", name="Môn TH", credits=3, type="Thực hành", search_text="ty02")
    m3 = Module(code="TY03", name="Môn ĐA", credits=3, type="Đồ án", search_text="ty03")
    db.add_all([m1, m2, m3])
    db.commit()

    # Comma-separated type_in
    res = client.get("/api/modules?type_in=Lý thuyết,Thực hành")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 2
    codes = {m["code"] for m in data["items"]}
    assert codes == {"TY01", "TY02"}

    # Single type legacy filter
    res = client.get("/api/modules?type=Đồ án")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["items"][0]["code"] == "TY03"

    # Accented uppercase regression covering single and multiple filters
    res_single_upper = client.get("/api/modules?type=ĐỒ ÁN")
    assert res_single_upper.status_code == 200
    data_single = res_single_upper.json()
    assert data_single["total"] == 1
    assert data_single["items"][0]["code"] == "TY03"

    res_multi_upper = client.get("/api/modules?type_in=LÝ THUYẾT,ĐỒ ÁN")
    assert res_multi_upper.status_code == 200
    data_multi = res_multi_upper.json()
    assert data_multi["total"] == 2
    assert {m["code"] for m in data_multi["items"]} == {"TY01", "TY03"}


def test_faculty_in_matching_and_no_duplicates(client, db):
    m1 = Module(code="LAW01", name="Luật Dân sự", credits=3, faculty="Khoa Luật", department="Bộ môn Luật Dân sự", search_text="law01")
    m2 = Module(code="ECO01", name="Kinh tế vi mô", credits=3, faculty="Khoa Kinh tế", department="Bộ môn Kinh tế học", search_text="eco01")
    # m3 has faculty == department (overlap)
    m3 = Module(code="ECO02", name="Kinh tế vĩ mô", credits=3, faculty="Khoa Kinh tế", department="Khoa Kinh tế", search_text="eco02")
    m4 = Module(code="IT01", name="Nhập môn CNTT", credits=3, faculty="Khoa CNTT", department="Bộ môn HTTT", search_text="it01")
    db.add_all([m1, m2, m3, m4])
    db.commit()

    # Repeated ?faculty_in=Khoa Luật&faculty_in=Khoa Kinh tế
    res = client.get("/api/modules?faculty_in=Khoa+Luật&faculty_in=Khoa+Kinh+tế")
    assert res.status_code == 200
    data = res.json()
    # M3 matches both faculty and department, but must NOT duplicate the record or total count!
    assert data["total"] == 3
    codes = [m["code"] for m in data["items"]]
    assert len(codes) == 3
    assert set(codes) == {"LAW01", "ECO01", "ECO02"}

    # Matches department
    res = client.get("/api/modules?faculty_in=Bộ môn Luật Dân sự")
    assert res.status_code == 200
    assert res.json()["total"] == 1
    assert res.json()["items"][0]["code"] == "LAW01"

    # Single legacy faculty filter
    res = client.get("/api/modules?faculty=Khoa+Luật")
    assert res.status_code == 200
    assert res.json()["total"] == 1
    assert res.json()["items"][0]["code"] == "LAW01"

    # Accented uppercase regression covering single and multiple faculty filters
    res_fac_upper = client.get("/api/modules?faculty=KHOA LUẬT")
    assert res_fac_upper.status_code == 200
    assert res_fac_upper.json()["total"] == 1
    assert res_fac_upper.json()["items"][0]["code"] == "LAW01"

    res_fac_multi_upper = client.get("/api/modules?faculty_in=KHOA LUẬT&faculty_in=KHOA KINH TẾ")
    assert res_fac_multi_upper.status_code == 200
    assert res_fac_multi_upper.json()["total"] == 3
    assert set(m["code"] for m in res_fac_multi_upper.json()["items"]) == {"LAW01", "ECO01", "ECO02"}


def test_combined_facets_and_pagination(client, db):
    m1 = Module(code="COMB01", name="Môn 1", credits=2, type="Lý thuyết", faculty="Khoa Luật", search_text="comb01")
    m2 = Module(code="COMB02", name="Môn 2", credits=3, type="Thực hành", faculty="Khoa Luật", search_text="comb02")
    m3 = Module(code="COMB03", name="Môn 3", credits=2, type="Lý thuyết", faculty="Khoa Kinh tế", search_text="comb03")
    m4 = Module(code="COMB04", name="Môn 4", credits=2, type="Lý thuyết", faculty="Khoa Luật", search_text="comb04")
    db.add_all([m1, m2, m3, m4])
    db.commit()

    # OR within each facet, AND between facets:
    # credits in (2, 3) AND type in (Lý thuyết) AND faculty in (Khoa Luật)
    # m1: credits=2, type=Lý thuyết, faculty=Khoa Luật -> MATCH
    # m2: type=Thực hành -> NO MATCH
    # m3: faculty=Khoa Kinh tế -> NO MATCH
    # m4: credits=2, type=Lý thuyết, faculty=Khoa Luật -> MATCH
    res = client.get("/api/modules?credits_in=2,3&type_in=Lý thuyết&faculty_in=Khoa+Luật")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 2
    codes = {m["code"] for m in data["items"]}
    assert codes == {"COMB01", "COMB04"}

    # Pagination on server before slice
    res_page1 = client.get("/api/modules?credits_in=2,3&type_in=Lý thuyết&faculty_in=Khoa+Luật&page=1&size=1")
    assert res_page1.status_code == 200
    d1 = res_page1.json()
    assert d1["total"] == 2
    assert len(d1["items"]) == 1
    assert d1["items"][0]["code"] == "COMB01"

    res_page2 = client.get("/api/modules?credits_in=2,3&type_in=Lý thuyết&faculty_in=Khoa+Luật&page=2&size=1")
    assert res_page2.status_code == 200
    d2 = res_page2.json()
    assert d2["total"] == 2
    assert len(d2["items"]) == 1
    assert d2["items"][0]["code"] == "COMB04"


def test_accented_case_insensitive_regression(client, db):
    """Regression test ensuring accented uppercase and lowercase match correctly across SQLite and Postgres."""
    m1 = Module(code="ACC01", name="Môn Đồ Án", credits=3, type="Đồ án", faculty="Khoa Luật", department="Bộ môn Luật Dân sự", search_text="acc01")
    m2 = Module(code="ACC02", name="Môn Thực Hành", credits=2, type="Thực hành", faculty="Khoa Kinh tế", department="Khoa Kinh tế", search_text="acc02")
    db.add_all([m1, m2])
    db.commit()

    # Single filter with accented uppercase
    res = client.get("/api/modules?type=ĐỒ ÁN")
    assert res.status_code == 200
    assert res.json()["total"] == 1
    assert res.json()["items"][0]["code"] == "ACC01"

    # Multiple filter with accented uppercase
    res = client.get("/api/modules?type_in=ĐỒ ÁN,THỰC HÀNH")
    assert res.status_code == 200
    assert res.json()["total"] == 2
    assert {m["code"] for m in res.json()["items"]} == {"ACC01", "ACC02"}

    # Single faculty filter with accented uppercase
    res = client.get("/api/modules?faculty=KHOA LUẬT")
    assert res.status_code == 200
    assert res.json()["total"] == 1
    assert res.json()["items"][0]["code"] == "ACC01"

    # Multiple faculty filter with accented uppercase
    res = client.get("/api/modules?faculty_in=KHOA LUẬT&faculty_in=KHOA KINH TẾ")
    assert res.status_code == 200
    assert res.json()["total"] == 2
    assert {m["code"] for m in res.json()["items"]} == {"ACC01", "ACC02"}
