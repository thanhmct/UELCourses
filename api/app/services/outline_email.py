"""Trích xuất và tra cứu email giảng viên / người phụ trách môn học từ đề cương trong DB."""

from __future__ import annotations

import re
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import OutlineDocument, OutlineModuleLink, OutlineSection

# Ưu tiên các email có đuôi @uel.edu.vn, @st.uel.edu.vn, hoặc @agu.edu.vn
_EMAIL_REGEX = re.compile(r"[\w\.-]+@(?:[a-zA-Z0-9-]+\.)?uel\.edu\.vn|[\w\.-]+@agu\.edu\.vn", re.IGNORECASE)

# Cache trong bộ nhớ cho phiên làm việc
_MODULE_EMAIL_CACHE: dict[str, str | None] = {}


def get_module_lecturer_email(db: Session, module_code: str) -> str | None:
    """Tra cứu email giảng viên/phụ trách môn học từ các mục đề cương trong cơ sở dữ liệu."""
    if not module_code:
        return None
    if module_code in _MODULE_EMAIL_CACHE:
        return _MODULE_EMAIL_CACHE[module_code]

    # Tìm các outline_sections của module này
    stmt = (
        select(OutlineSection.heading, OutlineSection.text)
        .join(OutlineDocument, OutlineDocument.id == OutlineSection.document_id)
        .join(OutlineModuleLink, OutlineModuleLink.document_id == OutlineDocument.id)
        .where(
            OutlineModuleLink.module_code == module_code,
            OutlineSection.text.like("%@%"),
        )
    )
    rows = db.execute(stmt).all()
    if not rows:
        _MODULE_EMAIL_CACHE[module_code] = None
        return None

    # Ưu tiên các mục có tiêu đề liên quan đến phụ trách / giảng viên / coordinator
    priority_email: str | None = None
    fallback_email: str | None = None

    for heading, text in rows:
        h_lower = (heading or "").lower()
        emails = _EMAIL_REGEX.findall(text or "")
        if not emails:
            continue
        first_email = emails[0].lower()
        is_priority = any(
            k in h_lower
            for k in ("phụ trách", "giảng viên", "lecturer", "coordinator", "instructor", "rules", "regulations")
        )
        if is_priority and not priority_email:
            priority_email = first_email
        elif not fallback_email:
            fallback_email = first_email

    email = priority_email or fallback_email
    _MODULE_EMAIL_CACHE[module_code] = email
    return email
