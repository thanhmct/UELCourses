"""Centralized resolution and contextual views for program tracks (English track 'E' and standard)."""

from __future__ import annotations

import re
from typing import Any, Callable

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Module, ModuleRelation, Program, ProgramModule
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

REQ_TYPES = ("prereq", "previous", "coreq")


def parse_track_identifier(raw_id: str) -> tuple[str, str, bool]:
    """Tách mã chương trình thành (base_id, suffix, is_english).

    VD:
      - 'K26409E' -> ('K26409', 'E', True)
      - 'K26409E1' -> ('K26409', 'E1', True)
      - 'K26409E2' -> ('K26409', 'E2', True)
      - 'K26409' -> ('K26409', '', False)
      - 'K26409A' -> ('K26409', 'A', False)
      - 'K23406H' -> ('K23406', 'H', False)
    """
    clean = raw_id.strip().upper()
    # Khớp K + 2 số khóa + 3 số ngành + hậu tố (E\d*, A\d*, H...)
    m = re.match(r"^(K?\d{5})([A-Z]\d*)?$", clean)
    if m:
        base = m.group(1)
        suffix = m.group(2) or ""
        is_en = suffix.startswith("E")
        return base, suffix, is_en

    # Biểu thức tổng quát cho mã bất kỳ kết thúc bằng E/E\d*
    m2 = re.match(r"^(.+?)(E\d*)$", clean)
    if m2:
        return m2.group(1), m2.group(2), True

    return clean, "", False


def resolve_program_and_track(
    db: Session, program_id: str, track: str | None = None
) -> tuple[Program, bool, str]:
    """Tìm Program trong DB và xác định xem có phải hệ tiếng Anh hay không.

    Hỗ trợ:
      - Mã có hậu tố E/E1/E2 (vd K26409E, K26409E1)
      - Tham số track='en' hoặc 'english'
      - Mã chuẩn K26409 (canonical)

    Trả về: (Program, is_english, contextual_id)
    """
    clean_id = program_id.strip()
    base_candidate, suffix, parsed_en = parse_track_identifier(clean_id)
    explicit_en = (track or "").strip().lower() in ("en", "english")
    is_english = parsed_en or explicit_en

    # 1. Thử lấy theo clean_id chính xác nếu có sẵn trong DB
    p = db.scalar(
        select(Program)
        .where(Program.id == clean_id)
        .options(selectinload(Program.modules).selectinload(ProgramModule.module))
    )
    if p is not None:
        contextual_id = f"{p.id}E" if is_english else p.id
        return p, is_english, contextual_id

    # 2. Thử lấy theo base_candidate nếu khác clean_id
    if base_candidate != clean_id:
        p = db.scalar(
            select(Program)
            .where(Program.id == base_candidate)
            .options(selectinload(Program.modules).selectinload(ProgramModule.module))
        )
        if p is not None:
            contextual_id = f"{p.id}E" if is_english else p.id
            return p, is_english, contextual_id

    raise HTTPException(404, f"Không tìm thấy chương trình đào tạo {program_id}.")


def build_program_track_mapping(
    db: Session, program: Program, is_english: bool
) -> tuple[dict[str, str], dict[str, Module | None], dict[str, bool]]:
    """Xây dựng bản đồ chuyển đổi mã môn học cho CTĐT theo hệ đào tạo.

    Đối với hệ tiếng Anh (is_english=True):
      - Môn đã bắt đầu bằng E (hoặc language_track='en'): giữ nguyên.
      - Môn cơ sở có counterpart_code bắt đầu bằng E và tồn tại thực trong bảng modules:
        chuyển sang counterpart_code.
      - Môn không có bản tương ứng E (hoặc counterpart không tồn tại trong DB):
        giữ nguyên mã gốc và ghi nhận thiếu counterpart (truthful missing notice).
        Không bao giờ bịa mã E giả.

    Trả về:
      - code_map: dict[mã_gốc, mã_chuyển_đổi]
      - mapped_module_map: dict[mã_gốc, Module_đã_chuyển_đổi]
      - missing_notice_map: dict[mã_gốc, bool] (True nếu là môn chưa có bản E tương ứng)
    """
    code_map: dict[str, str] = {}
    mapped_module_map: dict[str, Module | None] = {}
    missing_notice_map: dict[str, bool] = {}

    if not is_english:
        for pm in program.modules:
            code_map[pm.module_code] = pm.module_code
            mapped_module_map[pm.module_code] = pm.module
            missing_notice_map[pm.module_code] = False
        return code_map, mapped_module_map, missing_notice_map

    # Thu thập trước các counterpart_code tiềm năng để nạp 1 lần
    candidates: set[str] = set()
    for pm in program.modules:
        m = pm.module
        if m and m.counterpart_code and m.counterpart_code.startswith("E"):
            candidates.add(m.counterpart_code)

    existing_cps: dict[str, Module] = {}
    if candidates:
        for cp_mod in db.scalars(select(Module).where(Module.code.in_(candidates))):
            existing_cps[cp_mod.code] = cp_mod

    for pm in program.modules:
        orig_code = pm.module_code
        m = pm.module
        is_already_en = orig_code.startswith("E") or (m is not None and m.language_track == "en")

        if is_already_en:
            code_map[orig_code] = orig_code
            mapped_module_map[orig_code] = m
            missing_notice_map[orig_code] = False
        else:
            cp_code = m.counterpart_code if m else None
            if cp_code and cp_code.startswith("E") and cp_code in existing_cps:
                code_map[orig_code] = cp_code
                mapped_module_map[orig_code] = existing_cps[cp_code]
                missing_notice_map[orig_code] = False
            else:
                code_map[orig_code] = orig_code
                mapped_module_map[orig_code] = m
                missing_notice_map[orig_code] = True

    return code_map, mapped_module_map, missing_notice_map


def remap_tree(tree: Any, map_fn: Callable[[str], str]) -> Any:
    """Đổi mã trong cây quan hệ JSON ({and: [...]}, {or: [...]}, danh sách, chuỗi đơn).

    Bảo toàn ngữ nghĩa AND / OR và khử trùng lặp các nhánh đồng nhất.
    """
    if isinstance(tree, str):
        return map_fn(tree)
    if isinstance(tree, dict):
        res: dict[str, Any] = {}
        for k, v in tree.items():
            if isinstance(v, list):
                seen: set[str] = set()
                mapped_list: list[Any] = []
                for item in v:
                    mapped_item = remap_tree(item, map_fn)
                    key = repr(mapped_item)
                    if key not in seen:
                        seen.add(key)
                        mapped_list.append(mapped_item)
                res[k] = mapped_list
            else:
                res[k] = remap_tree(v, map_fn)
        return res
    if isinstance(tree, list):
        seen_list: set[str] = set()
        out_list: list[Any] = []
        for item in tree:
            mapped_item = remap_tree(item, map_fn)
            key = repr(mapped_item)
            if key not in seen_list:
                seen_list.add(key)
                out_list.append(mapped_item)
        return out_list
    return tree


def make_code_resolver(db: Session, code_map: dict[str, str], is_english: bool) -> Callable[[str], str]:
    def resolve_code(code: str) -> str:
        s = code.strip()
        if not s:
            return s
        if s in code_map:
            return code_map[s]
        if is_english and not s.startswith("E"):
            m = db.get(Module, s)
            if m and m.counterpart_code and m.counterpart_code.startswith("E"):
                cp = db.get(Module, m.counterpart_code)
                if cp:
                    code_map[s] = cp.code
                    return cp.code
        return s

    return resolve_code


def get_contextual_program_detail(
    db: Session, program: Program, is_english: bool, contextual_id: str | None = None
) -> ProgramDetail:
    code_map, mapped_module_map, missing_notice_map = build_program_track_mapping(db, program, is_english)
    resolver = make_code_resolver(db, code_map, is_english)

    from app.routers.programs import equivalence_map

    eq = equivalence_map(db, program.id)
    if is_english:
        for orig, mapped in code_map.items():
            if orig != mapped:
                eq[orig].add(mapped)
                eq[mapped].add(orig)

    blocks: dict[tuple[str, str | None], ProgramBlock] = {}
    for pm in sorted(program.modules, key=lambda x: (x.suggested_order or 999, x.module_code)):
        orig_code = pm.module_code
        mapped_code = code_map[orig_code]
        m_mapped = mapped_module_map.get(orig_code) or pm.module
        is_missing = missing_notice_map.get(orig_code, False)

        note = pm.note
        if is_missing:
            notice = "[Hệ tiếng Anh] Chưa có mã học phần tương ứng bắt đầu bằng E (giữ nguyên mã gốc)"
            note = f"{note} · {notice}" if note else notice

        cr = (m_mapped.credits or 0) if m_mapped else ((pm.module.credits or 0) if pm.module else 0)

        mapped_prereq = remap_tree(pm.prereq_tree, resolver)
        mapped_previous = remap_tree(pm.previous_tree, resolver)
        mapped_coreq = remap_tree(pm.coreq_tree, resolver)

        # Gộp tương đương và đổi mã tương đương
        raw_eqs = eq.get(orig_code, set()) | eq.get(mapped_code, set())
        mapped_eqs = sorted({resolver(c) for c in raw_eqs if c != mapped_code})

        pm_out = ProgramModuleOut(
            code=mapped_code,
            name=m_mapped.name if m_mapped else None,
            name_en=m_mapped.name_en if m_mapped else None,
            credits=cr,
            required=pm.required,
            suggested_term=pm.suggested_term,
            suggested_semester=pm.suggested_semester,
            suggested_order=pm.suggested_order,
            prereq=mapped_prereq,
            previous=mapped_previous,
            coreq=mapped_coreq,
            equivalents=mapped_eqs,
            prereq_raw=pm.prereq_raw,
            previous_raw=pm.previous_raw,
            note=note,
        )

        key = (pm.block or "Khác", pm.parent_block)
        b = blocks.setdefault(key, ProgramBlock(name=key[0], parent=key[1]))
        b.modules.append(pm_out)
        b.total_credits += cr
        if pm.required:
            b.required_credits += cr

    total_req_cr = sum((m.credits or 0) for b in blocks.values() for m in b.modules if m.required)
    p_name = f"{program.name} (Hệ tiếng Anh)" if is_english else program.name
    pid = contextual_id or (f"{program.id}E" if is_english else program.id)

    summary = ProgramSummary(
        program_id=pid,
        name=p_name,
        cohort=program.cohort,
        faculty=program.faculty,
        total_credits=total_req_cr,
        module_count=len(program.modules),
        is_sample=program.is_sample,
    )
    return ProgramDetail(program=summary, blocks=list(blocks.values()))


def get_contextual_program_graph(db: Session, program: Program, is_english: bool) -> ProgramGraph:
    code_map, mapped_module_map, _ = build_program_track_mapping(db, program, is_english)
    resolver = make_code_resolver(db, code_map, is_english)

    rels = list(
        db.scalars(
            select(ModuleRelation)
            .where(ModuleRelation.program_id == program.id)
            .order_by(ModuleRelation.source, ModuleRelation.target)
        )
    )

    nodes: dict[str, GraphNode] = {}
    for pm in program.modules:
        mapped_code = code_map[pm.module_code]
        m_mapped = mapped_module_map.get(pm.module_code) or pm.module
        nodes[mapped_code] = GraphNode(
            code=mapped_code,
            name=m_mapped.name if m_mapped else None,
            name_en=m_mapped.name_en if m_mapped else None,
            credits=m_mapped.credits if m_mapped else None,
            required=pm.required,
            suggested_term=pm.suggested_term,
            suggested_order=pm.suggested_order,
            block=pm.block,
            in_program=True,
        )

    edges: list[GraphEdge] = []
    edges_seen: set[tuple[str, str, str]] = set()
    for r in rels:
        s = resolver(r.source)
        t = resolver(r.target)
        key = (s, t, r.type)
        if key not in edges_seen:
            edges_seen.add(key)
            edges.append(GraphEdge(source=s, target=t, type=r.type))

    extra = {c for e in edges for c in (e.source, e.target)} - nodes.keys()
    if extra:
        for m in db.scalars(select(Module).where(Module.code.in_(extra))):
            nodes[m.code] = GraphNode(
                code=m.code, name=m.name, name_en=m.name_en, credits=m.credits, in_program=False
            )
        for c in extra - nodes.keys():
            nodes[c] = GraphNode(code=c, in_program=False)

    cycles = find_cycles((e.source, e.target) for e in edges if e.type in REQ_TYPES)
    return ProgramGraph(
        nodes=sorted(nodes.values(), key=lambda n: (n.suggested_order or 999, n.code)),
        edges=edges,
        cycles=cycles,
    )


def get_contextual_module_tree(
    db: Session,
    code: str,
    program_id: str | None,
    direction: str,
    depth: int,
) -> TreeNode:
    code = code.strip()
    is_english = False
    prog: Program | None = None
    code_map: dict[str, str] = {}
    resolver: Callable[[str], str] = lambda c: c

    if program_id:
        prog, is_english, _ = resolve_program_and_track(db, program_id)
        code_map, _, _ = build_program_track_mapping(db, prog, is_english)
        resolver = make_code_resolver(db, code_map, is_english)

    stmt = select(ModuleRelation).where(ModuleRelation.type.in_(REQ_TYPES))
    if prog:
        stmt = stmt.where(ModuleRelation.program_id == prog.id)

    adj: dict[str, list[tuple[str, str]]] = {}
    for r in db.scalars(stmt):
        s = resolver(r.source)
        t = resolver(r.target)
        if direction == "prereq":
            adj.setdefault(t, []).append((s, r.type))
        else:
            adj.setdefault(s, []).append((t, r.type))

    for k in adj:
        adj[k] = sorted(set(adj[k]))

    codes = {code} | {c for v in adj.values() for c, _ in v} | set(adj)
    name_rows = db.execute(select(Module.code, Module.name, Module.name_en).where(Module.code.in_(codes))).all()
    names = {c: n for c, n, _ in name_rows}
    names_en = {c: e for c, _, e in name_rows}

    if code not in names and code not in adj and not any(code == c for v in adj.values() for c, _ in v):
        raise HTTPException(404, f"Không tìm thấy học phần {code}.")

    trees: dict[str, tuple] = {}
    if prog and direction == "prereq":
        for pm in prog.modules:
            mapped_c = code_map.get(pm.module_code, pm.module_code)
            pt = remap_tree(pm.prereq_tree, resolver)
            vt = remap_tree(pm.previous_tree, resolver)
            trees[mapped_c] = (pt, vt)

    def build(c: str, rtype: str, path: tuple[str, ...], level: int) -> TreeNode:
        pt, vt = trees.get(c, (None, None))
        node = TreeNode(
            code=c, name=names.get(c), name_en=names_en.get(c), type=rtype, prereq_tree=pt, previous_tree=vt
        )
        if c in path:
            node.cycle = True
            return node
        if level >= depth:
            node.truncated = bool(adj.get(c))
            return node
        node.children = [build(child, t, path + (c,), level + 1) for child, t in adj.get(c, [])]
        return node

    return build(code, "root", (), 0)


def check_contextual_program(
    db: Session, program: Program, is_english: bool, body: CheckRequest
) -> CheckResult:
    code_map, _, _ = build_program_track_mapping(db, program, is_english)
    resolver = make_code_resolver(db, code_map, is_english)

    mods: list[ReqModule] = []
    for pm in program.modules:
        mapped_code = code_map[pm.module_code]
        pt = remap_tree(pm.prereq_tree, resolver)
        vt = remap_tree(pm.previous_tree, resolver)
        ct = remap_tree(pm.coreq_tree, resolver)
        mods.append(
            ReqModule(
                code=mapped_code,
                prereq=pt,
                previous=vt,
                coreq=ct,
                order=pm.suggested_order,
            )
        )

    from app.routers.programs import equivalence_map

    eq = equivalence_map(db, program.id)
    if is_english:
        for orig, mapped in code_map.items():
            if orig != mapped:
                eq[orig].add(mapped)
                eq[mapped].add(orig)

    res = check(mods, [(c.code, c.grade) for c in body.completed], body.planned, eq)
    return CheckResult(
        eligible_now=res.eligible_now,
        blocked=[BlockedModule(**b) for b in res.blocked],
        passed=res.passed,
        planned_issues=[PlannedIssue(**x) for x in res.planned_issues],
    )


def get_program_track_codes(db: Session, program_id: str) -> set[str]:
    """Trả về tập hợp mã học phần (đã map theo hệ) thuộc CTĐT được chỉ định."""
    prog, is_english, _ = resolve_program_and_track(db, program_id)
    if not is_english:
        return {pm.module_code for pm in prog.modules}
    code_map, _, _ = build_program_track_mapping(db, prog, is_english=True)
    return set(code_map.values())
