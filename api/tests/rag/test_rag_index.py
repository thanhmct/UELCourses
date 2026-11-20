from app.rag.index import BM25, RagIndex
from app.rag.textnorm import features, strip_accents


def test_features_accent_insensitive():
    assert strip_accents("Đăng ký học phần") == "Dang ky hoc phan"
    f_doc = features("Đăng ký học phần")
    assert "đăng_ký" in f_doc and "~dang_ky" in f_doc
    f_q = features("dang ky hoc phan", query=True)
    assert "~dang_ky" in f_q and "dang_ky" not in f_q
    assert set(f_q) <= set(f_doc)


def test_bm25_basic():
    bm = BM25(["điều kiện tốt nghiệp", "học phí và miễn giảm học phí", "đăng ký học phần"])
    s = bm.scores("hoc phi")
    assert max(s, key=s.get) == 1
    assert bm.coverage("học phí", 1) == 1.0
    assert bm.coverage("ký túc xá", 1) == 0.0


def test_search_accentless_and_filter(index):
    hits = index.search("toi da bao nhieu tin chi", top_k=3, doc_ids=["QC-DT-2023-MAU"])
    assert hits and all(h.chunk.doc_id == "QC-DT-2023-MAU" for h in hits)
    assert hits[0].chunk.chunk_id == "QC-DT-2023-MAU:D5:K3"
    assert index.search("anything", doc_ids=["nope"]) == []


def test_save_load_roundtrip(index, tmp_path):
    index.save(tmp_path / "idx")
    assert RagIndex.exists(tmp_path / "idx")
    loaded = RagIndex.load(tmp_path / "idx")
    assert len(loaded.chunks) == len(index.chunks)
    assert loaded.docs_by_id["QC-DT-2021-MAU"].decision_no == "1001/QĐ-ĐHKTL"
    q = "học cải thiện điểm tối đa mấy lần"
    assert [h.chunk.chunk_id for h in loaded.search(q, 3)] == [h.chunk.chunk_id for h in index.search(q, 3)]
    assert "QC-DT-2021-MAU" in loaded.articles
