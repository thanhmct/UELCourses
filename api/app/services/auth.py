"""Đăng nhập bằng Google / Facebook (OAuth2 authorization-code) + phiên ký HMAC trong cookie.

Lưu (provider, subject, tên hiển thị); email là tùy chọn, chỉ lưu nếu OAuth cấp quyền và chỉ dùng để thông báo khi bị ban, không hiển thị công khai.
Khóa OAuth lấy từ biến môi trường; thiếu khóa thì endpoint đăng nhập trả 503 (không vỡ app).
Tạo khóa: Google Cloud Console (OAuth client, redirect URI = {OAUTH_REDIRECT_BASE}/api/auth/google/callback),
Facebook for Developers (app Facebook Login, redirect = {OAUTH_REDIRECT_BASE}/api/auth/facebook/callback).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx

from app.config import get_settings

SESSION_COOKIE = "uelc_session"
SESSION_MAX_AGE = 14 * 24 * 3600
STATE_MAX_AGE = 600


class AuthNotConfigured(RuntimeError):
    pass


@dataclass
class Provider:
    name: str
    auth_url: str
    token_url: str
    scope: str
    client_id: str
    client_secret: str

    def ready(self) -> bool:
        return bool(self.client_id and self.client_secret)


def providers() -> dict[str, Provider]:
    s = get_settings()
    return {
        "google": Provider(
            "google", "https://accounts.google.com/o/oauth2/v2/auth", "https://oauth2.googleapis.com/token",
            "openid profile email", s.google_client_id, s.google_client_secret,
        ),
        "facebook": Provider(
            "facebook", "https://www.facebook.com/v19.0/dialog/oauth", "https://graph.facebook.com/v19.0/oauth/access_token",
            "public_profile,email", s.facebook_app_id, s.facebook_app_secret,
        ),
    }


def redirect_uri(provider: str) -> str:
    return f"{get_settings().oauth_redirect_base.rstrip('/')}/api/auth/{provider}/callback"


# ---------------------------------------------------------------- ký / kiểm tra (HMAC-SHA256, không cần thư viện ngoài)
def _sign(payload: dict) -> str:
    body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    sig = hmac.new(get_settings().session_secret.encode(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def _unsign(token: str | None, max_age: int) -> dict | None:
    if not token or "." not in token:
        return None
    body, sig = token.rsplit(".", 1)
    good = hmac.new(get_settings().session_secret.encode(), body.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, good):
        return None
    try:
        pad = "=" * (-len(body) % 4)
        payload = json.loads(base64.urlsafe_b64decode(body + pad))
    except (ValueError, TypeError):
        return None
    if time.time() - payload.get("iat", 0) > max_age:
        return None
    return payload


def make_state(provider: str) -> str:
    return _sign({"p": provider, "n": secrets.token_urlsafe(12), "iat": int(time.time())})


def check_state(state: str | None, provider: str) -> bool:
    data = _unsign(state, STATE_MAX_AGE)
    return bool(data) and data.get("p") == provider


def make_session(user_id: int) -> str:
    return _sign({"uid": user_id, "iat": int(time.time())})


def read_session(token: str | None) -> int | None:
    data = _unsign(token, SESSION_MAX_AGE)
    return int(data["uid"]) if data and "uid" in data else None


# ---------------------------------------------------------------- OAuth
def authorize_url(p: Provider, state: str) -> str:
    if not p.ready():
        raise AuthNotConfigured(f"Chưa cấu hình đăng nhập {p.name} (thiếu khóa OAuth).")
    params = {"client_id": p.client_id, "redirect_uri": redirect_uri(p.name), "response_type": "code",
              "scope": p.scope, "state": state}
    if p.name == "google":
        params.update({"prompt": "select_account"})
    return f"{p.auth_url}?{urlencode(params)}"


def _clean_optional_email(raw: object) -> str | None:
    if not isinstance(raw, str):
        return None
    cleaned = raw.strip()[:256]
    return cleaned or None


def exchange_code(p: Provider, code: str) -> dict:
    """Trả về {subject, name, email}. Ném ValueError nếu nhà cung cấp từ chối."""
    with httpx.Client(timeout=15) as client:
        if p.name == "google":
            tok = client.post(p.token_url, data={"code": code, "client_id": p.client_id, "client_secret": p.client_secret,
                                                 "redirect_uri": redirect_uri(p.name), "grant_type": "authorization_code"})
            if tok.status_code != 200:
                raise ValueError("Google từ chối mã xác thực.")
            access = tok.json().get("access_token")
            info = client.get("https://openidconnect.googleapis.com/v1/userinfo",
                              headers={"Authorization": f"Bearer {access}"})
            if info.status_code != 200:
                raise ValueError("Không lấy được thông tin tài khoản Google.")
            d = info.json()
            return {
                "subject": str(d.get("sub")),
                "name": d.get("name") or "Sinh viên",
                "email": _clean_optional_email(d.get("email")),
            }
        tok = client.get(p.token_url, params={"client_id": p.client_id, "client_secret": p.client_secret,
                                              "redirect_uri": redirect_uri(p.name), "code": code})
        if tok.status_code != 200:
            raise ValueError("Facebook từ chối mã xác thực.")
        access = tok.json().get("access_token")
        info = client.get("https://graph.facebook.com/me", params={"fields": "id,name,email", "access_token": access})
        if info.status_code != 200:
            raise ValueError("Không lấy được thông tin tài khoản Facebook.")
        d = info.json()
        return {
            "subject": str(d.get("id")),
            "name": d.get("name") or "Sinh viên",
            "email": _clean_optional_email(d.get("email")),
        }
