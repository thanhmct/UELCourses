"""Unit tests for valid program groups validation and blocking fictitious English tracks (Brief W30)."""

from app.models import ClassSection, Module, Program, ProgramCatalogEntry, ProgramModule
from app.services.program_tracks import clear_valid_groups_cache


def test_valid_groups_endpoint_and_en_track_blocking(client, db):
    clear_valid_groups_cache()

    # 1. Setup modules
    m1 = Module(code="BFF2044", name="Nguyên lý thị trường tài chính", credits=3, counterpart_code="EFF2044", language_track="vi")
    m1_e = Module(code="EFF2044", name="Principles of Financial Market", credits=3, counterpart_code="BFF2044", language_track="en")
    m2 = Module(code="FIN3001", name="Công nghệ tài chính căn bản", credits=3, language_track="vi")
    db.add_all([m1, m1_e, m2])
    db.flush()

    # 2. Setup programs: K24404 (Tài chính - Ngân hàng) and K24414 (Công nghệ tài chính)
    p_404 = Program(id="K24404", name="Tài chính - Ngân hàng Khóa 24", cohort="K24", faculty="Khoa Tài chính - Ngân hàng")
    p_414 = Program(id="K24414", name="Công nghệ tài chính Khóa 24", cohort="K24", faculty="Khoa Tài chính - Ngân hàng")
    db.add_all([p_404, p_414])
    db.flush()

    db.add(ProgramModule(program_id="K24404", module_code="BFF2044", block="Cơ sở ngành", required=True))
    db.add(ProgramModule(program_id="K24414", module_code="FIN3001", block="Cơ sở ngành", required=True))

    # 3. Setup ClassSections:
    # 404 has K24404A/B/E (real groups with E)
    # 414 has K24414 and K24414H (standard and coop, NO E)
    cs_404 = ClassSection(class_code="241BFF204401", module_code="BFF2044", student_groups=["K24404A/B/E"])
    cs_414_std = ClassSection(class_code="241FIN300101", module_code="FIN3001", student_groups=["K24414"])
    cs_414_coop = ClassSection(class_code="241FIN300102", module_code="FIN3001", student_groups=["K24414H"])
    db.add_all([cs_404, cs_414_std, cs_414_coop])

    # 4. Setup ProgramCatalogEntry for 2025:
    # 404 has both vi and en
    # 414 has only vi
    entry_404_en = ProgramCatalogEntry(
        id="cat_404_en",
        program_label="Tài chính - Ngân hàng",
        language_track="en",
        source_file="f1.xlsx",
        source_sheet="Sheet1",
        source_row=1,
    )
    entry_414_vi = ProgramCatalogEntry(
        id="cat_414_vi",
        program_label="Công nghệ tài chính",
        language_track="vi",
        source_file="f2.xlsx",
        source_sheet="Sheet1",
        source_row=1,
    )
    db.add_all([entry_404_en, entry_414_vi])
    db.commit()

    # --- Test 1: GET /api/programs/valid-groups ---
    res = client.get("/api/programs/valid-groups")
    assert res.status_code == 200
    groups = res.json()
    group_codes = {g["code"] for g in groups}

    # K24404E must be present
    assert "K24404E" in group_codes
    assert "K24404A" in group_codes
    assert "K24404B" in group_codes

    # K24414 and K24414H must be present
    assert "K24414" in group_codes
    assert "K24414H" in group_codes

    # K24414E must NOT be present
    assert "K24414E" not in group_codes

    # Check structure of K24404E
    item_404e = next(g for g in groups if g["code"] == "K24404E")
    assert item_404e["cohort"] == "K24"
    assert item_404e["major"] == "404"
    assert item_404e["suffix"] == "E"
    assert item_404e["kind"] == "english"
    assert item_404e["program_id"] == "K24404"
    assert item_404e["source"] == "class_sections"

    # Check structure of K24414H (Coop)
    item_414h = next(g for g in groups if g["code"] == "K24414H")
    assert item_414h["cohort"] == "K24"
    assert item_414h["major"] == "414"
    assert item_414h["suffix"] == "H"
    assert item_414h["kind"] == "coop"
    assert item_414h["source"] == "class_sections"

    # Catalog derived K25404E must be present from entry_404_en
    assert "K25404E" in group_codes
    item_25_404e = next(g for g in groups if g["code"] == "K25404E")
    assert item_25_404e["source"] == "catalog"

    # Catalog must NOT generate K25414E because 414 only has vi
    assert "K25414E" not in group_codes

    # --- Test 2: GET /api/programs/K24414?track=en must return 404 ---
    res_414_track_en = client.get("/api/programs/K24414?track=en")
    assert res_414_track_en.status_code == 404
    assert "Chương trình này không có hệ tiếng Anh" in res_414_track_en.json()["detail"]

    # Suffix E for K24414 also returns 404
    res_414_suffix_e = client.get("/api/programs/K24414E")
    assert res_414_suffix_e.status_code == 404
    assert "Chương trình này không có hệ tiếng Anh" in res_414_suffix_e.json()["detail"]

    # --- Test 3: Standard K24414 must succeed with 200 ---
    res_414_std = client.get("/api/programs/K24414")
    assert res_414_std.status_code == 200
    assert res_414_std.json()["program"]["program_id"] == "K24414"

    # --- Test 4: Real English track K24404E must succeed with 200 ---
    res_404_track_en = client.get("/api/programs/K24404?track=en")
    assert res_404_track_en.status_code == 200
    assert res_404_track_en.json()["program"]["program_id"] == "K24404E"

    res_404_suffix_e = client.get("/api/programs/K24404E")
    assert res_404_suffix_e.status_code == 200
    assert res_404_suffix_e.json()["program"]["program_id"] == "K24404E"
