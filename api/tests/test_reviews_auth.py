import pytest

from app.models import Module, User
from app.services import auth as svc
from app.services.moderation import moderate

GOOD = "Môn học có nội dung thực tế, giảng viên giải thích rõ và bài tập nhóm hợp lý. Nên chuẩn bị kỹ trước khi thi."


def _fake_ai_flags(text: str) -> list[str]:
    """Mô phỏng mô hình kiểm duyệt AI cho test (không gọi mạng thật): gắn cờ các câu lăng mạ/đe dọa
    rõ ràng trong bộ dữ liệu test, coi phần còn lại là an toàn."""
    low = text.lower()
    if "ngu quá" in low or "đồ ngu" in low:
        return ["harassment"]
    if "giết" in low:
        return ["violence"]
    return []


@pytest.mark.parametrize("text,status", [
    (GOOD, "approved"),
    ("Môn này hơi khó, bài tập nhiều nhưng học được nhiều kiến thức thực tế.", "approved"),  # phê bình xây dựng: được phép
    ("Thầy này ngu quá, đúng là đồ ngu", "pending"),  # lăng mạ/công kích cá nhân -> mô hình AI gắn cờ
    ("Liên hệ zalo 0912345678 để mua tài liệu giá rẻ nhé", "pending"),  # số điện thoại -> cờ contact_info
    ("Mail mình: abc@gmail.com, inbox để nhận đề thi", "pending"),  # email -> cờ contact_info
    ("Xem thêm tại https://example.com/abc để kiếm tiền online", "pending"),  # liên kết -> cờ link
    ("Em sẽ giết thầy nếu không cho qua môn này", "pending"),  # đe dọa -> mô hình AI gắn cờ
])
def test_moderation_status(text, status, monkeypatch):
    from app.services import moderation as mod_svc

    monkeypatch.setattr(mod_svc, "ai_flag_categories", _fake_ai_flags)
    assert moderate(text).status == status


def test_moderation_reasons_are_reported():
    res = moderate("Liên hệ zalo 0912345678")
    assert "contact_info" in res.reasons


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


def test_login_rejects_unsafe_next_and_falls_back_to_root(client, monkeypatch):
    from urllib.parse import parse_qs, urlsplit

    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "google_client_id", "x")
    monkeypatch.setattr(get_settings(), "google_client_secret", "y")

    for unsafe in ("https://evil.example.com/", "//evil.example.com/", "modules/BAA4041"):
        r = client.get(f"/api/auth/google/login?next={unsafe}", follow_redirects=False)
        state = parse_qs(urlsplit(r.headers["location"]).query)["state"][0]
        assert svc.state_next(state, "google") is None


def test_login_with_next_redirects_back_to_same_page_on_callback(client, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "google_client_id", "x")
    monkeypatch.setattr(get_settings(), "google_client_secret", "y")
    r = client.get("/api/auth/google/login?next=%2Fmodules%2FBAA4041%23mod-reviews", follow_redirects=False)
    assert r.status_code == 302
    # state đã ký mang theo "next"; callback với state hợp lệ nhưng không có code -> vẫn quay về đúng trang
    from urllib.parse import parse_qs, urlsplit

    auth_url = r.headers["location"]
    state = parse_qs(urlsplit(auth_url).query)["state"][0]
    cb = client.get(f"/api/auth/google/callback?state={state}", follow_redirects=False)
    assert cb.status_code == 302
    location = cb.headers["location"]
    assert location.startswith(get_settings().frontend_base_url.rstrip("/") + "/modules/BAA4041")
    assert "mod-reviews" in location
    assert "login=error" in location


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


def test_review_flow_publish_pending_and_one_per_user(client, db, monkeypatch):
    from app.services import moderation as mod_svc

    monkeypatch.setattr(mod_svc, "ai_flag_categories", _fake_ai_flags)

    _module(db)
    _login(client, db)
    ok = client.post("/api/modules/BAA4041/reviews", json={"rating": 4, "difficulty": 3, "workload": 3,
                                                          "semester": "2025-2026-1", "content": GOOD})
    assert ok.status_code == 201 and ok.json()["status"] == "approved"
    # người dùng khác (cùng module) — đánh giá bị mô hình AI gắn cờ -> chờ duyệt, không hiển thị
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


def _enable_google_with_origins(monkeypatch, origins: str):
    from app.config import get_settings

    s = get_settings()
    monkeypatch.setattr(s, "google_client_id", "x")
    monkeypatch.setattr(s, "google_client_secret", "y")
    monkeypatch.setattr(s, "cors_origins", origins)


def test_login_redirect_uri_follows_allowed_origin(client, monkeypatch):
    from urllib.parse import parse_qs, urlsplit

    _enable_google_with_origins(monkeypatch, "https://uelpath.vercel.app,https://uelpath.uelcourses.id.vn")
    r = client.get("/api/auth/google/login?origin=https%3A%2F%2Fuelpath.uelcourses.id.vn", follow_redirects=False)
    q = parse_qs(urlsplit(r.headers["location"]).query)
    assert q["redirect_uri"][0] == "https://uelpath.uelcourses.id.vn/api/auth/google/callback"


def test_login_ignores_origin_not_in_allowlist(client, monkeypatch):
    from urllib.parse import parse_qs, urlsplit

    from app.config import get_settings

    _enable_google_with_origins(monkeypatch, "https://uelpath.vercel.app")
    r = client.get("/api/auth/google/login?origin=https%3A%2F%2Fevil.example.com", follow_redirects=False)
    q = parse_qs(urlsplit(r.headers["location"]).query)
    expected = get_settings().oauth_redirect_base.rstrip("/") + "/api/auth/google/callback"
    assert q["redirect_uri"][0] == expected
    assert svc.state_origin(q["state"][0], "google") is None


def test_callback_returns_to_origin_and_sets_session_cookie_there(client, monkeypatch):
    from urllib.parse import parse_qs, urlsplit

    _enable_google_with_origins(monkeypatch, "https://uelpath.vercel.app,https://uelpath.uelcourses.id.vn")
    r = client.get(
        "/api/auth/google/login?next=%2Fsettings&origin=https%3A%2F%2Fuelpath.uelcourses.id.vn",
        follow_redirects=False,
    )
    state = parse_qs(urlsplit(r.headers["location"]).query)["state"][0]

    seen = {}

    def fake_exchange(p, code, origin=None):
        seen["origin"] = origin
        return {"subject": "google-42", "name": "Sinh viên", "email": None}

    monkeypatch.setattr(svc, "exchange_code", fake_exchange)
    cb = client.get(f"/api/auth/google/callback?code=abc&state={state}", follow_redirects=False)

    assert seen["origin"] == "https://uelpath.uelcourses.id.vn"
    assert cb.headers["location"] == "https://uelpath.uelcourses.id.vn/settings?login=ok"
    set_cookie = cb.headers["set-cookie"].lower()
    assert svc.SESSION_COOKIE in set_cookie and "secure" in set_cookie
