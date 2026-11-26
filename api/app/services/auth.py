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
            # Chỉ xin public_profile: quyền email của Facebook cần Meta xét duyệt mới cấp được cho người dùng thường,
            # còn email trong hệ thống chỉ là tùy chọn (thông báo khi bị khóa). Thêm lại "email" sau khi được duyệt.
            "public_profile", s.facebook_app_id, s.facebook_app_secret,
        ),
    }


def redirect_uri(provider: str, origin: str | None = None) -> str:
    """Địa chỉ callback. Với origin (web đã gọi đăng nhập) thì callback quay về đúng domain đó để cookie gắn với domain đó."""
    base = (origin or get_settings().oauth_redirect_base).rstrip("/")
    return f"{base}/api/auth/{provider}/callback"


def allowed_origin(raw: str | None) -> str | None:
    """Chuẩn hóa origin do trình duyệt gửi lên; chỉ chấp nhận khi nằm trong CORS_ORIGINS (danh sách web được phép)."""
    if not raw:
        return None
    candidate = raw.strip().rstrip("/")
    allowed = {o.rstrip("/") for o in get_settings().cors_origin_list}
    return candidate if candidate in allowed else None


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


def make_state(provider: str, next_path: str | None = None, origin: str | None = None) -> str:
    payload = {"p": provider, "n": secrets.token_urlsafe(12), "iat": int(time.time())}
    if next_path:
        payload["r"] = next_path
    if origin:
        payload["o"] = origin
    return _sign(payload)


def check_state(state: str | None, provider: str) -> bool:
    data = _unsign(state, STATE_MAX_AGE)
    return bool(data) and data.get("p") == provider


def state_next(state: str | None, provider: str) -> str | None:
    """Đường dẫn (tương đối) để quay lại sau khi đăng nhập, nếu có và state hợp lệ cho đúng provider."""
    data = _unsign(state, STATE_MAX_AGE)
    if not data or data.get("p") != provider:
        return None
    r = data.get("r")
    return r if isinstance(r, str) and r else None


def state_origin(state: str | None, provider: str) -> str | None:
    """Origin của web đã bắt đầu đăng nhập (đã ký trong state), hoặc None nếu không có/không hợp lệ."""
    data = _unsign(state, STATE_MAX_AGE)
    if not data or data.get("p") != provider:
        return None
    o = data.get("o")
    return o if isinstance(o, str) and o else None


def make_session(user_id: int) -> str:
    return _sign({"uid": user_id, "iat": int(time.time())})


def read_session(token: str | None) -> int | None:
    data = _unsign(token, SESSION_MAX_AGE)
    return int(data["uid"]) if data and "uid" in data else None


# ---------------------------------------------------------------- OAuth
def authorize_url(p: Provider, state: str, origin: str | None = None) -> str:
    if not p.ready():
        raise AuthNotConfigured(f"Chưa cấu hình đăng nhập {p.name} (thiếu khóa OAuth).")
    params = {"client_id": p.client_id, "redirect_uri": redirect_uri(p.name, origin), "response_type": "code",
              "scope": p.scope, "state": state}
    if p.name == "google":
        params.update({"prompt": "select_account"})
    return f"{p.auth_url}?{urlencode(params)}"


def _clean_optional_email(raw: object) -> str | None:
    if not isinstance(raw, str):
        return None
    cleaned = raw.strip()[:256]
    return cleaned or None


def exchange_code(p: Provider, code: str, origin: str | None = None) -> dict:
    """Trả về {subject, name, email}. Ném ValueError nếu nhà cung cấp từ chối. redirect_uri phải khớp với lúc đăng nhập."""
    with httpx.Client(timeout=15) as client:
        if p.name == "google":
            tok = client.post(p.token_url, data={"code": code, "client_id": p.client_id, "client_secret": p.client_secret,
                                                 "redirect_uri": redirect_uri(p.name, origin), "grant_type": "authorization_code"})
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
                                              "redirect_uri": redirect_uri(p.name, origin), "code": code})
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
