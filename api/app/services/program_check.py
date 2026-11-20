"""Kiểm tra điều kiện đăng ký học phần theo CTĐT.

Quy ước (ARCHITECTURE.md, theo quy chế tín chỉ):
* tiên quyết (prereq): phải học và ĐẠT môn nguồn;
* học trước (previous): chỉ cần ĐÃ HỌC môn nguồn (kể cả chưa đạt);
* song hành (coreq): đã học hoặc học cùng kỳ;
* môn tương đương thay thế được môn yêu cầu.

Ngưỡng "đạt" mặc định (GIẢ ĐỊNH, cần đối chiếu quy chế từng khóa): điểm thang 10 >= 4.0,
hoặc điểm chữ khác F; không ghi điểm = coi là đạt.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

from app.services.requirements import evaluate

PASS_GRADE_10 = 4.0
FAIL_LETTERS = {"F", "F+", "0"}


def is_pass(grade: Any) -> bool:
    if grade is None or grade == "":
        return True
    if isinstance(grade, (int, float)):
        return float(grade) >= PASS_GRADE_10
    s = str(grade).strip().upper().replace(",", ".")
    if re.fullmatch(r"\d+(\.\d+)?", s):
        return float(s) >= PASS_GRADE_10
    return s not in FAIL_LETTERS


@dataclass
class ReqModule:
    code: str
    prereq: Any = None
    previous: Any = None
    coreq: Any = None
    order: int | None = None


@dataclass
class CheckOutput:
    eligible_now: list[str] = field(default_factory=list)
    blocked: list[dict] = field(default_factory=list)
    passed: list[str] = field(default_factory=list)
    planned_issues: list[dict] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _term_key(t: str):
    nums = [int(x) for x in re.findall(r"\d+", t)]
    return (nums, t)


def _typed(missing: list[dict], rtype: str) -> list[dict]:
    return [{"type": rtype, **m} for m in missing]


def check(modules: Iterable[ReqModule], completed: list[tuple[str, Any]], planned: dict[str, list[str]],
          equivalents: dict[str, set[str]]) -> CheckOutput:
    mods = {m.code: m for m in modules}
    out = CheckOutput()
    taken = {c.strip().upper() for c, _ in completed}
    passed = {c.strip().upper() for c, g in completed if is_pass(g)}

    def satisfied_by(pool: set[str]):
        def ok(code: str) -> bool:
            if code in pool:
                return True
            return any(e in pool for e in equivalents.get(code, ()))
        return ok

    def evaluate_module(m: ReqModule, pass_pool: set[str], taken_pool: set[str], coreq_pool: set[str]) -> list[dict]:
        missing: list[dict] = []
        sat, miss = evaluate(m.prereq, satisfied_by(pass_pool))
        if not sat:
            missing += _typed(miss, "prereq")
        sat, miss = evaluate(m.previous, satisfied_by(taken_pool))
        if not sat:
            missing += _typed(miss, "previous")
        sat, miss = evaluate(m.coreq, satisfied_by(coreq_pool))
        if not sat:
            missing += _typed(miss, "coreq")
        return missing

    def done(code: str) -> bool:
        return code in passed or any(e in passed for e in equivalents.get(code, ()))

    ordered = sorted(mods.values(), key=lambda m: (m.order or 999, m.code))
    out.passed = [m.code for m in ordered if done(m.code)]
    for m in ordered:
        if done(m.code):
            continue
        missing = evaluate_module(m, passed, taken, taken)
        if any(x["type"] != "coreq" for x in missing):
            out.blocked.append({"code": m.code, "missing": missing})
        else:
            out.eligible_now.append(m.code)
            if missing:  # chỉ thiếu song hành -> vẫn đăng ký được nếu học cùng kỳ
                codes = [x.get("code") or "/".join(x.get("one_of") or []) for x in missing]
                out.warnings.append(f"{m.code}: cần đăng ký học song hành {', '.join(codes)}")

    # Kế hoạch: các kỳ trước coi như đã học và đạt
    pool_pass, pool_taken = set(passed), set(taken)
    for term in sorted(planned, key=_term_key):
        codes = [c.strip().upper() for c in planned[term] if c and c.strip()]
        same = set(codes)
        for code in codes:
            m = mods.get(code)
            if m is None:
                out.warnings.append(f"{term}: {code} không thuộc CTĐT này — không kiểm tra điều kiện")
                continue
            if code in pool_pass:
                out.warnings.append(f"{term}: {code} đã đạt trước đó (học lại/cải thiện?)")
            missing = evaluate_module(m, pool_pass, pool_taken, pool_taken | same)
            if missing:
                out.planned_issues.append({"term": term, "code": code, "missing": missing})
                desc = ", ".join(f"{x['type']}:{x.get('code') or '/'.join(x.get('one_of') or [])}" for x in missing)
                out.warnings.append(f"{term}: {code} chưa đủ điều kiện ({desc})")
        pool_pass |= same
        pool_taken |= same
    if any(g not in (None, "") for _, g in completed):
        out.warnings.append("Ngưỡng 'đạt' đang dùng giả định: điểm >= 4.0 (thang 10) hoặc điểm chữ khác F — "
                            "cần đối chiếu quy chế áp dụng cho khóa.")
    return out
