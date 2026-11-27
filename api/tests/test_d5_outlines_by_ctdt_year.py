from __future__ import annotations

import csv
from pathlib import Path
import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from fastapi import HTTPException

from app.models import Base, Module, OutlineCourse, OutlineDocument, OutlineModuleLink, Program, ProgramModule
from app.routers.modules import get_module_outline, resolve_ctdt_year
from app.services.outline_docx import (
    export_chan_quyen_csv,
    parse_docx_document,
    replace_bff4009_outline,
)

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_resolve_ctdt_year():
    assert resolve_ctdt_year(cohort="K23") == 2023
    assert resolve_ctdt_year(cohort="K24") == 2023
    assert resolve_ctdt_year(cohort="K25") == 2025
    assert resolve_ctdt_year(cohort="K26") == 2025
    assert resolve_ctdt_year(cohort="K24404E") == 2023
    assert resolve_ctdt_year(cohort="K25414H") == 2025
    assert resolve_ctdt_year(ctdt_year=2023) == 2023
    assert resolve_ctdt_year(cohort="K26", ctdt_year=2023) == 2023
    assert resolve_ctdt_year(cohort=None, ctdt_year=None) is None


def test_module_outline_uses_program_cohort_or_latest_available_year():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as db:
        db.add(Module(code="OUT1001", name="Test module", degree="dai_hoc"))
        db.add(Program(id="K23401", name="Test programme", cohort="K23", degree="dai_hoc"))
        db.flush()
        db.add(ProgramModule(program_id="K23401", module_code="OUT1001"))
        for doc_id, year in ((1, 2023), (2, 2025)):
            doc = OutlineDocument(
                id=doc_id,
                sha256=f"{doc_id:064d}",
                file_name=f"outline-{year}.docx",
                rel_path=f"outline-{year}.docx",
                size_bytes=1,
                ctdt_year=year,
            )
            db.add(doc)
            db.flush()
            db.add(OutlineCourse(
                document_id=doc_id,
                doc_type="syllabus_vi",
                course_code_norm="OUT1001",
                parse_status="ok",
                parse_detail={"counts": {}},
            ))
            db.add(OutlineModuleLink(document_id=doc_id, module_code="OUT1001", ctdt_year=year))
        db.commit()

        selected = get_module_outline("OUT1001", "K23401", "K23", None, db)
        default = get_module_outline("OUT1001", None, None, None, db)

        assert selected.outline_year == 2023
        assert selected.document.document_id == 1
        assert default.outline_year == 2025
        assert default.document.document_id == 2


def test_module_outline_rejects_program_with_wrong_degree_or_module():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as db:
        db.add_all([
            Module(code="OUT2001", name="Test module", degree="dai_hoc"),
            Module(code="OUT2002", name="Other module", degree="dai_hoc"),
            Program(id="K23401", name="Test programme", cohort="K23", degree="dai_hoc"),
            Program(id="M601NC", name="Master programme", cohort=None, degree="thac_si"),
        ])
        db.flush()
        db.add(ProgramModule(program_id="K23401", module_code="OUT2001"))
        db.add(ProgramModule(program_id="M601NC", module_code="OUT2001"))

        with pytest.raises(HTTPException) as wrong_module:
            get_module_outline("OUT2002", "K23401", "K23", None, db)
        assert wrong_module.value.status_code == 404

        with pytest.raises(HTTPException) as wrong_degree:
            get_module_outline("OUT2001", "M601NC", None, None, db)
        assert wrong_degree.value.status_code == 409


def test_export_chan_quyen_csv(tmp_path: Path):
    manifest_p = tmp_path / "manifest_ctdt2023.csv"
    manifest_p.write_text(
        "code,status,url\n"
        "BFF4007,ok,https://example.com/ok\n"
        "BFF4008,chan-quyen,https://example.com/blocked\n"
        "BFF4009,failed,https://example.com/failed\n",
        encoding="utf-8-sig",
    )

    out_csv = tmp_path / "outlines_2023_chan_quyen.csv"
    count = export_chan_quyen_csv(manifest_p, out_csv)
    assert count == 2
    assert out_csv.is_file()

    with out_csv.open("r", encoding="utf-8-sig") as f:
        assert [(row["code"], row["status"], row["url"]) for row in csv.DictReader(f)] == [
            ("BFF4008", "chan-quyen", "https://example.com/blocked"),
            ("BFF4009", "failed", "https://example.com/failed"),
        ]


def test_parse_docx_bff4009_manual():
    manual_docx = REPO_ROOT / "data" / "outlines_master" / "manual" / "BFF4009_K25.docx"
    if not manual_docx.is_file():
        pytest.skip("Chưa có file manual/BFF4009_K25.docx")

    parsed = parse_docx_document(manual_docx, target_code="BFF4009")
    assert parsed["course"]["course_code_norm"] == "BFF4009"
    assert parsed["doc_type"] == "syllabus_vi"
    assert {"general", "description", "assessment", "schedule"} <= {s["kind"] for s in parsed["sections"]}
    assert parsed["status"] in ("ok", "partial")
    assert parsed["course"]["credits"] == 3
    # Môn Ngoại ngữ hoặc khoa override
    assert parsed["course"]["faculty"] is not None
    # Đã bóc tách được CO / CLO / Đánh giá
    assert len(parsed.get("assessments", [])) > 0


def test_replace_bff4009_outline():
    manual_docx = REPO_ROOT / "data" / "outlines_master" / "manual" / "BFF4009_K25.docx"
    if not manual_docx.is_file():
        pytest.skip("Chưa có file manual/BFF4009_K25.docx")

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as db:
        db.add(Module(code="BFF4009", name="Đầu tư tài chính", credits=3))
        db.add(Module(code="EFF4009", name="Financial Investment", credits=3))
        # Giả lập bản cũ 2025 bị hỏng
        old_doc = OutlineDocument(
            sha256="old_sha256",
            file_name="corrupt.pdf",
            rel_path="corrupt.pdf",
            size_bytes=1,
            ctdt_year=2025,
            source_format="pdf",
        )
        db.add(old_doc)
        db.flush()
        db.add(OutlineModuleLink(document_id=old_doc.id, module_code="BFF4009", ctdt_year=2025, source="auto"))
        db.commit()

        # Thực hiện thay thế
        res = replace_bff4009_outline(db, manual_docx, dry_run=False)
        assert res["ok"] is True
        assert res["module"] == "BFF4009"

        # Kiểm tra liên kết mới
        links = list(db.scalars(select(OutlineModuleLink).where(OutlineModuleLink.module_code == "BFF4009")).all())
        assert len(links) == 1
        assert links[0].ctdt_year == 2025
        assert links[0].source == "manual"

        new_doc = db.get(OutlineDocument, links[0].document_id)
        assert new_doc is not None
        assert new_doc.source_format == "docx"
        assert new_doc.ctdt_year == 2025

        # EFF4009 cũng được gắn liên kết tương ứng
        eff_link = db.scalar(select(OutlineModuleLink).where(OutlineModuleLink.module_code == "EFF4009"))
        assert eff_link is not None
        assert eff_link.document_id == new_doc.id
