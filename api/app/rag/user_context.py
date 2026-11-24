"""Request-scoped settings from UELPATH. They are user data, never regulation evidence."""
from __future__ import annotations

import re
from typing import Annotated, Literal

from pydantic import BaseModel, Field

from app.services.text import normalize_search

from .safety import blocked
from .validity import normalize_cohort


class TimetableContext(BaseModel):
    semester: str = Field(pattern=r"^20\d{2}-20\d{2}-[123]$")
    modules: int = Field(ge=0, le=500)
    credits: float | None = Field(None, ge=0, le=2000)


class PlannerContext(BaseModel):
    terms: int = Field(ge=0, le=100)
    modules: int = Field(ge=0, le=2000)
    backlog: int = Field(ge=0, le=2000)


ProgramId = Annotated[str, Field(pattern=r"^(?:K\d{5}(?:TE|T|H|E)?|M\d{3}(?:NC|UD)?|N\d{3}|[89]\d{6})$")]
Profile = dict[str, str | list[str]]


class ChatContext(BaseModel):
    program_ids: list[ProgramId] = Field(default_factory=list, max_length=2)
    degree: Literal["dai_hoc", "thac_si", "tien_si"] | None = None
    timetable: TimetableContext | None = None
    planner: PlannerContext | None = None
    theme: Literal["system", "light", "dark"] | None = None

    def study_profile(self, cohort: str | None) -> Profile:
        normalized = normalize_cohort(cohort)
        return {
            **({"degree": self.degree} if self.degree else {}),
            **({"program_ids": [code for code in self.program_ids
                                if not normalized or not code.startswith("K") or code[:3] == normalized]}
               if self.program_ids else {}),
        }


_PERSONAL = re.compile(r"\b(?:toi|minh|em|cua ban|hien tai|dang|my|current|i)\b")
_POLICY = re.compile(r"\b(?:quy dinh|quy che|toi da|toi thieu|gioi han|dieu kien|co duoc|vuot|"
                     r"du dieu kien|maximum|minimum|limit|eligible|regulations?)\b")
_COUNT = re.compile(r"\b(?:(?:bao nhieu|may|tong so)\s+(?:tin chi|mon|hoc phan|hoc ky)|"
                    r"(?:how many|total)\s+(?:credits|courses|terms)|tom tat|summary)\b")
_TIMETABLE = re.compile(r"\b(?:thoi khoa bieu|tkb|lich hoc|timetable|schedule|da xep bao nhieu tin chi)\b")
_PLANNER = re.compile(r"\b(?:ke hoach|lo trinh|planner|study plan)\b")
_THEMES = {"dark": "Tối", "light": "Sáng", "system": "Theo hệ thống"}


def workspace_answer(question: str, cohort: str | None, context: ChatContext | None) -> tuple[str | None, str | None]:
    """Return (direct answer, supporting workspace summary) without handing local data to the LLM."""
    query = normalize_search(question)
    if blocked(question) or not _PERSONAL.search(query):
        return None, None
    policy = bool(_POLICY.search(query))
    if not policy and re.search(r"\b(?:khoa nao|which cohort|what cohort)\b", query):
        selected = normalize_cohort(cohort)
        if selected and re.fullmatch(r"K\d{2}", selected):
            return f"Khóa đang áp dụng cho cuộc trò chuyện là {selected}.", None
    if context is None:
        return None, None
    if not policy and re.search(r"\b(?:chuong trinh(?: dao tao)? nao|ctdt nao|which program|what program)\b", query):
        ids = context.study_profile(cohort).get("program_ids", [])
        if ids:
            return f"Mã chương trình đào tạo đã chọn: {', '.join(ids)}.", None
    if context.theme and not policy and re.search(r"\b(?:giao dien|theme)\b", query):
        if re.search(r"\b(?:dang|hien tai|da chon|gi|what|current)\b", query):
            return f"Giao diện trên thiết bị đang đặt ở chế độ {_THEMES[context.theme]}.", None

    summaries = []
    if (policy or _COUNT.search(query)) and context.timetable and _TIMETABLE.search(query):
        tt = context.timetable
        summary = f"Phương án thời khóa biểu {tt.semester} có {tt.modules} học phần"
        summaries.append(summary + (f", tổng {tt.credits:g} tín chỉ." if tt.credits is not None
                                    else ". Chưa đủ dữ liệu để tính tổng tín chỉ."))
    if (policy or _COUNT.search(query)) and context.planner and _PLANNER.search(query):
        plan = context.planner
        summaries.append(f"Kế hoạch có {plan.modules} học phần đã xếp vào {plan.terms} học kỳ và "
                         f"{plan.backlog} học phần trong danh sách dự định học.")
    if not summaries:
        return None, None
    summary = "\n".join(summaries)
    return (None, summary) if policy else (summary, None)
