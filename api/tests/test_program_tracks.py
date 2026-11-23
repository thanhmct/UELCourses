"""Tests for program tracks resolution, contextual views (English track 'E' vs standard),
and multi-program filtering."""

from app.models import ClassSection, Module, ModuleRelation, Program, ProgramModule
from app.services.program_tracks import clear_valid_groups_cache, parse_track_identifier


def test_parse_track_identifier():
    assert parse_track_identifier("K26409E") == ("K26409", "E", True)
    assert parse_track_identifier("K26409E1") == ("K26409", "E1", True)
    assert parse_track_identifier("K26409E2") == ("K26409", "E2", True)
    assert parse_track_identifier("K26409") == ("K26409", "", False)
    assert parse_track_identifier("K26409A") == ("K26409", "A", False)
    assert parse_track_identifier("K23406H") == ("K23406", "H", False)
    assert parse_track_identifier("K24416T") == ("K24416", "T", False)


def test_hidden_agu_module_is_kept_in_db_but_excluded_from_public_catalog(client, db):
    visible = Module(code="BCS1001", name="Tin học", credits=3, search_text="tin hoc")
    hidden = Module(code="COS101", name="Tin học đại cương (AGU)", credits=3, search_text="tin hoc agu")
    program = Program(id="K26401", name="Kinh tế", cohort="K26")
    db.add_all([visible, hidden, program])
    db.flush()
    db.add_all([
        ProgramModule(program_id=program.id, module_code=visible.code, required=True),
        ProgramModule(program_id=program.id, module_code=hidden.code, required=True),
        ModuleRelation(program_id=program.id, source=hidden.code, target=visible.code, type="prereq"),
    ])
    db.commit()
    assert db.get(Module, "COS101").is_hidden
    assert client.get("/api/modules?degree=all&q=agu").json()["total"] == 0
    assert client.get("/api/module-facets?q=agu").json()["total"] == 0
    assert client.get("/api/modules/COS101").status_code == 404
    assert client.get("/api/modules/COS101/tree").status_code == 404
    assert client.get("/api/modules/COS101/classes").status_code == 404
    detail = client.get("/api/programs/K26401").json()
    assert [module["code"] for block in detail["blocks"] for module in block["modules"]] == ["BCS1001"]
    graph = client.get("/api/programs/K26401/graph").json()
    assert [node["code"] for node in graph["nodes"]] == ["BCS1001"]


def test_program_track_resolution_and_mapping(client, db):
    # Setup synthetic modules
    m1 = Module(
        code="BIM5022",
        name="Phân tích và thiết kế HTTT",
        credits=3,
        counterpart_code="EIM5022",
        language_track="vi",
        search_text="bim5022 phan tich va thiet ke httt",
    )
    m1_e = Module(
        code="EIM5022",
        name="Systems Analysis and Design",
        name_en="Systems Analysis and Design",
        credits=3,
        counterpart_code="BIM5022",
        language_track="en",
        search_text="eim5022 systems analysis and design",
    )
    m2_no_cp = Module(
        code="TOA1001",
        name="Toán cao cấp",
        credits=3,
        counterpart_code=None,
        language_track="vi",
        search_text="toa1001 toan cao cap",
    )
    m3_already_e = Module(
        code="EAA2028",
        name="Principles of Accounting",
        credits=3,
        counterpart_code="BAA2028",
        language_track="en",
        search_text="eaa2028 principles of accounting",
    )
    db.add_all([m1, m1_e, m2_no_cp, m3_already_e])

    # Setup synthetic program K26409 (canonical base in DB)
    clear_valid_groups_cache()
    prog = Program(id="K26409", name="Kiểm toán Khóa 26", cohort="K26", faculty="Khoa Kế toán - Kiểm toán")
    cs = ClassSection(class_code="261BIM502201", module_code="BIM5022", student_groups=["K26409E"])
    db.add_all([prog, cs])
    db.flush()

    pm1 = ProgramModule(
        program_id="K26409",
        module_code="BIM5022",
        block="Cơ sở ngành",
        required=True,
        suggested_order=1,
        prereq_tree="TOA1001",
    )
    pm2 = ProgramModule(
        program_id="K26409",
        module_code="TOA1001",
        block="Đại cương",
        required=True,
        suggested_order=2,
    )
    pm3 = ProgramModule(
        program_id="K26409",
        module_code="EAA2028",
        block="Đại cương",
        required=True,
        suggested_order=3,
    )
    db.add_all([pm1, pm2, pm3])

    rel = ModuleRelation(
        source="TOA1001",
        target="BIM5022",
        type="prereq",
        program_id="K26409",
    )
    db.add(rel)
    db.commit()

    # 1. Canonical program GET /api/programs/K26409
    res_base = client.get("/api/programs/K26409")
    assert res_base.status_code == 200
    data_base = res_base.json()
    assert data_base["program"]["program_id"] == "K26409"
    assert data_base["program"]["name"] == "Kiểm toán Khóa 26"
    base_codes = [m["code"] for b in data_base["blocks"] for m in b["modules"]]
    assert "BIM5022" in base_codes
    assert "TOA1001" in base_codes
    assert "EAA2028" in base_codes

    # 2. English track via suffix E: GET /api/programs/K26409E
    res_en = client.get("/api/programs/K26409E")
    assert res_en.status_code == 200
    data_en = res_en.json()
    assert data_en["program"]["program_id"] == "K26409E"
    assert "Hệ tiếng Anh" in data_en["program"]["name"]
    en_mods = {m["code"]: m for b in data_en["blocks"] for m in b["modules"]}

    # BIM5022 must be mapped to EIM5022
    assert "EIM5022" in en_mods
    assert "BIM5022" not in en_mods
    assert en_mods["EIM5022"]["name"] == "Systems Analysis and Design"
    assert en_mods["EIM5022"]["prereq"] == "TOA1001"

    # TOA1001 has no E counterpart -> kept with honest missing counterpart notice
    assert "TOA1001" in en_mods
    assert "Chưa có mã học phần tương ứng" in (en_mods["TOA1001"]["note"] or "")

    # EAA2028 is already an E course -> preserved as EAA2028
    assert "EAA2028" in en_mods

    # 3. E1 and E2 resolve to the exact same English track
    res_e1 = client.get("/api/programs/K26409E1")
    assert res_e1.status_code == 200
    res_e2 = client.get("/api/programs/K26409E2")
    assert res_e2.status_code == 200
    e1_codes = [m["code"] for b in res_e1.json()["blocks"] for m in b["modules"]]
    e2_codes = [m["code"] for b in res_e2.json()["blocks"] for m in b["modules"]]
    assert e1_codes == e2_codes == ["EIM5022", "TOA1001", "EAA2028"]

    # 4. No DB mutation: canonical rows in database remain unchanged
    db.expire_all()
    p_db = db.get(Program, "K26409")
    assert p_db is not None
    db_codes = {pm.module_code for pm in p_db.modules}
    assert db_codes == {"BIM5022", "TOA1001", "EAA2028"}
    assert db.get(Program, "K26409E") is None  # no fictitious row created

    # 5. Program graph mapping consistency: GET /api/programs/K26409E/graph
    res_graph = client.get("/api/programs/K26409E/graph")
    assert res_graph.status_code == 200
    graph_data = res_graph.json()
    graph_node_codes = {n["code"] for n in graph_data["nodes"]}
    assert "EIM5022" in graph_node_codes
    assert "BIM5022" not in graph_node_codes
    # Edge source TOA1001 -> target EIM5022
    assert any(e["source"] == "TOA1001" and e["target"] == "EIM5022" for e in graph_data["edges"])

    # 6. Module tree endpoint: GET /api/modules/EIM5022/tree?program_id=K26409E
    res_tree = client.get("/api/modules/EIM5022/tree?program_id=K26409E")
    assert res_tree.status_code == 200
    tree_data = res_tree.json()
    assert tree_data["code"] == "EIM5022"
    assert any(child["code"] == "TOA1001" for child in tree_data.get("children", []))

    # 7. Check program endpoint: POST /api/programs/K26409E/check
    res_check = client.get("/api/programs/K26409E")
    assert res_check.status_code == 200
    check_payload = {
        "completed": [{"code": "TOA1001", "grade": 8.0}],
        "planned": {"HK1": ["EIM5022"]},
    }
    res_check_call = client.post("/api/programs/K26409E/check", json=check_payload)
    assert res_check_call.status_code == 200
    check_result = res_check_call.json()
    assert "EIM5022" in check_result["eligible_now"] or "EIM5022" in check_result.get("passed", []) or len(check_result["blocked"]) == 0


def test_modules_filter_single_and_repeated_program_ids(client, db):
    clear_valid_groups_cache()
    # Setup two programs: K26409 (primary, will be viewed in E track) and K24406 (secondary)
    p1 = Program(id="K26409", name="Kiểm toán K26", cohort="K26")
    p2 = Program(id="K24406", name="HTTTQL K24", cohort="K24")
    cs = ClassSection(class_code="261BIM502201", module_code="BIM5022", student_groups=["K26409E"])
    db.add_all([p1, p2, cs])

    m_base = Module(code="BIM5022", name="HTTT Base", credits=3, counterpart_code="EIM5022", language_track="vi")
    m_e = Module(code="EIM5022", name="HTTT E", credits=3, counterpart_code="BIM5022", language_track="en")
    m_sec = Module(code="MIS2001", name="Hệ cơ sở dữ liệu", credits=3, language_track="vi")
    m_shared = Module(code="SHARED01", name="Môn dùng chung", credits=2, language_track="vi")
    m_other = Module(code="OTHER99", name="Môn của ngành khác", credits=3, language_track="vi")
    db.add_all([m_base, m_e, m_sec, m_shared, m_other])
    db.flush()

    db.add(ProgramModule(program_id="K26409", module_code="BIM5022", block="Chuyên ngành"))
    db.add(ProgramModule(program_id="K26409", module_code="SHARED01", block="Đại cương"))

    db.add(ProgramModule(program_id="K24406", module_code="MIS2001", block="Cơ sở"))
    db.add(ProgramModule(program_id="K24406", module_code="SHARED01", block="Đại cương"))
    db.commit()

    # Filter with single program_id=K26409E (returns mapped EIM5022 and SHARED01)
    res_single = client.get("/api/modules?program_id=K26409E")
    assert res_single.status_code == 200
    data_single = res_single.json()
    codes_single = {m["code"] for m in data_single["items"]}
    assert codes_single == {"EIM5022", "SHARED01"}
    assert "BIM5022" not in codes_single
    assert "MIS2001" not in codes_single
    assert "OTHER99" not in codes_single

    # Filter with repeated program_ids: K26409E and K24406 (returns union deduped before pagination)
    res_union = client.get("/api/modules?program_ids=K26409E&program_ids=K24406")
    assert res_union.status_code == 200
    data_union = res_union.json()
    codes_union = {m["code"] for m in data_union["items"]}
    # SHARED01 appears in both programs, must not be duplicated in result
    assert codes_union == {"EIM5022", "SHARED01", "MIS2001"}
    assert data_union["total"] == 3
    assert len(data_union["items"]) == 3
    assert "OTHER99" not in codes_union


def test_program_track_404_on_unknown(client, db):
    res = client.get("/api/programs/UNKNOWN999")
    assert res.status_code == 404
    res_e = client.get("/api/programs/UNKNOWN999E1")
    assert res_e.status_code == 404
