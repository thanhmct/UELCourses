"""Centralized resolution and contextual views for program tracks (English track 'E' and standard)."""

from __future__ import annotations

import re
import time
from typing import Any, Callable

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import ClassSection, Module, ModuleRelation, Program, ProgramCatalogEntry, ProgramModule
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
from app.services.catalog_visibility import visible_module, visible_program_modules
from app.services.program_check import ReqModule, check
from app.services.program_names import parse_class_code, resolve_program_alias
from app.services.requirements import find_cycles

REQ_TYPES = ("prereq", "previous", "coreq")


_VALID_GROUPS_CACHE: tuple[float, list[dict[str, Any]]] | None = None
_CACHE_TTL_SECONDS = 60.0

MAJOR_LABELS_TO_CODE = {
    "kinh tế": "401",
    "kinh tế học": "401",
    "kinh tế đối ngoại": "402",
    "kinh tế quốc tế": "402",
    "kinh tế và quản lý công": "403",
    "kinh tế và quản lý": "403",
    "tài chính": "404",
    "tài chính - ngân hàng": "404",
    "tài chính – ngân hàng": "404",
    "kế toán": "405",
    "hệ thống thông tin quản lý": "406",
    "hệ thống thông tin": "406",
    "quản trị kinh doanh": "407",
    "kinh doanh quốc tế": "408",
    "kiểm toán": "409",
    "marketing": "410",
    "thương mại điện tử": "411",
    "ngân hàng": "412",
    "toán ứng dụng trong kinh tế, quản trị và tài chính": "413",
    "toán kinh tế": "413",
    "công nghệ tài chính": "414",
    "quản trị du lịch và lữ hành": "415",
    "kinh doanh số và trí tuệ nhân tạo": "416",
    "digital marketing": "417",
    "quản lý công": "418",
    "phân tích dữ liệu": "419",
}

OFFICIAL_ENGLISH_TRACK_MAJORS: set[str] = {
    "402",  # Kinh tế quốc tế / Kinh tế đối ngoại
    "404",  # Tài chính - Ngân hàng (404E)
    "405",  # Kế toán (405E)
    "407",  # Quản trị kinh doanh (407E)
    "408",  # Kinh doanh quốc tế (408E)
    "409",  # Kiểm toán (409E / 405E)
    "410",  # Marketing (410E)
    "411",  # Thương mại điện tử (411E, 411TE)
    "413",  # Toán ứng dụng trong kinh tế, quản trị và tài chính (413E)
    "502",  # Luật thương mại quốc tế (502E)
    "503",  # Luật dân sự (503E)
}


def kind_of_suffix(suffix: str) -> str:
    if not suffix:
        return "standard"
    first = suffix[0].upper()
    if first == "H":
        return "coop"
    if first == "T":
        return "talent"
    if first == "E":
        return "english"
    if first in ("A", "B", "C"):
        return "standard"
    return "other"


def clear_valid_groups_cache() -> None:
    global _VALID_GROUPS_CACHE
    _VALID_GROUPS_CACHE = None


def get_valid_groups(db: Session, force_refresh: bool = False) -> list[dict[str, Any]]:
    global _VALID_GROUPS_CACHE
    now = time.monotonic()
    if not force_refresh and _VALID_GROUPS_CACHE is not None:
        cached_time, cached_data = _VALID_GROUPS_CACHE
        if now - cached_time < _CACHE_TTL_SECONDS:
            return cached_data

    groups_map: dict[str, dict[str, Any]] = {}

    # (a) Nguồn class_sections (các nhóm lớp thật)
    stmt = select(ClassSection.student_groups).where(ClassSection.student_groups.is_not(None))
    for (val,) in db.execute(stmt):
        if not val:
            continue
        items: list[str] = []
        if isinstance(val, list):
            for it in val:
                if isinstance(it, str):
                    items.extend(re.split(r"[,;\s\n]+", it))
        elif isinstance(val, str):
            items.extend(re.split(r"[,;\s\n]+", val))

        for raw_tok in items:
            token = raw_tok.strip().upper()
            if not token:
                continue
            # Trường hợp có slash ghép lớp, vd K24404A/B hoặc K24404A/B/E hoặc K23404A/B
            m_slash = re.match(r"^(K?\d{5})([A-Z\d]+(?:/[A-Z\d]+)+)$", token)
            if m_slash:
                base = m_slash.group(1)
                if not base.startswith("K"):
                    base = f"K{base}"
                year = base[1:3]
                major = base[3:6]
                suffixes = m_slash.group(2).split("/")
                for sfx in suffixes:
                    code = f"{base}{sfx}"
                    if code not in groups_map:
                        groups_map[code] = {
                            "code": code,
                            "cohort": f"K{year}",
                            "major": major,
                            "suffix": sfx,
                            "kind": kind_of_suffix(sfx),
                            "program_id": base,
                            "source": "class_sections",
                            "degree": "dai_hoc",
                        }
            else:
                parsed_c = parse_class_code(token)
                if parsed_c:
                    deg = parsed_c.get("degree", "dai_hoc")
                    code_val = parsed_c["code"]
                    if code_val not in groups_map:
                        groups_map[code_val] = {
                            "code": code_val,
                            "cohort": parsed_c["cohort"],
                            "major": parsed_c["major"],
                            "suffix": parsed_c.get("suffix", "") or parsed_c.get("branch", ""),
                            "kind": parsed_c.get("kind", "standard"),
                            "program_id": parsed_c["program_id"],
                            "source": "class_sections",
                            "degree": deg,
                        }
                else:
                    m_single = re.match(r"^K?(\d{2})(\d{3})([A-Z]\d*)?$", token)
                    if m_single:
                        year = m_single.group(1)
                        major = m_single.group(2)
                        sfx = m_single.group(3) or ""
                        base = f"K{year}{major}"
                        code = f"{base}{sfx}"
                        if code not in groups_map:
                            groups_map[code] = {
                                "code": code,
                                "cohort": f"K{year}",
                                "major": major,
                                "suffix": sfx,
                                "kind": kind_of_suffix(sfx),
                                "program_id": base,
                                "source": "class_sections",
                                "degree": "dai_hoc",
                            }

    # (b) Nguồn program_catalog_entries (dành cho khóa 25/26)
    cat_stmt = (
        select(ProgramCatalogEntry.program_label, ProgramCatalogEntry.language_track)
        .where(ProgramCatalogEntry.language_track.is_not(None))
        .distinct()
    )
    for label, lang_track in db.execute(cat_stmt):
        if not label:
            continue
        clean_lbl = label.strip().lower()
        clean_lbl = re.sub(r"[\s–—-]+", " ", clean_lbl)
        major = None
        for k, v in MAJOR_LABELS_TO_CODE.items():
            if k in clean_lbl or clean_lbl in k:
                major = v
                break
        if not major:
            continue

        for cohort in ("K25", "K26"):
            base = f"{cohort}{major}"
            if lang_track == "en":
                code_e = f"{base}E"
                if code_e not in groups_map:
                    groups_map[code_e] = {
                        "code": code_e,
                        "cohort": cohort,
                        "major": major,
                        "suffix": "E",
                        "kind": "english",
                        "program_id": base,
                        "source": "catalog",
                    }
            elif lang_track == "vi":
                if base not in groups_map:
                    groups_map[base] = {
                        "code": base,
                        "cohort": cohort,
                        "major": major,
                        "suffix": "",
                        "kind": "standard",
                        "program_id": base,
                        "source": "catalog",
                    }

    # (c) Nguồn programs đã có trong DB (đã nạp từ BĐCL / Drive khoa)
    prog_stmt = select(Program.id, Program.cohort, Program.degree)
    for pid, cohort, deg in db.execute(prog_stmt):
        deg_str = deg or "dai_hoc"
        if deg_str == "thac_si":
            if pid not in groups_map:
                m_mj = re.search(r"(\d{3})", pid)
                mj = m_mj.group(1) if m_mj else ""
                branch = pid[4:] if len(pid) > 4 else ""
                kind = "research" if branch == "NC" else ("applied" if branch == "UD" else "standard")
                groups_map[pid] = {
                    "code": pid,
                    "cohort": cohort or "2025-2026",
                    "major": mj,
                    "suffix": branch,
                    "kind": kind,
                    "program_id": pid,
                    "source": "programs",
                    "degree": "thac_si",
                }
        else:
            base, sfx, is_en = parse_track_identifier(pid)
            m_mj = re.match(r"^K?(\d{2})(\d{3})([A-Z\d]*)?", pid)
            if m_mj:
                y = m_mj.group(1)
                mj = m_mj.group(2)
                sfx_from_pid = m_mj.group(3) or sfx
                knd = kind_of_suffix(sfx_from_pid)
                if pid not in groups_map:
                    groups_map[pid] = {
                        "code": pid,
                        "cohort": cohort or f"K{y}",
                        "major": mj,
                        "suffix": sfx_from_pid,
                        "kind": knd,
                        "program_id": base,
                        "source": "programs",
                        "degree": "dai_hoc",
                    }

    result = sorted(groups_map.values(), key=lambda x: x["code"])
    _VALID_GROUPS_CACHE = (now, result)
    return result


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
      - Mã có hậu tố E/E1/E2 (vd K25410E, K26409E, K26409E1)
      - Tham số track='en' hoặc 'english'
      - Mã chuẩn K25410 (canonical)

    Quy tắc Brief D7:
      - Nếu đã nạp chương trình E thật trong DB -> dùng chương trình thật (track_source='official').
      - Chỉ khi chưa nạp được chương trình E thật mới rơi về ánh xạ từ bản VI (track_source='derived').
      - Chương trình không có hệ E chính thức (vd 414 Công nghệ tài chính) -> trả 404, không tự sinh.

    Trả về: (Program, is_english, contextual_id)
    (Gắn kèm thuộc tính _track_source trên Program: 'official' | 'derived' | None)
    """
    clean_id = resolve_program_alias(program_id.strip())
    base_candidate, suffix, parsed_en = parse_track_identifier(clean_id)
    explicit_en = (track or "").strip().lower() in ("en", "english")
    is_english = parsed_en or explicit_en

    if not is_english:
        p = db.scalar(
            select(Program)
            .where(Program.id == clean_id)
            .options(selectinload(Program.modules).selectinload(ProgramModule.module))
        )
        if p is None and base_candidate != clean_id:
            p = db.scalar(
                select(Program)
                .where(Program.id == base_candidate)
                .options(selectinload(Program.modules).selectinload(ProgramModule.module))
            )
        if p is None:
            raise HTTPException(404, f"Không tìm thấy chương trình đào tạo {program_id}.")
        p._track_source = None
        return p, False, clean_id

    # is_english is True: Xác định khóa và mã ngành
    m_major = re.match(r"^K?(\d{2})(\d{3})", base_candidate)
    p_cohort = f"K{m_major.group(1)}" if m_major else (base_candidate[:3] if base_candidate.startswith("K") else None)
    p_major = m_major.group(2) if m_major else None

    # Kiểm tra xem ngành này có hệ tiếng Anh hợp lệ hay không (sheet chính thức hoặc nhóm lớp thật)
    valid_groups = get_valid_groups(db)
    has_en_track = any(
        g["cohort"] == p_cohort and g["major"] == p_major and g["kind"] == "english"
        for g in valid_groups
    ) or (p_major in OFFICIAL_ENGLISH_TRACK_MAJORS)

    if not has_en_track:
        raise HTTPException(404, "Chương trình này không có hệ tiếng Anh")

    # 1. Thử tìm chương trình hệ E THẬT trong DB
    target_e_ids: list[str] = []
    if suffix and suffix.startswith("E"):
        target_e_ids.append(clean_id)
    if "TE" in suffix:
        target_e_ids.append(f"{base_candidate}TE")
    target_e_ids.append(f"{base_candidate}E")

    official_prog: Program | None = None
    for tid in target_e_ids:
        cand_p = db.scalar(
            select(Program)
            .where(Program.id == tid)
            .options(selectinload(Program.modules).selectinload(ProgramModule.module))
        )
        if cand_p is not None and len(cand_p.modules) > 0:
            official_prog = cand_p
            break

    if official_prog is not None:
        official_prog._track_source = "official"
        contextual_id = clean_id if (suffix and suffix.startswith("E")) else official_prog.id
        return official_prog, True, contextual_id

    # 2. Chưa nạp chương trình E thật -> fallback ánh xạ từ CTĐT gốc (track_source='derived')
    base_prog = db.scalar(
        select(Program)
        .where(Program.id == base_candidate)
        .options(selectinload(Program.modules).selectinload(ProgramModule.module))
    )
    if base_prog is None:
        raise HTTPException(404, f"Không tìm thấy chương trình đào tạo {program_id}.")

    base_prog._track_source = "derived"
    contextual_id = f"{base_prog.id}E" if not (suffix and suffix.startswith("E")) else clean_id
    return base_prog, True, contextual_id


def build_program_track_mapping(
    db: Session, program: Program, is_english: bool
) -> tuple[dict[str, str], dict[str, Module | None], dict[str, bool]]:
    """Xây dựng bản đồ chuyển đổi mã môn học cho CTĐT theo hệ đào tạo.

    Đối với hệ tiếng Anh (is_english=True):
      - Nếu là chương trình chính thức (official từ sheet BĐCL / hậu tố E):
        giữ nguyên toàn bộ danh sách môn thật của sheet đó (cả mã E và các mã B hợp lệ).
      - Nếu là bản tự sinh (derived):
        môn đã bắt đầu bằng E giữ nguyên; môn cơ sở có counterpart_code bắt đầu bằng E
        chuyển sang counterpart_code; môn không có bản tương ứng giữ nguyên và ghi nhận thiếu.

    Trả về:
      - code_map: dict[mã_gốc, mã_chuyển_đổi]
      - mapped_module_map: dict[mã_gốc, Module_đã_chuyển_đổi]
      - missing_notice_map: dict[mã_gốc, bool]
    """
    code_map: dict[str, str] = {}
    mapped_module_map: dict[str, Module | None] = {}
    missing_notice_map: dict[str, bool] = {}

    is_official = (
        getattr(program, "_track_source", None) == "official"
        or program.id.endswith("E")
        or program.id.endswith("TE")
    )

    if not is_english or is_official:
        for pm in visible_program_modules(program):
            code_map[pm.module_code] = pm.module_code
            mapped_module_map[pm.module_code] = pm.module
            missing_notice_map[pm.module_code] = False
        return code_map, mapped_module_map, missing_notice_map

    # Thu thập trước các counterpart_code tiềm năng để nạp 1 lần
    candidates: set[str] = set()
    visible_modules = visible_program_modules(program)
    for pm in visible_modules:
        m = pm.module
        if m and m.counterpart_code and m.counterpart_code.startswith("E"):
            candidates.add(m.counterpart_code)

    existing_cps: dict[str, Module] = {}
    if candidates:
        for cp_mod in db.scalars(select(Module).where(Module.code.in_(candidates), Module.is_hidden.is_(False))):
            existing_cps[cp_mod.code] = cp_mod

    for pm in visible_modules:
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
                if cp and not cp.is_hidden:
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
    for pm in sorted(visible_program_modules(program), key=lambda x: (x.suggested_order or 999, x.module_code)):
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

        is_vietnamese_course = is_english and (
            mapped_code.startswith("B") or (m_mapped is not None and m_mapped.language_track == "vi")
        )

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
            is_vietnamese_track=is_vietnamese_course,
        )

        key = (pm.block or "Khác", pm.parent_block)
        b = blocks.setdefault(key, ProgramBlock(name=key[0], parent=key[1]))
        b.modules.append(pm_out)
        b.total_credits += cr
        if pm.required:
            b.required_credits += cr

    total_req_cr = sum((m.credits or 0) for b in blocks.values() for m in b.modules if m.required)
    p_name = program.name
    if is_english and "(Hệ tiếng Anh)" not in p_name and "(tiếng Anh)" not in p_name:
        p_name = f"{program.name} (Hệ tiếng Anh)"
    pid = contextual_id or (f"{program.id}E" if is_english else program.id)

    track_src = getattr(program, "_track_source", None)
    if track_src is None and is_english:
        track_src = "official" if (program.id.endswith("E") or program.id.endswith("TE")) else "derived"

    summary = ProgramSummary(
        program_id=pid,
        name=p_name,
        cohort=program.cohort,
        faculty=program.faculty,
        total_credits=total_req_cr,
        module_count=sum(len(block.modules) for block in blocks.values()),
        degree=program.degree,
        is_sample=program.is_sample,
        track_source=track_src,
    )
    return ProgramDetail(program=summary, blocks=list(blocks.values()), track_source=track_src)


def get_contextual_program_graph(db: Session, program: Program, is_english: bool) -> ProgramGraph:
    code_map, mapped_module_map, _ = build_program_track_mapping(db, program, is_english)
    resolver = make_code_resolver(db, code_map, is_english)

    rels = list(
        db.scalars(
            select(ModuleRelation)
            .where(ModuleRelation.program_id == program.id, visible_module(ModuleRelation.source), visible_module(ModuleRelation.target))
            .order_by(ModuleRelation.source, ModuleRelation.target)
        )
    )

    nodes: dict[str, GraphNode] = {}
    for pm in visible_program_modules(program):
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
    track_src = getattr(program, "_track_source", None)
    if track_src is None and is_english:
        track_src = "official" if (program.id.endswith("E") or program.id.endswith("TE")) else "derived"

    return ProgramGraph(
        nodes=sorted(nodes.values(), key=lambda n: (n.suggested_order or 999, n.code)),
        edges=edges,
        cycles=cycles,
        track_source=track_src,
    )


def get_contextual_module_tree(
    db: Session,
    code: str,
    program_id: str | None,
    direction: str,
    depth: int,
) -> TreeNode:
    code = code.strip()
    selected_module = db.get(Module, code)
    if selected_module is not None and selected_module.is_hidden:
        raise HTTPException(404, f"Không tìm thấy học phần {code}.")
    is_english = False
    prog: Program | None = None
    code_map: dict[str, str] = {}
    resolver: Callable[[str], str] = lambda c: c

    if program_id:
        prog, is_english, _ = resolve_program_and_track(db, program_id)
        code_map, _, _ = build_program_track_mapping(db, prog, is_english)
        resolver = make_code_resolver(db, code_map, is_english)

    stmt = select(ModuleRelation).where(
        ModuleRelation.type.in_(REQ_TYPES), visible_module(ModuleRelation.source), visible_module(ModuleRelation.target),
    )
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
        for pm in visible_program_modules(prog):
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
    for pm in visible_program_modules(program):
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
        return {pm.module_code for pm in visible_program_modules(prog)}
    if getattr(prog, "_track_source", None) == "official" or prog.id.endswith("E") or prog.id.endswith("TE"):
        return {pm.module_code for pm in visible_program_modules(prog)}
    code_map, _, _ = build_program_track_mapping(db, prog, is_english=True)
    return set(code_map.values())
