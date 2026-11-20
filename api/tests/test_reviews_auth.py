import pytest

from app.models import Module, User
from app.services import auth as svc
from app.services.moderation import moderate

GOOD = "Môn học có nội dung thực tế, giảng viên giải thích rõ và bài tập nhóm hợp lý. Nên chuẩn bị kỹ trước khi thi."


@pytest.mark.parametrize("text,status", [
    (GOOD, "approved"),
    ("Môn này hơi khó, bài tập nhiều nhưng học được nhiều kiến thức thực tế.", "approved"),  # phê bình xây dựng: được phép
    ("Thầy này ngu quá, đúng là đồ ngu", "pending"),  # lăng mạ/công kích cá nhân
    ("Liên hệ zalo 0912345678 để mua tài liệu giá rẻ nhé", "pending"),  # quảng cáo + số điện thoại
    ("Mail mình: abc@gmail.com, inbox để nhận đề thi", "pending"),  # email/inbox
    ("Xem thêm tại https://example.com/abc để kiếm tiền online", "pending"),  # liên kết + spam
    ("Em sẽ giết thầy nếu không cho qua môn này", "pending"),  # đe dọa
])
def test_moderation_status(text, status):
    assert moderate(text).status == status


def test_moderation_reasons_are_reported():
    res = moderate("Liên hệ zalo 0912345678")
    assert "spam_advertising" in res.reasons and "personal_info" in res.reasons


def test_guidelines_endpoint(client):
    items = client.get("/api/reviews/guidelines").json()["items"]
    assert len(items) >= 5 and any("spam" in s.lower() for s in items)


def test_login_not_configured_returns_503(client, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "google_client_id", "")
    monkeypatch.setattr(get_settings(), "google_client_secret", "")
    assert client.get("/api/auth/google/login", follow_redirects=False).status_code == 503
    assert client.get("/api/auth/providers").json()["google"]["ready"] is False
    assert client.get("/api/auth/me").json() == {"user": None}


def test_callback_rejects_bad_state(client):
    r = client.get("/api/auth/google/callback?code=x&state=forged", follow_redirects=False)
    assert r.status_code == 302 and "login=error" in r.headers["location"]


def test_session_roundtrip_and_tamper():
    token = svc.make_session(7)
    assert svc.read_session(token) == 7
    assert svc.read_session(token[:-2] + "00") is None
    assert svc.read_session(None) is None


def _module(db, code="BAA4041"):
    if db.get(Module, code) is None:
        db.add(Module(code=code, name="Kế toán tài chính nâng cao 2", credits=3))
        db.commit()


def _login(client, db):
    u = User(provider="google", subject="abc123", display_name="Sinh viên K24")
    db.add(u)
    db.commit()
    client.cookies.set(svc.SESSION_COOKIE, svc.make_session(u.id))
    return u


def test_review_requires_login(client, db):
    _module(db)
    body = {"rating": 4, "content": GOOD}
    assert client.post("/api/modules/BAA4041/reviews", json=body).status_code == 401


def test_review_flow_publish_pending_and_one_per_user(client, db):
    _module(db)
    _login(client, db)
    ok = client.post("/api/modules/BAA4041/reviews", json={"rating": 4, "difficulty": 3, "workload": 3,
                                                          "semester": "2025-2026-1", "content": GOOD})
    assert ok.status_code == 201 and ok.json()["status"] == "approved"
    # người dùng khác (cùng module) — đánh giá có nội dung bị đánh dấu -> chờ duyệt, không hiển thị
    other = User(provider="facebook", subject="fb999", display_name="K23")
    db.add(other)
    db.commit()
    client.cookies.set(svc.SESSION_COOKIE, svc.make_session(other.id))
    bad = client.post("/api/modules/BAA4041/reviews", json={"rating": 1, "content": "Thầy này ngu quá, đồ ngu thật sự luôn"})
    assert bad.status_code == 201 and bad.json()["status"] == "pending"
    # trùng: cùng người dùng không được đánh giá lần hai
    dup = client.post("/api/modules/BAA4041/reviews", json={"rating": 5, "content": GOOD})
    assert dup.status_code == 409
    public = client.get("/api/modules/BAA4041/reviews").json()
    assert public["total"] == 1 and public["items"][0]["rating"] == 4
    assert public["summary"]["count"] == 1 and public["summary"]["avg_rating"] == 4.0


def test_review_validation(client, db):
    _module(db)
    _login(client, db)
    assert client.post("/api/modules/BAA4041/reviews", json={"rating": 9, "content": GOOD}).status_code == 422
    assert client.post("/api/modules/BAA4041/reviews", json={"rating": 3, "content": "ngắn"}).status_code == 422
