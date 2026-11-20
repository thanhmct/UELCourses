from app.models import Module, ProgramCatalogEntry
from app.services.english_names import fill_english_names, is_clean_english, load_seed_table, normalize_vi


def test_normalize_strips_credit_and_class_suffixes():
    assert normalize_vi("Kế toán quản trị (4TC)") == "ke toan quan tri"
    assert normalize_vi("Quản trị tài chính (404CA)") == "quan tri tai chinh"
    assert normalize_vi("Phân tích dữ liệu - Lớp vét") == "phan tich du lieu"
    assert normalize_vi("Khóa luận tốt nghiệp (4TC) - ngành 2") == "khoa luan tot nghiep"
    assert normalize_vi("Quản trị chuỗi cung ứng (E)") == "quan tri chuoi cung ung"


def test_junk_values_are_rejected():
    for junk in (None, "", "v", "  ", "Machine Learning............", "Kế toán tài chính", "123"):
        assert not is_clean_english(junk), junk
    assert is_clean_english("Management Accounting 1")


def test_seed_table_loads_and_picks_most_common(tmp_path):
    p = tmp_path / "t.tsv"
    p.write_text("name_vi\tname_en\nKế toán công\tPublic Sector Accounting\nKế toán công\tPublic Sector Accounting\n"
                 "Kế toán công (4TC)\tAccounting for Nonbusiness Entities\nRác\tv\n", encoding="utf-8")
    t = load_seed_table(p)
    assert t["ke toan cong"] == "Public Sector Accounting"
    assert "rac" not in t  # giá trị rác bị bỏ


def test_real_seed_table_has_expected_entries():
    t = load_seed_table()
    assert t[normalize_vi("Kế toán quản trị 1")] == "Management Accounting 1"
    assert len(t) > 500


def test_fill_prefers_catalog_over_seed_and_keeps_manual(db, tmp_path):
    seed = tmp_path / "s.tsv"
    seed.write_text("name_vi\tname_en\nKế toán quản trị\tManagement Accounting\nLuật hình sự\tCriminal Law\n", encoding="utf-8")
    db.add_all([
        Module(code="A1", name="Kế toán quản trị (3TC)"),
        Module(code="A2", name="Luật hình sự"),
        Module(code="A3", name="Môn không có nguồn"),
        Module(code="A4", name="Luật hình sự", name_en="Hand Written"),
    ])
    db.flush()
    db.add(ProgramCatalogEntry(id="c1", program_label="P", module_code="A2", module_name_en="Penal Law",
                               source_file="f", source_sheet="s", source_row=1))
    db.add(ProgramCatalogEntry(id="c2", program_label="P", module_code="A1", module_name_en="v",
                               source_file="f", source_sheet="s", source_row=2))
    db.commit()
    res = fill_english_names(db, seed)
    got = {m.code: (m.name_en, m.name_en_source) for m in db.query(Module).all()}
    assert got["A1"] == ("Management Accounting", "seed_table")  # catalog rác "v" bị bỏ, rơi xuống bảng đối chiếu
    assert got["A2"] == ("Penal Law", "catalog")
    assert got["A3"] == (None, None)
    assert got["A4"] == ("Hand Written", None)  # nhập tay không bị ghi đè
    assert res["without_name_en"] == 1 and res["kept_manual"] == 1
    assert fill_english_names(db, seed) == res  # idempotent


def test_tree_nodes_carry_name_en(client, db):
    from app.models import ModuleRelation
    db.add_all([Module(code="T1", name="Môn một", name_en="Course One"), Module(code="T2", name="Môn hai")])
    db.flush()
    db.add(ModuleRelation(source="T1", target="T2", type="prereq"))
    db.commit()
    r = client.get("/api/modules/T2/tree", params={"direction": "prereq"})
    assert r.status_code == 200
    root = r.json()
    assert root["name_en"] is None
    assert root["children"][0]["code"] == "T1" and root["children"][0]["name_en"] == "Course One"


def test_api_returns_name_en(client, db):
    db.add(Module(code="Z9", name="Luật hình sự", name_en="Criminal Law", name_en_source="seed_table",
                  search_text="z9 luat hinh su"))
    db.commit()
    r = client.get("/api/modules", params={"q": "Z9"})
    assert r.status_code == 200
    item = [i for i in r.json()["items"] if i["code"] == "Z9"][0]
    assert item["name_en"] == "Criminal Law"
