import csv
import json
import unicodedata

import pytest
from openpyxl import Workbook
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import sessionmaker

from app import cli
from app.db import Base
from app.models import ClassSection, Module, ModuleRelation, Program, ProgramModule, Semester

SOURCE_NAME = unicodedata.normalize("NFD", "Ngành mẫu – Khoá 24")


@pytest.fixture
def db(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{(tmp_path / 'clone.db').as_posix()}")
    models = (Module, Semester, ClassSection, Program, ProgramModule, ModuleRelation)
    Base.metadata.create_all(engine, tables=[model.__table__ for model in models])
    sessions = sessionmaker(engine, autoflush=False, expire_on_commit=False)
    monkeypatch.setattr(cli, "SessionLocal", sessions)
    try:
        with sessions() as session:
            yield session
    finally:
        engine.dispose()


def _workbook(directory, filename, rows):
    workbook = Workbook()
    for row in rows:
        workbook.active.append(row)
    workbook.save(directory / filename)
    workbook.close()


@pytest.fixture
def clone_data(db, tmp_path):
    db.add_all([
        Module(code="BMM1001", name="Môn bắt buộc", credits=3),
        Module(code="BMM1002", name="Môn tự chọn", credits=2),
    ])
    db.flush()
    for program_id in ("K24401", "K24402", "K24403", "K24404", "K24405", "K24413", "K24419",
                       "K24401E", "K24401H", "K24401T"):
        db.add(Program(
            id=program_id, name=SOURCE_NAME, cohort="K24", faculty="Khoa mẫu",
            source="ctdt", modules=[
                ProgramModule(
                    module_code="BMM1001", block="Cơ sở", parent_block="Đại cương",
                    required=True, suggested_semester="2024-2025-1", suggested_term="HK01 năm học 2024-2025",
                    suggested_order=1, prereq_raw="BMM1002", prereq_tree={"code": "BMM1002"}, note="Ghi chú",
                ),
                ProgramModule(
                    module_code="BMM1002", block="Tự chọn", required=False,
                    suggested_semester="2025-2026-3", suggested_term=None, suggested_order=6,
                ),
            ],
        ))
    db.add_all([
        Program(id="K23402", name="Chương trình gốc K23", cohort="K23", source="ctdt",
                modules=[ProgramModule(module_code="BMM1002", suggested_semester="2023-2024-2")]),
        Program(id="K24406", name="Nguồn khác", cohort="K24", source="catalog"),
        ModuleRelation(program_id="K24401", source="BMM1002", target="BMM1001", type="prereq"),
        ModuleRelation(program_id="K24402", source="BMM1002", target="BMM1001", type="prereq"),
        ClassSection(class_code="A", module_code="BMM1001", student_groups=["K23401A", "K23402A", "K23406A"]),
        ClassSection(class_code="B", module_code="BMM1002", cohorts=["K23", "K23413B"]),
    ])
    db.commit()

    excel_dir = tmp_path / "outlines_master" / "ctdt2023_excel"
    excel_dir.mkdir(parents=True)
    _workbook(excel_dir, "CTĐT 2023_403.xlsx", [("Mã môn",), ("BMM1001",)])
    _workbook(excel_dir, "CTĐT 20232024_404_405.xlsx", [
        ("Mã ngành", "Học kỳ K23", "Học kỳ K24"),
        (404, "HK01", "HK01"),
        (405, " ", "HK02"),
    ])
    _workbook(excel_dir, "CTĐT 20232024_413_419.xlsx", [
        ("Mã ngành", "2023", "2024"),
        (419, "HK01", "HK01"),
    ])
    return tmp_path


def _read_report(data_dir):
    path = data_dir / "processed" / "k23_clone_report.csv"
    with path.open(encoding="utf-8-sig", newline="") as report:
        return {row["ma_ctdt"]: row for row in csv.DictReader(report)}


def test_clone_cohort_programs_dry_run(db, clone_data, capsys, monkeypatch):
    def unexpected_init():
        pytest.fail("Lệnh clone không được khởi tạo schema")

    monkeypatch.setattr(cli, "init_db", unexpected_init)
    statements = []

    def capture_sql(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement.lstrip().split()[0].upper())

    bind = db.get_bind()
    event.listen(bind, "before_cursor_execute", capture_sql)
    try:
        assert cli.main(["clone-cohort-programs", "--dry-run", "--data-dir", str(clone_data)]) == 0
    finally:
        event.remove(bind, "before_cursor_execute", capture_sql)

    summary = json.loads(capsys.readouterr().out)
    assert (summary["dry_run"], summary["so_chuong_trinh_them"], summary["so_mon_them"]) == (True, 4, 8)
    assert statements and set(statements) == {"SELECT"}
    assert db.scalars(select(Program.id).where(Program.id.like("K23%"))).all() == ["K23402"]

    rows = _read_report(clone_data)
    assert set(rows) == {"K23401", "K23402", "K23403", "K23404", "K23405", "K23413", "K23419"}
    assert "K23401A" in rows["K23401"]["bang_chung"]
    assert "đã tồn tại" in rows["K23402"]["ly_do"]
    assert "Tên tệp CTĐT 2023" in rows["K23403"]["bang_chung"]
    assert "dòng 2" in rows["K23404"]["bang_chung"]
    assert rows["K23405"]["quyet_dinh"] == "bỏ qua"
    assert rows["K23401"]["ten_ctdt"] == "Ngành mẫu – Khóa 23"
    assert "class_sections.cohorts" in rows["K23413"]["bang_chung"]
    assert rows["K23419"]["quyet_dinh"] == "bỏ qua"
    assert rows["K23401"]["tin_chi_bat_buoc_them"] == "3"
    assert rows["K23401"]["so_mon_them"] == "2"


def test_clone_cohort_programs_apply_and_rerun_on_sqlite(db, clone_data, capsys):
    args = ["clone-cohort-programs", "--data-dir", str(clone_data)]
    assert db.get_bind().dialect.name == "sqlite"
    assert cli.main(args) == 0
    assert json.loads(capsys.readouterr().out)["so_chuong_trinh_them"] == 4

    source = db.get(Program, "K24401")
    cloned = db.get(Program, "K23401")
    assert (cloned.name, cloned.cohort, cloned.faculty, cloned.source, cloned.is_sample) == (
        "Ngành mẫu – Khóa 23", "K23", "Khoa mẫu", "derived_from_K24", False,
    )
    assert cloned.search_text == "k23401 nganh mau – khoa 23 khoa mau"
    assert [pm.module_code for pm in cloned.modules] == ["BMM1001", "BMM1002"]
    assert [pm.suggested_semester for pm in cloned.modules] == ["2023-2024-1", "2024-2025-3"]
    assert [pm.suggested_term for pm in cloned.modules] == ["HK01 năm học 2023-2024", None]
    for original, copy in zip(source.modules, cloned.modules, strict=True):
        assert (copy.block, copy.parent_block, copy.required, copy.suggested_order) == (
            original.block, original.parent_block, original.required, original.suggested_order,
        )
        assert (copy.prereq_raw, copy.prereq_tree, copy.note, copy.module.credits) == (
            original.prereq_raw, original.prereq_tree, original.note, original.module.credits,
        )
    assert source.name == SOURCE_NAME
    assert source.modules[0].suggested_term == "HK01 năm học 2024-2025"
    existing = db.get(Program, "K23402")
    assert existing.name == "Chương trình gốc K23"
    assert [(pm.module_code, pm.suggested_semester) for pm in existing.modules] == [
        ("BMM1002", "2023-2024-2"),
    ]
    assert set(db.scalars(select(Program.id).where(Program.id.like("K23%")))) == {
        "K23401", "K23402", "K23403", "K23404", "K23413",
    }
    relations = select(ModuleRelation.program_id, ModuleRelation.source, ModuleRelation.target)
    assert set(db.execute(relations)) == {
        ("K24401", "BMM1002", "BMM1001"),
        ("K24402", "BMM1002", "BMM1001"),
        ("K23401", "BMM1002", "BMM1001"),
    }

    assert cli.main(args) == 0
    summary = json.loads(capsys.readouterr().out)
    assert (summary["so_chuong_trinh_them"], summary["so_mon_them"]) == (0, 0)
    assert len(db.execute(relations).all()) == 3
    assert len(db.scalars(select(ProgramModule).where(ProgramModule.program_id == "K23401")).all()) == 2
