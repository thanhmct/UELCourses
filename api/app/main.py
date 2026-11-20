from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.config import get_settings
from app.db import SessionLocal, init_db
from app.models import Module
from app.routers import equivalents, feedback, imports, modules, programs, semesters, sync, venues

log = logging.getLogger("uelplan")


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
    yield


app = FastAPI(
    title="UELPlan API",
    version="0.1.0",
    description="Backend lập kế hoạch học tập cho sinh viên UEL (học phần, lớp, lịch, phòng, tương đương, phản hồi).",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", tags=["health"], summary="Kiểm tra trạng thái")
def health():
    return {"status": "ok"}


for r in (semesters, modules, programs, equivalents, venues, imports, sync, feedback):
    app.include_router(r.router, prefix="/api")

# Router RAG quy chế (do agent regulations-rag cung cấp). Không có / lỗi -> chỉ cảnh báo.
if get_settings().enable_rag:
    try:
        from app.rag.router import router as rag_router

        app.include_router(rag_router, prefix="/api")
    except Exception as e:  # noqa: BLE001
        log.warning("Không nạp được router RAG (app.rag.router): %s: %s", type(e).__name__, e)
