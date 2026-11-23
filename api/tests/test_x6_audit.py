import csv
from pathlib import Path

from app.models import (
    Module,
    OutlineAssessment,
    OutlineClo,
    OutlineCourse,
    OutlineDocument,
    OutlineMaterial,
    OutlineModuleLink,
    OutlineObjective,
    OutlineScheduleItem,
    Program,
    ProgramModule,
)
from app.services.x6_audit import run_x6_audit


def _seed_complete_outline(db):
    module = Module(code="AAA1001", name="Kế toán", credits=3, search_text="")
    db.add_all([
        module,
        Program(id="K23101", name="K23", cohort="K23", degree="dai_hoc", search_text=""),
        Program(id="K25101", name="K25", cohort="K25", degree="dai_hoc", search_text=""),
    ])
    db.flush()
    db.add_all([
        ProgramModule(program_id="K23101", module_code=module.code),
        ProgramModule(program_id="K25101", module_code=module.code),
        OutlineDocument(id=1, sha256="a" * 64, file_name="AAA1001.docx", rel_path="x", size_bytes=10, ctdt_year=2023, source_format="docx", text_status="extracted"),
    ])
    db.flush()
    db.add_all([
        OutlineModuleLink(document_id=1, module_code=module.code, ctdt_year=2023, source="docx_import"),
        OutlineCourse(document_id=1, name_vi="Kế toán", name_en="Accounting", credits=3, description="Mô tả", lecturers=["GV"], parse_status="ok"),
        OutlineObjective(document_id=1, code="CO1", description="Mục tiêu"),
        OutlineClo(document_id=1, code="CLO1", description="Chuẩn đầu ra"),
        OutlineAssessment(document_id=1, ord=1, item_name="Thi", weight_pct=100),
        OutlineMaterial(document_id=1, kind="textbook", ord=1, citation="Sách"),
        OutlineScheduleItem(document_id=1, ord=1, week_label="1", content="Bài 1"),
    ])
    db.commit()


def test_x6_gap_and_english_audit(db, tmp_path: Path):
    _seed_complete_outline(db)
    missing_2023 = tmp_path / "outline_2023_con_thieu.csv"
    with missing_2023.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["ma_mon", "ten_vi", "ten_en_db", "ly_do", "link"])
        writer.writeheader()
        writer.writerow({"ma_mon": "BBB1002", "ten_vi": "Môn thiếu", "ly_do": "chan-quyen", "link": "https://example.test"})
    seed = tmp_path / "seed.tsv"
    seed.write_text("name_vi\tname_en\n", encoding="utf-8")

    result = run_x6_audit(
        db,
        processed_dir=tmp_path,
        missing_2023_csv=missing_2023,
        master_file=tmp_path / "missing.xlsx",
        seed_file=seed,
        apply_names=False,
    )

    matrix = list(csv.DictReader((tmp_path / "outline_gap_matrix.csv").open(encoding="utf-8-sig")))
    assert {(row["ctdt_year"], row["trạng_thái"]) for row in matrix} == {("2023", "du"), ("2025", "chua_co_de_cuong")}
    manual = list(csv.DictReader((tmp_path / "outline_can_nhap_tay.csv").open(encoding="utf-8-sig")))
    assert any(row["module_code"] == "BBB1002" and row["lý_do_thiếu"] == "chan-quyen" for row in manual)
    audit = list(csv.DictReader((tmp_path / "english_name_audit.csv").open(encoding="utf-8-sig")))
    row = next(item for item in audit if item["module_code"] == "AAA1001")
    assert row["kết_luận"] == "db_thieu_co_nguon"
    assert row["name_en_de_xuat"] == "Accounting"
    assert db.get(Module, "AAA1001").name_en is None
    assert result["outline_gap"]["protected_2023"] == 1


def test_x6_only_applies_missing_or_case_only(db, tmp_path: Path):
    _seed_complete_outline(db)
    seed = tmp_path / "seed.tsv"
    seed.write_text("name_vi\tname_en\n", encoding="utf-8")
    run_x6_audit(db, processed_dir=tmp_path, master_file=None, seed_file=seed, apply_names=True)
    module = db.get(Module, "AAA1001")
    assert module.name_en == "Accounting"
    assert module.name_en_source == "outline"
