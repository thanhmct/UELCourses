import json

from app.rag.answer import REFUSAL, answer_extractive, answer_llm, verify_llm_output, retrieve
from app.rag.providers import ClaudeProvider, LLMProvider, NoneProvider, OllamaProvider, ProviderError, get_provider
from app.rag.verify import best_match, is_verbatim


def test_extractive_format_and_citation(index, today):
    r = answer_extractive(index, "Sinh viên phải đăng ký tối thiểu bao nhiêu tín chỉ trong học kỳ chính?", "K22", today)
    assert r["found"] and r["mode"] == "extractive"
    c = r["citations"][0]
    assert (c["doc_id"], c["article"], c["clause"]) == ("QC-DT-2021-MAU", "5", "2")
    assert c["decision_no"] == "1001/QĐ-ĐHKTL" and c["status"] == "active"
    assert c["anchor"] == "dieu-5-khoan-2"
    assert c["wikilink"].startswith("[[QC-DT-2021-MAU#^dieu-5-khoan-2|Khoản 2 Điều 5")
    assert r["answer"].startswith("Theo Khoản 2 Điều 5 ")
    assert "Quyết định số 1001/QĐ-ĐHKTL ngày 15/07/2021" in r["answer"]
    assert f"«{c['quote']}»" in r["answer"]
    assert c["quote"] in index.chunk_by_id[c["chunk_id"]].text  # verbatim


def test_cohort_changes_answer(index, today):
    q = "Mỗi học phần được học cải thiện điểm tối đa mấy lần?"
    a = answer_extractive(index, q, "K21", today)["citations"][0]
    b = answer_extractive(index, q, "2025", today)["citations"][0]  # K25: covered by "từ K23 trở về sau"
    assert a["doc_id"] == "QC-DT-2021-MAU" and "2 lần" in a["quote"]
    assert b["doc_id"] == "QC-DT-2023-MAU" and "1 lần" in b["quote"]


def test_refusal_when_no_source(index, today):
    for q in ("Thủ tục đăng ký ở ký túc xá như thế nào?", "Mật khẩu wifi của trường là gì?", ""):
        r = answer_extractive(index, q, "K22", today)
        assert not r["found"] and r["answer"] == REFUSAL and r["citations"] == []


def test_old_cohort_uses_superseded_doc_with_warning(index, today):
    r = answer_extractive(index, "Sinh viên phải đăng ký tối thiểu bao nhiêu tín chỉ mỗi học kỳ?", "K18", today)
    assert r["found"]
    assert r["citations"][0]["doc_id"] == "QC-DT-2015-MAU"
    assert r["citations"][0]["status"] == "superseded"
    assert any("đã bị thay thế" in w for w in r["warnings"])


def test_expiring_warning_on_citation(index, today):
    r = answer_extractive(index, "Những chứng chỉ tiếng Anh quốc tế nào được công nhận?", "K22", today)
    assert r["citations"][0]["doc_id"] == "QD-CDR-NN-TH-MAU"
    assert any("sắp hết hiệu lực" in w for w in r["warnings"])


def test_no_cohort_warning(index, today):
    r = answer_extractive(index, "Học cải thiện điểm tối đa mấy lần?", None, today)
    assert any("chưa chọn khóa" in w for w in r["warnings"])


def test_point_selection(index, today):
    r = answer_extractive(index, "Chứng chỉ IELTS do đơn vị nào cấp thì được công nhận?", "K22", today)
    c = r["citations"][0]
    assert (c["article"], c["clause"], c["point"]) == ("3", "1", "b")
    assert c["quote"].startswith("b) IELTS")
    assert c["anchor"] == "dieu-3-khoan-1-diem-b"
    assert r["answer"].startswith("Theo Điểm b Khoản 1 Điều 3")


def test_unverified_metadata_warning(fresh_index, today):
    fresh_index.docs_by_id["QC-DT-2021-MAU"].verified = False
    r = answer_extractive(fresh_index, "Học cải thiện điểm tối đa mấy lần?", "K22", today)
    assert any("metadata chưa được xác minh" in w for w in r["warnings"])


# ------------------------------------------------------------------ LLM ---
class FakeProvider(LLMProvider):
    name = "fake"

    def __init__(self, fn):
        self.fn = fn
        self.calls = 0

    def generate(self, system, prompt):
        self.calls += 1
        assert "CHỈ được dùng" in system and "chunk_id" in prompt
        return self.fn(prompt)


Q = "Mỗi học phần được học cải thiện điểm tối đa mấy lần?"
CID = "QC-DT-2021-MAU:D10:K2"


def test_llm_valid_answer_passes_postcheck(index, today):
    out = json.dumps({"answer": "Tối đa 2 lần (Khoản 2 Điều 10).",
                      "citations": [{"chunk_id": CID, "quote": "Mỗi học phần chỉ được học cải thiện điểm tối đa 2 lần"}]},
                     ensure_ascii=False)
    r = answer_llm(index, Q, "K22", today, FakeProvider(lambda p: out))
    assert r["mode"] == "llm" and r["provider"] == "fake"
    assert r["citations"][0]["chunk_id"] == CID and r["citations"][0]["match_ratio"] == 1.0


def test_llm_near_verbatim_quote_accepted(index, today):
    out = json.dumps({"answer": "2 lần", "citations": [
        {"chunk_id": CID, "quote": "Mỗi học phần chỉ được học cải thiện điểm tối đa 2 lần."}]}, ensure_ascii=False)
    assert answer_llm(index, Q, "K22", today, FakeProvider(lambda p: "```json\n" + out + "\n```"))["mode"] == "llm"


def test_llm_fabricated_quote_falls_back(index, today):
    out = json.dumps({"answer": "Được học cải thiện không giới hạn số lần.",
                      "citations": [{"chunk_id": CID, "quote": "Sinh viên được học cải thiện không giới hạn số lần"}]},
                     ensure_ascii=False)
    r = answer_llm(index, Q, "K22", today, FakeProvider(lambda p: out))
    assert r["mode"] == "extractive" and r["llm_fallback"] is True
    assert "không khớp nguyên văn" in r["fallback_reason"]
    assert r["citations"][0]["chunk_id"] == CID


def test_llm_unknown_chunk_or_bad_json_or_no_citation(index, today):
    bad = [
        json.dumps({"answer": "x", "citations": [{"chunk_id": "BIA:D1", "quote": "abc"}]}),
        "Tôi nghĩ là 3 lần.",
        json.dumps({"answer": "2 lần", "citations": []}),
        json.dumps({"answer": "Theo quy chế: «được học lại vô hạn lần trong mọi trường hợp»",
                    "citations": [{"chunk_id": CID, "quote": "Mỗi học phần chỉ được học cải thiện điểm tối đa 2 lần"}]},
                   ensure_ascii=False),
    ]
    for out in bad:
        r = answer_llm(index, Q, "K22", today, FakeProvider(lambda p, o=out: o))
        assert r["mode"] == "extractive" and r["llm_fallback"], out


def test_llm_not_called_when_nothing_retrieved(index, today):
    fp = FakeProvider(lambda p: "{}")
    r = answer_llm(index, "Mật khẩu wifi của trường là gì?", None, today, fp)
    assert not r["found"] and fp.calls == 0


def test_llm_provider_unavailable_or_error(index, today):
    r = answer_llm(index, Q, "K22", today, NoneProvider())
    assert r["mode"] == "extractive" and r["fallback_reason"] == "provider_unavailable"

    def boom(p):
        raise ProviderError("timeout")

    r = answer_llm(index, Q, "K22", today, FakeProvider(boom))
    assert r["fallback_reason"] == "provider_error"


def test_get_provider_env(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    monkeypatch.setenv("OLLAMA_URL", "http://ollama:11434/")
    p = get_provider()
    assert isinstance(p, OllamaProvider) and p.url == "http://ollama:11434"
    monkeypatch.setenv("LLM_PROVIDER", "claude")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    c = get_provider()
    assert isinstance(c, ClaudeProvider) and c.model == "claude-sonnet-5-5" and not c.available()
    monkeypatch.delenv("LLM_PROVIDER")
    assert isinstance(get_provider(), NoneProvider)


def test_claude_provider_with_fake_client():
    class Block:
        type, text = "text", '{"answer": "ok", "citations": []}'

    class Msgs:
        def create(self, **kw):
            assert kw["model"] == "claude-sonnet-5-5" and kw["messages"][0]["role"] == "user"
            return type("M", (), {"content": [Block()]})()

    p = ClaudeProvider(api_key="test", client=type("C", (), {"messages": Msgs()})())
    assert json.loads(p.generate("sys", "prompt"))["answer"] == "ok"


def test_verify_helpers(index, today):
    text = index.chunk_by_id[CID].text
    assert best_match("mỗi học phần chỉ được học cải thiện điểm", text)[0] == 1.0
    assert is_verbatim("Mỗi học phần chỉ đươc học cải thiện điểm tối đa 2 lần", text)  # 1 typo
    assert not is_verbatim("Sinh viên được miễn học phí", text)
    rr = retrieve(index, Q, "K22", today)
    ok, _, verified, _ = verify_llm_output(json.dumps({"answer": "a", "citations": [
        {"chunk_id": CID, "quote": "tối đa 2 lần"}]}), rr.confident)
    assert ok and verified[0][1] == "tối đa 2 lần"
