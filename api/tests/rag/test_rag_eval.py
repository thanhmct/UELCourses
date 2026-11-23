import runpy
from pathlib import Path


EVAL = runpy.run_path(str(Path(__file__).parent / "eval" / "run_eval.py"))
matches = EVAL["_matches"]


def test_metric_accepts_point_inside_clause_and_clause_for_point_chunk():
    expected_point = {
        "doc_id": "qd", "article": "22", "clause": "1", "point": "e", "evidence": "không ít hơn 2/3",
    }
    clause = {
        "doc_id": "qd", "article": "22", "clause": "1", "point": None, "page": 7,
        "text": "1. Khối lượng đăng ký\ne) không ít hơn 2/3 số tín chỉ", "points": [{"point": "e"}],
    }
    assert matches(expected_point, clause)
    assert matches({"doc_id": "qd", "article": "22", "clause": "1"}, clause | {"point": "e"})


def test_handbook_metric_requires_exact_page_or_evidence():
    expected = {"doc_id": "st", "page": 63, "evidence": "Hotline: 1900.05.55.59"}
    assert matches(expected, {"doc_id": "st", "page": 63, "text": "mục khác"})
    assert matches(expected, {"doc_id": "st", "page": 64, "text": "Hotline: 1900.05.55.59"})
    assert not matches(expected, {"doc_id": "st", "page": 64, "text": "mục khác"})
