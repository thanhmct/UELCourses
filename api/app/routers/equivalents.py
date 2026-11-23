from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Equivalent, Module
from app.schemas import EquivalentItem, EquivalentRef
from app.services.catalog_visibility import visible_module
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
            or_(Equivalent.code.in_(codes), Equivalent.equivalent_code.in_(codes)),
            visible_module(Equivalent.code), visible_module(Equivalent.equivalent_code),
        )
    ).all()
    found = set()
    for a, b in rows:
        found.add(a)
        found.add(b)
    return found & set(codes)


def _en_names(db: Session) -> dict[str, str | None]:
    return dict(db.execute(select(Module.code, Module.name_en)).all())


def equivalents_for(db: Session, code: str, en_map: dict[str, str | None] | None = None) -> list[EquivalentRef]:
    """Tương đương hai chiều (A~B thì B~A), bỏ trùng."""
    refs: dict[str, EquivalentRef] = {}
    base = select(Equivalent).where(visible_module(Equivalent.code), visible_module(Equivalent.equivalent_code))
    for e in db.scalars(base.where(Equivalent.code == code).order_by(Equivalent.equivalent_code)):
        refs.setdefault(e.equivalent_code, EquivalentRef(code=e.equivalent_code, name=e.equivalent_name, credits=e.equivalent_credits))
    for e in db.scalars(base.where(Equivalent.equivalent_code == code).order_by(Equivalent.code)):
        refs.setdefault(e.code, EquivalentRef(code=e.code, name=e.name, credits=e.credits))
    if refs:  # tên tiếng Anh lấy từ bảng modules (bảng equivalents chỉ lưu tên Việt tại thời điểm nhập)
        en = en_map if en_map is not None else dict(
            db.execute(select(Module.code, Module.name_en).where(Module.code.in_(list(refs)))).all())
        for c, r in refs.items():
            r.name_en = en.get(c)
    return list(refs.values())


def _item(db: Session, code: str, en_map: dict[str, str | None] | None = None) -> EquivalentItem | None:
    refs = equivalents_for(db, code, en_map)
    if not refs:
        return None
    name = credits = name_en = None
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
        name_en = m.name_en
    return EquivalentItem(code=code, name=name, name_en=name_en, credits=credits, equivalents=refs)


def _bulk_items(db: Session, codes: list[str]) -> list[EquivalentItem]:
    """Cùng kết quả như `_item` cho từng mã, nhưng nạp bảng một lần (2 truy vấn thay vì ~6 truy vấn mỗi mã)."""
    if not codes:
        return []
    eqs = db.scalars(select(Equivalent).where(
        visible_module(Equivalent.code), visible_module(Equivalent.equivalent_code),
    ).order_by(Equivalent.id)).all()
    mods = {c: (n, cr, en) for c, n, cr, en in db.execute(select(Module.code, Module.name, Module.credits, Module.name_en))}
    fwd: dict[str, list[Equivalent]] = defaultdict(list)   # code -> các dòng có code đó là môn gốc
    back: dict[str, list[Equivalent]] = defaultdict(list)  # code -> các dòng có code đó là môn tương đương
    for e in eqs:
        fwd[e.code].append(e)
        back[e.equivalent_code].append(e)
    out: list[EquivalentItem] = []
    for code in codes:
        refs: dict[str, EquivalentRef] = {}
        for e in sorted(fwd.get(code, []), key=lambda x: x.equivalent_code):
            refs.setdefault(e.equivalent_code, EquivalentRef(code=e.equivalent_code, name=e.equivalent_name,
                                                             name_en=mods.get(e.equivalent_code, (None, None, None))[2],
                                                             credits=e.equivalent_credits))
        for e in sorted(back.get(code, []), key=lambda x: x.code):
            refs.setdefault(e.code, EquivalentRef(code=e.code, name=e.name, name_en=mods.get(e.code, (None, None, None))[2],
                                                  credits=e.credits))
        if not refs:
            continue
        name = credits = None
        if fwd.get(code):
            name, credits = fwd[code][0].name, fwd[code][0].credits
        elif back.get(code):
            name, credits = back[code][0].equivalent_name, back[code][0].equivalent_credits
        m = mods.get(code)
        name_en = None
        if m:
            name, credits, name_en = name or m[0], credits if credits is not None else m[1], m[2]
        out.append(EquivalentItem(code=code, name=name, name_en=name_en, credits=credits, equivalents=list(refs.values())))
    return out


@router.get("/equivalents", response_model=list[EquivalentItem], summary="Tra cứu học phần tương đương")
def list_equivalents(
    q: str | None = Query(None, description="Mã hoặc tên (không dấu cũng được)"),
    limit: int = Query(100, ge=1, le=100),
    db: Session = Depends(get_db),
):
    stmt = select(Equivalent.code).where(
        visible_module(Equivalent.code), visible_module(Equivalent.equivalent_code),
    ).distinct().order_by(Equivalent.code)
    for tok in search_tokens(q):
        stmt = stmt.where(Equivalent.search_text.like(f"%{like_escape(tok)}%", escape="\\"))
    codes = list(db.scalars(stmt.limit(limit)))
    return _bulk_items(db, codes)


@router.get("/equivalents/{code}", response_model=EquivalentItem, summary="Học phần tương đương của một mã")
def get_equivalent(code: str, db: Session = Depends(get_db)):
    it = _item(db, code.strip())
    if it is None:
        raise HTTPException(404, f"Không có học phần tương đương cho mã {code}.")
    return it
