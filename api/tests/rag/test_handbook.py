import json

import pytest
from sqlalchemy import create_engine

from app.db import Base
from app.rag.answer import answer_extractive, answer_llm, retrieve, verify_llm_output
from app.rag.handbook import MAX_CHUNK_CHARS, SOURCE_LABEL, SUMMARY_WARNING, build_handbook_chunks
from app.rag.loader import load_document
from app.rag.models import RegulationDoc
from app.rag.pipeline import build_index
from app.rag.providers import LLMProvider
from app.rag.service import RegulationService
from app.rag.storage import load_db_index, publish_index


def test_uppercase_certificate_scores_remain_quotable():
    doc = RegulationDoc(doc_id="handbook", title="Sổ tay K26", source_type="handbook", applies_to_cohorts=["K26"])
    chunks = build_handbook_chunks(doc, [(35, "CHUẨN NGOẠI NGỮ\nIELTS (*) 5.0 6.0\nTOEIC 550 785")])
    assert len(chunks) == 1
    assert chunks[0].heading == "CHUẨN NGOẠI NGỮ"
    assert "IELTS (*) 5.0 6.0" in chunks[0].text and "TOEIC 550 785" in chunks[0].text


QUESTION = "Báo mất thẻ ký túc xá"
SUMMARY_TEXT = "Nếu làm mất thẻ ký túc xá, sinh viên báo tại quầy tiếp nhận."
OFFICIAL_TEXT = "1. Sinh viên làm mất thẻ ký túc xá phải báo tại văn phòng quản lý."


@pytest.fixture
def handbook_corpus(tmp_path, today):
    manual = tmp_path / "manual"
    manual.mkdir()
    catalog = []
    for cohort in ("K24", "K25", "K26"):
        doc_id = f"sotay-{cohort.lower()}"
        filename = f"{doc_id}.txt"
        catalog.append({"doc_id": doc_id, "source_type": "handbook", "file": f"manual/{filename}",
                        "applies_to_cohorts": [cohort], "verified": False})
        (manual / filename).write_text(f"=== Trang 8 ===\nKÝ TÚC XÁ\n{SUMMARY_TEXT}",
                                       encoding="utf-8")
    # An ordinary file with well-formed text must still yield to the approved OCR transcript.
    (tmp_path / "original.txt").write_text("Điều 9. Cách cũ\n1. Mất thẻ ký túc xá báo cho lớp.", encoding="utf-8")
    (manual / "quy-che.txt").write_text(
        f"=== Trang 3 ===\nĐiều 1. Thẻ nội trú\n{OFFICIAL_TEXT}\n"
        "2. Sinh viên báo mất thẻ ký túc xá cho quản lý.\n"
        "3. Báo mất thẻ ký túc xá trong giờ hành chính.", encoding="utf-8"
    )
    catalog.append({"doc_id": "quy-che", "file": "original.txt", "applies_to_cohorts": ["K25"],
                    "ocr_transcript": True})
    (tmp_path / "catalog.json").write_text(json.dumps(catalog), encoding="utf-8")
    return build_index(tmp_path, today)


def test_handbook_chunking_keeps_headings_pages_and_stable_ids(tmp_path):
    file = tmp_path / "handbook.txt"
    body = "Đoạn văn về điều kiện xét học bổng sinh viên. " * 59
    file.write_text(f"=== Trang 5 ===\nChương II. HỖ TRỢ\n\nHỌC BỔNG\n{body}\n"
                    "=== Trang 9 ===\nSinh viên xem thông báo tại MyUEL.\n", encoding="utf-8")
    pages = load_document(file).pages
    doc = RegulationDoc("sotay-k25", "Sổ tay sinh viên K25", source_type="handbook")
    chunks = build_handbook_chunks(doc, pages)
    assert len(chunks) >= 4
    assert {c.page for c in chunks} == {5, 9}
    assert {c.heading for c in chunks} == {"HỌC BỔNG"}
    assert {c.chapter for c in chunks} == {"Chương II. HỖ TRỢ"}
    assert all(c.article is None and c.clause is None and len(c.text) <= MAX_CHUNK_CHARS for c in chunks)
    assert len({c.chunk_id for c in chunks}) == len(chunks)
    assert chunks == build_handbook_chunks(doc, pages)
    assert chunks[-1].chunk_id == "sotay-k25:trang-9-muc-1"


@pytest.mark.parametrize("cohort", ["K24", "K25", "K26"])
def test_handbook_retrieval_uses_cohort_in_question_or_request(handbook_corpus, today, cohort):
    index, _ = handbook_corpus
    expected = f"sotay-{cohort.lower()}"
    for query, requested in [(QUESTION, cohort), (f"{cohort}: {QUESTION}", None)]:
        result = retrieve(index, query, requested, today)
        assert {h.chunk.doc_id for h in result.hits if h.chunk.source_type == "handbook"} == {expected}


def test_official_ocr_precedes_labeled_handbook_and_sql_keeps_anchor(handbook_corpus, today):
    index, report = handbook_corpus
    assert not report.errors
    assert index.docs_by_id["quy-che"].indexed
    official = next(c for c in index.chunks if c.doc_id == "quy-che")
    assert official.text == OFFICIAL_TEXT and official.article == "1" and official.page == 3

    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    publish_index(engine, index)
    restored = load_db_index(engine)
    result = answer_extractive(restored, QUESTION, "K25", today)
    [primary] = result["citations"]
    second, summary = result["related"]
    assert primary["doc_id"] == second["doc_id"] == "quy-che"
    assert primary["quote"] in restored.chunk_by_id[primary["chunk_id"]].text
    assert summary["page"] == 8 and summary["article"] is None
    assert summary["label"] == "Sổ tay SV K25, tr. 8 — KÝ TÚC XÁ"
    assert summary["source_type"] == "handbook" and "quote" not in summary
    assert f"{SOURCE_LABEL} — {summary['label']}" in result["answer"]
    reader = RegulationService(restored).markdown("sotay-k25")["markdown"]
    assert f"^{summary['anchor']}" in reader
    assert SUMMARY_WARNING not in result["warnings"]


class HandbookProvider(LLMProvider):
    name = "mock-handbook"

    def generate(self, system, prompt):
        data = json.loads(prompt)
        source = next(c for c in data["context"] if c["chunk_id"].startswith("sotay-"))
        return json.dumps({"answer": source["text"], "citations": [
            {"chunk_id": source["chunk_id"], "quote": source["text"]},
        ]})


def test_handbook_only_warns_and_llm_checks_verbatim(handbook_corpus, today):
    index, _ = handbook_corpus
    for answer in (answer_extractive(index, QUESTION, "K26", today),
                   answer_llm(index, QUESTION, "K26", today, HandbookProvider())):
        assert answer["found"]
        assert SUMMARY_WARNING in answer["warnings"]
        assert answer["citations"][0]["quote"] == SUMMARY_TEXT
    hits = retrieve(index, QUESTION, "K26", today).hits
    key = hits[0].chunk.chunk_id
    invalid = json.dumps({"answer": "Bịa nguồn", "citations": [{"chunk_id": key, "quote": "báo tại thư viện"}]})
    assert not verify_llm_output(invalid, hits)[0]
    mixed = answer_llm(index, QUESTION, "K25", today, HandbookProvider())
    assert mixed["citations"][0]["doc_id"] == "quy-che" and mixed["llm_fallback"]
