from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.services.analytics import record_events

router = APIRouter(prefix="/analytics", tags=["analytics"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class EventItem(BaseModel):
    type: str
    module_code: str | None = None
    class_code: str | None = None
    semester_id: str | None = None
    program_code: str | None = None
    query: str | None = None
    query_text: str | None = None
    filters: dict[str, Any] | None = None
    page: str | None = None
    ts: Any | None = None

    model_config = {"extra": "allow"}


class AnalyticsPayload(BaseModel):
    anon_id: str = Field(..., max_length=64)
    events: list[dict[str, Any]] = Field(default_factory=list, max_length=50)


@router.post(
    "/events",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Thu thập sự kiện người dùng ẩn danh theo lô",
)
def post_analytics_events(
    payload: AnalyticsPayload,
    request: Request,
    db: Session = Depends(get_db),
    dnt: str | None = Header(None, alias="DNT"),
):
    """Tiếp nhận lô sự kiện ẩn danh (tối đa 50 sự kiện/lô):
    - Không yêu cầu đăng nhập.
    - Bỏ qua khi DNT = '1' hoặc analytics bị tắt.
    - Rate limit 300/min/anon_id, 3000/min/IP (429).
    - Cắt query 64 ký tự, kiểm tra regex program_code, bỏ trường lạ.
    - Không lưu IP, user-agent.
    """
    if dnt == "1":
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    client_ip = request.client.host if request.client else "127.0.0.1"
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()

    record_events(
        db=db,
        anon_id=payload.anon_id,
        raw_events=payload.events,
        client_ip=client_ip,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
