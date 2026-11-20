from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import User
from app.services import auth as svc

router = APIRouter(tags=["auth"])


def current_user(
    session: str | None = Cookie(default=None, alias=svc.SESSION_COOKIE), db: Session = Depends(get_db)
) -> User | None:
    uid = svc.read_session(session)
    return db.get(User, uid) if uid else None


def require_user(user: User | None = Depends(current_user)) -> User:
    if user is None:
        raise HTTPException(401, "Cần đăng nhập để thực hiện thao tác này.")
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
def callback(provider: str, code: str | None = Query(None), state: str | None = Query(None), db: Session = Depends(get_db)):
    front = get_settings().frontend_base_url.rstrip("/")
    p = svc.providers().get(provider)
    if p is None or not code or not svc.check_state(state, provider):
        return RedirectResponse(f"{front}/?login=error", status_code=302)
    try:
        info = svc.exchange_code(p, code)
    except (ValueError, Exception):  # noqa: BLE001 - mạng/nhà cung cấp lỗi: không lộ chi tiết
        return RedirectResponse(f"{front}/?login=error", status_code=302)
    user = db.scalar(select(User).where(User.provider == provider, User.subject == info["subject"]))
    if user is None:
        user = User(provider=provider, subject=info["subject"], display_name=info["name"][:128])
        db.add(user)
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
    return {"user": {"id": user.id, "display_name": user.display_name, "provider": user.provider}}


@router.post("/auth/logout", summary="Đăng xuất")
def logout(response: Response):
    response.delete_cookie(svc.SESSION_COOKIE, path="/")
    return {"ok": True}
