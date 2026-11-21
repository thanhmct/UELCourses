"""Học phần tương đương từ cổng portal (`GET /backend/api/student/equivalentcourse`) + sửa dữ liệu `equivalents` bị hỏng.

Định dạng thật của cổng: MaMon (mã cũ), TenMon, MaMonTuongDuong = "<mã mới>-<tên>-<n> tín chỉ", TenMonTuongDuong (tên Việt sạch),
TenHPTATuongDuong (tên tiếng Anh), STC, STCTuongDuong. Endpoint chỉ trả học phần tương đương của các CTĐT của tài khoản đang đăng nhập.

File cũ `equivalents_portal.json` bị hỏng khi tạo (chuỗi "EAA2028-NGUYÊN LÝ…" bị tách ở ký tự có dấu thành mảnh "3", "M", "TC"…),
nên `repair_equivalents` bỏ các dòng mảnh và chuẩn hóa dòng còn bắt đầu bằng mã ("EAA2028-NGUY" -> "EAA2028").
"""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Equivalent, Module
from app.services.english_names import is_clean_english
from app.services.importer import import_equivalents
from app.services.text import normalize_search

CODE_RE = re.compile(r"^([A-Z]{1,4}\d{2,5}[A-Z]?)(?:-|$)")
_CREDITS_TAIL = re.compile(r"\s*-\s*\d+\s*tín chỉ\s*$", re.I)


def code_of(token: Any) -> str | None:
    m = CODE_RE.match(str(token or "").strip())
    return m.group(1) if m else None


def repair_equivalents(db: Session) -> dict:
    """Bỏ dòng mảnh vỡ (equivalent_code không bắt đầu bằng mã), chuẩn hóa mã còn dính hậu tố, bỏ trùng. Idempotent."""
    mods = {m.code: m for m in db.scalars(select(Module))}
    rows = db.scalars(select(Equivalent).order_by(Equivalent.id)).all()
    taken = {(e.code, e.equivalent_code) for e in rows if CODE_RE.fullmatch(e.equivalent_code or "")}
    deleted = normalized = deduped = 0
    for e in rows:
        if CODE_RE.fullmatch(e.equivalent_code or ""):
            continue  # đã là mã sạch
        new = code_of(e.equivalent_code)
        if not new or new == e.code:
            db.delete(e)
            deleted += 1
        elif (e.code, new) in taken:
            db.delete(e)
            deduped += 1
        else:
            taken.add((e.code, new))
            e.equivalent_code = new
            m = mods.get(new)
            if m:
                e.equivalent_name = e.equivalent_name or m.name
                e.equivalent_credits = e.equivalent_credits if e.equivalent_credits is not None else m.credits
            e.search_text = normalize_search(f"{e.code} {e.name or ''} {new} {e.equivalent_name or ''}")
            normalized += 1
    db.commit()
    return {"deleted_fragments": deleted, "normalized": normalized, "deduplicated": deduped}


def import_portal_equivalents(db: Session, rows: list[dict], *, repair: bool = True) -> dict:
    repaired = repair_equivalents(db) if repair else {}
    payload: list[dict] = []
    en_by_code: dict[str, str] = {}
    skipped = 0
    for r in rows:
        code = str(r.get("MaMon") or "").strip()
        eq = code_of(r.get("MaMonTuongDuong"))
        if not code or not eq:
            skipped += 1
            continue
        payload.append({
            "MaMon": code, "TenMon": _CREDITS_TAIL.sub("", str(r.get("TenMon") or "")).strip() or None, "STC": r.get("STC"),
            "MaMonTuongDuong": eq, "TenMonTuongDuong": r.get("TenMonTuongDuong"), "STCTuongDuong": r.get("STCTuongDuong"),
        })
        if is_clean_english(r.get("TenHPTATuongDuong")):
            en_by_code.setdefault(eq, str(r["TenHPTATuongDuong"]).strip())
    res = import_equivalents(db, payload)
    named = 0  # tên tiếng Anh của cổng: nguồn thấp nhất, không ghi đè tên từ đề cương/catalog/bảng đối chiếu/nhập tay
    for code, en in en_by_code.items():
        m = db.get(Module, code)
        if m is not None and (not m.name_en or m.name_en_source == "portal"):
            m.name_en, m.name_en_source = en, "portal"
            named += 1
    db.commit()
    return {"imported": res.imported, "skipped": res.skipped + skipped, "modules_named_en": named, "repair": repaired}
