"""Gửi email thông báo cho người dùng qua SMTP (tùy chọn)."""

from __future__ import annotations

import logging
import smtplib
from datetime import datetime
from email.message import EmailMessage
from typing import Any

from app.config import get_settings
from app.services.moderation_ban import as_utc

log = logging.getLogger("uelcourses")


def is_smtp_configured() -> bool:
    """Kiểm tra cấu hình SMTP tối thiểu đã được thiết lập hay chưa."""
    s = get_settings()
    return bool((s.smtp_host or "").strip() and (s.smtp_from or "").strip())


def send_ban_email(
    to_email: str,
    display_name: str,
    level: str,
    reason: str | None,
    expires_at: datetime | None,
) -> dict[str, Any]:
    """Gửi email văn bản thuần thông báo khóa tài khoản cho sinh viên."""
    if not is_smtp_configured():
        return {"sent": False, "reason": "smtp_not_configured"}

    s = get_settings()
    host = s.smtp_host.strip()
    sender = s.smtp_from.strip()

    level_label = "vĩnh viễn" if level == "permanent" else "tạm thời"
    exp_utc = as_utc(expires_at)
    expiry_line = (
        f"Thời hạn khóa đến: {exp_utc.strftime('%d/%m/%Y %H:%M UTC')}\n"
        if exp_utc is not None and level != "permanent"
        else ""
    )
    reason_text = (reason or "").strip() or "Vi phạm nguyên tắc cộng đồng."

    body = (
        f"Chào {display_name},\n\n"
        f"Tài khoản UELPath của bạn đã bị khóa {level_label}.\n"
        f"Lý do: {reason_text}\n"
        f"{expiry_line}\n"
        "Nếu bạn cho rằng đây là nhầm lẫn, vui lòng liên hệ quản trị viên qua kênh hỗ trợ của hệ thống.\n\n"
        "Trân trọng,\n"
        "Đội ngũ UELPath"
    )

    msg = EmailMessage()
    msg["Subject"] = "Thông báo khóa tài khoản UELPath"
    msg["From"] = sender
    msg["To"] = to_email
    msg.set_content(body, subtype="plain", charset="utf-8")

    try:
        if s.smtp_port == 465:
            with smtplib.SMTP_SSL(host, s.smtp_port, timeout=10) as server:
                if (s.smtp_user or "").strip() and s.smtp_password:
                    server.login(s.smtp_user.strip(), s.smtp_password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(host, s.smtp_port, timeout=10) as server:
                server.ehlo()
                if server.has_extn("starttls"):
                    server.starttls()
                    server.ehlo()
                if (s.smtp_user or "").strip() and s.smtp_password:
                    server.login(s.smtp_user.strip(), s.smtp_password)
                server.send_message(msg)
        return {"sent": True, "reason": None}
    except Exception as exc:
        log.warning("Không thể gửi email thông báo khóa tài khoản (%s)", type(exc).__name__)
        return {"sent": False, "reason": "smtp_error"}
