import json

from app.models import OutlineCourse, OutlineDocument
from app.services.outline_colab import import_colab_results, load_colab_records
from app.services.outline_parse import tables_from_raw, tables_to_records

SCHEDULE_TABLE = {
    "page": 3,
    "rows": [
        ["Tuần", "Nội dung", "CĐR", "Hoạt động dạy", "Hoạt động đánh giá"],
        ["1", "Giới thiệu", "CLO1", "Thuyết giảng", "A1"],
        ["2", "Chương 2", "CLO2", "Thảo luận", ""],
    ],
}


def test_tables_from_raw_builds_schedule_and_skips_errors():
    raw = [SCHEDULE_TABLE, {"page": 4, "error": "find_tables lỗi"}, {"page": 5, "rows": [["không liên quan", "x"]]}]
    recs = tables_to_records(tables_from_raw(raw))
    assert [r["week_label"] for r in recs["schedule"]] == ["1", "2"]
    assert recs["schedule"][0]["content"] == "Giới thiệu"
    assert recs["schedule"][0]["activities"] == "Thuyết giảng"
    assert recs["objectives"] == [] and recs["assessments"] == []


def test_tables_from_raw_merges_continuation_rows():
    # ô đầu trống -> dòng nối tiếp ghép vào dòng trước (như extract_tables)
    raw = [{"page": 1, "rows": [
        ["Tuần", "Nội dung", "CĐR"],
        ["1", "Phần đầu", "CLO1"],
        ["", "tiếp theo", ""],
    ]}]
    tabs = tables_from_raw(raw)
    assert tabs["schedule"][1][0] == "1"
    assert "tiếp theo" in tabs["schedule"][1][1]
    assert len(tabs["schedule"]) == 2


def test_load_colab_records_last_line_wins(tmp_path):
    p = tmp_path / "r.jsonl"
    lines = [
        {"file": "a.pdf", "text": "cũ", "tables": []},
        {"file": "a.pdf", "text": "mới", "tables": [SCHEDULE_TABLE]},
        {"file": "b.pdf", "error": "lỗi tải"},
        "không phải json",
    ]
    p.write_text("\n".join(x if isinstance(x, str) else json.dumps(x, ensure_ascii=False) for x in lines), encoding="utf-8")
    records, stats = load_colab_records(p)
    assert records["a.pdf"]["text"] == "mới"
    assert stats["bad_lines"] == 1 and stats["error_records"] == 1


def test_import_colab_results_fills_text_and_reparses(db, tmp_path):
    doc = OutlineDocument(sha256="b" * 64, file_name="de-cuong.pdf", rel_path="2025/de-cuong.pdf", size_bytes=10,
                          text_status="pending", text=None)
    empty = OutlineDocument(sha256="c" * 64, file_name="rong.pdf", rel_path="2025/rong.pdf", size_bytes=10,
                            text_status="extracted", text="văn bản pdftotext có sẵn")
    db.add_all([doc, empty])
    db.commit()
    p = tmp_path / "outline_results.jsonl"
    rows = [
        {"file": "de-cuong.pdf", "pages": 2, "text": "Nội dung trích PyMuPDF", "tables": [SCHEDULE_TABLE]},
        {"file": "khong-co.pdf", "pages": 1, "text": "x", "tables": []},
        {"file": "rong.pdf", "pages": 1, "text": "bỏ qua vì đã có văn bản", "tables": []},
    ]
    p.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows), encoding="utf-8")

    stats = import_colab_results(db, p, tmp_path)
    assert stats["matched"] == 2 and stats["unmatched"] == 1
    assert stats["text_filled"] == 1 and stats["tables_found"] == 1
    assert stats["not_in_colab"] == 0

    db.refresh(doc)
    assert doc.text == "Nội dung trích PyMuPDF" and doc.text_method == "pymupdf_colab" and doc.text_status == "extracted"
    db.refresh(empty)
    assert empty.text == "văn bản pdftotext có sẵn"
    row = db.query(OutlineCourse).filter_by(document_id=doc.id).one()
    assert row.parse_method == "rules-5"
