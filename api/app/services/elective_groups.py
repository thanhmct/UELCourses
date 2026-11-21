"""Xử lý và tính toán nhóm môn học tự chọn cho chương trình đào tạo (CTĐT).

Tìm quy định "phải hoàn thành N tín chỉ trong nhóm" từ:
  - program_modules (block, note)
  - program_catalog_entries (required_raw, original)
  - ProgramBlock.required_credits

Nếu trong DB không có dữ liệu quy định số tín chỉ yêu cầu, trả về mảng rỗng [] — tuyệt đối không bịa số.
"""

from __future__ import annotations

import re
from typing import Any
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Module, Program, ProgramCatalogEntry, ProgramModule
from app.schemas import ElectiveGroup, ProgramModuleOut
from app.services.program_tracks import build_program_track_mapping, make_code_resolver, remap_tree

# Regex trích xuất số tín chỉ tự chọn từ văn bản
_CREDIT_RE = re.compile(
    r"(?:chọn|hoàn thành|tối thiểu|yêu cầu)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(?:tín chỉ|tc|credits?)\b",
    re.I,
)
_CREDIT_IN_NAME_RE = re.compile(
    r"(?:tự chọn|elective).*?[\(\[]\s*(\d+(?:[.,]\d+)?)\s*(?:tín chỉ|tc|credits?)\s*[\)\]]",
    re.I,
)
_TC_TRAILING_RE = re.compile(r"\b(\d+(?:[.,]\d+)?)\s*(?:tín chỉ|tc)\s*(?:tự chọn|trong nhóm)\b", re.I)


def extract_required_credits_from_text(text: str | None) -> float | None:
    """Trích xuất số tín chỉ yêu cầu từ chuỗi mô tả (block, note, v.v.)."""
    if not text:
        return None
    for pattern in (_CREDIT_RE, _CREDIT_IN_NAME_RE, _TC_TRAILING_RE):
        m = pattern.search(text)
        if m:
            try:
                return float(m.group(1).replace(",", "."))
            except ValueError:
                pass
    return None


def get_elective_groups(db: Session, program: Program, is_english: bool = False) -> list[ElectiveGroup]:
    """Lấy danh sách các nhóm môn tự chọn của CTĐT.

    Quy định trả về:
      - block: tên khối/nhóm tự chọn
      - required_credits: số tín chỉ tối thiểu sinh viên phải hoàn thành
      - available_credits: tổng số tín chỉ khả dụng từ các môn tự chọn trong nhóm
      - modules: danh sách các môn tự chọn trong nhóm

    ĐẶC TẢ VỀ DỮ LIỆU THIẾU:
    Nếu không có dữ liệu trong DB (trường note, block của program_modules, hoặc catalog_entries
    không ghi rõ số tín chỉ tự chọn yêu cầu), hàm trả về danh sách rỗng [] để bảo đảm tính trung thực
    của dữ liệu — không bao giờ tự bịa số tín chỉ.
    """
    code_map, mapped_module_map, missing_notice_map = build_program_track_mapping(db, program, is_english)
    resolver = make_code_resolver(db, code_map, is_english)

    from app.routers.programs import equivalence_map

    eq = equivalence_map(db, program.id)
    if is_english:
        for orig, mapped in code_map.items():
            if orig != mapped:
                eq[orig].add(mapped)
                eq[mapped].add(orig)

    # Thu thập các module tự chọn (required == False) theo từng block
    groups_dict: dict[str, list[ProgramModule]] = {}
    for pm in program.modules:
        if not pm.required:
            block_name = pm.block or "Khối kiến thức tự chọn"
            groups_dict.setdefault(block_name, []).append(pm)

    if not groups_dict:
        return []

    # Thu thập thêm thông tin từ program_catalog_entries nếu có
    catalog_notes: dict[str, str] = {}
    for entry in db.scalars(
        select(ProgramCatalogEntry).where(
            ProgramCatalogEntry.module_code.in_([pm.module_code for pm in program.modules])
        )
    ).all():
        if entry.module_code:
            txt_parts: list[str] = []
            if entry.required_raw:
                txt_parts.append(entry.required_raw)
            if entry.original and isinstance(entry.original, list):
                for cell in entry.original:
                    if isinstance(cell, dict):
                        h = str(cell.get("header") or "").lower()
                        v = str(cell.get("value") or "")
                        if "tự chọn" in h or "tc" in h:
                            txt_parts.append(f"{h}: {v}")
            if txt_parts:
                catalog_notes[entry.module_code] = " ; ".join(txt_parts)

    result: list[ElectiveGroup] = []

    for block_name, pms in groups_dict.items():
        # 1. Tìm số tín chỉ yêu cầu từ tên block
        req_cr = extract_required_credits_from_text(block_name)

        # 2. Nếu chưa có, tìm từ note của các môn trong block
        if req_cr is None:
            for pm in pms:
                if pm.note:
                    req_cr = extract_required_credits_from_text(pm.note)
                    if req_cr is not None:
                        break

        # 3. Nếu chưa có, tìm từ catalog entries liên quan
        if req_cr is None:
            for pm in pms:
                cat_txt = catalog_notes.get(pm.module_code)
                if cat_txt:
                    req_cr = extract_required_credits_from_text(cat_txt)
                    if req_cr is not None:
                        break

        # Nếu hoàn toàn không có dữ liệu số tín chỉ yêu cầu trong DB -> KHÔNG BỊA SỐ, bỏ qua nhóm này
        if req_cr is None:
            continue

        out_modules: list[ProgramModuleOut] = []
        avail_cr = 0.0

        for pm in sorted(pms, key=lambda x: (x.suggested_order or 999, x.module_code)):
            orig_code = pm.module_code
            mapped_code = code_map[orig_code]
            m_mapped = mapped_module_map.get(orig_code) or pm.module
            is_missing = missing_notice_map.get(orig_code, False)

            note = pm.note
            if is_missing:
                notice = "[Hệ tiếng Anh] Chưa có mã học phần tương ứng bắt đầu bằng E (giữ nguyên mã gốc)"
                note = f"{note} · {notice}" if note else notice

            cr = (m_mapped.credits or 0) if m_mapped else ((pm.module.credits or 0) if pm.module else 0)
            avail_cr += float(cr)

            mapped_prereq = remap_tree(pm.prereq_tree, resolver)
            mapped_previous = remap_tree(pm.previous_tree, resolver)
            mapped_coreq = remap_tree(pm.coreq_tree, resolver)

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
            out_modules.append(pm_out)

        result.append(
            ElectiveGroup(
                block=block_name,
                required_credits=req_cr,
                available_credits=avail_cr,
                modules=out_modules,
            )
        )

    return result
