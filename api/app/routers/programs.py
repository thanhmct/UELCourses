from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.models import Equivalent, Module, ModuleRelation, Program, ProgramModule
from app.routers.equivalents import like_escape
from app.schemas import (
    BlockedModule,
    CheckRequest,
    CheckResult,
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
    stmt = select(Program).options(selectinload(Program.modules).selectinload(ProgramModule.module)).order_by(Program.id)
    if cohort:
        stmt = stmt.where(Program.cohort == cohort.strip().upper())
    else:
        stmt = stmt.where(Program.cohort >= "K23")
    for tok in search_tokens(q):
        stmt = stmt.where(Program.search_text.like(f"%{like_escape(tok)}%", escape="\\"))
    return [_summary(p) for p in db.scalars(stmt)]


def _pm_out(pm: ProgramModule, eq: dict[str, set[str]]) -> ProgramModuleOut:
    m = pm.module
    return ProgramModuleOut(
        code=pm.module_code, name=m.name if m else None, credits=m.credits if m else None, required=pm.required,
        suggested_term=pm.suggested_term, suggested_semester=pm.suggested_semester,
        suggested_order=pm.suggested_order, prereq=pm.prereq_tree, previous=pm.previous_tree, coreq=pm.coreq_tree,
        equivalents=sorted(eq.get(pm.module_code, set())), prereq_raw=pm.prereq_raw,
        previous_raw=pm.previous_raw, note=pm.note,
    )


@router.get("/programs/{program_id}", response_model=ProgramDetail, summary="Chi tiết CTĐT theo khối kiến thức")
def get_program(program_id: str, db: Session = Depends(get_db)):
    p = _get_program(db, program_id)
    eq = equivalence_map(db, p.id)
    blocks: dict[tuple[str, str | None], ProgramBlock] = {}
    for pm in sorted(p.modules, key=lambda x: (x.suggested_order or 999, x.module_code)):
        key = (pm.block or "Khác", pm.parent_block)
        b = blocks.setdefault(key, ProgramBlock(name=key[0], parent=key[1]))
        b.modules.append(_pm_out(pm, eq))
        cr = (pm.module.credits or 0) if pm.module else 0
        b.total_credits += cr
        if pm.required:
            b.required_credits += cr
    return ProgramDetail(program=_summary(p), blocks=list(blocks.values()))


@router.get("/programs/{program_id}/graph", response_model=ProgramGraph, summary="Đồ thị môn học của CTĐT")
def program_graph(program_id: str, db: Session = Depends(get_db)):
    p = _get_program(db, program_id)
    rels = list(db.scalars(select(ModuleRelation).where(ModuleRelation.program_id == p.id)
                           .order_by(ModuleRelation.source, ModuleRelation.target)))
    nodes = {pm.module_code: GraphNode(
        code=pm.module_code, name=pm.module.name if pm.module else None,
        credits=pm.module.credits if pm.module else None, required=pm.required,
        suggested_term=pm.suggested_term, suggested_order=pm.suggested_order, block=pm.block,
    ) for pm in p.modules}
    extra = {c for r in rels for c in (r.source, r.target)} - nodes.keys()
    for m in db.scalars(select(Module).where(Module.code.in_(extra))) if extra else []:
        nodes[m.code] = GraphNode(code=m.code, name=m.name, credits=m.credits, in_program=False)
    for c in extra - nodes.keys():
        nodes[c] = GraphNode(code=c, in_program=False)
    edges = [GraphEdge(source=r.source, target=r.target, type=r.type) for r in rels]
    cycles = find_cycles((e.source, e.target) for e in edges if e.type in REQ_TYPES)
    return ProgramGraph(nodes=sorted(nodes.values(), key=lambda n: (n.suggested_order or 999, n.code)),
                        edges=edges, cycles=cycles)


@router.get("/modules/{code}/tree", response_model=TreeNode, summary="Cây tiên quyết / mở khóa của một học phần")
def module_tree(
    code: str,
    program_id: str | None = Query(None, description="Chỉ xét quan hệ trong CTĐT này"),
    direction: str = Query("prereq", pattern="^(prereq|unlocks)$",
                           description="prereq: các môn cần học trước; unlocks: các môn được mở khóa"),
    depth: int = Query(10, ge=1, le=30),
    db: Session = Depends(get_db),
):
    code = code.strip()
    stmt = select(ModuleRelation).where(ModuleRelation.type.in_(REQ_TYPES))
    if program_id:
        stmt = stmt.where(ModuleRelation.program_id == program_id)
    adj: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for r in db.scalars(stmt):
        if direction == "prereq":
            adj[r.target].append((r.source, r.type))
        else:
            adj[r.source].append((r.target, r.type))
    for k in adj:
        adj[k] = sorted(set(adj[k]))
    codes = {code} | {c for v in adj.values() for c, _ in v} | set(adj)
    names = dict(db.execute(select(Module.code, Module.name).where(Module.code.in_(codes))).all())
    if code not in names and code not in adj and not any(code == c for v in adj.values() for c, _ in v):
        raise HTTPException(404, f"Không tìm thấy học phần {code}.")
    trees: dict[str, tuple] = {}
    if program_id and direction == "prereq":
        for pm in db.scalars(select(ProgramModule).where(ProgramModule.program_id == program_id)):
            trees[pm.module_code] = (pm.prereq_tree, pm.previous_tree)

    def build(c: str, rtype: str, path: tuple[str, ...], level: int) -> TreeNode:
        pt, vt = trees.get(c, (None, None))
        node = TreeNode(code=c, name=names.get(c), type=rtype, prereq_tree=pt, previous_tree=vt)
        if c in path:
            node.cycle = True
            return node
        if level >= depth:
            node.truncated = bool(adj.get(c))
            return node
        node.children = [build(child, t, path + (c,), level + 1) for child, t in adj.get(c, [])]
        return node

    return build(code, "root", (), 0)


@router.post("/programs/{program_id}/check", response_model=CheckResult,
             summary="Kiểm tra môn đủ điều kiện / bị chặn theo CTĐT")
def check_program(program_id: str, body: CheckRequest, db: Session = Depends(get_db)):
    p = _get_program(db, program_id)
    mods = [ReqModule(code=pm.module_code, prereq=pm.prereq_tree, previous=pm.previous_tree,
                      coreq=pm.coreq_tree, order=pm.suggested_order) for pm in p.modules]
    res = check(mods, [(c.code, c.grade) for c in body.completed], body.planned, equivalence_map(db, p.id))
    return CheckResult(
        eligible_now=res.eligible_now,
        blocked=[BlockedModule(**b) for b in res.blocked],
        passed=res.passed,
        planned_issues=[PlannedIssue(**x) for x in res.planned_issues],
        warnings=res.warnings,
        # Liên kết quy chế (Điều/Khoản về tiên quyết/học trước) do module RAG cung cấp; chưa ánh xạ tự động.
        rule_refs=[],
    )
