"""FastAPI router for regulations. main.py includes it with prefix "/api".

Depends only on fastapi/pydantic and the app.rag package.
"""
from __future__ import annotations

import hmac
from datetime import datetime, timedelta, timezone
from functools import partial
from typing import Any, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.db import SessionLocal, get_db
from app.models import RagAnswerFeedback
from app.rate_limit import heavy_rate_limit, limiter
from .module_answer import answer_module
from .safety import log_question, private_hash, reserve_attempt
from .service import RagUnavailable, get_service

router = APIRouter(tags=["regulations"])


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    cohort: str | None = Field(None, max_length=16)
    mode: Literal["extractive", "llm"] | None = None
    top_k: int = Field(3, ge=1, le=10)


class CompareRequest(BaseModel):
    topic: str = Field(..., min_length=1, max_length=500)
    cohorts: list[str] = Field(..., min_length=1, max_length=10)


class ModuleAskRequest(AskRequest):
    program_id: str | None = Field(None, pattern=r"^[Kk]\d{5}(?:TE|E|T|H|[ABC])?$")
    semester: str | None = Field(None, pattern=r"^20\d{2}-20\d{2}-[123]$")
    ctdt_year: int | None = Field(None, ge=2000, le=2099)
    language: Literal["vi", "en"] = "vi"


Scope = Literal["regulations", "modules"]


class AnswerFeedbackRequest(BaseModel):
    answer_id: str = Field(pattern=r"^[0-9a-f]{32}\.[0-9a-f]{64}$")
    scope: Scope
    helpful: bool


def _svc():
    try:
        return get_service()
    except RagUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/regulations")
def list_regulations(cohort: str | None = None,
                     status: Literal["active", "expired", "superseded", "upcoming"] | None = None,
                     q: str | None = None) -> list[dict[str, Any]]:
    return _svc().list_docs(cohort=cohort, status=status, q=q)


@router.get("/regulations/expiring")
def expiring_regulations(within_days: int = Query(90, ge=0, le=3650)) -> list[dict[str, Any]]:
    return _svc().expiring(within_days)


@router.post("/regulations/ask")
@limiter.limit(heavy_rate_limit)
def ask_regulations(req: AskRequest, request: Request) -> JSONResponse:
    try:
        result = _svc().ask(req.question, req.cohort, req.mode, min(req.top_k, 3), reserve=_reserve(request))
    except SQLAlchemyError:
        raise HTTPException(503, "Chưa đọc được dữ liệu quy chế.") from None
    return JSONResponse(_with_feedback_id("regulations", req.question, result), headers={"Cache-Control": "no-store"})


def _reserve(request: Request):
    # Uvicorn handles proxy headers only from configured trusted peers.
    return partial(reserve_attempt, SessionLocal, request.client.host if request.client else "unknown")


def _with_feedback_id(scope: Scope, question: str, result: dict[str, Any]) -> dict[str, Any]:
    log_question(scope, question, result["found"], result["mode"])
    if result["found"]:
        answer_id = uuid4().hex
        day = datetime.now(timezone.utc).date().isoformat()
        result["answer_id"] = f"{answer_id}.{private_hash(f'feedback:{scope}:{answer_id}', day)}"
    return result


@router.post("/modules/ask")
@limiter.limit(heavy_rate_limit)
def ask_modules(req: ModuleAskRequest, request: Request, db: Session = Depends(get_db)) -> JSONResponse:
    try:
        result = answer_module(db, req.question, cohort=req.cohort, mode=req.mode, program_id=req.program_id,
                               semester=req.semester, ctdt_year=req.ctdt_year, language=req.language,
                               reserve=_reserve(request))
    except SQLAlchemyError:
        raise HTTPException(503, "Chưa đọc được dữ liệu học phần.") from None
    return JSONResponse(_with_feedback_id("modules", req.question, result), headers={"Cache-Control": "no-store"})


@router.post("/ask/feedback", status_code=204)
@limiter.limit(heavy_rate_limit)
def rate_answer(req: AnswerFeedbackRequest, request: Request, db: Session = Depends(get_db)) -> Response:
    answer_id, signature = req.answer_id.split(".")
    today = datetime.now(timezone.utc).date()
    if not any(hmac.compare_digest(signature, private_hash(f"feedback:{req.scope}:{answer_id}", day.isoformat()))
               for day in (today, today - timedelta(days=1))):
        raise HTTPException(400, "Mã phản hồi đã hết hạn hoặc không hợp lệ.")
    try:
        db.add(RagAnswerFeedback(answer_id=answer_id, scope=req.scope, helpful=req.helpful,
                                 created_at=datetime.now(timezone.utc)))
        db.commit()
    except IntegrityError:
        db.rollback()
    except SQLAlchemyError:
        raise HTTPException(503, "Chưa lưu được phản hồi.") from None
    return Response(status_code=204)


@router.post("/regulations/compare")
@limiter.limit(heavy_rate_limit)
def compare_regulations(req: CompareRequest, request: Request) -> JSONResponse:
    return JSONResponse(_svc().compare(req.topic, req.cohorts))


@router.get("/regulations/graph")
def regulations_graph(cohort: str | None = None, include_articles: bool = False) -> dict[str, Any]:
    return _svc().graph(cohort=cohort, include_articles=include_articles)


@router.get("/regulations/resolve")
def resolve_reference(ref: str = Query(..., min_length=2, max_length=300),
                      from_doc: str | None = None) -> dict[str, Any]:
    return _svc().resolve(ref, from_doc)


def _not_found(doc_id: str) -> HTTPException:
    return HTTPException(status_code=404, detail=f"Không tìm thấy văn bản {doc_id}")


@router.get("/regulations/{doc_id}/markdown")
def regulation_markdown(doc_id: str) -> dict[str, Any]:
    data = _svc().markdown(doc_id)
    if data is None:
        raise _not_found(doc_id)
    return data


@router.get("/regulations/{doc_id}/backlinks")
def regulation_backlinks(doc_id: str) -> list[dict[str, Any]]:
    data = _svc().backlinks(doc_id)
    if data is None:
        raise _not_found(doc_id)
    return data


@router.get("/regulations/{doc_id}")
def get_regulation(doc_id: str) -> dict[str, Any]:
    data = _svc().get_doc(doc_id)
    if data is None:
        raise _not_found(doc_id)
    return data
