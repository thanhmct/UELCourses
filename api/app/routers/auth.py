from __future__ import annotations

import re
from datetime import datetime, timezone
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import User
from app.rate_limit import get_real_ip
from app.services import auth as svc
from app.services.ip_utils import hash_client_ip
from app.services.nickname import public_name, validate_nickname
from app.services.moderation_ban import as_utc, get_active_ip_ban, is_user_ban_active

router = APIRouter(tags=["auth"])

_IP_BAN_MESSAGE = "IP này đang bị khóa do vi phạm nhiều lần, không thể đăng nhập hoặc viết đánh giá."

# Chỉ chấp nhận đường dẫn tương đối, nội bộ (vd "/modules/ABC#mod-reviews") làm điểm quay về sau đăng nhập,
# để tránh open-redirect: không chấp nhận "//host", "https://host" hay bất kỳ ký tự khoảng trắng nào.
_SAFE_NEXT_RE = re.compile(r"^/[^\s]*$")


def _safe_next_path(next_path: str | None) -> str | None:
    if not next_path:
        return None
    candidate = next_path.strip()[:512]
    if not _SAFE_NEXT_RE.match(candidate):
        return None
    if candidate.startswith("//") or "://" in candidate:
        return None
    return candidate


def _append_query(url: str, **params: str) -> str:
    parts = urlsplit(url)
    query = parse_qsl(parts.query, keep_blank_values=True)
    query.extend(params.items())
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def current_user(
    session: str | None = Cookie(default=None, alias=svc.SESSION_COOKIE), db: Session = Depends(get_db)
) -> User | None:
    uid = svc.read_session(session)
    return db.get(User, uid) if uid else None


def require_user(user: User | None = Depends(current_user)) -> User:
    if user is None:
        raise HTTPException(401, "Cần đăng nhập để thực hiện thao tác này.")
    return user


def require_active_user(
    request: Request,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
) -> User:
    """Yêu cầu người dùng đã đăng nhập và không bị khóa theo tài khoản hoặc địa chỉ IP."""
    now = datetime.now(timezone.utc)
    if is_user_ban_active(user, now):
        reason_text = user.ban_reason or "vi phạm quy tắc cộng đồng"
        if user.ban_level == "permanent":
            raise HTTPException(403, f"Tài khoản của bạn đã bị khóa vĩnh viễn. Lý do: {reason_text}")
        exp_utc = as_utc(user.ban_expires_at)
        exp_str = exp_utc.strftime("%d/%m/%Y %H:%M UTC") if exp_utc else ""
        raise HTTPException(403, f"Tài khoản của bạn đang bị tạm khóa đến {exp_str}. Lý do: {reason_text}")

    ip_hash = hash_client_ip(get_real_ip(request))
    if get_active_ip_ban(db, ip_hash, now) is not None:
        raise HTTPException(403, _IP_BAN_MESSAGE)

    return user


@router.get("/auth/providers", summary="Các phương thức đăng nhập đã được cấu hình")
def providers():
    return {name: {"ready": p.ready()} for name, p in svc.providers().items()}


@router.get("/auth/{provider}/login", summary="Chuyển sang trang đăng nhập của nhà cung cấp")
def login(
    provider: str,
    next: str | None = Query(None, description="Đường dẫn quay về sau khi đăng nhập xong"),
    origin: str | None = Query(None, description="Gốc của web bắt đầu đăng nhập; phải nằm trong CORS_ORIGINS, nếu không sẽ dùng cấu hình mặc định"),
):
    p = svc.providers().get(provider)
    if p is None:
        raise HTTPException(404, "Không hỗ trợ phương thức đăng nhập này.")
    o = svc.allowed_origin(origin)
    try:
        url = svc.authorize_url(p, svc.make_state(provider, _safe_next_path(next), o), o)
    except svc.AuthNotConfigured as e:
        raise HTTPException(503, str(e))
    return RedirectResponse(url, status_code=302)


@router.get("/auth/{provider}/callback", summary="Nhận kết quả đăng nhập từ nhà cung cấp")
def callback(
    provider: str,
    request: Request,
    code: str | None = Query(None),
    state: str | None = Query(None),
    db: Session = Depends(get_db),
):
    p = svc.providers().get(provider)
    # Origin lấy từ state đã ký (và phải còn nằm trong CORS_ORIGINS); không có thì dùng cấu hình mặc định.
    origin = svc.allowed_origin(svc.state_origin(state, provider)) if p else None
    front = (origin or get_settings().frontend_base_url).rstrip("/")
    next_path = svc.state_next(state, provider) if p else None
    target = f"{front}{next_path}" if next_path else f"{front}/"
    if p is None or not code or not svc.check_state(state, provider):
        return RedirectResponse(_append_query(target, login="error"), status_code=302)
    ip_hash = hash_client_ip(get_real_ip(request))
    if get_active_ip_ban(db, ip_hash) is not None:
        return RedirectResponse(
            _append_query(target, login="error", reason="ip_banned", message=_IP_BAN_MESSAGE),
            status_code=302,
        )
    try:
        info = svc.exchange_code(p, code, origin)
    except (ValueError, Exception):  # noqa: BLE001 - mạng/nhà cung cấp lỗi: không lộ chi tiết
        return RedirectResponse(_append_query(target, login="error"), status_code=302)
    email = info.get("email")
    user = db.scalar(select(User).where(User.provider == provider, User.subject == info["subject"]))
    if user is None:
        user = User(
            provider=provider,
            subject=info["subject"],
            display_name=info["name"][:128],
            email=email,
        )
        db.add(user)
    elif user.email is None and email is not None:
        user.email = email
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    resp = RedirectResponse(_append_query(target, login="ok"), status_code=302)
    resp.set_cookie(svc.SESSION_COOKIE, svc.make_session(user.id), max_age=svc.SESSION_MAX_AGE, httponly=True,
                    samesite="lax", secure=(origin or get_settings().oauth_redirect_base).startswith("https://"), path="/")
    return resp


@router.get("/auth/me", summary="Tài khoản đang đăng nhập (null nếu chưa)")
def me(user: User | None = Depends(current_user)):
    if user is None:
        return {"user": None}
    now = datetime.now(timezone.utc)
    banned = None
    if is_user_ban_active(user, now):
        exp_utc = as_utc(user.ban_expires_at) if user.ban_level != "permanent" else None
        banned = {
            "level": user.ban_level,
            "reason": user.ban_reason,
            "expires_at": exp_utc.isoformat() if exp_utc else None,
        }
    return {
        "user": {
            "id": user.id,
            "display_name": user.display_name,
            "nickname": user.nickname,
            "provider": user.provider,
            "banned": banned,
        }
    }


class NicknameIn(BaseModel):
    nickname: str | None = Field(default=None, max_length=64, description="Biệt danh công khai; để trống để quay về ẩn danh")


@router.put("/auth/nickname", summary="Đặt hoặc xóa biệt danh công khai của tài khoản")
def set_nickname(
    body: NicknameIn,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """Biệt danh dùng cho đánh giá và bình luận mới. Bài đã đăng giữ nguyên tên lúc viết."""
    user.nickname = validate_nickname(body.nickname, db)
    db.commit()
    return {"nickname": user.nickname, "public_name": public_name(user.nickname)}


@router.post("/auth/logout", summary="Đăng xuất")
def logout(response: Response):
    response.delete_cookie(svc.SESSION_COOKIE, path="/")
    return {"ok": True}
