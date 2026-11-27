from __future__ import annotations

from datetime import datetime, timedelta, timezone
from app.config import get_settings
from app.models import Feedback, Module, Review, User


def test_admin_feedback_requires_admin(client, monkeypatch):
    """Khi ADMIN_DEV_OPEN=false và không có phiên: endpoint trả 404."""
    settings = get_settings()
    monkeypatch.setattr(settings, "admin_dev_open", False)
    monkeypatch.setattr(settings, "env", "development")

    assert client.get("/api/admin/feedback-summary").status_code == 404
    assert client.get("/api/admin/feedback/1").status_code == 404


def test_admin_feedback_summary_empty_db(client, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "admin_dev_open", True)
    monkeypatch.setattr(settings, "env", "development")

    res = client.get("/api/admin/feedback-summary")
    assert res.status_code == 200
    data = res.json()
    assert data["feedback_stats"] == {
        "total": 0,
        "average_rating": None,
        "rating_distribution": {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0},
    }
    assert data["reviews_stats"] == {
        "total": 0,
        "average_rating": None,
        "by_module": [],
    }
    assert data["items"] == []
    assert data["total"] == 0
    assert data["page"] == 1
    assert data["size"] == 20


def test_admin_feedback_summary_and_detail(client, monkeypatch, db):
    settings = get_settings()
    monkeypatch.setattr(settings, "admin_dev_open", True)
    monkeypatch.setattr(settings, "env", "development")

    now = datetime.now(timezone.utc)
    # 3 feedback records: 2 with text message, 1 quick rating without message
    fb1 = Feedback(
        page="/search",
        rating=5,
        category="ux",
        message="Giao diện tìm kiếm rất nhanh và dễ dùng.",
        app_version="1.2.0",
        contact="sv1@uel.edu.vn",
        created_at=now - timedelta(hours=2),
    )
    fb2 = Feedback(
        page="/timetable",
        rating=3,
        category="bug",
        message="Thỉnh thoảng bị chậm khi xếp nhiều lớp.",
        app_version="1.2.0",
        created_at=now - timedelta(hours=1),
    )
    fb3 = Feedback(
        page="/",
        rating=4,
        category="quick",
        message="",
        is_quick_rating=True,
        created_at=now,
    )
    db.add_all([fb1, fb2, fb3])

    user = User(provider="google", subject="fb-test-u1", display_name="SV 1")
    mod1 = Module(code="BIM5001", name="Cơ sở dữ liệu", credits=3)
    mod2 = Module(code="ACC1001", name="Nguyên lý kế toán", credits=3)
    db.add_all([user, mod1, mod2])
    db.flush()

    db.add_all([
        Review(module_code="BIM5001", user_id=user.id, rating=5, content="Rất hay"),
        Review(module_code="BIM5001", user_id=user.id, rating=4, content="Khá ổn"),
        Review(module_code="ACC1001", user_id=user.id, rating=3, content="Bình thường"),
    ])
    db.commit()

    # 1. Summary without filter
    res = client.get("/api/admin/feedback-summary?page=1&size=1")
    assert res.status_code == 200
    data = res.json()

    # (a) Feedback stats include all 3 ratings: (5 + 3 + 4) / 3 = 4.0
    assert data["feedback_stats"]["total"] == 3
    assert data["feedback_stats"]["average_rating"] == 4.0
    assert data["feedback_stats"]["rating_distribution"] == {
        "1": 0,
        "2": 0,
        "3": 1,
        "4": 1,
        "5": 1,
    }

    # (b) Reviews stats: 3 reviews -> (5 + 4 + 3) / 3 = 4.0
    assert data["reviews_stats"]["total"] == 3
    assert data["reviews_stats"]["average_rating"] == 4.0
    by_mod = {m["module_code"]: m for m in data["reviews_stats"]["by_module"]}
    assert by_mod["BIM5001"]["count"] == 2
    assert by_mod["BIM5001"]["average_rating"] == 4.5
    assert by_mod["BIM5001"]["module_name"] == "Cơ sở dữ liệu"
    assert by_mod["ACC1001"]["count"] == 1
    assert by_mod["ACC1001"]["average_rating"] == 3.0

    # (c) Text feedback only (2 items), paginated size=1, newest first (fb2)
    assert data["total"] == 2
    assert len(data["items"]) == 1
    assert data["items"][0]["id"] == fb2.id
    assert data["items"][0]["page"] == "/timetable"
    assert data["items"][0]["app_version"] == "1.2.0"

    # Page 2 -> fb1
    res_p2 = client.get("/api/admin/feedback-summary?page=2&size=1")
    assert res_p2.status_code == 200
    assert res_p2.json()["items"][0]["id"] == fb1.id

    # Filter by rating=5 -> only fb1
    res_r5 = client.get("/api/admin/feedback-summary?rating=5")
    assert res_r5.status_code == 200
    r5_data = res_r5.json()
    assert r5_data["total"] == 1
    assert r5_data["items"][0]["id"] == fb1.id

    # 2. Detail endpoint
    detail_res = client.get(f"/api/admin/feedback/{fb1.id}")
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["id"] == fb1.id
    assert detail["message"] == "Giao diện tìm kiếm rất nhanh và dễ dùng."
    assert detail["contact"] == "sv1@uel.edu.vn"
    assert detail["app_version"] == "1.2.0"

    # Non-existent feedback id -> 404
    assert client.get("/api/admin/feedback/999999").status_code == 404
