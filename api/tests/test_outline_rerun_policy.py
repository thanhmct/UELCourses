"""parse-outlines: đề cương đã 'ok' không chạy lại; ô mã học phần trống nhưng danh mục CTĐT đã gắn mã thì không tính là thiếu."""
from pathlib import Path

from app.models import OutlineCourse, OutlineDocument, OutlineModuleLink
from app.services.outline_parse import PARSER_VERSION, apply_catalog_codes, outline_status, parse_outlines


def _doc(db, n: int, status: str | None, method: str | None) -> OutlineDocument:
    d = OutlineDocument(sha256=f"{n}" * 64, file_name=f"d{n}.pdf", rel_path=f"x/d{n}.pdf", size_bytes=1,
                        text_status="extracted", text="văn bản không phải đề cương")  # doc_type 'other' -> không chạy trích bảng
    db.add(d)
    db.flush()
    if status:
        db.add(OutlineCourse(document_id=d.id, doc_type="syllabus_vi", parse_status=status, parse_method=method))
    db.commit()
    return d


def _methods(db):
    return {c.document_id: (c.parse_method, c.parse_status) for c in db.query(OutlineCourse)}


def test_default_run_skips_ok_and_current_version(db, tmp_path):
    ok_old = _doc(db, 1, "ok", "rules-5")
    partial_now = _doc(db, 2, "partial", PARSER_VERSION)
    fresh = _doc(db, 3, None, None)
    stats = parse_outlines(db, tmp_path, workers=1)
    assert stats["docs"] == 1
    m = _methods(db)
    assert m[ok_old.id] == ("rules-5", "ok")            # đủ rồi: không đụng tới, kể cả khi phiên bản cũ
    assert m[partial_now.id] == (PARSER_VERSION, "partial")
    assert m[fresh.id][0] == PARSER_VERSION


def test_force_reruns_incomplete_but_not_ok_and_include_ok_reruns_all(db, tmp_path):
    ok_old = _doc(db, 4, "ok", "rules-5")
    partial_now = _doc(db, 5, "partial", PARSER_VERSION)
    assert parse_outlines(db, tmp_path, workers=1, force=True)["docs"] == 1   # chỉ tài liệu chưa 'ok'
    assert _methods(db)[partial_now.id] == (PARSER_VERSION, "failed")      # văn bản thử không phải đề cương
    assert _methods(db)[ok_old.id] == ("rules-5", "ok")
    assert parse_outlines(db, tmp_path, workers=1, force=True, include_ok=True)["docs"] == 2


def _parsed(missing):
    return {"doc_type": "syllabus_vi", "status": outline_status("syllabus_vi", missing), "detail": {"missing": list(missing)}}


def test_catalog_code_counts_when_pdf_code_cell_is_blank():
    p = apply_catalog_codes(_parsed(["course_code"]), ["BUS1206", "BUS1206"])
    assert p["status"] == "ok" and p["detail"]["missing"] == []
    assert p["detail"]["course_code_from_catalog"] == ["BUS1206"]
    p = apply_catalog_codes(_parsed(["course_code", "clos"]), ["BUS1206"])
    assert p["status"] == "partial" and p["detail"]["missing"] == ["clos"]


def test_no_catalog_link_keeps_code_missing():
    p = apply_catalog_codes(_parsed(["course_code"]), [])
    assert p["status"] == "partial" and "course_code_from_catalog" not in p["detail"]


def test_parse_outlines_uses_catalog_links(db, tmp_path):
    d = _doc(db, 6, None, None)
    db.add(OutlineModuleLink(document_id=d.id, module_code="LAW1021"))
    db.commit()
    parse_outlines(db, Path(tmp_path), workers=1)
    row = db.query(OutlineCourse).filter_by(document_id=d.id).one()
    assert row.doc_type == "other"  # văn bản thử không phải đề cương: không áp mã danh mục cho tài liệu không phải syllabus
    assert "course_code_from_catalog" not in (row.parse_detail or {})
