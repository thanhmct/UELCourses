import json

import pytest

from app.models import ClassSection, Lesson, Module, ModuleRelation, Program, ProgramModule
from app.services.importer import import_classes
from app.services.legacy import is_legacy_code, purge_legacy_codes


@pytest.mark.parametrize(
    "code,expected",
    [("AA01", True), ("EN21", True), ("kt48", True), (" LU 10 ", True), ("GDQP", False), ("TATC", False), ("TEST", False),
     ("TATC1", False), ("2NL01", False), ("EEE1038", False), ("BBU4025", False), ("", False), (None, False)],
)
def test_is_legacy_code(code, expected):
    assert is_legacy_code(code) is expected


def _row(code, alias):
    return {"CurriculumID": code, "ScheduleStudyUnitAlias": alias, "ScheduleStudyUnitName": "Môn " + code, "Credits": 3,
            "Schedules": "Thứ 2, Tiết 1-3, Phòng B.101", "StudentQuotas": "10-50"}


def test_importer_skips_legacy_codes(db, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "skip_legacy_codes", True)
    res = import_classes(db, [_row("AA01", "261AA0101"), _row("EEE1038", "261EEE103801"), _row("GDQP", "261GDQP01")])
    assert res.imported == 2 and res.skipped == 1
    codes = {m.code for m in db.query(Module)}
    assert codes == {"EEE1038", "GDQP"}  # mã chỉ gồm chữ không bị coi là mã cũ


def test_old_programs_purged_and_skipped(db, monkeypatch):
    from app.config import get_settings
    from app.services.ctdt_import import import_ctdt
    from app.services.legacy import cohort_number, purge_old_programs, skip_old_program

    assert cohort_number("K22") == 22 and cohort_number(None) is None
    monkeypatch.setattr(get_settings(), "min_program_cohort", 23)
    assert skip_old_program("K22") and not skip_old_program("K23") and not skip_old_program(None)

    rows = lambda pid: [{"MaCTDT": pid, "TenCTDT": "CT " + pid, "MaHP": "EEE1038", "TenHP": "Kinh tế vĩ mô (E)", "STC": 3}]
    res = import_ctdt(db, {"K22404": rows("K22404"), "K24404": rows("K24404")})
    assert db.query(Program).count() == 1  # K22 bị bỏ qua khi nạp
    assert db.query(Program).one().id == "K24404"

    monkeypatch.setattr(get_settings(), "min_program_cohort", 0)
    import_ctdt(db, {"K22404": rows("K22404")})  # nạp lại K22 để thử xóa
    assert db.query(Program).count() == 2
    dry = purge_old_programs(db, before=23, dry_run=True)
    assert dry["programs"] == 1 and db.query(Program).count() == 2
    out = purge_old_programs(db, before=23)
    assert out["programs"] == 1 and out["program_modules"] == 1
    assert [p.id for p in db.query(Program)] == ["K24404"]
    assert db.get(Module, "EEE1038") is not None  # học phần vẫn còn


def test_purge_removes_legacy_with_cascade(db):
    db.add_all([Module(code="AA01", name="Cũ"), Module(code="EEE1038", name="Mới"), Module(code="GDQP", name="GDQP"),
                Program(id="K22404", name="Tài chính K22")])
    db.flush()
    cs = ClassSection(class_code="261AA0101", module_code="AA01")
    db.add_all([cs, ProgramModule(program_id="K22404", module_code="AA01"), ProgramModule(program_id="K22404", module_code="GDQP"),
                ModuleRelation(source="AA01", target="EEE1038", type="previous"), ModuleRelation(source="GDQP", target="EEE1038", type="previous")])
    db.flush()
    db.add(Lesson(class_id=cs.id, weekday=2, start_period=1, end_period=3, start_time="07:00", end_time="09:30"))
    db.commit()

    dry = purge_legacy_codes(db, dry_run=True)
    assert dry == {"modules": 1, "class_sections": 1, "program_modules": 1, "relations": 1, "dry_run": True}
    assert db.query(Module).count() == 3  # dry-run không xóa

    res = purge_legacy_codes(db)
    assert res["modules"] == 1
    assert {m.code for m in db.query(Module)} == {"EEE1038", "GDQP"}
    assert db.query(ClassSection).count() == 0 and db.query(Lesson).count() == 0
    assert [pm.module_code for pm in db.query(ProgramModule)] == ["GDQP"]
    assert [(r.source, r.target) for r in db.query(ModuleRelation)] == [("GDQP", "EEE1038")]
