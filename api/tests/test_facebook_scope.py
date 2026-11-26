"""Facebook chỉ xin public_profile: quyền email cần Meta xét duyệt nên không đưa vào yêu cầu đăng nhập."""

from app.services import auth as svc


def test_facebook_requests_only_public_profile(monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "facebook_app_id", "123")
    monkeypatch.setattr(get_settings(), "facebook_app_secret", "s3cret")
    fb = svc.providers()["facebook"]
    assert fb.scope == "public_profile"
    url = svc.authorize_url(fb, "state-x")
    assert "scope=public_profile" in url and "email" not in url


def test_google_still_requests_email():
    assert "email" in svc.providers()["google"].scope.split()
