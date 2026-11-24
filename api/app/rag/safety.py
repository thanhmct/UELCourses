"""Question scope checks, privacy filters and shared LLM call budgeting."""

from __future__ import annotations

import hashlib
import hmac
import logging
import re
import secrets
import threading
from collections import Counter
from datetime import datetime, timedelta, timezone
from functools import lru_cache

from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker

from app.config import get_settings
from app.models import RagCallBudget

from .textnorm import collapse_ws, strip_accents

MAX_QUESTION = 1200  # forum posts often run several sentences
MAX_QUOTE = 700
MAX_CONTEXT_CHARS = 1800
log = logging.getLogger("uvicorn.error.rag")
_local_secret = secrets.token_hex(32)
_private = re.compile(
    r"[\w.+-]+@[\w.-]+\.[a-z]{2,}|\bK\d{7,12}\b|"
    r"\b(?:mssv|student\s*id|ma\s+sinh\s+vien)\s*[:#=]?\s*(?=[a-z0-9-]*\d)[a-z0-9-]{6,18}\b|"
    r"\b\d{8,12}\b",
    re.IGNORECASE,
)
_source_private = re.compile(
    r"[\w.+-]+@[\w.-]+\.[a-z]{2,}|\bK\d{7,12}\b|"
    r"\b(?:mssv|student\s*id|ma\s+sinh\s+vien)\s*[:#=]?\s*(?=[a-z0-9-]*\d)[a-z0-9-]{6,18}\b",
    re.IGNORECASE,
)
_instruction = re.compile(
    r"\b(?:system\s*(?:prompt|message|instructions?)|developer\s*(?:prompt|message)|"
    r"chi dan he thong|prompt an|api[ _-]?key|khoa api|bien moi truong|environment variables?|"
    r"(?:bo qua|quen)\s+(?:(?:moi|tat ca(?: cac)?|cac)\s+)?(?:chi dan|quy tac|huong dan|quy dinh|quy che)|"
    r"ignore\s+(?:(?:all|the|your)\s+)*(?:previous|prior|above|all|instructions?)|"
    r"doi vai|dong vai|act as|you are now|ban la chatgpt|"
    r"(?:viet|tao)\s+(?:code|ma nguon|script|mot bai rap)|(?:soan|viet)\s+(?:mot\s+)?bai\s+(?:van|tho|rap)|"
    r"write\s+(?:me\s+)?(?:a\s+)?(?:script|code|poem|essay)|"
    r"(?:xuat|in|dump)\s+(?:ra\s+)?(?:toan bo|toan van)|"
    r"(?:print|reveal|show)\s+(?:your\s+)?(?:hidden|configuration|secrets?))\b",
)
_regulation_topic = re.compile(
    r"\b(?:quy che|quy dinh|dieu kien|dieu \d+|khoan \d+|quyet dinh|"
    r"hoc phan|tin chi|hoc ky|hoc vu|hoc phi|hoc bong|ket qua hoc tap|dao tao|"
    r"diem trung binh|cai thien diem|ren luyen|co van hoc tap|cvht|sinh hoat lop|"
    r"ngoai ngu|tieng anh|tin hoc|chung chi|tot nghiep|thoi hoc|canh bao hoc tap|"
    r"mien thi|mien hoc|bao luu|khen thuong|ky luat|kien tap|tro giang|"
    r"day hoc truc tuyen|chuong trinh chinh quy|van bang|ban sao|ban can su|cong tac xa hoi|"
    r"so tay|hotline|phong y te|y si|"
    r"ky tuc xa|bao hiem y te|bhyt|vay von|chinh sach xa hoi|tro cap xa hoi|ho tro chi phi hoc tap|"
    r"cau lac bo|clb|doan thanh nien|hoi sinh vien|doan hoi|giay xac nhan|giay chung nhan sinh vien|"
    r"thi ket thuc hoc phan|thi giua ky|lich thi|phong thi|vang thi|hoan thi|dinh chi thi|"
    r"dang ky hoc phan|dieu chinh hoc phan|huy hoc phan|rut hoc phan|doi lop|hoc lai|hoc vuot|lich hoc|"
    r"thoi khoa bieu|giao duc the chat|giao duc quoc phong|nghia vu quan su|tam hoan|"
    r"le tot nghiep|le phuc|xet tot nghiep|bang diem|xep loai|diem ren luyen|minh chung|nha van hoa|"
    r"hoc truc tuyen|chuong trinh trao doi|trao doi sinh vien|"
    r"academic regulations?|grade point average|graduation|tuition|scholarships?|student conduct)\b"
)


def normalized(text: str) -> str:
    return collapse_ws(text).casefold()


def blocked(text: str) -> bool:
    folded = strip_accents(normalized(text))
    return bool(_instruction.search(folded) or _private.search(folded))


def source_blocked(text: str) -> bool:
    """Reject instructions embedded in source data, while allowing published contact details."""
    folded = strip_accents(normalized(text))
    return bool(_instruction.search(folded) or _source_private.search(folded))


def regulation_scope(question: str) -> bool:
    """Open gate: only unsafe input is refused here. Whether the question is about regulations is decided by
    retrieval (no confident source -> refusal) and by the model's verbatim-quote check, in any language."""
    return bool(question and question.strip()) and not blocked(question)


def safe_source(text: str) -> str:
    """Keep the exact prefix supplied to the provider for later verbatim checking."""
    text = text.strip()[:MAX_CONTEXT_CHARS]
    return text if text and not source_blocked(text) else ""


def digest(*values: object) -> str:
    return hashlib.sha256(repr(values).encode("utf-8")).hexdigest()


def private_hash(value: str, day: str) -> str:
    settings = get_settings()
    secret = (settings.llm_hash_secret or settings.codex_api_key or settings.anthropic_api_key
              or (settings.session_secret if settings.env == "production" else _local_secret))
    return hmac.new(secret.encode(), f"{day}:{value}".encode(), hashlib.sha256).hexdigest()


def log_question(scope: str, question: str, found: bool, mode: str) -> None:
    if get_settings().llm_log_questions:
        day = datetime.now(timezone.utc).date().isoformat()
        question_id = private_hash(f"question:{normalized(question)}", day)
        log.info("rag_question scope=%s id=%s found=%s mode=%s", scope, question_id, found, mode)


class BudgetExceeded(Exception):
    pass


def reserve_attempt(sessions: sessionmaker, caller: str, now: datetime | None = None) -> bool:
    """Persist one upstream attempt across both endpoints and all workers."""
    settings = get_settings()
    now = now or datetime.now(timezone.utc)
    day = now.date()
    day_key = day.isoformat()
    caller_key = private_hash(f"ip:{caller}", day_key)
    buckets = (
        (f"{day_key}:all", settings.llm_daily_call_cap),
        (f"d:{caller_key}", settings.llm_ip_daily_cap),
        (f"h:{now.hour:02d}:{caller_key}", settings.llm_ip_hourly_cap),
    )
    if any(cap == 0 for _, cap in buckets):
        return False
    try:
        with sessions.begin() as db:
            insert = pg_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert
            for bucket, cap in buckets:
                stmt = insert(RagCallBudget).values(bucket=bucket, day=day, calls=1)
                stmt = stmt.on_conflict_do_update(
                    index_elements=[RagCallBudget.bucket],
                    set_={"calls": RagCallBudget.calls + 1},
                    where=RagCallBudget.calls < cap,
                ).returning(RagCallBudget.calls)
                # rowcount is -1 for INSERT .. ON CONFLICT under psycopg; RETURNING is portable.
                if db.execute(stmt).scalar_one_or_none() is None:
                    raise BudgetExceeded
            db.execute(delete(RagCallBudget).where(RagCallBudget.day < day - timedelta(days=1)))
        return True
    except (BudgetExceeded, SQLAlchemyError):
        return False


@lru_cache(maxsize=16)
def slots(count: int) -> threading.BoundedSemaphore:
    return threading.BoundedSemaphore(count)


_metrics: Counter = Counter()
_metrics_lock = threading.Lock()


def report_verification(ok: bool) -> None:
    with _metrics_lock:
        _metrics["checked"] += 1
        _metrics["rejected"] += not ok
        log.info("rag_postcheck checked=%d rejected=%d", _metrics["checked"], _metrics["rejected"])
