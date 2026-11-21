from sqlalchemy import select

from app.models import Equivalent, Module
from app.services.equivalents_repair import code_of, import_portal_equivalents, repair_equivalents


def _eq(code, eq, name=None):
    return Equivalent(code=code, equivalent_code=eq, name=name, equivalent_name=None, search_text="")


def test_code_of():
    assert code_of("BIM5001-An toàn và bảo mật-3 tín chỉ") == "BIM5001"
    assert code_of("EAA2028-NGUY") == "EAA2028"
    assert code_of("EAAT027") == "EAAT027"
    for frag in ("3", "M", "TC", "VI", "", None):
        assert code_of(frag) is None


def test_repair_drops_fragments_and_normalizes(db):
    db.add(Module(code="EAA2028", name="Principles of Accounting (E)", credits=3))
    db.flush()
    db.add_all([
        _eq("BAA2028", "3"), _eq("BAA2028", "M"), _eq("BAA2028", "TC"),   # mảnh: bỏ
        _eq("BAA2028", "EAA2028-NGUY"),                                    # chuẩn hóa -> EAA2028
        _eq("BAA2028", "EAA2028-NGUYEN"),                                  # trùng sau chuẩn hóa: bỏ
        _eq("BAA4027", "BAA4027"),                                         # tự tương đương mình: giữ (đã là mã sạch)
        _eq("BAA2029", "BAA2029-X"),                                       # trỏ về chính nó sau chuẩn hóa: bỏ
    ])
    db.commit()
    res = repair_equivalents(db)
    assert res == {"deleted_fragments": 4, "normalized": 1, "deduplicated": 1}
    pairs = {(e.code, e.equivalent_code) for e in db.scalars(select(Equivalent))}
    assert pairs == {("BAA2028", "EAA2028"), ("BAA4027", "BAA4027")}
    e = db.scalar(select(Equivalent).where(Equivalent.equivalent_code == "EAA2028"))
    assert e.equivalent_name == "Principles of Accounting (E)"  # điền tên từ modules
    assert repair_equivalents(db) == {"deleted_fragments": 0, "normalized": 0, "deduplicated": 0}  # idempotent


def test_import_portal_rows_sets_names_and_english(db):
    db.add_all([Module(code="BIM5001", name="An toàn và bảo mật hệ thống thông tin", credits=3),
                Module(code="BIM4002", name="Chuyên đề: Big data", name_en="Big Data Seminar", name_en_source="outline")])
    db.add(_eq("IS28", "3"))
    db.commit()
    rows = [
        {"MaMon": "IS28", "TenMon": "An toàn và bảo mật hệ thống thông tin-3 tín chỉ", "STC": 3,
         "MaMonTuongDuong": "BIM5001-An toàn và bảo mật hệ thống thông tin-3 tín chỉ",
         "TenMonTuongDuong": "An toàn và bảo mật hệ thống thông tin", "TenHPTATuongDuong": "Information System Security", "STCTuongDuong": 3},
        {"MaMon": "MI14", "TenMon": "Big Data và ứng dụng-2 tín chỉ", "STC": 2,
         "MaMonTuongDuong": "BIM4002-Chuyên đề: Big data-2 tín chỉ", "TenMonTuongDuong": "Chuyên đề: Big data",
         "TenHPTATuongDuong": "Big Data and Applications", "STCTuongDuong": 2},
        {"MaMon": "", "MaMonTuongDuong": "BIM1-x"},                      # thiếu mã gốc: bỏ
    ]
    res = import_portal_equivalents(db, rows)
    assert res["imported"] == 2 and res["skipped"] == 1 and res["repair"]["deleted_fragments"] == 1
    e = db.scalar(select(Equivalent).where(Equivalent.code == "IS28"))
    assert (e.equivalent_code, e.name, e.equivalent_name) == ("BIM5001", "An toàn và bảo mật hệ thống thông tin",
                                                              "An toàn và bảo mật hệ thống thông tin")
    m1, m2 = db.get(Module, "BIM5001"), db.get(Module, "BIM4002")
    assert (m1.name_en, m1.name_en_source) == ("Information System Security", "portal")
    assert (m2.name_en, m2.name_en_source) == ("Big Data Seminar", "outline")  # nguồn tốt hơn không bị ghi đè
    again = import_portal_equivalents(db, rows)
    assert again["imported"] == 2 and again["repair"]["deleted_fragments"] == 0
    assert len(db.scalars(select(Equivalent)).all()) == 2
