from __future__ import annotations

import csv
import hashlib
import hmac
import io
import secrets
from collections import defaultdict
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import require_admin
from app.models import Feedback, User
from app.rate_limit import get_real_ip, heavy_rate_limit, limiter
from app.routers.auth import current_user
from app.schemas import CategoryStat, DayStat, FeedbackIn, FeedbackItem, FeedbackOut, FeedbackStats, PageStat
from app.services.moderation import check_content

router = APIRouter(prefix="/feedback", tags=["feedback"])

_local_ip_hash_secret = secrets.token_hex(32)


def _quick_rating_ip_hash(request: Request) -> str:
    """Hash IP ổn định lâu dài (không xoay theo ngày) bằng HMAC-SHA256 để chống hiện lại popup đánh giá nhanh."""
    settings = get_settings()
    secret = (
        settings.llm_hash_secret
        or settings.codex_api_key
        or settings.anthropic_api_key
        or (settings.session_secret if settings.env == "production" else _local_ip_hash_secret)
    )
    ip = get_real_ip(request)
    return hmac.new(secret.encode("utf-8"), f"quick_rating:{ip}".encode("utf-8"), hashlib.sha256).hexdigest()


@router.post("", response_model=FeedbackOut, status_code=201, summary="Gửi phản hồi từ widget")
def create_feedback(
    body: FeedbackIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User | None = Depends(current_user),
):
    flags: list[str] = []
    if body.message and body.message.strip():
        flags = check_content(body.message, db=db, min_len=1, max_len=5000)

    is_quick = bool(body.quick_rating)
    fb = Feedback(
        **body.model_dump(exclude={"quick_rating"}),
        status="pending",
        flag_reasons=flags or None,
        is_quick_rating=is_quick,
        rater_ip_hash=_quick_rating_ip_hash(request) if is_quick else None,
        account_id=(user.id if user else None) if is_quick else None,
    )
    db.add(fb)
    db.commit()
    db.refresh(fb)
    return fb


@router.get("/satisfaction-status", summary="Kiểm tra người dùng đã từng gửi đánh giá nhanh hay chưa")
def satisfaction_status(
    request: Request,
    db: Session = Depends(get_db),
    user: User | None = Depends(current_user),
):
    ip_hash = _quick_rating_ip_hash(request)
    cond = Feedback.rater_ip_hash == ip_hash
    if user is not None:
        cond = or_(Feedback.account_id == user.id, Feedback.rater_ip_hash == ip_hash)
    already_rated = (
        db.scalar(select(Feedback.id).where(Feedback.is_quick_rating.is_(True), cond).limit(1)) is not None
    )
    return {"already_rated": already_rated}


def _filtered(db: Session, since: date | None, until: date | None) -> list[Feedback]:
    stmt = select(Feedback).order_by(Feedback.created_at)
    if since:
        stmt = stmt.where(Feedback.created_at >= datetime.combine(since, datetime.min.time(), timezone.utc))
    if until:
        stmt = stmt.where(Feedback.created_at < datetime.combine(until, datetime.max.time(), timezone.utc))
    return list(db.scalars(stmt))


def _group(rows: list[Feedback], key) -> list[tuple[str, int, float]]:
    """(khóa, số lượng, rating trung bình làm tròn 3 chữ số), sắp theo khóa."""
    acc: dict[str, list[int]] = defaultdict(list)
    for r in rows:
        acc[key(r)].append(r.rating)
    return [(k, len(v), round(sum(v) / len(v), 3)) for k, v in sorted(acc.items())]


def _day(fb: Feedback) -> str:
    dt = fb.created_at
    if dt.tzinfo is None:  # SQLite trả datetime naive (đã lưu UTC)
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).date().isoformat()


@router.get("/stats", response_model=FeedbackStats, summary="Thống kê phản hồi (cho phân tích UX)")
def feedback_stats(since: date | None = None, until: date | None = None, db: Session = Depends(get_db)):
    # Tổng hợp trong Python để chạy giống nhau trên SQLite và PostgreSQL.
    rows = _filtered(db, since, until)
    dist = {str(i): 0 for i in range(1, 6)}
    for r in rows:
        dist[str(r.rating)] = dist.get(str(r.rating), 0) + 1
    return FeedbackStats(
        total=len(rows),
        average_rating=round(sum(r.rating for r in rows) / len(rows), 3) if rows else None,
        by_page=[PageStat(page=k, count=c, average_rating=a) for k, c, a in _group(rows, lambda r: r.page)],
        by_category=[CategoryStat(category=k, count=c, average_rating=a)
                     for k, c, a in _group(rows, lambda r: r.category)],
        by_day=[DayStat(date=k, count=c) for k, c, _ in _group(rows, _day)],
        rating_distribution=dist,
        items=[FeedbackItem(id=r.id, created_at=_naive_utc(r.created_at), page=r.page, rating=r.rating,
                            category=r.category, message=r.message or "", app_version=r.app_version)
               for r in sorted(rows, key=lambda r: r.id)],
    )


def _naive_utc(dt: datetime) -> datetime:
    """Trả created_at dạng UTC không kèm offset (giống research/analysis/sample_feedback_stats.json)."""
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt.replace(microsecond=0)


def _cell(v):
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, str) and v[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + v  # chống CSV/formula injection khi mở bằng Excel
    return v


@router.get("/export.csv", summary="Xuất phản hồi ra CSV (UTF-8 BOM, mở được bằng Excel)",
            dependencies=[Depends(require_admin)], response_class=StreamingResponse)
@limiter.limit(heavy_rate_limit)
def export_feedback_csv(
    request: Request,
    since: date | None = None,
    until: date | None = None,
    include_contact: bool = Query(False, description="Kèm cột liên hệ (dữ liệu cá nhân) — mặc định không"),
    db: Session = Depends(get_db),
):
    rows = _filtered(db, since, until)
    buf = io.StringIO()
    buf.write("﻿")
    fields = ["id", "created_at", "page", "rating", "category", "message", "app_version"]
    if include_contact:
        fields.append("contact")
    w = csv.writer(buf)
    w.writerow(fields)
    for r in rows:
        w.writerow([_cell(getattr(r, f)) for f in fields])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]), media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="feedback.csv"'},
    )
