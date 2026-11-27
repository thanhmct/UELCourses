from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import select

from app.config import get_settings
from app.db import SessionLocal, init_db
from app.models import AuditLog, Module
from app.admin.router import router as admin_router
from app.rate_limit import (
    AppRateLimitMiddleware,
    InflightLimitMiddleware,
    trusted_web_client_ip,
    RateLimitExceeded,
    cache_control_middleware,
    limiter,
    rate_limit_exceeded_handler,
    user_agent_block_middleware,
)
from app.routers import auth as auth_router
from app.routers import analytics, calendar, equivalents, feedback, imports, modules, programs, reviews, semesters, sync, venues

log = logging.getLogger("uelcourses")


def _record_server_error(method: str, path: str, status_code: int, err_msg: str | None = None):
    """Ghi lỗi 5xx vào audit_log với actor_type='system' (không lưu body, headers hay thông tin nhạy cảm)."""
    try:
        with SessionLocal() as db:
            audit = AuditLog(
                actor_type="system",
                actor_id="system",
                action="server_error",
                entity_type="http_5xx",
                entity_id=path[:128],
                before=None,
                after={"method": method, "path": path[:128], "status_code": status_code, "error": err_msg[:200] if err_msg else None},
                created_at=datetime.now(timezone.utc),
            )
            db.add(audit)
            db.commit()
    except Exception:
        pass


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
    init_db()  # create_all — tạo bảng nếu chưa có (SQLite/PostgreSQL)
    if settings.auto_seed:
        with SessionLocal() as db:
            if db.scalar(select(Module.code).limit(1)) is None:
                from app.services.seed import run_seed

                counts = run_seed(db)
                log.warning("DB trống -> đã nạp dữ liệu MẪU: %s", counts)
    with SessionLocal() as db:
        from app.services.calendar_stickers import (
            ensure_calendar_sticker_defaults,
            ensure_sticker_assets,
        )

        ensure_calendar_sticker_defaults(db)
        ensure_sticker_assets(db)
    yield


app = FastAPI(
    title="UELPATH API",
    version="0.1.0",
    description="Backend lập kế hoạch học tập cho sinh viên UEL (học phần, lớp, lịch, phòng, tương đương, phản hồi).",
    lifespan=lifespan,
)

# Gắn Limiter và Exception Handler cho Rate Limiting (Brief S1)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# Nén phản hồi lớn (/venues ~2 MB JSON, /equivalents ~100 KB). Phản hồi nhỏ hơn 1 KB giữ nguyên.
app.add_middleware(GZipMiddleware, minimum_size=1024)
# Bộ bảo vệ tải nằm BÊN TRONG CORS (thêm trước CORS) để phản hồi 429/503 vẫn mang header CORS,
# trình duyệt hiện đúng lỗi "quá nhiều yêu cầu / máy chủ bận" thay vì lỗi CORS khó hiểu.
app.add_middleware(InflightLimitMiddleware)
app.add_middleware(AppRateLimitMiddleware)
cors_origins = get_settings().cors_origin_list
if "*" in cors_origins:
    # Browsers reject Access-Control-Allow-Origin: * when credentials are included (allow_credentials=True).
    # Raise RuntimeError at startup to prevent invalid or insecure wildcard configuration.
    raise RuntimeError("CORS_ORIGINS cannot contain '*' when allow_credentials=True. Specify explicit origins.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def audit_5xx_errors_middleware(request: Request, call_next):
    """Middleware nhẹ ghi nhận lỗi 5xx vào audit_log cho trang Hệ thống (Brief A6)."""
    try:
        response = await call_next(request)
        if response.status_code >= 500:
            _record_server_error(request.method, request.url.path, response.status_code)
        return response
    except Exception as exc:
        _record_server_error(request.method, request.url.path, 500, str(exc))
        raise exc


@app.middleware("http")
async def proxy_verified_header_middleware(request: Request, call_next):
    """Chẩn đoán: báo cho web biết API đã xác nhận đúng khóa chuyển tiếp (không lộ khóa hay IP)."""
    response = await call_next(request)
    if trusted_web_client_ip(request):
        response.headers["X-UEL-Proxy-Verified"] = "1"
    return response


@app.middleware("http")
async def user_agent_check_middleware(request: Request, call_next):
    """Middleware chặn User-Agent rỗng khi BLOCK_EMPTY_USER_AGENT=true (Brief S1)."""
    return await user_agent_block_middleware(request, call_next)


@app.middleware("http")
async def cache_control_header_middleware(request: Request, call_next):
    """Middleware gắn Cache-Control cho Cloudflare và trình duyệt (Brief S1)."""
    return await cache_control_middleware(request, call_next)



@app.get("/api/health", tags=["health"], summary="Kiểm tra trạng thái")
@limiter.exempt
def health(request: Request):
    return {"status": "ok"}


for r in (semesters, modules, programs, equivalents, venues, imports, sync, feedback, reviews, calendar, analytics):
    app.include_router(r.router, prefix="/api")
app.include_router(auth_router.router, prefix="/api")
app.include_router(admin_router, prefix="/api")

# Router RAG quy chế (do agent regulations-rag cung cấp). Không có / lỗi -> chỉ cảnh báo.
if get_settings().enable_rag:
    try:
        from app.rag.router import router as rag_router

        app.include_router(rag_router, prefix="/api")
    except Exception as e:  # noqa: BLE001
        log.warning("Không nạp được router RAG (app.rag.router): %s: %s", type(e).__name__, e)
