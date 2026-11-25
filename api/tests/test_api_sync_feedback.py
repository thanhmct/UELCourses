import csv
import io
import logging

import httpx
import pytest
import respx

PORTAL = "https://portal.uel.edu.vn/backend/api/student/equivalentcourse"
TOKEN = "eyJhbGciOiJSUzI1NiJ9.test-token-value.signature"
ROWS = [{"MaMon": "ECO101", "TenMon": "Kinh tế vi mô", "STC": 3,
         "MaMonTuongDuong": "ECO100", "TenMonTuongDuong": "Kinh tế học", "STCTuongDuong": 3}]


@respx.mock(assert_all_mocked=True)
def test_sync_equivalents_uses_token_once_and_does_not_store(client, db, caplog, respx_mock):
    caplog.set_level(logging.DEBUG)
    route = respx_mock.get(PORTAL).mock(return_value=httpx.Response(200, json=ROWS))
    r = client.post("/api/sync/equivalents", json={"token": "Bearer " + TOKEN})
    assert r.status_code == 200, r.text
    assert r.json()["imported"] == 1
    assert route.call_count == 1
    assert route.calls[0].request.headers["Authorization"] == f"Bearer {TOKEN}"
    assert client.get("/api/equivalents/ECO101").json()["equivalents"][0]["code"] == "ECO100"
    # token không xuất hiện trong log
    assert TOKEN not in caplog.text
    # token không có trong DB
    from sqlalchemy import text

    for table in ("equivalents", "modules", "feedback"):
        for row in db.execute(text(f"SELECT * FROM {table}")):
            assert TOKEN not in " ".join(str(v) for v in row)


@respx.mock(assert_all_mocked=True)
def test_sync_wrapped_response(client, respx_mock):
    respx_mock.get(PORTAL).mock(return_value=httpx.Response(200, json={"Data": ROWS}))
    assert client.post("/api/sync/equivalents", json={"token": TOKEN}).json()["imported"] == 1


@pytest.mark.parametrize("status, expected", [(401, 401), (403, 401), (500, 502)])
@respx.mock(assert_all_mocked=True)
def test_sync_errors(client, respx_mock, status, expected):
    respx_mock.get(PORTAL).mock(return_value=httpx.Response(status))
    r = client.post("/api/sync/equivalents", json={"token": TOKEN})
    assert r.status_code == expected
    assert TOKEN not in r.text


@respx.mock(assert_all_mocked=True)
def test_sync_network_error(client, respx_mock, caplog):
    respx_mock.get(PORTAL).mock(side_effect=httpx.ConnectError("boom"))
    r = client.post("/api/sync/equivalents", json={"token": TOKEN})
    assert r.status_code == 502
    assert TOKEN not in r.text and TOKEN not in caplog.text


@respx.mock(assert_all_mocked=True)
def test_sync_bad_payload(client, respx_mock):
    respx_mock.get(PORTAL).mock(return_value=httpx.Response(200, text="<html>login</html>"))
    assert client.post("/api/sync/equivalents", json={"token": TOKEN}).status_code == 502


def test_sync_requires_token(client):
    assert client.post("/api/sync/equivalents", json={}).status_code == 422


# --------------------------------------------------------------------- feedback
def test_feedback_flow(client):
    payloads = [
        {"page": "/timetable", "rating": 5, "category": "praise", "message": "Rất tiện", "app_version": "0.1.0"},
        {"page": "/timetable", "rating": 3, "category": "bug", "message": "Kéo thả hơi chậm", "contact": "a@example.com"},
        {"page": "/modules", "rating": 4, "category": "idea", "message": "=HYPERLINK(\"x\")"},
    ]
    for p in payloads:
        r = client.post("/api/feedback", json=p)
        assert r.status_code == 201, r.text
        assert r.json()["id"] > 0
    stats = client.get("/api/feedback/stats").json()
    # Đúng dạng research/analysis/sample_feedback_stats.json
    assert {"total", "average_rating", "by_page", "by_category", "by_day", "items"} <= stats.keys()
    assert stats["total"] == 3
    assert stats["average_rating"] == 4.0
    assert stats["rating_distribution"] == {"1": 0, "2": 0, "3": 1, "4": 1, "5": 1}
    assert stats["by_page"] == [{"page": "/modules", "count": 1, "average_rating": 4.0},
                                {"page": "/timetable", "count": 2, "average_rating": 4.0}]
    assert stats["by_category"][0] == {"category": "bug", "count": 1, "average_rating": 3.0}
    assert len(stats["by_day"]) == 1 and set(stats["by_day"][0]) == {"date", "count"}
    assert stats["by_day"][0]["count"] == 3
    items = stats["items"]
    assert [i["id"] for i in items] == sorted(i["id"] for i in items) and len(items) == 3
    assert set(items[0]) == {"id", "created_at", "page", "rating", "category", "message", "app_version"}
    assert "a@example.com" not in str(stats)  # không lộ contact
    assert "+" not in items[0]["created_at"] and "Z" not in items[0]["created_at"]

    r = client.get("/api/feedback/export.csv")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    rows = list(csv.DictReader(io.StringIO(r.content.decode("utf-8-sig"))))
    assert len(rows) == 3 and "contact" not in rows[0]
    assert rows[2]["message"].startswith("'=")
    rows = list(csv.DictReader(io.StringIO(client.get("/api/feedback/export.csv", params={"include_contact": True}).content.decode("utf-8-sig"))))
    assert rows[1]["contact"] == "a@example.com"


@pytest.mark.parametrize("bad", [
    {"page": "/x", "rating": 0},
    {"page": "/x", "rating": 6},
    {"page": "", "rating": 3},
    {"page": "/x", "rating": 3, "message": "a" * 5001},
    {"rating": 3},
])
def test_feedback_validation(client, bad):
    assert client.post("/api/feedback", json=bad).status_code == 422


def test_feedback_stats_empty(client):
    s = client.get("/api/feedback/stats").json()
    assert s["total"] == 0 and s["average_rating"] is None and s["by_day"] == [] and s["items"] == []


def test_quick_rating_anonymous_and_satisfaction_status(client, db):
    from sqlalchemy import select
    from app.models import Feedback

    ip_a = {"X-Forwarded-For": "203.0.113.10"}
    ip_b = {"X-Forwarded-For": "203.0.113.11"}

    assert client.get("/api/feedback/satisfaction-status", headers=ip_a).json() == {"already_rated": False}

    # Normal feedback (quick_rating=False by default) must NOT store rater_ip_hash/account_id or block popup
    r_normal = client.post(
        "/api/feedback",
        json={"page": "/feedback", "rating": 4, "category": "feature", "message": "Góp ý thường"},
        headers=ip_a,
    )
    assert r_normal.status_code == 201, r_normal.text
    normal_row = db.scalar(select(Feedback).where(Feedback.id == r_normal.json()["id"]))
    assert normal_row is not None
    assert normal_row.is_quick_rating is False
    assert normal_row.rater_ip_hash is None
    assert normal_row.account_id is None
    assert client.get("/api/feedback/satisfaction-status", headers=ip_a).json() == {"already_rated": False}

    # Quick rating from ip_a (with empty message) stores is_quick_rating=True and hashed IP
    r_quick = client.post(
        "/api/feedback",
        json={
            "page": "/today",
            "rating": 5,
            "category": "other",
            "message": "",
            "quick_rating": True,
            "rater_ip_hash": "spoofed",
            "account_id": 999999,
        },
        headers=ip_a,
    )
    assert r_quick.status_code == 201, r_quick.text
    quick_row = db.scalar(select(Feedback).where(Feedback.id == r_quick.json()["id"]))
    assert quick_row is not None
    assert quick_row.is_quick_rating is True
    assert quick_row.rater_ip_hash is not None
    assert len(quick_row.rater_ip_hash) == 64
    assert quick_row.rater_ip_hash != "spoofed"
    assert "203.0.113.10" not in quick_row.rater_ip_hash
    assert quick_row.account_id is None

    assert client.get("/api/feedback/satisfaction-status", headers=ip_a).json() == {"already_rated": True}
    assert client.get("/api/feedback/satisfaction-status", headers=ip_b).json() == {"already_rated": False}


def test_quick_rating_authenticated_account_and_ip(client, db):
    from sqlalchemy import select
    from app.models import Feedback, User
    from app.services.auth import SESSION_COOKIE, make_session

    user1 = User(provider="google", subject="quick-rating-u1", display_name="SV Một")
    user2 = User(provider="google", subject="quick-rating-u2", display_name="SV Hai")
    db.add_all([user1, user2])
    db.commit()
    db.refresh(user1)
    db.refresh(user2)

    headers_ip1 = {"X-Forwarded-For": "198.51.100.1"}
    headers_ip2 = {"X-Forwarded-For": "198.51.100.2"}
    cookies_u1 = {SESSION_COOKIE: make_session(user1.id)}
    cookies_u2 = {SESSION_COOKIE: make_session(user2.id)}

    r = client.post(
        "/api/feedback",
        json={
            "page": "/settings",
            "rating": 2,
            "category": "ux",
            "message": "Chữ hơi nhỏ",
            "quick_rating": True,
        },
        headers=headers_ip1,
        cookies=cookies_u1,
    )
    assert r.status_code == 201, r.text
    row = db.scalar(select(Feedback).where(Feedback.id == r.json()["id"]))
    assert row is not None
    assert row.is_quick_rating is True
    assert row.account_id == user1.id
    assert row.rater_ip_hash is not None

    # Same user on a different IP -> already_rated=True
    assert (
        client.get("/api/feedback/satisfaction-status", headers=headers_ip2, cookies=cookies_u1).json()
        == {"already_rated": True}
    )
    # Different user on a different IP -> already_rated=False
    assert (
        client.get("/api/feedback/satisfaction-status", headers=headers_ip2, cookies=cookies_u2).json()
        == {"already_rated": False}
    )
    # Unauthenticated user on the same IP as submission -> already_rated=True
    assert client.get("/api/feedback/satisfaction-status", headers=headers_ip1).json() == {"already_rated": True}
    # Unauthenticated user on a different IP -> already_rated=False
    assert client.get("/api/feedback/satisfaction-status", headers=headers_ip2).json() == {"already_rated": False}
