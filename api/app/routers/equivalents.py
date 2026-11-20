from __future__ import annotations

from collections.abc import Iterable

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Equivalent, Module
from app.schemas import EquivalentItem, EquivalentRef
from app.services.text import search_tokens

router = APIRouter(tags=["equivalents"])


def like_escape(tok: str) -> str:
    return tok.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def codes_with_equivalents(db: Session, codes: Iterable[str]) -> set[str]:
    codes = list(codes)
    if not codes:
        return set()
    rows = db.execute(
        select(Equivalent.code, Equivalent.equivalent_code).where(
            or_(Equivalent.code.in_(codes), Equivalent.equivalent_code.in_(codes))
        )
    ).all()
    found = set()
    for a, b in rows:
        found.add(a)
        found.add(b)
    return found & set(codes)


def equivalents_for(db: Session, code: str) -> list[EquivalentRef]:
    """Tương đương hai chiều (A~B thì B~A), bỏ trùng."""
    refs: dict[str, EquivalentRef] = {}
    for e in db.scalars(select(Equivalent).where(Equivalent.code == code).order_by(Equivalent.equivalent_code)):
        refs.setdefault(e.equivalent_code, EquivalentRef(code=e.equivalent_code, name=e.equivalent_name, credits=e.equivalent_credits))
    for e in db.scalars(select(Equivalent).where(Equivalent.equivalent_code == code).order_by(Equivalent.code)):
        refs.setdefault(e.code, EquivalentRef(code=e.code, name=e.name, credits=e.credits))
    return list(refs.values())


def _item(db: Session, code: str) -> EquivalentItem | None:
    refs = equivalents_for(db, code)
    if not refs:
        return None
    name = credits = None
    e = db.scalar(select(Equivalent).where(Equivalent.code == code).limit(1))
    if e:
        name, credits = e.name, e.credits
    else:
        e = db.scalar(select(Equivalent).where(Equivalent.equivalent_code == code).limit(1))
        if e:
            name, credits = e.equivalent_name, e.equivalent_credits
    m = db.get(Module, code)
    if m:
        name = name or m.name
        credits = credits if credits is not None else m.credits
    return EquivalentItem(code=code, name=name, credits=credits, equivalents=refs)


@router.get("/equivalents", response_model=list[EquivalentItem], summary="Tra cứu học phần tương đương")
def list_equivalents(
    q: str | None = Query(None, description="Mã hoặc tên (không dấu cũng được)"),
    limit: int = Query(500, ge=1, le=5000),
    db: Session = Depends(get_db),
):
    stmt = select(Equivalent.code).distinct().order_by(Equivalent.code)
    for tok in search_tokens(q):
        stmt = stmt.where(Equivalent.search_text.like(f"%{like_escape(tok)}%", escape="\\"))
    codes = list(db.scalars(stmt.limit(limit)))
    return [it for c in codes if (it := _item(db, c)) is not None]


@router.get("/equivalents/{code}", response_model=EquivalentItem, summary="Học phần tương đương của một mã")
def get_equivalent(code: str, db: Session = Depends(get_db)):
    it = _item(db, code.strip())
    if it is None:
        raise HTTPException(404, f"Không có học phần tương đương cho mã {code}.")
    return it
