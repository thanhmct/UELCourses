"""Ô HPTuongDuong của CTĐT: 'MÃ-Tên [n TC]; …' -> đúng mã; không tạo cạnh rác từ chữ trong tên môn."""
import pytest

from app.models import Module, ModuleRelation, Program, ProgramModule
from app.services.ctdt_import import import_ctdt, parse_equivalent_codes, rebuild_equivalent_relations


@pytest.mark.parametrize("raw,codes", [
    ("EAA2028-Nguyên lý kế toán [3 TC]", ["EAA2028"]),
    ("EN03-Tiếng Anh 3 [5 TC]; EN13-Tiếng Anh 3 [5 TC]; EN23-Tiếng Anh 3 [5 TC]", ["EN03", "EN13", "EN23"]),
    ("BFF2071-Phương pháp nghiên cứu khoa học trong kinh tế và quản lý [3 TC]", ["BFF2071"]),
    ("GDQP-Học phần GDQP [5 TC]", ["GDQP"]),
    ("BBM3102 - Mô hình kinh doanh số, Thương mại điện tử [3 TC]", ["BBM3102"]),  # dấu phẩy trong tên không sinh mã
    ("EAA2028", ["EAA2028"]),
    ("", []),
    (None, []),
    ("Không có", []),
])
def test_parse_equivalent_codes(raw, codes):
    assert parse_equivalent_codes(raw) == codes


def _row(code, eq):
    return {"MaCTDT": "K24404", "TenCTDT": "Kế toán", "MaHP": code, "TenHP": "Nguyên lý kế toán", "STC": 3,
            "BatBuoc": "Bắt Buộc", "HPTuongDuong": eq}


def test_import_ctdt_builds_only_real_code_edges(db, monkeypatch):
    monkeypatch.setenv("SKIP_LEGACY_CODES", "true")
    from app.config import get_settings
    get_settings.cache_clear()
    try:
        import_ctdt(db, {"K24404": [_row("BAA2028", "EAA2028-Nguyên lý kế toán [3 TC]; EN03-Tiếng Anh 3 [5 TC]")]})
        db.commit()
        edges = {(r.source, r.target) for r in db.query(ModuleRelation).filter_by(type="equivalent")}
        assert edges == {("EAA2028", "BAA2028")}  # EN03 là mã hệ cũ: không thành cạnh (D13)
    finally:
        get_settings.cache_clear()


def test_rebuild_replaces_junk_edges_from_stored_raw(db):
    db.add(Program(id="K24999", name="Thử", cohort="K24"))
    db.add_all([Module(code="BAA2028", name="Nguyên lý kế toán"), Module(code="BAA1001", name="Kinh tế vi mô")])
    db.flush()
    db.add(ProgramModule(program_id="K24999", module_code="BAA2028", equivalent_raw="EAA2028-Nguyên lý kế toán [3 TC]"))
    db.add_all([ModuleRelation(source=s, target="BAA2028", type="equivalent", program_id="K24999") for s in ("T", "K", "TRONG", "TC")])
    db.add(ModuleRelation(source="BAA1001", target="BAA2028", type="prereq", program_id="K24999"))
    db.commit()
    dry = rebuild_equivalent_relations(db, dry_run=True)
    assert (dry["old_edges"], dry["new_edges"]) == (4, 1)
    assert db.query(ModuleRelation).filter_by(type="equivalent").count() == 4  # dry-run không ghi
    rebuild_equivalent_relations(db)
    assert {(r.source, r.target) for r in db.query(ModuleRelation).filter_by(type="equivalent")} == {("EAA2028", "BAA2028")}
    assert db.query(ModuleRelation).filter_by(type="prereq").count() == 1  # cạnh loại khác giữ nguyên
