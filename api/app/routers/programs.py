from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.models import Equivalent, Module, ModuleRelation, Program, ProgramModule
from app.routers.equivalents import like_escape
from app.schemas import (
    BlockedModule,
    CheckRequest,
    CheckResult,
    ElectiveGroup,
    GraphEdge,
    GraphNode,
    PlannedIssue,
    ProgramBlock,
    ProgramDetail,
    ProgramGraph,
    ProgramModuleOut,
    ProgramSummary,
    TreeNode,
)
from app.services.program_check import ReqModule, check
from app.services.elective_groups import get_elective_groups
from app.services.program_tracks import (
    check_contextual_program,
    get_contextual_module_tree,
    get_contextual_program_detail,
    get_contextual_program_graph,
    resolve_program_and_track,
)
from app.services.requirements import find_cycles
from app.services.text import search_tokens

router = APIRouter(tags=["programs"])

REQ_TYPES = ("prereq", "previous", "coreq")


def _summary(p: Program) -> ProgramSummary:
    total = sum((pm.module.credits or 0) for pm in p.modules if pm.required and pm.module)
    return ProgramSummary(program_id=p.id, name=p.name, cohort=p.cohort, faculty=p.faculty,
                          total_credits=total, module_count=len(p.modules), is_sample=p.is_sample)


def _get_program(db: Session, program_id: str) -> Program:
    p = db.scalar(select(Program).where(Program.id == program_id.strip())
                  .options(selectinload(Program.modules).selectinload(ProgramModule.module)))
    if p is None:
        raise HTTPException(404, f"Không tìm thấy chương trình đào tạo {program_id}.")
    return p


def equivalence_map(db: Session, program_id: str | None = None) -> dict[str, set[str]]:
    eq: dict[str, set[str]] = defaultdict(set)
    for a, b in db.execute(select(Equivalent.code, Equivalent.equivalent_code)):
        eq[a].add(b)
        eq[b].add(a)
    stmt = select(ModuleRelation.source, ModuleRelation.target).where(ModuleRelation.type == "equivalent")
    if program_id:
        stmt = stmt.where(or_(ModuleRelation.program_id == program_id, ModuleRelation.program_id.is_(None)))
    for a, b in db.execute(stmt):
        eq[a].add(b)
        eq[b].add(a)
    return eq


@router.get("/programs", response_model=list[ProgramSummary], summary="Danh sách chương trình đào tạo")
def list_programs(cohort: str | None = Query(None, description="vd K24"), q: str | None = None,
                  db: Session = Depends(get_db)):
    stmt = select(Program).order_by(Program.id)
    if cohort:
        stmt = stmt.where(Program.cohort == cohort.strip().upper())
    else:
        stmt = stmt.where(Program.cohort >= "K23")
    for tok in search_tokens(q):
        stmt = stmt.where(Program.search_text.like(f"%{like_escape(tok)}%", escape="\\"))
    progs = list(db.scalars(stmt))
    # Tổng hợp bằng một truy vấn (trước đây nạp toàn bộ học phần của mọi CTĐT chỉ để cộng tín chỉ: ~240 ms -> vài chục ms).
    required_credits = case((ProgramModule.required.is_(True), func.coalesce(Module.credits, 0)), else_=0)
    agg = {
        pid: (n, float(total or 0))
        for pid, n, total in db.execute(
            select(ProgramModule.program_id, func.count(ProgramModule.id), func.sum(required_credits))
            .outerjoin(Module, Module.code == ProgramModule.module_code)
            .where(ProgramModule.program_id.in_([p.id for p in progs]))
            .group_by(ProgramModule.program_id)
        )
    } if progs else {}
    return [
        ProgramSummary(program_id=p.id, name=p.name, cohort=p.cohort, faculty=p.faculty,
                       total_credits=agg.get(p.id, (0, 0.0))[1], module_count=agg.get(p.id, (0, 0.0))[0], is_sample=p.is_sample)
        for p in progs
    ]


def _pm_out(pm: ProgramModule, eq: dict[str, set[str]]) -> ProgramModuleOut:
    m = pm.module
    return ProgramModuleOut(
        code=pm.module_code, name=m.name if m else None, name_en=m.name_en if m else None,
        credits=m.credits if m else None, required=pm.required,
        suggested_term=pm.suggested_term, suggested_semester=pm.suggested_semester,
        suggested_order=pm.suggested_order, prereq=pm.prereq_tree, previous=pm.previous_tree, coreq=pm.coreq_tree,
        equivalents=sorted(eq.get(pm.module_code, set())), prereq_raw=pm.prereq_raw,
        previous_raw=pm.previous_raw, note=pm.note,
    )


@router.get("/programs/{program_id}", response_model=ProgramDetail, summary="Chi tiết CTĐT theo khối kiến thức")
def get_program(
    program_id: str,
    track: str | None = Query(None, description="Hệ đào tạo: en | english | vi"),
    db: Session = Depends(get_db),
):
    p, is_english, contextual_id = resolve_program_and_track(db, program_id, track)
    return get_contextual_program_detail(db, p, is_english, contextual_id)


@router.get(
    "/programs/{program_id}/elective-groups",
    response_model=list[ElectiveGroup],
    summary="Danh sách nhóm môn tự chọn của CTĐT",
)
def get_program_elective_groups(
    program_id: str,
    track: str | None = Query(None, description="Hệ đào tạo: en | english | vi"),
    db: Session = Depends(get_db),
):
    """Lấy danh sách các nhóm môn tự chọn của CTĐT kèm số tín chỉ yêu cầu.

    Trả về [{block, required_credits, available_credits, modules[]}].
    Nếu CTĐT không có quy định số tín chỉ tự chọn trong DB (thiếu ở trường note, block, và catalog entries),
    hàm trả về mảng rỗng [] — tuyệt đối không bịa số.
    """
    p, is_english, _ = resolve_program_and_track(db, program_id, track)
    return get_elective_groups(db, p, is_english)


@router.get("/programs/{program_id}/graph", response_model=ProgramGraph, summary="Đồ thị môn học của CTĐT")
def program_graph(
    program_id: str,
    track: str | None = Query(None, description="Hệ đào tạo: en | english | vi"),
    db: Session = Depends(get_db),
):
    p, is_english, _ = resolve_program_and_track(db, program_id, track)
    return get_contextual_program_graph(db, p, is_english)


@router.get("/modules/{code}/tree", response_model=TreeNode, summary="Cây tiên quyết / mở khóa của một học phần")
def module_tree(
    code: str,
    program_id: str | None = Query(None, description="Chỉ xét quan hệ trong CTĐT này"),
    direction: str = Query("prereq", pattern="^(prereq|unlocks)$",
                           description="prereq: các môn cần học trước; unlocks: các môn được mở khóa"),
    depth: int = Query(10, ge=1, le=30),
    db: Session = Depends(get_db),
):
    return get_contextual_module_tree(db, code, program_id, direction, depth)


@router.post("/programs/{program_id}/check", response_model=CheckResult,
             summary="Kiểm tra môn đủ điều kiện / bị chặn theo CTĐT")
def check_program(
    program_id: str,
    body: CheckRequest,
    track: str | None = Query(None, description="Hệ đào tạo: en | english | vi"),
    db: Session = Depends(get_db),
):
    p, is_english, _ = resolve_program_and_track(db, program_id, track)
    return check_contextual_program(db, p, is_english, body)
