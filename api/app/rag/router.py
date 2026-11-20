"""FastAPI router for regulations. main.py includes it with prefix "/api".

Depends only on fastapi/pydantic and the app.rag package.
"""
from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from .service import RagUnavailable, get_service

router = APIRouter(tags=["regulations"])


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    cohort: str | None = None
    mode: Literal["extractive", "llm"] | None = "extractive"
    top_k: int = Field(3, ge=1, le=10)


class CompareRequest(BaseModel):
    topic: str = Field(..., min_length=1, max_length=500)
    cohorts: list[str] = Field(..., min_length=1, max_length=10)


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
def ask_regulations(req: AskRequest) -> dict[str, Any]:
    return _svc().ask(req.question, req.cohort, req.mode, req.top_k)


@router.post("/regulations/compare")
def compare_regulations(req: CompareRequest) -> dict[str, Any]:
    return _svc().compare(req.topic, req.cohorts)


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
