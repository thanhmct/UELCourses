"""Đồng bộ học phần tương đương từ portal UEL bằng token của sinh viên.

Token chỉ nằm trong bộ nhớ trong thời gian request: không lưu DB, không ghi log,
không đưa vào thông báo lỗi.
"""

from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.schemas import ImportResult, SyncRequest
from app.services.importer import ImportFormatError, extract_rows, import_equivalents

log = logging.getLogger(__name__)
router = APIRouter(prefix="/sync", tags=["sync"])


def fetch_portal_equivalents(token: str) -> list[dict]:
    settings = get_settings()
    token = token.strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    try:
        with httpx.Client(timeout=settings.portal_timeout_seconds) as client:
            resp = client.get(settings.portal_equivalent_url, headers=headers)
    except httpx.HTTPError as e:
        log.warning("Không kết nối được portal UEL: %s", type(e).__name__)
        raise HTTPException(502, "Không kết nối được portal UEL. Thử lại sau.") from None
    finally:
        del headers, token
    if resp.status_code in (401, 403):
        raise HTTPException(401, "Token hết hạn hoặc không hợp lệ. Đăng nhập lại portal để lấy token mới.")
    if resp.status_code >= 400:
        log.warning("Portal UEL trả mã lỗi %s", resp.status_code)
        raise HTTPException(502, f"Portal UEL trả lỗi {resp.status_code}.")
    try:
        return extract_rows(resp.json())
    except (ValueError, ImportFormatError):
        raise HTTPException(502, "Dữ liệu trả về từ portal không đúng định dạng mong đợi.") from None


@router.post("/equivalents", response_model=ImportResult,
             summary="Đồng bộ học phần tương đương từ portal (token dùng 1 lần, không lưu)")
def sync_equivalents(body: SyncRequest, db: Session = Depends(get_db)):
    rows = fetch_portal_equivalents(body.token)
    return import_equivalents(db, rows)
