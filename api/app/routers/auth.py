from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import quote

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import User
from app.rate_limit import get_real_ip
from app.services import auth as svc
from app.services.ip_utils import hash_client_ip
from app.services.moderation_ban import as_utc, get_active_ip_ban, is_user_ban_active

router = APIRouter(tags=["auth"])

_IP_BAN_MESSAGE = "IP này đang bị khóa do vi phạm nhiều lần, không thể đăng nhập hoặc viết đánh giá."


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
def login(provider: str):
    p = svc.providers().get(provider)
    if p is None:
        raise HTTPException(404, "Không hỗ trợ phương thức đăng nhập này.")
    try:
        url = svc.authorize_url(p, svc.make_state(provider))
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
    front = get_settings().frontend_base_url.rstrip("/")
    p = svc.providers().get(provider)
    if p is None or not code or not svc.check_state(state, provider):
        return RedirectResponse(f"{front}/?login=error", status_code=302)
    ip_hash = hash_client_ip(get_real_ip(request))
    if get_active_ip_ban(db, ip_hash) is not None:
        return RedirectResponse(
            f"{front}/?login=error&reason=ip_banned&message={quote(_IP_BAN_MESSAGE)}",
            status_code=302,
        )
    try:
        info = svc.exchange_code(p, code)
    except (ValueError, Exception):  # noqa: BLE001 - mạng/nhà cung cấp lỗi: không lộ chi tiết
        return RedirectResponse(f"{front}/?login=error", status_code=302)
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
    resp = RedirectResponse(f"{front}/?login=ok", status_code=302)
    resp.set_cookie(svc.SESSION_COOKIE, svc.make_session(user.id), max_age=svc.SESSION_MAX_AGE, httponly=True,
                    samesite="lax", secure=get_settings().oauth_redirect_base.startswith("https://"), path="/")
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
            "provider": user.provider,
            "banned": banned,
        }
    }


@router.post("/auth/logout", summary="Đăng xuất")
def logout(response: Response):
    response.delete_cookie(svc.SESSION_COOKIE, path="/")
    return {"ok": True}
