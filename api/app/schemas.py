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
    teaching_start: date | None = None
    teaching_end: date | None = None
    is_sample: bool = False


class EquivalentRef(BaseModel):
    code: str
    name: str | None = None
    name_en: str | None = None
    credits: int | None = None


class OfferingPlanOut(BaseModel):
    academic_year: str
    terms: list[int] = []
    terms_text: str | None = None
    open_pct: float | None = None


class OpenSemester(BaseModel):
    semester: str
    classes: int = Field(description="Số lớp học phần mở trong học kỳ")


class OutlineLinkOut(BaseModel):
    kind: str | None = None
    url: str


class ModuleAssessmentOut(BaseModel):
    process_ratio: float | None = Field(None, description="Quá trình - Tỉ lệ điểm (0.0 đến 1.0)")
    process_form: str | None = Field(None, description="Quá trình - Hình thức đánh giá")
    midterm_ratio: float | None = Field(None, description="Giữa kỳ - Tỉ lệ điểm (0.0 đến 1.0)")
    midterm_form: str | None = Field(None, description="Giữa kỳ - Hình thức đánh giá")
    final_ratio: float | None = Field(None, description="Cuối kỳ - Tỉ lệ điểm (0.0 đến 1.0)")
    final_form: str | None = Field(None, description="Cuối kỳ - Hình thức đánh giá")
    advanced_ratio: float | None = Field(None, description="Nâng cao - Tỉ lệ điểm (0.0 đến 1.0)")
    advanced_form: str | None = Field(None, description="Nâng cao - Hình thức đánh giá")
    exam_type: str | None = Field(None, description="Loại thi (vd 'Thi giấy', 'Thi máy')")
    exam_duration: str | None = Field(None, description="Thời lượng thi (vd '60'')")


class ModuleTextbookOut(BaseModel):
    name: str | None = Field(None, description="Tên giáo trình / tài liệu chính")
    url: str | None = Field(None, description="Đường link tới tài liệu (nếu có)")
    document_code: str | None = Field(None, description="Mã tài liệu")
    note: str | None = Field(None, description="Ghi chú về tài liệu")
    is_main: bool = Field(True, description="Tài liệu chính hay tài liệu tham khảo")


class ModuleSummary(BaseModel):
    code: str
    name: str
    name_en: str | None = Field(None, description="Tên tiếng Anh (đề cương > catalog > bảng đối chiếu); None nếu chưa có")
    credits: int | None = None
    type: str | None = None
    faculty: str | None = None
    faculty_en: str | None = Field(None, description="Tên khoa tiếng Anh; None nếu chưa có")
    department: str | None = None
    department_en: str | None = Field(None, description="Tên bộ môn tiếng Anh; None nếu chưa có")
    description: str | None = Field(None, description="Mô tả học phần bằng TIẾNG VIỆT (NULL nếu chưa có)")
    description_en: str | None = Field(None, description="Mô tả học phần bằng TIẾNG ANH (NULL nếu chưa có); giao diện EN dùng trường này")
    outline_url: str | None = Field(None, description="Link trực tiếp tới file PDF đề cương (Google Drive) của học phần")
    outline_url_en: str | None = Field(None, description="Link đề cương bản tiếng Anh (nếu có)")
    outline_links: list[OutlineLinkOut] = Field(default_factory=list, description="Danh sách các link đề cương (loại bỏ trùng URL, bỏ URL rỗng)")
    final_assessment: str | None = Field(None, description="Hình thức thi cuối kỳ đã chuẩn hóa")
    head_lecturer: str | None = Field(None, description="Giảng viên phụ trách học phần")
    is_english: bool = False
    has_equivalents: bool = False
    offering_plan: list[OfferingPlanOut] = []
    language_track: str = Field('vi', description="'en' = dạy bằng tiếng Anh (mã EXX### hoặc tên có (E), gồm môn CNTN tiếng Anh); 'vi' = tiếng Việt")
    language_basis: str | None = Field(None, description="Căn cứ phân loại: code_and_name | code_pattern | name_marker | cntn_confirmed | default")
    is_talent_program: bool = Field(False, description="Môn thuộc chương trình Cử nhân tài năng (CNTN)")
    counterpart_code: str | None = Field(None, description="Mã bản Anh<->Việt tương ứng (EEE1038 <-> BEE1038)")
    open_semesters: list[OpenSemester] = Field([], description="Học kỳ có lớp mở + số lớp")
    has_outline: bool = Field(False, description="Có đề cương chi tiết đã phân tích (xem /modules/{code}/outline)")
    outline_year: int | None = Field(None, description="Năm CTĐT của đề cương (vd 2023, 2025)")
    outline_year_fallback: bool = Field(False, description="True nếu phải dùng đề cương năm khác do thiếu đề cương năm yêu cầu")
    degree: str = Field("dai_hoc", description="Bậc đào tạo: 'dai_hoc' | 'thac_si' | 'tien_si'")
    is_sample: bool = False


class ModuleList(BaseModel):
    items: list[ModuleSummary]
    total: int
    page: int
    size: int


class ProgramRequired(BaseModel):
    program_id: str
    required: bool


class ModuleDetail(ModuleSummary):
    description: str | None = None
    prerequisites: list[str] = []
    equivalents: list[EquivalentRef] = []
    semesters: list[str] = []
    required_in_programs: list[ProgramRequired] = Field(
        default_factory=list, description="Danh sách CTĐT chứa môn này và trạng thái bắt buộc trong từng CTĐT"
    )
    is_required_any: bool = Field(False, description="True nếu là môn bắt buộc trong ít nhất một CTĐT")
    required: bool | None = Field(
        None, description="Trạng thái bắt buộc của môn trong CTĐT được chỉ định bởi tham số program_id"
    )
    assessment: ModuleAssessmentOut | None = Field(None, description="Thông tin đánh giá học phần từ Master_data/đề cương")
    textbooks: list[ModuleTextbookOut] = Field(default_factory=list, description="Danh sách giáo trình/tài liệu học phần")


class LessonOut(BaseModel):
    weekday: int = Field(description="2=Thứ 2 ... 7=Thứ 7, 8=Chủ nhật")
    start_period: int
    end_period: float = Field(description="Tiết kết thúc; x.5 = tiết nửa")
    start_time: str
    end_time: str
    room: str | None = None
    weeks: str | None = None
    date_start: date | None = Field(default=None, description="Ngày đầu của buổi (vd 2026-09-09)")
    date_end: date | None = Field(default=None, description="Ngày cuối; bằng date_start nếu buổi chỉ diễn ra một lần")


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
    name_en: str | None = None
    credits: int | None = None
    equivalents: list[EquivalentRef] = []


class VenueSession(BaseModel):
    module_code: str
    module_name: str | None = None
    class_code: str
    semester: str | None = None
    weekday: int
    start_period: int
    end_period: float = Field(description="Tiết kết thúc; x.5 = tiết nửa")
    start_time: str
    end_time: str
    weeks: str | None = None
    date_start: date | None = Field(default=None, description="Ngày đầu của buổi; dùng để xem theo tuần")
    date_end: date | None = Field(default=None, description="Ngày cuối của buổi (lặp hằng tuần đến ngày này)")


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
    degree: str = Field("dai_hoc", description="Bậc đào tạo: 'dai_hoc' | 'thac_si' | 'tien_si'")
    total_credits: int = Field(0, description="Tổng TC các học phần BẮT BUỘC (xấp xỉ, chưa gồm TC tự chọn tối thiểu)")
    module_count: int = 0
    is_sample: bool = False
    track_source: str | None = Field(default=None, description="Nguồn dữ liệu của hệ: 'official' | 'derived' | None")


class ProgramModuleOut(BaseModel):
    code: str
    name: str | None = None
    name_en: str | None = None
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
    is_vietnamese_track: bool = Field(default=False, description="Đánh dấu môn học bằng tiếng Việt trong hệ tiếng Anh")


class ProgramBlock(BaseModel):
    name: str
    parent: str | None = None
    required_credits: int = Field(0, description="Tổng TC học phần bắt buộc trong khối (xấp xỉ)")
    total_credits: int = 0
    modules: list[ProgramModuleOut] = []


class ElectiveGroup(BaseModel):
    block: str = Field(description="Tên nhóm hoặc khối môn tự chọn")
    required_credits: float = Field(description="Số tín chỉ tối thiểu phải hoàn thành trong nhóm")
    available_credits: float = Field(description="Tổng số tín chỉ khả dụng từ các môn tự chọn trong nhóm")
    modules: list[ProgramModuleOut] = Field(default_factory=list, description="Danh sách các môn học trong nhóm tự chọn")


class ProgramDetail(BaseModel):
    program: ProgramSummary
    blocks: list[ProgramBlock]
    track_source: str | None = Field(default=None, description="Nguồn dữ liệu của hệ: 'official' | 'derived' | None")


class ValidProgramGroup(BaseModel):
    code: str = Field(description="Mã nhóm lớp đầy đủ, vd K24404E, K24414H")
    cohort: str = Field(description="Mã khóa, vd K24")
    major: str = Field(description="Mã ngành 3 số, vd 404, 414")
    suffix: str = Field(default="", description="Hậu tố lớp, vd E, H, A, B hoặc rỗng")
    kind: str = Field(description="Loại hệ: standard | english | coop | talent | other")
    program_id: str = Field(description="Mã CTĐT cơ sở, vd K24404")
    source: str = Field(description="Nguồn dữ liệu: class_sections | catalog | programs")
    degree: str = Field(default="dai_hoc", description="Bậc đào tạo: 'dai_hoc' | 'thac_si' | 'tien_si'")


class GraphNode(BaseModel):
    code: str
    name: str | None = None
    name_en: str | None = None
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
    track_source: str | None = Field(default=None, description="Nguồn dữ liệu của hệ: 'official' | 'derived' | None")


class TreeNode(BaseModel):
    code: str
    name: str | None = None
    name_en: str | None = None
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
    status: str = "pending"
    flag_reasons: list[str] | None = None


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


# ---------------------------------------------------------------- facets & đề cương
class FacetCount(BaseModel):
    value: str
    count: int


class ModuleFacets(BaseModel):
    total: int
    language: list[FacetCount] = []
    talent: list[FacetCount] = []
    credits: list[FacetCount] = []
    faculty: list[FacetCount] = []
    department: list[FacetCount] = []
    type: list[FacetCount] = []
    semester: list[FacetCount] = Field([], description="Số HỌC PHẦN có lớp mở theo học kỳ")
    has_outline: list[FacetCount] = []
    final_assessment: list[FacetCount] = []


class OutlineDocumentInfo(BaseModel):
    document_id: int
    doc_type: str
    parse_status: str
    parse_method: str | None = None
    pages: int | None = None
    text_chars: int | None = None


class OutlineCourseOut(BaseModel):
    faculty: str | None = None
    department: str | None = None
    name_vi: str | None = None
    name_en: str | None = None
    course_code: str | None = None
    knowledge_block: str | None = None
    level: str | None = None
    major: str | None = None
    cohort_range: str | None = None
    academic_year: str | None = None
    term: str | None = None
    credits: float | None = None
    hours_lecture: float | None = None
    hours_practice: float | None = None
    hours_self_study: float | None = None
    prerequisite_raw: str | None = None
    previous_raw: str | None = None
    next_raw: str | None = None
    corequisite_raw: str | None = None
    teaching_language: str | None = None
    lecturers: list[str] = []
    assistants: list[str] = []
    description: str | None = None


class OutlineObjectiveOut(BaseModel):
    code: str
    description: str | None = None
    clo_codes: list[str] = []
    competency_level: str | None = None


class OutlineCloOut(BaseModel):
    code: str
    description: str | None = None
    teaching_levels: str | None = None


class OutlineAssessmentOut(BaseModel):
    component: str | None = None
    item_code: str | None = None
    item_name: str | None = None
    clo_codes: list[str] = []
    criteria: str | None = None
    duration: str | None = None
    weight_pct: float | None = None
    sub_weight_pct: float | None = None


class OutlineScheduleOut(BaseModel):
    week_label: str | None = None
    content: str | None = None
    clo_codes: list[str] = []
    activities: str | None = None
    assessment: str | None = None


class OutlineMaterialOut(BaseModel):
    kind: str
    citation: str


class OutlineOut(BaseModel):
    module_code: str
    document: OutlineDocumentInfo
    course: OutlineCourseOut
    objectives: list[OutlineObjectiveOut] = []
    clos: list[OutlineCloOut] = []
    assessments: list[OutlineAssessmentOut] = []
    schedule: list[OutlineScheduleOut] = []
    materials: list[OutlineMaterialOut] = []
    alternatives: list[OutlineDocumentInfo] = Field([], description="Các đề cương khác của cùng học phần (bản Anh/Việt, khóa khác)")
    outline_year: int | None = Field(None, description="Năm CTĐT của đề cương được chọn (vd 2023, 2025)")
    outline_year_fallback: bool = Field(False, description="True nếu phải lùi về năm khác do không có đề cương đúng năm yêu cầu")


# =============================================================================
# Lịch năm học (academic_events) & Quản trị Lịch/Học kỳ (Brief A5)
# =============================================================================
class AcademicEventOut(ORM):
    id: int
    academic_year: str
    kind: str
    title: str
    start_date: date
    end_date: date | None = None
    semester_id: str | None = None
    cohorts: list[str] = []
    note: str | None = None
    verified: bool = True
    source: str = "TB 223/TB-ĐHKTL-ĐT"
    updated_by: str | None = None
    updated_at: datetime | None = None


class AcademicEventIn(BaseModel):
    academic_year: str = Field(min_length=4, max_length=16)
    kind: str = Field(min_length=1, max_length=32)
    title: str = Field(min_length=1, max_length=512)
    start_date: date
    end_date: date | None = None
    semester_id: str | None = None
    cohorts: list[str] = Field(default_factory=lambda: ["all"])
    note: str | None = None
    verified: bool = True
    source: str = "TB 223/TB-ĐHKTL-ĐT"


class AcademicEventPatchIn(BaseModel):
    academic_year: str | None = None
    kind: str | None = None
    title: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    semester_id: str | None = None
    cohorts: list[str] | None = None
    note: str | None = None
    verified: bool | None = None
    source: str | None = None


class CalendarEventsResponse(BaseModel):
    items: list[AcademicEventOut]
    total: int
    page: int
    size: int
    years: list[str] = []
    kinds: list[str] = []


class CalendarImportDryRunResponse(BaseModel):
    status: str = "ok"
    dry_run: bool = True
    success: bool = True
    total_incoming: int
    to_add: int
    to_update: int = 0
    to_delete: int = 0
    sample_incoming: list[dict[str, Any]] = []
    diff_summary: dict[str, Any] = {}


class CalendarImportResponse(BaseModel):
    status: str = "ok"
    dry_run: bool = False
    success: bool = True
    imported: int
    academic_year: str | None = None
    source: str | None = None


class SemesterAdminPatchIn(BaseModel):
    name: str | None = None
    is_current: bool | None = None
    teaching_start: date | None = None
    teaching_end: date | None = None


class SemesterAdminOut(ORM):
    id: str
    name: str
    year: str
    term: int
    is_current: bool
    start_date: date | None = None
    end_date: date | None = None
    teaching_start: date | None = None
    teaching_end: date | None = None
    is_current_override: bool | None = None


class CalendarPhaseOut(BaseModel):
    date: date
    semester_id: str | None = None
    phase: str = Field(description="teaching|exam|break|holiday|reserve|none")
    week_no: int | None = None
    weeks_total: int | None = None
    events: list[AcademicEventOut] = []


# =============================================================================
# Kiểm duyệt & Bình luận học phần (Brief A3)
# =============================================================================
class ModuleCommentIn(BaseModel):
    body: str = Field(min_length=5, max_length=1000)
    rating: int | None = Field(default=None, ge=1, le=5)
    anon_id: str | None = Field(default=None, max_length=64)


class ModuleCommentOut(ORM):
    id: int
    module_code: str
    body: str
    rating: int | None = None
    author_name: str = "Sinh viên ẩn danh"
    status: str
    created_at: datetime


class ModuleCommentListOut(BaseModel):
    items: list[ModuleCommentOut]
    total: int
    page: int
    size: int
    average_rating: float | None = None


class BannedTermIn(BaseModel):
    term: str = Field(min_length=1, max_length=128)
    severity: str = Field(default="flag", pattern="^(flag|block)$")


class BannedTermOut(ORM):
    id: int
    term: str
    severity: str
    created_at: datetime


class ModerationQueueItemOut(BaseModel):
    id: str
    item_id: int
    type: str  # feedback | comment | book
    title: str
    content: str
    rating: int | None = None
    author: str = "Sinh viên ẩn danh"
    status: str  # pending | approved | rejected | hidden
    flag_reasons: list[str] = []
    created_at: datetime
    moderated_by: str | None = None
    moderated_at: datetime | None = None
    moderation_note: str | None = None
    module_code: str | None = None
    page: str | None = None
    category: str | None = None


class ModerationQueueResponse(BaseModel):
    items: list[ModerationQueueItemOut]
    total: int
    page: int
    size: int
    counts: dict[str, int] = Field(default_factory=dict)


class ModerationActionIn(BaseModel):
    note: str | None = Field(default=None, max_length=1000)


class BulkModerationTarget(BaseModel):
    type: str = Field(pattern="^(feedback|comment|book)$")
    id: int


class BulkModerationIn(BaseModel):
    items: list[BulkModerationTarget]
    action: str = Field(pattern="^(approve|reject|hide)$")
    note: str | None = Field(default=None, max_length=1000)


# =============================================================================
# Dữ liệu học phần (khoa/bộ môn) & Đề cương (Brief A4)
# =============================================================================
class FacultyReviewSuggestion(BaseModel):
    faculty: str | None = None
    source: str | None = None
    confidence: str | None = None


class FacultyReviewItemOut(BaseModel):
    code: str
    name: str
    credits: int | None = None
    faculty: str | None = None
    department: str | None = None
    faculty_source: str | None = None
    suggestion: FacultyReviewSuggestion | None = None
    reason: str | None = None
    open_classes_count: int = 0
    program_count: int = 0


class FacultyReviewResponse(BaseModel):
    items: list[FacultyReviewItemOut]
    total: int
    page: int
    size: int
    counts: dict[str, int] = Field(default_factory=dict)


class ModuleFacultyPatchIn(BaseModel):
    faculty: str | None = None
    department: str | None = None


class BulkFacultyReviewIn(BaseModel):
    codes: list[str] = Field(min_length=1)
    action: str = Field(pattern="^(accept_suggestion|set)$")
    faculty: str | None = None
    department: str | None = None


class FacultyDepartmentInfo(BaseModel):
    name: str
    departments: list[str] = Field(default_factory=list)


class FacultiesResponse(BaseModel):
    faculties: list[FacultyDepartmentInfo]
    canonical_faculties: list[str]
    all_departments: list[str]


class FacultyCoverageItem(BaseModel):
    faculty: str
    total_modules: int
    with_outline: int
    coverage_pct: float


class SemesterCoverageItem(BaseModel):
    semester_id: str
    semester_name: str
    total_modules: int
    with_outline: int
    coverage_pct: float


class OutlineCoverageResponse(BaseModel):
    total_modules: int
    modules_with_outline: int
    coverage_pct: float
    by_faculty: list[FacultyCoverageItem]
    by_semester: list[SemesterCoverageItem]


class OutlineMissingItem(BaseModel):
    code: str
    name: str
    credits: int | None = None
    faculty: str | None = None
    department: str | None = None
    open_classes_count: int = 0
    counterpart_code: str | None = None
    counterpart_has_outline: bool = False


class OutlineMissingResponse(BaseModel):
    items: list[OutlineMissingItem]
    total: int
    page: int
    size: int


class OutlineOcrPendingItem(BaseModel):
    id: int
    file_name: str
    rel_path: str
    size_bytes: int
    page_count: int | None = None
    ocr_engine: str | None = None
    text_chars: int | None = None
    extracted_at: datetime | None = None
    related_modules: list[str] = Field(default_factory=list)


class OutlineOcrPendingResponse(BaseModel):
    items: list[OutlineOcrPendingItem]
    total: int
    page: int
    size: int


class OutlineDriveLinkItem(BaseModel):
    id: str
    url: str | None = None
    kind: str | None = None
    label: str | None = None
    status: str
    failure_reason: str | None = None
    entry_id: str
    module_codes: list[str] = Field(default_factory=list)


class OutlineDriveLinkResponse(BaseModel):
    items: list[OutlineDriveLinkItem]
    total: int
    page: int
    size: int


# =============================================================================
# Hệ thống, Nhật ký, Tài khoản & Cài đặt quản trị (Brief A6)
# =============================================================================
class TableStat(BaseModel):
    name: str
    count: int
    size_bytes: int | None = None


class SystemInfoResponse(BaseModel):
    app_version: str
    env: str
    alembic_current: str | None = None
    alembic_head: str
    alembic_match: bool
    table_stats: list[TableStat]
    last_import_at: str | None = None
    errors_24h: int = 0
    safe_config: dict[str, Any]


class AuditLogItemOut(BaseModel):
    id: int
    actor_type: str
    actor_id: str | None = None
    action: str
    entity_type: str | None = None
    entity_id: str | None = None
    before: Any | None = None
    after: Any | None = None
    created_at: datetime


class AuditLogListResponse(BaseModel):
    items: list[AuditLogItemOut]
    total: int
    page: int
    page_size: int
    total_pages: int


class AdminUserOut(BaseModel):
    id: int
    email: str
    role: str
    is_active: bool
    failed_attempts: int = 0
    locked_until: datetime | None = None
    last_login_at: datetime | None = None
    created_at: datetime
    updated_at: datetime | None = None


class AdminUserCreateIn(BaseModel):
    email: str = Field(min_length=3, max_length=256)
    role: str = Field(default="admin", pattern="^(admin|moderator|data_editor)$")


class AdminUserCreateOut(BaseModel):
    user: AdminUserOut
    temporary_password: str
    message: str


class AdminUserPatchIn(BaseModel):
    role: str | None = Field(default=None, pattern="^(admin|moderator|data_editor)$")
    is_active: bool | None = None
    is_locked: bool | None = None


class AdminPasswordResetOut(BaseModel):
    user_id: int
    temporary_password: str
    message: str


class AdminChangeMyPasswordIn(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=128)


class AdminSettingsOut(BaseModel):
    moderation_mode: str = "pre"
    analytics_enabled: bool = True
    analytics_retention_days: int = 180
    updated_by: str | None = None
    updated_at: datetime | None = None


class AdminSettingsPatchIn(BaseModel):
    moderation_mode: str | None = Field(default=None, pattern="^(pre|post)$")
    analytics_enabled: bool | None = None
    analytics_retention_days: int | None = Field(default=None, ge=30, le=365)


class AdminLoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=256)
    password: str = Field(min_length=1)


class AdminLoginOut(BaseModel):
    email: str
    role: str
    csrf_token: str
    user: AdminUserOut | None = None





