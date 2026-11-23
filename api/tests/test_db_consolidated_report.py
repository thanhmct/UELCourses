from pathlib import Path

from app.models import Module, Program, ProgramModule
from app.services.db_consolidated_report import generate_db_consolidated_report, program_track


def test_program_track_suffix_order():
    assert program_track("K25408TE") == "TE"
    assert program_track("K25408E") == "E"
    assert program_track("K25414H") == "H"
    assert program_track("K25411T") == "T"
    assert program_track("K25422") == "chuẩn"


def test_generate_consolidated_report(db, tmp_path: Path):
    db.add(Module(code="AAA1001", name="Môn A", credits=3, degree="dai_hoc", search_text=""))
    db.add(Program(id="K25101", name="CTĐT A", cohort="K25", degree="dai_hoc", source="test", search_text=""))
    db.flush()
    db.add(ProgramModule(program_id="K25101", module_code="AAA1001"))
    db.commit()
    out = tmp_path / "report.md"
    result = generate_db_consolidated_report(db, out_path=out, pending_imports=True)
    content = out.read_text(encoding="utf-8")
    assert result["programs"] == 1
    assert "## 6. Kiểm toàn vẹn" in content
    assert "Docker pipe" in content
