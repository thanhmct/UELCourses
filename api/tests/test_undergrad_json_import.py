from __future__ import annotations

import json

from sqlalchemy import func, select

from app.models import Module, ModuleAssessment, ModuleTextbook, Program, ProgramModule
from app.services.undergrad_json_import import import_undergrad_json


def _fixture(path):
    payload = {"bac_hoc": {"Đại học": {"KẾ TOÁN": [{
        "ma_chuong_trinh": "405", "ten_chuong_trinh": "Kế toán", "hoc_phan": [{
            "Index": 1, "Mã học phần": "BAA1001", "Tên học phần": "Kế toán cơ bản",
            "Số tín chỉ": "3", "Loại học phần": "Bắt buộc", "Khối kiến thức": "Cơ sở ngành",
            "Quá trình - Tỉ lệ điểm": "20%", "Quá trình - Hình thức": "Bài tập",
            "Giữa kỳ - Tỉ lệ điểm": 0.3, "Giữa kỳ - Hình thức": "Tự luận",
            "Cuối kỳ - Tỉ lệ điểm": 50, "Cuối kỳ - Hình thức": "Thi viết",
            "Thời gian thi": "60 phút", "Tài liệu chính": "Giáo trình kế toán", "Mã tài liệu": "KT01",
        }]
    }]}}}
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def test_import_undergrad_json_is_idempotent(db, tmp_path):
    path = tmp_path / "ctdt.json"
    _fixture(path)
    first = import_undergrad_json(db, path, include_programs=True)
    second = import_undergrad_json(db, path, include_programs=True)
    assert first["programs_created"] == 1
    assert second["programs_created"] == 0
    assert db.scalar(select(func.count(Program.id))) == 1
    assert db.scalar(select(func.count(ProgramModule.id))) == 1
    module = db.get(Module, "BAA1001")
    assert module and module.degree == "dai_hoc" and module.credits == 3
    assessment = db.get(ModuleAssessment, "BAA1001")
    assert assessment and assessment.process_ratio == 0.2 and assessment.final_ratio == 0.5
    assert assessment.final_assessment_kind == "Thi viết"
    assert assessment.applies_to_cohorts == ["K25", "K26"]
    textbook = db.scalar(select(ModuleTextbook).where(ModuleTextbook.module_code == "BAA1001"))
    assert textbook.document_code == "KT01"
    assert textbook.applies_to_cohorts == ["K25", "K26"]


def test_import_undergrad_json_dry_run_rolls_back(db, tmp_path):
    path = tmp_path / "ctdt.json"
    _fixture(path)
    result = import_undergrad_json(db, path, dry_run=True)
    assert result["status"] == "dry_run"
    assert db.scalar(select(func.count(Module.code))) == 0
