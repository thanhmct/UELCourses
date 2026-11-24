"""Answer module questions using public catalog facts and bounded outline excerpts."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable

from sqlalchemy import case, or_, select
from sqlalchemy.orm import Session, load_only

from app.models import (ClassSection, Module, ModuleRelation, OutlineCourse, OutlineDocument, OutlineModuleLink,
                        OutlineSection, Program, ProgramModule, Semester)
from app.routers.equivalents import equivalents_for
from app.routers.modules import resolve_ctdt_year
from app.services.catalog_visibility import visible_module
from app.services.text import normalize_search

from .completion import complete
from .providers import LLMProvider, get_provider
from .safety import MAX_CONTEXT_CHARS, MAX_QUOTE, blocked, digest

MISSING = "Chưa có dữ liệu phù hợp cho câu hỏi này."
REFUSAL = "Tôi có thể tra cứu dữ kiện học phần và đề cương UEL. Hãy nhập một mã hoặc tên học phần và nội dung cần tra."
PLANNER = "Bạn có thể mở trang Kế hoạch để so sánh học phần hoặc xây dựng lộ trình theo chương trình đào tạo."
_CODE = re.compile(r"\b[A-Z]{3}[A-Z0-9]?\d{3,5}\b", re.IGNORECASE)
_PROGRAM = re.compile(r"\bK\d{5}(?:TE|E|T|H|[ABC])?\b", re.IGNORECASE)
_PLANNING = re.compile(r"\b(?:so sanh|compare|goi y|recommend|lap lo trinh|nen hoc|nen chon|study plan|which course should)\b")
_INTENTS = {
    "credits": r"tin chi|credits?",
    "affiliation": r"khoa|bo mon|faculty|department",
    "names": r"ten(?: tieng (?:anh|viet))?|english name|vietnamese name|course name|mon gi",
    "prereq": r"tien quyet|pre-?requisites?",
    "previous": r"hoc truoc",
    "coreq": r"song hanh|co-?requisites?",
    "equivalent": r"tuong duong|thay the|equivalen(?:t|ts|ce)",
    "classes": r"lop mo|mo lop|lop hoc phan|co mo|class(?:es| sections?)?|offered|offerings?",
    "required": r"bat buoc|tu chon|mandatory|compulsory|required|elective",
}
_SECTION_PATTERNS = {
    "objectives": r"muc tieu|objectives?",
    "clos": r"chuan dau ra|cdr|clo[s]?|learning outcomes?",
    "assessment": r"danh gia|thi cuoi ky|diem thanh phan|trong so|assessments?|grading|exams?",
    "schedule": r"ke hoach giang day|ke hoach hoc tap|tuan \d+|teaching (?:plan|schedule)|week \d+",
    "materials": r"tai lieu|giao trinh|textbooks?|reading materials?|references",
    "description": r"mo ta|noi dung|gioi thieu|description|what (?:is|does) .+ about",
}
_LABELS = {
    "objectives": "Mục tiêu", "clos": "Chuẩn đầu ra", "assessment": "Đánh giá",
    "schedule": "Kế hoạch giảng dạy", "materials": "Tài liệu", "description": "Mô tả",
}
_RELATIONS = {"prereq": "Tiên quyết", "previous": "Học trước", "coreq": "Song hành"}
_RAW_RELATIONS = {"prereq": "prereq_raw", "previous": "previous_raw", "coreq": "coreq_raw"}
_QUESTION_WORDS = re.compile(
    r"\b(?:cho (?:toi|minh|em) (?:biet|hoi|xem)|nhung gi|gi the nao|bao gom|la gi|the nao|"
    r"cua|trong|theo|cho|gi|nao|ve|cac|nhung|co|khong|mon|hoc phan|de cuong|bao nhieu|"
    r"what|which|how|are|does|the|for|of|is|in|a|an|this|course|syllabus|please|list|tell me)\b"
)


def _matches(pattern: str, text: str) -> bool:
    return re.search(rf"\b(?:{pattern})\b", text) is not None


def _result(answer: str, *, found: bool = False, mode: str = "extractive", citations=None,
            warnings=None, reason: str | None = None) -> dict:
    return {"answer": answer, "found": found, "mode": mode, "citations": citations or [],
            "warnings": warnings or [], "reason": reason}


def _identify(db: Session, question: str) -> tuple[list[Module], str]:
    codes = set(_CODE.findall(question.upper()))
    public = select(Module).where(Module.is_hidden.is_(False), Module.is_sample.is_(False))
    if codes:
        rows = db.scalars(public.where(Module.code.in_(codes)).order_by(Module.code)).all()
        return list(rows), _CODE.sub(" ", question)

    # Search the existing accent-folded catalog index. Match whole names before using a candidate.
    words = re.findall(r"[a-z0-9]{3,}", question)
    if not words:
        return [], question
    candidate = or_(*(Module.search_text.contains(w, autoescape=True) for w in sorted(set(words))[:24]))
    rows = db.scalars(public.where(candidate | (Module.search_text == ""))).all()
    matches = [(module, name) for module in rows
               for label in (module.name, module.name_en)
               if (name := normalize_search(label)) and _matches(re.escape(name), question)]
    if not matches:
        return [], question
    # "Kế toán" can be part of a longer course name. Only keep maximal names.
    matches = [(module, name) for module, name in matches
               if not any(other != name and _matches(re.escape(name), other) for _, other in matches)]
    codes = {module.code: module for module, _ in matches}
    for name in {name for _, name in matches}:
        question = re.sub(rf"\b{re.escape(name)}\b", " ", question)
    return list(codes.values()), question


def _source(code: str, kind: str, quote: str, year: int | None = None) -> dict:
    return {"code": code, "kind": kind, "quote": quote, "ctdt_year": year, "href": f"/modules/{code}"}


def _bounded_list(values: list[str], limit: int = 12) -> str:
    shown = ", ".join(values[:limit])
    return shown + ("…" if len(values) > limit else "")


def _facts(db: Session, module: Module, program_id: str | None,
           semester: str | None, kinds: list[str]) -> dict:
    program = db.get(Program, program_id) if program_id else None
    if program is not None and program.is_sample:
        program = None
    row = db.scalar(select(ProgramModule).where(
        ProgramModule.program_id == program.id, ProgramModule.module_code == module.code,
    )) if program else None
    values = {
        "names": f"Tên tiếng Việt: {module.name}. Tên tiếng Anh: {module.name_en or 'chưa có dữ liệu'}.",
        "credits": f"Số tín chỉ: {module.credits if module.credits is not None else 'chưa có dữ liệu'}.",
        "affiliation": f"Khoa: {module.faculty or 'chưa có dữ liệu'}. Bộ môn: {module.department or 'chưa có dữ liệu'}.",
    }
    for kind in kinds:
        if kind in _RELATIONS:
            raw = getattr(row, _RAW_RELATIONS[kind], None)
            refs = db.scalars(select(ModuleRelation.source).where(
                ModuleRelation.target == module.code, ModuleRelation.type == kind,
                ModuleRelation.program_id == (program.id if program else None),
                visible_module(ModuleRelation.source),
            ).order_by(ModuleRelation.source).limit(13)).all()
            if not refs and not program_id and kind == "prereq":
                candidates = list((module.prerequisites or [])[:13])
                if candidates:
                    refs = db.scalars(select(Module.code).where(
                        Module.code.in_(candidates), Module.is_hidden.is_(False),
                    ).order_by(Module.code)).all()
            value = "chưa có dữ liệu"
            if raw and not blocked(raw):
                value = raw[:250]
            elif refs and (not program_id or program is not None):
                value = _bounded_list(list(refs))
            values[kind] = f"{_RELATIONS[kind]}{f' ({program_id})' if program_id else ''}: {value}."
        elif kind == "equivalent":
            refs = equivalents_for(db, module.code)
            codes = _bounded_list([ref.code for ref in refs]) if refs else "chưa có dữ liệu"
            values[kind] = f"Học phần tương đương: {codes}."
        elif kind == "required":
            if not program_id:
                values[kind] = "Hãy nhập mã chương trình đào tạo để kiểm tra học phần bắt buộc hay tự chọn."
            elif row is None:
                values[kind] = f"Chưa có dữ liệu bắt buộc/tự chọn trong CTĐT {program_id}."
            else:
                values[kind] = f"Trong CTĐT {program.id}, học phần này {'bắt buộc' if row.required else 'tự chọn'}."
        elif kind == "classes":
            if not semester:
                values[kind] = "Hãy nhập học kỳ và năm học, ví dụ HK1 2026-2027, để kiểm tra lớp mở."
                continue
            term = db.get(Semester, semester)
            classes = db.scalars(select(ClassSection.class_code).where(
                ClassSection.module_code == module.code, ClassSection.semester_id == semester,
                ClassSection.is_sample.is_(False),
            ).order_by(ClassSection.class_code).limit(13)).all() if term and not term.is_sample else []
            values[kind] = (f"Lớp mở kỳ {semester}: {_bounded_list(list(classes))}." if classes else
                            f"Chưa có dữ liệu lớp mở cho học kỳ {semester}.")
    lines = [values[kind][:400] for kind in kinds if kind in values and not blocked(values[kind])]
    if not lines:
        return _result(MISSING, reason="missing")
    return _result(f"{module.code} — {module.name[:180]}\n" + "\n".join(lines), found=True,
                   mode="structured", citations=[_source(module.code, "catalog", "")])


@dataclass(frozen=True)
class Excerpt:
    kind: str
    text: str
    year: int | None


def _outline_sources(db: Session, module: Module, year: int | None, kinds: list[str],
                     question: str, language: str) -> tuple[dict[str, Excerpt], list[str]]:
    links = select(OutlineModuleLink.document_id).where(OutlineModuleLink.module_code == module.code)
    docs = db.execute(select(OutlineCourse, OutlineDocument).join(
        OutlineDocument, OutlineDocument.id == OutlineCourse.document_id,
    ).options(load_only(OutlineCourse.document_id, OutlineCourse.doc_type, OutlineCourse.parse_status),
              load_only(OutlineDocument.id, OutlineDocument.ctdt_year, OutlineDocument.source_format)).where(
        or_(OutlineCourse.course_code_norm == module.code, OutlineCourse.document_id.in_(links)),
        OutlineCourse.doc_type.in_(("syllabus_vi", "syllabus_en")), OutlineCourse.parse_status.in_(("ok", "partial")),
    )).all()
    years: dict[int, set[int]] = {}
    for doc_id, linked_year in db.execute(select(OutlineModuleLink.document_id, OutlineModuleLink.ctdt_year).where(
        OutlineModuleLink.module_code == module.code, OutlineModuleLink.ctdt_year.is_not(None),
    )):
        years.setdefault(doc_id, set()).add(linked_year)
    variants = [(course, doc, actual_year) for course, doc in docs
                for actual_year in years.get(doc.id, {doc.ctdt_year})]
    known_years = {actual_year for _, _, actual_year in variants if actual_year is not None}
    selected_year = min(known_years, key=lambda y: (abs(y - year), -y)) if year and known_years else max(known_years, default=None)
    preferred_type = "syllabus_en" if module.language_track == "en" else "syllabus_vi"
    chosen = sorted(
        [(course, doc) for course, doc, actual_year in variants if actual_year == selected_year],
        key=lambda pair: (pair[0].doc_type != preferred_type, pair[0].parse_status != "ok",
                          pair[1].source_format not in ("docx", "gdoc"), -pair[1].id),
    )
    warnings = []
    if year and chosen and year != selected_year:
        warnings.append(f"Chưa có đề cương CTĐT {year}. " +
                        (f"Đang tra bản CTĐT {selected_year}." if selected_year else "Bản hiện có chưa rõ năm CTĐT."))
    excerpts: dict[str, Excerpt] = {}
    if chosen:
        doc_id = chosen[0][1].id
        terms = _detail_terms(question, kinds)[:12]
        matches = [OutlineSection.search_text.contains(term, autoescape=True) for term in terms]
        rank = sum((case((match, 1), else_=0) for match in matches),
                   case((OutlineSection.kind == kinds[0], 1), else_=0))
        statement = select(OutlineSection).where(
            OutlineSection.document_id == doc_id, OutlineSection.kind.in_(kinds),
        )
        if matches:
            statement = statement.where(or_(*matches, OutlineSection.search_text == ""))
        sections = db.scalars(statement.order_by(rank.desc(), OutlineSection.ord, OutlineSection.id).limit(8))
        for section in sections:
            # Individual excerpts always stay within the selected section and version.
            text = section.text.strip()
            for offset in range(0, min(len(text), 7200), MAX_CONTEXT_CHARS):
                excerpt = text[max(0, offset - 120):offset + MAX_CONTEXT_CHARS - (120 if offset else 0)].strip()
                if excerpt and not blocked(excerpt):
                    excerpts[f"section:{section.id}:{offset}"] = Excerpt(section.kind, excerpt, selected_year)
    if "description" in kinds:
        descriptions = ((module.description_en, "description_en"), (module.description, "description"))
        if language != "en":
            descriptions = descriptions[::-1]
        description, key = next(((text, key) for text, key in descriptions if text and not blocked(text)), ("", ""))
        if description:
            excerpts[f"{module.code}:{key}"] = Excerpt("description", description.strip()[:MAX_CONTEXT_CHARS], None)
    return excerpts, warnings


def _detail_terms(question: str, kinds: list[str]) -> list[str]:
    # Preserve numbered week lookups while removing the labels of general section requests.
    week = re.search(r"\b(?:tuan|week)\s+(\d+)\b", question)
    question = re.sub(r"\b(?:ctdt|chuong trinh dao tao|curriculum)\s+(?:20\d{2}|k\d{2})\b", " ", question)
    question = re.sub(r"\bk\d{2}(?:\d{3}(?:te|e|t|h|[abc])?)?\b", " ", question)
    for kind in kinds:
        question = re.sub(rf"\b(?:{_SECTION_PATTERNS[kind]})\b", " ", question)
    question = _QUESTION_WORDS.sub(" ", question)
    words = list(dict.fromkeys(re.findall(r"[a-z0-9]{2,}", question)))
    return ([week[0]] if week else []) + words


def _semester(question: str) -> str | None:
    direct = re.search(r"\b(20\d{2})\s*[-–/]\s*(20\d{2})-([123])\b", question)
    if direct:
        return "-".join(direct.groups())
    term = re.search(r"\b(?:hk|hoc ky|semester|term)\s*([123])\b", question)
    year = re.search(r"\b(20\d{2})\s*[-–/]\s*(20\d{2})\b", question)
    return f"{year[1]}-{year[2]}-{term[1]}" if term and year else None


def answer_module(db: Session, question: str, *, cohort: str | None = None, program_id: str | None = None,
                  semester: str | None = None, ctdt_year: int | None = None, language: str = "vi",
                  mode: str | None = None, provider: LLMProvider | None = None,
                  reserve: Callable[[], bool] | None = None) -> dict:
    if blocked(question):
        return _result(REFUSAL, reason="scope")
    query = normalize_search(question)
    if _PLANNING.search(query):
        return _result(PLANNER, reason="planner")
    modules, remaining = _identify(db, query)
    if len(modules) > 1:
        return _result(PLANNER, reason="planner")
    if not modules:
        return _result(MISSING if _CODE.search(query) else REFUSAL, reason="missing" if _CODE.search(query) else "scope")
    module = modules[0]
    kinds = [key for key, pattern in _SECTION_PATTERNS.items() if _matches(pattern, remaining)]
    if any(kind != "description" for kind in kinds):
        # "Nội dung đánh giá" asks for the assessment section.
        kinds = [kind for kind in kinds if kind != "description"]
    program_match = _PROGRAM.search(query)
    program_id = (program_id or (program_match[0] if program_match else "")).upper() or None
    if program_id and program_id[-1] in "ABC":
        program_id = program_id[:-1]
    facts = [key for key, pattern in _INTENTS.items() if _matches(pattern, remaining)]
    if "required" in facts and "prereq" in facts and not program_id:
        facts.remove("required")
    if "assessment" in kinds and not _matches(r"tin chi|credits?", remaining):
        facts = [kind for kind in facts if kind != "classes"]
    if not kinds and not facts and _matches(r"de cuong|syllabus", remaining):
        kinds = list(_SECTION_PATTERNS)
    if facts and not kinds:
        return _facts(db, module, program_id, semester or _semester(query), facts)
    if not kinds and not remaining.strip(" ?."):
        return _facts(db, module, program_id, semester, ["names", "credits", "affiliation"])
    if not kinds:
        return _result(REFUSAL, reason="scope")
    cohort_match = re.search(r"\bK\d{2}\b", question, re.IGNORECASE)
    effective_cohort = (program_id[:3] if program_id else None) or (cohort_match[0] if cohort_match else None) or cohort
    explicit_year = re.search(r"\b(?:ctdt|chuong trinh dao tao|curriculum)\s+(20\d{2})\b", query)
    year = resolve_ctdt_year(effective_cohort, ctdt_year or (int(explicit_year[1]) if explicit_year else None))
    excerpts, warnings = _outline_sources(db, module, year, kinds, remaining, language)
    if not excerpts:
        return _result(f"{module.code} — {MISSING}", warnings=warnings, reason="missing")
    terms = _detail_terms(remaining, kinds)
    if terms:
        ranked = [(sum(_matches(re.escape(term), normalize_search(excerpt.text)) for term in terms), key, excerpt)
                  for key, excerpt in excerpts.items()]
        ranked.sort(key=lambda row: -row[0])
        if ranked[0][0] < (len(terms) + 1) // 2:
            return _result(f"{module.code} — {MISSING}", warnings=warnings, reason="missing")
        excerpts = {key: excerpt for score, key, excerpt in ranked if score > 0}
    quotes = None
    reason = None
    provider = provider or get_provider()
    if mode != "extractive" and provider.available():
        quotes, reason = complete(
            question, {key: excerpt.text for key, excerpt in excerpts.items()},
            f"modules:{module.code}:{effective_cohort}:{year}:{language}:{digest(excerpts)}", provider, reserve,
        )
    used_llm = quotes is not None
    if quotes is None:
        quotes = tuple((key, excerpt.text[:MAX_QUOTE].rstrip())
                       for key, excerpt in list(excerpts.items())[:3])
    citations = [_source(module.code, excerpts[key].kind, quote, excerpts[key].year) for key, quote in quotes]
    answer = "\n\n".join(f"{_LABELS[citation['kind']]} — {citation['quote']}" for citation in citations)
    result = _result(answer, found=True, mode="llm" if used_llm else "extractive",
                     citations=citations, warnings=warnings)
    if facts and _matches(r"va|and", remaining):
        structured = _facts(db, module, program_id, semester or _semester(query), facts)
        if structured["found"]:
            result["answer"] = structured["answer"] + "\n\n" + result["answer"]
            result["citations"] += structured["citations"]
    if reason:
        result["llm_fallback"] = True
    return result
