from app.rag.service import RegulationService
from app.rag.user_context import ChatContext, workspace_answer


def test_chat_introduces_itself_without_loading_regulations(client, monkeypatch):
    def fail():
        raise AssertionError("The introduction should not load regulations")

    monkeypatch.setattr("app.rag.router.get_service", fail)
    response = client.post("/api/regulations/ask", json={"question": "Bạn là ai?", "cohort": "K26"})
    assert response.status_code == 200
    data = response.json()
    assert data["found"] and data["mode"] == "intro" and "trợ lý UELPATH" in data["answer"]
    assert data["citations"] == [] and response.headers["Cache-Control"] == "no-store"


def test_chat_reads_timetable_summary_without_a_regulation_citation(client):
    response = client.post("/api/regulations/ask", json={
        "question": "Thời khóa biểu của tôi có bao nhiêu tín chỉ?",
        "cohort": "K26",
        "context": {"timetable": {"semester": "2026-2027-1", "modules": 3, "credits": 9}},
    })
    assert response.status_code == 200 and response.headers["Cache-Control"] == "no-store"
    answer = response.json()
    assert answer["mode"] == "context" and answer["found"]
    assert "9 tín chỉ" in answer["answer"] and answer["citations"] == []


def test_regulation_question_keeps_workspace_summary_separate(client, monkeypatch, index, today):
    monkeypatch.setattr("app.rag.router.get_service", lambda: RegulationService(index, today_fn=lambda: today))
    response = client.post("/api/regulations/ask", json={
        "question": "Thời khóa biểu của tôi được đăng ký tối đa bao nhiêu tín chỉ?",
        "cohort": "K22",
        "mode": "extractive",
        "context": {"timetable": {"semester": "2026-2027-1", "modules": 3, "credits": 9}},
    })
    assert response.status_code == 200
    answer = response.json()
    assert answer["mode"] == "extractive" and "9 tín chỉ" in answer["workspace_summary"]
    assert all("Phương án thời khóa biểu" not in cite["quote"] for cite in answer["citations"])


class _RecordingService:
    def __init__(self):
        self.calls = []

    def ask(self, question, *args, **kwargs):
        self.calls.append((question, kwargs.get("previous")))
        return {"answer": "x", "citations": [], "warnings": [], "mode": "llm", "found": True}


def test_previous_questions_reach_the_service_and_are_capped(client, monkeypatch):
    service = _RecordingService()
    monkeypatch.setattr("app.rag.router.get_service", lambda: service)
    body = {"question": "Còn học kỳ hè thì sao?", "cohort": "K26", "previous": ["Tối đa bao nhiêu tín chỉ một học kỳ?"]}
    assert client.post("/api/regulations/ask", json=body).status_code == 200
    assert service.calls == [("Còn học kỳ hè thì sao?", ["Tối đa bao nhiêu tín chỉ một học kỳ?"])]
    assert client.post("/api/regulations/ask", json=body | {"previous": ["a", "b", "c"]}).status_code == 422
    assert client.post("/api/regulations/ask", json=body | {"previous": ["x" * 501]}).status_code == 422


def test_followup_cues():
    from app.rag.intent import followup_cue, maybe_elliptical, with_context

    for q in ("Còn học kỳ hè thì sao?", "Vậy nó có được miễn học không?", "And what rating does 75 get?"):
        assert followup_cue(q), q
    assert not followup_cue("Điểm rèn luyện từ 80 đến 89 được xếp loại gì?")
    assert maybe_elliptical("Ai ghi biên bản?") and not maybe_elliptical(
        "Điều kiện xét học bổng khuyến khích học tập năm nhất là gì?")
    assert with_context("Còn hè?", ["a?", "b?", "c?"]) == "b? c? Còn hè?"


def test_chat_context_limits_and_supports_plan_and_theme(client):
    assert client.post("/api/regulations/ask", json={
        "question": "Tôi học chương trình nào?", "context": {"program_ids": ["K264091234"]},
    }).status_code == 422
    context = ChatContext.model_validate({
        "program_ids": ["K26409E", "K25406"], "theme": "dark",
        "planner": {"terms": 2, "modules": 7, "backlog": 4},
    })
    assert context.study_profile("K26") == {"program_ids": ["K26409E"]}
    assert "7 học phần" in workspace_answer("Kế hoạch của tôi có bao nhiêu môn?", "K26", context)[0]
    assert "chế độ Tối" in workspace_answer("Giao diện hiện tại của tôi là gì?", "K26", context)[0]
    assert workspace_answer("Kế hoạch của tôi thi lúc nào?", "K26", context) == (None, None)
