"""Đếm vi phạm nghiêm trọng và tự động khóa tài khoản / IP khi đánh giá học phần vi phạm nhiều lần."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditLog, BannedIp, Review, User

SERIOUS_CATEGORIES: set[str] = {
    "hate_or_slur",
    "threat",
    "sexual",
    "harassment_personal",
    "blocked_content",
}

_REASON_LABELS_VI: dict[str, str] = {
    "hate_or_slur": "ngôn từ thù ghét hoặc lăng mạ",
    "threat": "đe dọa",
    "sexual": "nội dung tình dục",
    "harassment_personal": "công kích cá nhân",
    "blocked_content": "từ ngữ bị cấm",
    "spam_advertising": "spam hoặc quảng cáo",
    "personal_info": "thông tin cá nhân",
    "repeated_chars": "ký tự lặp bất thường",
}

_AUTOBAN_THRESHOLD = 3
_AUTOBAN_WINDOW_DAYS = 30
_AUTOBAN_DURATION_DAYS = 30


def as_utc(dt: datetime | None) -> datetime | None:
    """Chuẩn hóa datetime sang múi giờ UTC (hỗ trợ SQLite trả về datetime naive)."""
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def is_user_ban_active(user: User, now: datetime | None = None) -> bool:
    """Kiểm tra tài khoản sinh viên có đang bị khóa còn hiệu lực hay không."""
    if user.ban_level == "permanent":
        return True
    if user.ban_level == "temporary":
        ref_now = as_utc(now) or datetime.now(timezone.utc)
        expires = as_utc(user.ban_expires_at)
        return expires is not None and expires > ref_now
    return False


def get_active_ip_ban(db: Session, ip_hash: str | None, now: datetime | None = None) -> BannedIp | None:
    """Trả về bản ghi khóa IP đang còn hiệu lực (chưa được gỡ), hoặc None nếu không bị khóa."""
    if not ip_hash:
        return None
    ref_now = as_utc(now) or datetime.now(timezone.utc)
    rows = db.scalars(
        select(BannedIp).where(
            BannedIp.ip_hash == ip_hash,
            BannedIp.lifted_at.is_(None),
        )
    ).all()
    for row in rows:
        if row.level == "permanent":
            return row
        if row.level == "temporary":
            expires = as_utc(row.expires_at)
            if expires is not None and expires > ref_now:
                return row
    return None


def count_recent_serious_violations(db: Session, user_id: int, since: datetime) -> int:
    """Đếm số đánh giá đang chờ duyệt có lý do thuộc nhóm vi phạm nghiêm trọng từ mốc `since`."""
    since_utc = as_utc(since)
    rows = db.scalars(
        select(Review).where(
            Review.user_id == user_id,
            Review.status == "pending",
        )
    ).all()
    count = 0
    for row in rows:
        created = as_utc(row.created_at)
        if created is None or (since_utc is not None and created < since_utc):
            continue
        reasons = row.moderation_reasons
        if isinstance(reasons, list) and (set(reasons) & SERIOUS_CATEGORIES):
            count += 1
    return count


def apply_autoban_if_needed(
    db: Session,
    user: User,
    ip_hash: str | None,
    reasons: list[str] | None,
) -> None:
    """Tự động khóa tạm thời 30 ngày cho tài khoản (và IP tương ứng) nếu có từ 3 vi phạm nghiêm trọng trong 30 ngày.

    Hàm không tự commit transaction; caller chịu trách nhiệm commit cùng các thay đổi khác.
    """
    now = datetime.now(timezone.utc)
    if is_user_ban_active(user, now):
        return

    window_start = now - timedelta(days=_AUTOBAN_WINDOW_DAYS)
    reset_at = as_utc(user.ban_cycle_reset_at)
    since = max(window_start, reset_at) if reset_at is not None else window_start

    violation_count = count_recent_serious_violations(db, user.id, since)
    if violation_count < _AUTOBAN_THRESHOLD:
        return

    expires_at = now + timedelta(days=_AUTOBAN_DURATION_DAYS)
    reason_list = list(reasons or [])
    reason_labels = [_REASON_LABELS_VI.get(r, r) for r in reason_list]
    reason_summary = ", ".join(dict.fromkeys(reason_labels)) or "vi phạm quy tắc cộng đồng"
    ban_reason = (
        f"Tự động khóa {_AUTOBAN_DURATION_DAYS} ngày do có {violation_count} "
        f"đánh giá vi phạm nghiêm trọng ({reason_summary})."
    )

    user.ban_level = "temporary"
    user.banned_at = now
    user.ban_expires_at = expires_at
    user.ban_reason = ban_reason

    if ip_hash:
        db.add(
            BannedIp(
                ip_hash=ip_hash,
                level="temporary",
                reason=ban_reason,
                created_by="system",
                created_at=now,
                expires_at=expires_at,
                related_user_id=user.id,
            )
        )

    db.add(
        AuditLog(
            actor_type="system",
            actor_id="system",
            action="auto_ban_user",
            entity_type="user",
            entity_id=str(user.id),
            before=None,
            after={
                "ban_level": "temporary",
                "ban_expires_at": expires_at.isoformat(),
                "reasons": reason_list,
                "ip_hash": ip_hash,
                "violation_count": violation_count,
            },
            created_at=now,
        )
    )
