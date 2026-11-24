from __future__ import annotations

from datetime import datetime, timedelta, timezone
import pytest
from app.config import get_settings
from app.models import AdminSetting, AnalyticsDaily, AnalyticsEvent, AnalyticsPair, ClassSection, Lesson, Module, RegulationDocument
from app.services.analytics import (
    aggregate_analytics,
    purge_analytics,
    reset_rate_limits,
)


@pytest.fixture(autouse=True)
def clean_rate_limits():
    reset_rate_limits()
    yield
    reset_rate_limits()


def test_post_analytics_events_valid_batch(client, db):
    """Tiếp nhận lô sự kiện hợp lệ và ghi vào analytics_events, trả về 204."""
    payload = {
        "anon_id": "11111111-1111-4111-8111-111111111111",
        "events": [
            {
                "type": "module_view",
                "module_code": "BIM5001",
                "page": "/modules/BIM5001",
            },
            {
                "type": "timetable_add",
                "module_code": "BIM5001",
                "class_code": "BIM5001_01",
                "semester_id": "2026-2027-1",
                "program_code": "K24414",
            },
        ],
    }

    res = client.post("/api/analytics/events", json=payload)
    assert res.status_code == 204

    events = db.query(AnalyticsEvent).all()
    assert len(events) == 2
    ev1 = [e for e in events if e.event_type == "module_view"][0]
    assert ev1.module_code == "BIM5001"
    assert ev1.anon_id == "11111111-1111-4111-8111-111111111111"

    ev2 = [e for e in events if e.event_type == "timetable_add"][0]
    assert ev2.class_code == "BIM5001_01"
    assert ev2.program_code == "K24414"
    assert ev2.semester_id == "2026-2027-1"


def test_post_analytics_filters_invalid_types_and_fields(client, db):
    """Bỏ qua type lạ và lọc dữ liệu sạch sẽ."""
    payload = {
        "anon_id": "22222222-2222-4222-8222-222222222222",
        "events": [
            {
                "type": "malicious_type",  # không thuộc ALLOWED_EVENT_TYPES -> bỏ qua
                "module_code": "TEST",
            },
            {
                "type": "planner_add",
                "module_code": "TOA1001",
                "unknown_extra_field": "some_data",
            },
        ],
    }

    res = client.post("/api/analytics/events", json=payload)
    assert res.status_code == 204

    events = db.query(AnalyticsEvent).filter(AnalyticsEvent.anon_id == "22222222-2222-4222-8222-222222222222").all()
    assert len(events) == 1
    assert events[0].event_type == "planner_add"
    assert events[0].module_code == "TOA1001"


def test_post_analytics_cuts_query_and_validates_program_code(client, db):
    """Cắt query tối đa 64 ký tự; chỉ nhận program_code khớp regex ^K\\d{2}\\d{3}[A-Z0-9]*$."""
    long_query = "a" * 100
    payload = {
        "anon_id": "33333333-3333-4333-8333-333333333333",
        "events": [
            {
                "type": "search_no_result",
                "query": long_query,
                "program_code": "INVALID_CODE",  # không khớp regex -> None
            },
            {
                "type": "program_set",
                "program_code": "K24404E",  # khớp regex -> giữ nguyên
            },
        ],
    }

    res = client.post("/api/analytics/events", json=payload)
    assert res.status_code == 204

    ev_search = db.query(AnalyticsEvent).filter(AnalyticsEvent.event_type == "search_no_result").first()
    assert ev_search is not None
    assert len(ev_search.query_text) == 64
    assert ev_search.program_code is None

    ev_prog = db.query(AnalyticsEvent).filter(AnalyticsEvent.event_type == "program_set").first()
    assert ev_prog is not None
    assert ev_prog.program_code == "K24404E"


def test_post_analytics_rate_limit_429(client):
    """Vượt quá 10 sự kiện/giây trên cùng 1 anon_id sẽ trả 429."""
    anon_id = "44444444-4444-4444-8444-444444444444"
    # Gửi 10 sự kiện -> thành công (204)
    res1 = client.post("/api/analytics/events", json={
        "anon_id": anon_id,
        "events": [{"type": "module_view", "module_code": f"M{i}"} for i in range(10)],
    })
    assert res1.status_code == 204

    # Gửi thêm ngay lập tức -> ném 429
    res2 = client.post("/api/analytics/events", json={
        "anon_id": anon_id,
        "events": [{"type": "module_view", "module_code": "M_EXTRA"}],
    })
    assert res2.status_code == 429
    assert "tối đa 10 sự kiện/giây" in res2.json()["detail"]


def test_post_analytics_disabled_ignored(client, monkeypatch, db):
    """Khi analytics_enabled=False: endpoint trả 204 nhưng không lưu gì vào DB."""
    settings = get_settings()
    monkeypatch.setattr(settings, "analytics_enabled", False)

    res = client.post("/api/analytics/events", json={
        "anon_id": "55555555-5555-4555-8555-555555555555",
        "events": [{"type": "module_view", "module_code": "BIM5001"}],
    })
    assert res.status_code == 204

    count = db.query(AnalyticsEvent).filter(AnalyticsEvent.anon_id == "55555555-5555-4555-8555-555555555555").count()
    assert count == 0


def test_aggregate_analytics_idempotent_and_pairs(db):
    """CLI aggregate-analytics tính đúng cặp môn TKB và bảo đảm tính idempotent."""
    sem = "2026-2027-1"
    # 3 sinh viên cùng thêm các môn:
    # anon_1: [M1, M2, M3] -> pairs: (M1, M2), (M1, M3), (M2, M3)
    # anon_2: [M1, M2]     -> pair:  (M1, M2)
    # anon_3: [M1, M3]     -> pair:  (M1, M3)
    events = [
        AnalyticsEvent(anon_id="u1", event_type="timetable_add", module_code="M1", semester_id=sem),
        AnalyticsEvent(anon_id="u1", event_type="timetable_add", module_code="M2", semester_id=sem),
        AnalyticsEvent(anon_id="u1", event_type="timetable_add", module_code="M3", semester_id=sem),
        AnalyticsEvent(anon_id="u2", event_type="timetable_add", module_code="M1", semester_id=sem),
        AnalyticsEvent(anon_id="u2", event_type="timetable_add", module_code="M2", semester_id=sem),
        AnalyticsEvent(anon_id="u3", event_type="timetable_add", module_code="M1", semester_id=sem),
        AnalyticsEvent(anon_id="u3", event_type="timetable_add", module_code="M3", semester_id=sem),
    ]
    db.add_all(events)
    db.commit()

    # Lần chạy 1
    res1 = aggregate_analytics(db)
    assert res1["pair_rows"] == 3

    p12 = db.query(AnalyticsPair).filter(AnalyticsPair.module_a == "M1", AnalyticsPair.module_b == "M2").first()
    assert p12 is not None and p12.count == 2

    p13 = db.query(AnalyticsPair).filter(AnalyticsPair.module_a == "M1", AnalyticsPair.module_b == "M3").first()
    assert p13 is not None and p13.count == 2

    p23 = db.query(AnalyticsPair).filter(AnalyticsPair.module_a == "M2", AnalyticsPair.module_b == "M3").first()
    assert p23 is not None and p23.count == 1

    # Lần chạy 2 (idempotent): kết quả không bị cộng dồn
    res2 = aggregate_analytics(db)
    assert res2["pair_rows"] == 3
    p12_again = db.query(AnalyticsPair).filter(AnalyticsPair.module_a == "M1", AnalyticsPair.module_b == "M2").first()
    assert p12_again.count == 2


def test_k_anonymity_and_trends_endpoints(client, monkeypatch, db):
    """Kiểm tra k-anonymity (nhóm <5 ẩn thành '<5') và các endpoint /api/admin/trends/*."""
    settings = get_settings()
    monkeypatch.setattr(settings, "admin_dev_open", True)
    monkeypatch.setattr(settings, "env", "development")

    sem = "2026-2027-1"

    # Thêm module mẫu
    db.add(Module(code="M_POPULAR", name="Môn Rất Đông", credits=3))
    db.add(Module(code="M_RARE", name="Môn Rất Ít", credits=3))

    # M_POPULAR: 6 anon khác nhau thêm vào TKB (>= 5 -> hiện số thật)
    for i in range(6):
        db.add(AnalyticsEvent(
            anon_id=f"anon_pop_{i}",
            event_type="timetable_add",
            module_code="M_POPULAR",
            semester_id=sem,
        ))

    # M_RARE: 2 anon thêm vào TKB (< 5 -> k-anonymity '<5')
    for i in range(2):
        db.add(AnalyticsEvent(
            anon_id=f"anon_rare_{i}",
            event_type="timetable_add",
            module_code="M_RARE",
            semester_id=sem,
        ))

    # Thêm 2 sự kiện search_no_result
    db.add(AnalyticsEvent(anon_id="s1", event_type="search_no_result", query_text="machine learning"))
    db.add(AnalyticsEvent(anon_id="s2", event_type="search_no_result", query_text="machine learning"))

    db.commit()

    # 1. /api/admin/trends/modules
    res = client.get(f"/api/admin/trends/modules?semester={sem}")
    assert res.status_code == 200
    mods = res.json()["modules"]
    pop_mod = [m for m in mods if m["module_code"] == "M_POPULAR"][0]
    assert pop_mod["timetable_adds"] == 6
    assert pop_mod["anonymized"] is False

    rare_mod = [m for m in mods if m["module_code"] == "M_RARE"][0]
    assert rare_mod["timetable_adds"] == "<5"
    assert rare_mod["anonymized"] is True

    # 2. Xuất CSV /api/admin/trends/modules?format=csv
    res_csv = client.get(f"/api/admin/trends/modules?semester={sem}&format=csv")
    assert res_csv.status_code == 200
    assert res_csv.headers["content-type"].startswith("text/csv")
    assert "Mã môn" in res_csv.text
    assert "M_POPULAR" in res_csv.text
    assert "<5" in res_csv.text

    # 3. /api/admin/trends/search
    res_search = client.get("/api/admin/trends/search")
    assert res_search.status_code == 200
    searches = res_search.json()["searches"]
    assert len(searches) >= 1
    assert searches[0]["query"] == "machine learning"
    assert searches[0]["count"] == "<5"  # 2 anon < 5
    assert searches[0]["anonymized"] is True


def test_trends_requires_admin_dev_open(client, monkeypatch):
    """Khi ADMIN_DEV_OPEN=False: endpoint trends trả về 404."""
    settings = get_settings()
    monkeypatch.setattr(settings, "admin_dev_open", False)

    res = client.get("/api/admin/trends/modules")
    assert res.status_code == 404

    res2 = client.get("/api/admin/trends/pairs")
    assert res2.status_code == 404


def test_chat_topics_aggregate_catalog_targets_without_storing_questions(client, db, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "env", "development")
    monkeypatch.setattr(settings, "admin_dev_open", False)
    path = "/api/admin/trends/chat-topics"
    assert client.get(path).status_code == 404

    doc_id = "uel-cvht-1912-2024"
    db.add_all([
        RegulationDocument(id=doc_id, title="Quy định công tác Cố vấn học tập"),
        Module(code="BBA4001", name="Quản trị chuỗi cung ứng"),
        Module(code="BBA4002", name="Học phần ẩn", is_hidden=True),
    ])
    db.commit()
    for i in range(5):
        response = client.post("/api/analytics/events", json={
            "anon_id": f"00000000-0000-4000-8000-{i:012d}",
            "events": [{"type": "chat_regulation", "query": doc_id, "filters": {"question": "Nội dung chat"}}],
        })
        assert response.status_code == 204

    payload = {
        "anon_id": "10000000-0000-4000-8000-000000000000",
        "events": [
            {"type": "chat_module", "module_code": "bba4001", "query": "Nội dung riêng của câu hỏi"},
            {"type": "chat_module", "module_code": "BBA4002"},
            {"type": "chat_regulation", "query": "Nội dung riêng của câu hỏi"},
        ],
    }
    assert client.post("/api/analytics/events", json=payload, headers={"DNT": "1"}).status_code == 204
    assert db.query(AnalyticsEvent).count() == 5
    assert client.post("/api/analytics/events", json=payload).status_code == 204
    rows = db.query(AnalyticsEvent).all()
    assert len(rows) == 8
    assert {row.query_text for row in rows} == {doc_id, None}
    assert {row.module_code for row in rows} == {"BBA4001", None}
    assert all(row.filters is None and row.page is None for row in rows)

    monkeypatch.setattr(settings, "admin_dev_open", True)
    response = client.get(path)
    assert response.status_code == 200
    topics = {(row["scope"], row["target"]): row for row in response.json()["topics"]}
    assert topics[("regulations", doc_id)]["count"] == 5
    assert topics[("modules", "BBA4001")]["count"] == "<5"
    assert topics[("regulations", None)]["title"] is None
    assert ("modules", "BBA4002") not in topics
    assert client.get(path, params={"from": "2000-01-01", "to": "2000-01-07"}).json() == {"topics": []}

    db.add(AdminSetting(key="analytics.enabled", value=False))
    db.commit()
    assert client.post("/api/analytics/events", json=payload).status_code == 204
    assert db.query(AnalyticsEvent).count() == 8


def test_purge_analytics(db):
    """purge_analytics xóa đúng các sự kiện cũ hơn retention_days."""
    now = datetime.now(timezone.utc)
    old_time = now - timedelta(days=200)

    # 2 sự kiện cũ (200 ngày trước)
    db.add(AnalyticsEvent(anon_id="old1", event_type="module_view", created_at=old_time))
    db.add(AnalyticsEvent(anon_id="old2", event_type="module_view", created_at=old_time))
    # 1 sự kiện mới (hôm nay)
    db.add(AnalyticsEvent(anon_id="new1", event_type="module_view", created_at=now))
    db.commit()

    deleted = purge_analytics(db, retention_days=180)
    assert deleted == 2

    remaining = db.query(AnalyticsEvent).all()
    assert len(remaining) == 1
    assert remaining[0].anon_id == "new1"
