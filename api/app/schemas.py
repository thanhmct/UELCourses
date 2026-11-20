from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class SemesterOut(ORM):
    id: str
    name: str
    year: str
    term: int
    is_current: bool
    start_date: date | None = None
    end_date: date | None = None
    is_sample: bool = False


class EquivalentRef(BaseModel):
    code: str
    name: str | None = None
    credits: int | None = None


class OfferingPlanOut(BaseModel):
    academic_year: str
    terms: list[int] = []
    terms_text: str | None = None
    open_pct: float | None = None


class ModuleSummary(BaseModel):
    code: str
    name: str
    credits: int | None = None
    type: str | None = None
    faculty: str | None = None
    department: str | None = None
    is_english: bool = False
    has_equivalents: bool = False
    offering_plan: list[OfferingPlanOut] = []
    is_sample: bool = False


class ModuleList(BaseModel):
    items: list[ModuleSummary]
    total: int
    page: int
    size: int


class ModuleDetail(ModuleSummary):
    description: str | None = None
    prerequisites: list[str] = []
    equivalents: list[EquivalentRef] = []
    semesters: list[str] = []


class LessonOut(BaseModel):
    weekday: int = Field(description="2=Thứ 2 ... 7=Thứ 7, 8=Chủ nhật")
    start_period: int
    end_period: int
    start_time: str
    end_time: str
    room: str | None = None
    weeks: str | None = None


class ClassRoom(BaseModel):
    room: str
    capacity: int | None = None
    capacity_gap: int | None = Field(default=None, description="Độ lệch sức chứa (sức chứa − sĩ số)")


class ClassSectionOut(BaseModel):
    class_code: str
    module_code: str
    semester: str | None = None
    lecturer: str | None = None
    quota: int | None = None
    quota_min: int | None = None
    quota_max: int | None = None
    registered: int | None = None
    available: int | None = None
    student_groups: list[str] = []
    cohorts: list[str] = Field(default=[], description="Khóa, vd K24 (2 số cuối năm nhập học)")
    rooms: list[ClassRoom] = []
    notes: list[str] = []
    start_date: date | None = None
    end_date: date | None = None
    study_type: str | None = None
    lessons: list[LessonOut] = []
    schedule_raw: str | None = Field(default=None, description="Chuỗi Schedules gốc (để đối chiếu khi parse lỗi)")
    schedule_parsed: bool = True
    is_sample: bool = False


class EquivalentItem(BaseModel):
    code: str
    name: str | None = None
    credits: int | None = None
    equivalents: list[EquivalentRef] = []


class VenueSession(BaseModel):
    module_code: str
    module_name: str | None = None
    class_code: str
    semester: str | None = None
    weekday: int
    start_period: int
    end_period: int
    start_time: str
    end_time: str
    weeks: str | None = None


class VenueOut(BaseModel):
    room: str
    capacity: int | None = None
    sessions: list[VenueSession] = []


class ImportResult(BaseModel):
    imported: int
    modules: int | None = None
    lessons: int | None = None
    venues: int | None = None
    skipped: int = 0
    unparsed_schedules: int = 0
    semesters: list[str] = []
    warnings: list[str] = []


class SyncRequest(BaseModel):
    token: str = Field(min_length=10, max_length=8192, description="Bearer token của sinh viên — dùng 1 lần, không lưu")

    def __repr__(self) -> str:  # không để lộ token qua repr/log
        return "SyncRequest(token=***)"

    __str__ = __repr__


# ------------------------------------------------------------------ CTĐT & cây môn học
class ProgramSummary(BaseModel):
    program_id: str
    name: str | None = None
    cohort: str | None = None
    faculty: str | None = None
    total_credits: int = Field(0, description="Tổng TC các học phần BẮT BUỘC (xấp xỉ, chưa gồm TC tự chọn tối thiểu)")
    module_count: int = 0
    is_sample: bool = False


class ProgramModuleOut(BaseModel):
    code: str
    name: str | None = None
    credits: int | None = None
    required: bool = True
    suggested_term: str | None = None
    suggested_semester: str | None = None
    suggested_order: int | None = None
    prereq: Any = Field(None, description="Cây tiên quyết: 'MA' | {and:[..]} | {or:[..]}")
    previous: Any = Field(None, description="Cây học trước")
    coreq: Any = None
    equivalents: list[str] = []
    prereq_raw: str | None = None
    previous_raw: str | None = None
    note: str | None = None


class ProgramBlock(BaseModel):
    name: str
    parent: str | None = None
    required_credits: int = Field(0, description="Tổng TC học phần bắt buộc trong khối (xấp xỉ)")
    total_credits: int = 0
    modules: list[ProgramModuleOut] = []


class ProgramDetail(BaseModel):
    program: ProgramSummary
    blocks: list[ProgramBlock]


class GraphNode(BaseModel):
    code: str
    name: str | None = None
    credits: int | None = None
    required: bool | None = None
    suggested_term: str | None = None
    suggested_order: int | None = None
    block: str | None = None
    in_program: bool = True


class GraphEdge(BaseModel):
    source: str
    target: str
    type: str


class ProgramGraph(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    cycles: list[list[str]] = []


class TreeNode(BaseModel):
    code: str
    name: str | None = None
    type: str = Field(description="root | prereq | previous | coreq (quan hệ với nút cha)")
    children: list[TreeNode] = []
    cycle: bool = Field(False, description="True nếu nút này khép một chu trình (không mở rộng tiếp)")
    truncated: bool = False
    prereq_tree: Any = None
    previous_tree: Any = None


class CompletedModule(BaseModel):
    code: str
    grade: float | str | None = Field(None, description="Điểm thang 10 hoặc điểm chữ; trống = coi là đạt")


class CheckRequest(BaseModel):
    completed: list[CompletedModule] = []
    planned: dict[str, list[str]] = Field(default_factory=dict, description="{kỳ: [mã]} — xét theo thứ tự kỳ")


class MissingReq(BaseModel):
    type: str
    code: str | None = None
    one_of: list[str] | None = None


class BlockedModule(BaseModel):
    code: str
    missing: list[MissingReq]


class PlannedIssue(BaseModel):
    term: str
    code: str
    missing: list[MissingReq]


class CheckResult(BaseModel):
    eligible_now: list[str]
    blocked: list[BlockedModule]
    passed: list[str] = []
    planned_issues: list[PlannedIssue] = []
    warnings: list[str] = []
    rule_refs: list[dict] = []


class FeedbackIn(BaseModel):
    page: str = Field(min_length=1, max_length=256)
    rating: int = Field(ge=1, le=5)
    category: str = Field(default="other", min_length=1, max_length=64)
    message: str = Field(default="", max_length=5000)
    contact: str | None = Field(default=None, max_length=256)
    app_version: str | None = Field(default=None, max_length=64)

    @field_validator("page", "category")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("không được để trống")
        return v


class FeedbackOut(ORM):
    id: int
    created_at: datetime


class PageStat(BaseModel):
    page: str
    count: int
    average_rating: float


class CategoryStat(BaseModel):
    category: str
    count: int
    average_rating: float


class DayStat(BaseModel):
    date: str
    count: int


class FeedbackItem(BaseModel):
    """Phản hồi để phân tích — KHÔNG chứa contact."""

    id: int
    created_at: datetime
    page: str
    rating: int
    category: str
    message: str
    app_version: str | None = None


class FeedbackStats(BaseModel):
    total: int
    average_rating: float | None
    by_page: list[PageStat]
    by_category: list[CategoryStat]
    by_day: list[DayStat]
    rating_distribution: dict[str, int]
    items: list[FeedbackItem]
