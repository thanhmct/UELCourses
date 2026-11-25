from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

import sqlalchemy as sa
from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy import text as sql_text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from app.db import Base


# JSON: JSONB trên PostgreSQL (lập chỉ mục được), JSON trên SQLite. none_as_null: None -> SQL NULL (không phải JSON "null").
JsonType = JSON(none_as_null=True).with_variant(JSONB(none_as_null=True), "postgresql")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UTCDateTime(TypeDecorator[datetime]):
    """Khôi phục múi giờ UTC trên SQLite, nơi datetime được lưu không kèm múi giờ."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None and value.tzinfo is not None and dialect.name == "sqlite":
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value

    def process_result_value(self, value, dialect):
        if value is not None and value.tzinfo is None and dialect.name == "sqlite":
            return value.replace(tzinfo=timezone.utc)
        return value


class Semester(Base):
    __tablename__ = "semesters"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)  # vd "2026-2027-1"
    name: Mapped[str] = mapped_column(String(128))
    year: Mapped[str] = mapped_column(String(16))  # "2026-2027"
    term: Mapped[int] = mapped_column(Integer)  # 1, 2, 3 — cả ba đều là học kỳ chính thức (HK3 không phải học kỳ hè)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    teaching_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    teaching_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_current_override: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)


class Module(Base):
    __tablename__ = "modules"
    __table_args__ = (
        Index("ix_modules_search_trgm", "search_text", postgresql_using="gin", postgresql_ops={"search_text": "gin_trgm_ops"}),
    )

    code: Mapped[str] = mapped_column(String(64), primary_key=True)
    is_hidden: Mapped[bool] = mapped_column(
        Boolean,
        default=lambda context: context.get_current_parameters().get("code") in {"COS101", "PHT121"},
        server_default="false",
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(512))
    credits: Mapped[int | None] = mapped_column(Integer, nullable=True)
    type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    faculty: Mapped[str | None] = mapped_column(String(256), nullable=True)
    department: Mapped[str | None] = mapped_column(String(256), nullable=True)  # Bộ môn
    is_english: Mapped[bool] = mapped_column(Boolean, default=False)  # tên có hậu tố "(E)"
    # Ngôn ngữ giảng dạy suy từ mã/tên (app/services/language.py): 'en' | 'vi'. language_basis ghi căn cứ để rà soát.
    language_track: Mapped[str] = mapped_column(String(2), default="vi", server_default="vi", index=True)
    language_basis: Mapped[str | None] = mapped_column(String(32), nullable=True)
    counterpart_code: Mapped[str | None] = mapped_column(String(64), nullable=True)  # bản Anh<->Việt: EEE1038 <-> BEE1038
    # Tên tiếng Anh để hiển thị khi giao diện ở chế độ EN. NULL = chưa có nguồn (giao diện dùng tên tiếng Việt).
    name_en: Mapped[str | None] = mapped_column(String(512), nullable=True)
    name_en_source: Mapped[str | None] = mapped_column(String(16), nullable=True)  # outline | catalog | seed_table
    # Chương trình Cử nhân tài năng (CNTN): mã dạng [B|E]XXT### hoặc tên có "CNTN" (xem app/services/language.py)
    is_talent_program: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", index=True)
    # Mô tả học phần song ngữ: `description` = tiếng Việt, `description_en` = tiếng Anh. Giao diện VI hiện bản Việt, giao diện EN hiện bản Anh;
    # thiếu bản nào thì NULL (không tự dịch). `*_source`: outline | counterpart (chép từ bản Anh<->Việt tương ứng); NULL + có nội dung = nhập tay.
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    description_source: Mapped[str | None] = mapped_column(String(16), nullable=True)
    description_en: Mapped[str | None] = mapped_column(Text, nullable=True)
    description_en_source: Mapped[str | None] = mapped_column(String(16), nullable=True)
    prerequisites: Mapped[list[str] | None] = mapped_column(JsonType, nullable=True)
    search_text: Mapped[str] = mapped_column(Text, default="")  # bản không dấu; tìm bằng trigram GIN (xem __table_args__)
    # Quản trị dữ liệu khoa/bộ môn (PLAN_ADMIN D-A7): nguồn xác nhận khoa ('outline' | 'counterpart_outline' | 'prefix' | 'admin').
    # Khi nguồn là 'admin', các quy trình tự động (fix-module-faculty) không được ghi đè.
    faculty_source: Mapped[str | None] = mapped_column(String(32), nullable=True)
    faculty_set_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    faculty_set_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    final_assessment: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    head_lecturer: Mapped[str | None] = mapped_column(String(512), nullable=True)
    outline_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Bậc đào tạo: 'dai_hoc' | 'thac_si' | 'tien_si' (Brief D6)
    degree: Mapped[str] = mapped_column(String(16), default="dai_hoc", server_default="dai_hoc", nullable=False, index=True)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    classes: Mapped[list[ClassSection]] = relationship(back_populates="module", cascade="all, delete-orphan")
    offering_plans: Mapped[list[ModuleOfferingPlan]] = relationship(
        back_populates="module", cascade="all, delete-orphan", order_by="ModuleOfferingPlan.academic_year"
    )
    assessment: Mapped[ModuleAssessment | None] = relationship(
        back_populates="module", uselist=False, cascade="all, delete-orphan"
    )
    textbooks: Mapped[list[ModuleTextbook]] = relationship(
        back_populates="module", cascade="all, delete-orphan", order_by="ModuleTextbook.id"
    )


class ModuleOfferingPlan(Base):
    """Kế hoạch mở học phần theo năm học (vd file 'Thông tin môn học TA')."""

    __tablename__ = "module_offering_plans"
    __table_args__ = (UniqueConstraint("module_code", "academic_year", name="uq_offering_plan"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    module_code: Mapped[str] = mapped_column(ForeignKey("modules.code", ondelete="CASCADE"), index=True)
    academic_year: Mapped[str] = mapped_column(String(16))  # "2026-2027"
    terms: Mapped[list[int]] = mapped_column(JsonType, default=list)
    terms_text: Mapped[str | None] = mapped_column(String(128), nullable=True)  # nguyên văn "Học kỳ 1,3"
    open_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    lecture_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str | None] = mapped_column(String(64), nullable=True)

    module: Mapped[Module] = relationship(back_populates="offering_plans")


class ModuleAssessment(Base):
    """Hình thức đánh giá học phần từ Master_data (Sheet1) và đề cương (Brief D4)."""

    __tablename__ = "module_assessments"

    module_code: Mapped[str] = mapped_column(
        String(64), ForeignKey("modules.code", ondelete="CASCADE"), primary_key=True
    )
    process_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)
    process_form: Mapped[str | None] = mapped_column(String(256), nullable=True)
    midterm_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)
    midterm_form: Mapped[str | None] = mapped_column(String(256), nullable=True)
    final_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)
    final_form: Mapped[str | None] = mapped_column(String(256), nullable=True)
    advanced_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)
    advanced_form: Mapped[str | None] = mapped_column(String(256), nullable=True)
    exam_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    exam_duration: Mapped[str | None] = mapped_column(String(64), nullable=True)
    final_assessment_kind: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    source: Mapped[str | None] = mapped_column(String(64), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    module: Mapped[Module] = relationship(back_populates="assessment")


class ModuleTextbook(Base):
    """Giáo trình, tài liệu học phần từ Master_data (Sheet1) phục vụ trang chi tiết và trao đổi sách (Brief D4, W9)."""

    __tablename__ = "module_textbooks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    module_code: Mapped[str] = mapped_column(
        String(64), ForeignKey("modules.code", ondelete="CASCADE"), index=True
    )
    name: Mapped[str | None] = mapped_column(Text, nullable=True)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    document_code: Mapped[str | None] = mapped_column(String(128), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_main: Mapped[bool] = mapped_column(Boolean, default=True)

    module: Mapped[Module] = relationship(back_populates="textbooks")


class ClassSection(Base):
    __tablename__ = "class_sections"
    __table_args__ = (
        UniqueConstraint("class_code", "semester_id", name="uq_class_semester"),
        # UNIQUE thường coi NULL là khác nhau -> lớp chưa rõ học kỳ có thể trùng mã; chỉ mục từng phần chặn việc đó.
        Index("uq_class_code_no_semester", "class_code", unique=True,
              postgresql_where=sql_text("semester_id IS NULL"), sqlite_where=sql_text("semester_id IS NULL")),
        # Danh sách lớp theo học kỳ + gom "học kỳ có lớp mở" của từng học phần.
        Index("ix_class_sections_semester_module", "semester_id", "module_code"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    class_code: Mapped[str] = mapped_column(String(128), index=True)
    module_code: Mapped[str] = mapped_column(ForeignKey("modules.code", ondelete="CASCADE"), index=True)
    semester_id: Mapped[str | None] = mapped_column(
        ForeignKey("semesters.id", ondelete="SET NULL"), nullable=True, index=True
    )
    lecturer: Mapped[str | None] = mapped_column(String(512), nullable=True)
    quota: Mapped[int | None] = mapped_column(Integer, nullable=True)  # = sĩ số tối đa
    quota_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    registered: Mapped[int | None] = mapped_column(Integer, nullable=True)
    available: Mapped[int | None] = mapped_column(Integer, nullable=True)
    student_groups: Mapped[list[str] | None] = mapped_column(JsonType, nullable=True)  # "K24404E", ...
    cohorts: Mapped[list[str] | None] = mapped_column(JsonType, nullable=True)  # "K24", suy từ student_groups
    rooms: Mapped[list[dict] | None] = mapped_column(JsonType, nullable=True)  # [{room, capacity, capacity_gap}]
    notes: Mapped[list[str] | None] = mapped_column(JsonType, nullable=True)
    source: Mapped[str | None] = mapped_column(String(32), nullable=True)  # dkhp | uis | portal | sample
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    study_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    schedule_raw: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    module: Mapped[Module] = relationship(back_populates="classes")
    lessons: Mapped[list[Lesson]] = relationship(
        back_populates="class_section", cascade="all, delete-orphan", order_by="Lesson.id"
    )


class Venue(Base):
    __tablename__ = "venues"

    room: Mapped[str] = mapped_column(String(128), primary_key=True)
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)


class Lesson(Base):
    __tablename__ = "lessons"
    __table_args__ = (
        CheckConstraint("weekday BETWEEN 2 AND 8", name="ck_lessons_weekday"),
        CheckConstraint("end_period >= start_period", name="ck_lessons_period_order"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("class_sections.id", ondelete="CASCADE"), index=True)
    weekday: Mapped[int] = mapped_column(Integer)  # 2..8 (8 = Chủ nhật)
    start_period: Mapped[int] = mapped_column(Integer)
    end_period: Mapped[float] = mapped_column(Float)  # x.5 = tiết nửa
    start_time: Mapped[str] = mapped_column(String(5))
    end_time: Mapped[str] = mapped_column(String(5))
    room: Mapped[str | None] = mapped_column(ForeignKey("venues.room", ondelete="SET NULL"), nullable=True, index=True)
    weeks: Mapped[str | None] = mapped_column(String(256), nullable=True)
    date_start: Mapped[date | None] = mapped_column(Date, nullable=True)  # ngày đầu của buổi (lặp hoặc một lần)
    date_end: Mapped[date | None] = mapped_column(Date, nullable=True)    # ngày cuối; = date_start nếu chỉ một lần
    raw: Mapped[str | None] = mapped_column(Text, nullable=True)

    class_section: Mapped[ClassSection] = relationship(back_populates="lessons")


class Equivalent(Base):
    __tablename__ = "equivalents"
    __table_args__ = (UniqueConstraint("code", "equivalent_code", name="uq_equivalent_pair"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(64), index=True)
    name: Mapped[str | None] = mapped_column(String(512), nullable=True)
    credits: Mapped[int | None] = mapped_column(Integer, nullable=True)
    equivalent_code: Mapped[str] = mapped_column(String(64), index=True)
    equivalent_name: Mapped[str | None] = mapped_column(String(512), nullable=True)
    equivalent_credits: Mapped[int | None] = mapped_column(Integer, nullable=True)
    search_text: Mapped[str] = mapped_column(Text, default="")
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)


class Program(Base):
    """Chương trình đào tạo (CTĐT), vd K22404 = ngành 404 khóa 22."""

    __tablename__ = "programs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str | None] = mapped_column(String(512), nullable=True)
    cohort: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)  # "K22"
    faculty: Mapped[str | None] = mapped_column(String(256), nullable=True)
    # Bậc đào tạo: 'dai_hoc' | 'thac_si' | 'tien_si' (Brief D6)
    degree: Mapped[str] = mapped_column(String(16), default="dai_hoc", server_default="dai_hoc", nullable=False, index=True)
    search_text: Mapped[str] = mapped_column(Text, default="")
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)
    source: Mapped[str | None] = mapped_column(String(32), nullable=True)

    modules: Mapped[list[ProgramModule]] = relationship(
        back_populates="program", cascade="all, delete-orphan", order_by="ProgramModule.id"
    )


class ProgramModule(Base):
    __tablename__ = "program_modules"
    __table_args__ = (UniqueConstraint("program_id", "module_code", name="uq_program_module"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    program_id: Mapped[str] = mapped_column(ForeignKey("programs.id", ondelete="CASCADE"), index=True)
    module_code: Mapped[str] = mapped_column(ForeignKey("modules.code", ondelete="CASCADE"), index=True)
    block: Mapped[str | None] = mapped_column(String(512), nullable=True)  # TenKhoiKienThuc
    parent_block: Mapped[str | None] = mapped_column(String(512), nullable=True)  # TenKhoaKienThucCha
    required: Mapped[bool] = mapped_column(Boolean, default=True)
    suggested_term: Mapped[str | None] = mapped_column(String(128), nullable=True)  # "HK02 năm học 2022-2023"
    suggested_semester: Mapped[str | None] = mapped_column(String(32), nullable=True)  # "2022-2023-2"
    suggested_order: Mapped[int | None] = mapped_column(Integer, nullable=True)  # kỳ thứ n của khóa (1-based)
    prereq_raw: Mapped[str | None] = mapped_column(String(512), nullable=True)
    previous_raw: Mapped[str | None] = mapped_column(String(512), nullable=True)
    coreq_raw: Mapped[str | None] = mapped_column(String(512), nullable=True)
    equivalent_raw: Mapped[str | None] = mapped_column(String(512), nullable=True)
    prereq_tree: Mapped[Any | None] = mapped_column(JsonType, nullable=True)
    previous_tree: Mapped[Any | None] = mapped_column(JsonType, nullable=True)
    coreq_tree: Mapped[Any | None] = mapped_column(JsonType, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    program: Mapped[Program] = relationship(back_populates="modules")
    module: Mapped[Module] = relationship()


class ModuleRelation(Base):
    """Cạnh source -> target: phải có `source` (tiên quyết/học trước/song hành) mới học `target`;
    type=equivalent: source thay thế được target."""

    __tablename__ = "module_relations"
    __table_args__ = (
        UniqueConstraint("source", "target", "type", "program_id", name="uq_module_relation"),
        # Quan hệ chung (không gắn chương trình): program_id NULL nên UNIQUE ở trên không chặn trùng.
        Index("uq_module_relation_no_program", "source", "target", "type", unique=True,
              postgresql_where=sql_text("program_id IS NULL"), sqlite_where=sql_text("program_id IS NULL")),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source: Mapped[str] = mapped_column(String(64), index=True)
    target: Mapped[str] = mapped_column(String(64), index=True)
    type: Mapped[str] = mapped_column(String(16))  # prereq | previous | coreq | equivalent
    program_id: Mapped[str | None] = mapped_column(
        ForeignKey("programs.id", ondelete="CASCADE"), nullable=True, index=True
    )


class Feedback(Base):
    __tablename__ = "feedback"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    page: Mapped[str] = mapped_column(String(256), index=True)
    rating: Mapped[int] = mapped_column(Integer)
    category: Mapped[str] = mapped_column(String(64), index=True)
    message: Mapped[str] = mapped_column(Text, default="")
    contact: Mapped[str | None] = mapped_column(String(256), nullable=True)
    app_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    # Kiểm duyệt (Brief A3)
    status: Mapped[str] = mapped_column(String(16), default="pending", server_default="pending", index=True)
    moderated_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    moderated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    moderation_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    flag_reasons: Mapped[list[str] | None] = mapped_column(JsonType, nullable=True)
    # Đánh giá nhanh mức độ hài lòng (chỉ gán khi is_quick_rating=True)
    rater_ip_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    account_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    is_quick_rating: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)


# =============================================================================
# Nguồn gốc dữ liệu (data lineage)
# =============================================================================
class ImportRun(Base):
    """Mỗi lần nhập một file nguồn: ghi lại nguồn, file, sha256, số dòng — để truy vết dữ liệu (chương đánh giá khóa luận)."""

    __tablename__ = "import_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source: Mapped[str] = mapped_column(String(32), index=True)  # uis|dkhp|ctdt|ta_plan|equivalents|outlines|regulations|...
    file_name: Mapped[str | None] = mapped_column(String(512), nullable=True)
    file_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    rows_in: Mapped[int] = mapped_column(Integer, default=0)
    rows_ok: Mapped[int] = mapped_column(Integer, default=0)
    rows_skipped: Mapped[int] = mapped_column(Integer, default=0)
    rows_error: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(16), default="ok")  # ok | partial | failed
    detail: Mapped[Any | None] = mapped_column(JsonType, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# =============================================================================
# Đề cương học phần & danh mục CTĐT 2025 (data/outlines_2025)
# =============================================================================
class ProgramCatalogEntry(Base):
    """Một dòng của 18 workbook "Đề cương CTĐT 2025": chương trình → nhánh (sheet) → môn.

    Cùng một môn xuất hiện ở nhiều nhánh/bản rà soát nên KHÔNG dùng module_code làm khóa.
    `module_code` chỉ là liên kết mềm tới `modules.code` (có thể chưa tồn tại).
    """

    __tablename__ = "program_catalog_entries"
    __table_args__ = (
        UniqueConstraint("source_file", "source_sheet", "source_row", name="uq_catalog_entry_source"),
        Index("ix_catalog_program_module", "program_label", "module_code"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # id trong catalog.sqlite
    program_label: Mapped[str] = mapped_column(String(256), index=True)
    track_label: Mapped[str | None] = mapped_column(String(256), nullable=True)  # tên sheet
    category: Mapped[str | None] = mapped_column(String(32), nullable=True)  # curriculum_source | track_or_review
    module_code: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    module_code_en: Mapped[str | None] = mapped_column(String(64), nullable=True)
    language_track: Mapped[str | None] = mapped_column(String(2), nullable=True, index=True)  # 'en' | 'vi'
    module_name: Mapped[str | None] = mapped_column(String(512), nullable=True)
    module_name_en: Mapped[str | None] = mapped_column(String(512), nullable=True)
    term: Mapped[str | None] = mapped_column(String(16), nullable=True)  # "HK01"; NULL = sheet không có cột học kỳ
    academic_year: Mapped[str | None] = mapped_column(String(16), nullable=True)
    credits: Mapped[float | None] = mapped_column(Float, nullable=True)
    required_raw: Mapped[str | None] = mapped_column(String(32), nullable=True)  # "X" hoặc trống — không suy diễn
    department: Mapped[str | None] = mapped_column(String(256), nullable=True)
    previous_raw: Mapped[str | None] = mapped_column(String(512), nullable=True)  # môn học trước, nguyên văn
    source_file: Mapped[str] = mapped_column(String(512))
    source_sheet: Mapped[str] = mapped_column(String(256))
    source_row: Mapped[int] = mapped_column(Integer)
    original: Mapped[Any | None] = mapped_column(JsonType, nullable=True)  # toàn bộ ô gốc [{column, header, value}]
    import_run_id: Mapped[int | None] = mapped_column(ForeignKey("import_runs.id", ondelete="SET NULL"), nullable=True, index=True)

    resources: Mapped[list[OutlineResource]] = relationship(back_populates="entry", cascade="all, delete-orphan")


class OutlineDocument(Base):
    """Một file đề cương (PDF) đã tải. File nằm ngoài DB (data/outlines_2025/pdfs hoặc object storage); DB giữ metadata + văn bản trích xuất."""

    __tablename__ = "outline_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sha256: Mapped[str] = mapped_column(String(64), unique=True)
    file_name: Mapped[str] = mapped_column(String(255), index=True)
    rel_path: Mapped[str] = mapped_column(String(512))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ctdt_year: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    source_format: Mapped[str | None] = mapped_column(String(16), default="pdf", nullable=True, index=True)
    text_status: Mapped[str] = mapped_column(String(16), default="pending", index=True)  # pending|extracted|needs_ocr|failed
    text_method: Mapped[str | None] = mapped_column(String(16), nullable=True)  # pdf_text | ocr
    text_chars: Mapped[int | None] = mapped_column(Integer, nullable=True)
    language: Mapped[str | None] = mapped_column(String(8), nullable=True)
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    extracted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # OCR để làm sau (PDF scan, không có lớp chữ). NULL = không cần OCR; 'pending' = cần OCR, chưa xong;
    # 'done' = đã OCR (văn bản ở ocr_text, đồng thời chép sang `text` để parse-outlines dùng).
    # `ocr_text` của tài liệu 'pending' (nếu có) chỉ là bản chạy thử chưa duyệt — chưa đưa vào phân tích.
    ocr_status: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    ocr_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    ocr_engine: Mapped[str | None] = mapped_column(String(64), nullable=True)  # vd 'tesseract vie+eng psm4 300dpi'
    ocr_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    resources: Mapped[list[OutlineResource]] = relationship(back_populates="document")
    sections: Mapped[list[OutlineSection]] = relationship(
        back_populates="document", cascade="all, delete-orphan", order_by="OutlineSection.ord"
    )


class OutlineResource(Base):
    """Liên kết tới đề cương của một dòng catalog (4.736 tham chiếu, 951 URL khác nhau)."""

    __tablename__ = "outline_resources"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    entry_id: Mapped[str] = mapped_column(ForeignKey("program_catalog_entries.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str | None] = mapped_column(String(128), nullable=True)  # vd "Link đề cương hiện tại (chuẩn)"
    label: Mapped[str | None] = mapped_column(String(512), nullable=True)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_column: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="no_url", index=True)  # downloaded|failed|no_url
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    document_id: Mapped[int | None] = mapped_column(
        ForeignKey("outline_documents.id", ondelete="SET NULL"), nullable=True, index=True
    )

    entry: Mapped[ProgramCatalogEntry] = relationship(back_populates="resources")
    document: Mapped[OutlineDocument | None] = relationship(back_populates="resources")


class OutlineSection(Base):
    """Từng mục của đề cương (nguyên văn) — luôn được lưu để không mất thông tin và tìm kiếm toàn văn được."""

    __tablename__ = "outline_sections"
    __table_args__ = (
        Index("ix_outline_sections_search_trgm", "search_text", postgresql_using="gin",
              postgresql_ops={"search_text": "gin_trgm_ops"}),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("outline_documents.id", ondelete="CASCADE"), index=True)
    # general|description|materials|objectives|clos|assessment|schedule|workload|rules|responsible|clo_report|other
    kind: Mapped[str] = mapped_column(String(32), index=True)
    ord: Mapped[int] = mapped_column(Integer, default=0)
    heading: Mapped[str | None] = mapped_column(String(512), nullable=True)
    text: Mapped[str] = mapped_column(Text)
    search_text: Mapped[str] = mapped_column(Text, default="")  # không dấu, để tìm kiếm

    document: Mapped[OutlineDocument] = relationship(back_populates="sections")


class OutlineCourse(Base):
    """Thông tin tổng quát của một đề cương (1 dòng / tài liệu): tên, mã, tín chỉ, giờ, môn tiên quyết/học trước, giảng viên…

    Mọi giá trị "_raw" giữ nguyên văn như trong file. `parse_status`: ok (đủ trường chính) | partial | failed.
    """

    __tablename__ = "outline_courses"
    __table_args__ = (Index("ix_outline_courses_code_norm", "course_code_norm"),)

    document_id: Mapped[int] = mapped_column(ForeignKey("outline_documents.id", ondelete="CASCADE"), primary_key=True)
    doc_type: Mapped[str] = mapped_column(String(16), default="syllabus_vi")  # syllabus_vi | syllabus_en | clo_report | other
    faculty: Mapped[str | None] = mapped_column(String(256), nullable=True)
    department: Mapped[str | None] = mapped_column(String(256), nullable=True)  # bộ môn
    name_vi: Mapped[str | None] = mapped_column(String(512), nullable=True)
    name_en: Mapped[str | None] = mapped_column(String(512), nullable=True)
    course_code: Mapped[str | None] = mapped_column(String(64), nullable=True)  # nguyên văn, vd "BBU 402501"
    course_code_norm: Mapped[str | None] = mapped_column(String(64), nullable=True)  # bỏ khoảng trắng, in hoa
    language_track: Mapped[str | None] = mapped_column(String(2), nullable=True, index=True)  # 'en' | 'vi'
    knowledge_block: Mapped[str | None] = mapped_column(String(256), nullable=True)
    level: Mapped[str | None] = mapped_column(String(64), nullable=True)
    major: Mapped[str | None] = mapped_column(String(256), nullable=True)
    cohort_range: Mapped[str | None] = mapped_column(String(128), nullable=True)  # "2025 - 2029" hoặc "2023 – 2027, 2024 – 2028, 2025 - 2029"
    academic_year: Mapped[str | None] = mapped_column(String(64), nullable=True)
    term: Mapped[str | None] = mapped_column(String(64), nullable=True)
    credits: Mapped[float | None] = mapped_column(Float, nullable=True)
    hours_lecture: Mapped[float | None] = mapped_column(Float, nullable=True)
    hours_practice: Mapped[float | None] = mapped_column(Float, nullable=True)
    hours_self_study: Mapped[float | None] = mapped_column(Float, nullable=True)
    prerequisite_raw: Mapped[str | None] = mapped_column(Text, nullable=True)
    previous_raw: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_raw: Mapped[str | None] = mapped_column(Text, nullable=True)
    corequisite_raw: Mapped[str | None] = mapped_column(Text, nullable=True)
    teaching_language: Mapped[str | None] = mapped_column(String(128), nullable=True)
    lecturers: Mapped[Any | None] = mapped_column(JsonType, nullable=True)
    assistants: Mapped[Any | None] = mapped_column(JsonType, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    parse_status: Mapped[str] = mapped_column(String(16), default="failed", index=True)
    parse_detail: Mapped[Any | None] = mapped_column(JsonType, nullable=True)  # số dòng từng bảng, trường thiếu…
    parse_method: Mapped[str | None] = mapped_column(String(16), nullable=True)  # rules | llm
    parsed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class OutlineMaterial(Base):
    """Giáo trình / tài liệu tham khảo của đề cương."""

    __tablename__ = "outline_materials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("outline_documents.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(16))  # textbook | reference | software
    ord: Mapped[int] = mapped_column(Integer, default=0)
    citation: Mapped[str] = mapped_column(Text)


class OutlineObjective(Base):
    """Mục tiêu học phần (CO1, CO2…) và CLO tương ứng."""

    __tablename__ = "outline_objectives"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("outline_documents.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(16))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    clo_codes: Mapped[Any | None] = mapped_column(JsonType, nullable=True)
    competency_level: Mapped[str | None] = mapped_column(String(128), nullable=True)  # TĐNL


class OutlineClo(Base):
    """Chuẩn đầu ra học phần (CLO1, CLO2…) và mức độ giảng dạy (I, T, U)."""

    __tablename__ = "outline_clos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("outline_documents.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(16))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    teaching_levels: Mapped[str | None] = mapped_column(String(128), nullable=True)  # "I, T" / "T, U"


class OutlineAssessment(Base):
    """Một bài đánh giá (A1.1, A2.1…): thành phần, CLO, tiêu chí, thời lượng, trọng số."""

    __tablename__ = "outline_assessments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("outline_documents.id", ondelete="CASCADE"), index=True)
    ord: Mapped[int] = mapped_column(Integer, default=0)
    component: Mapped[str | None] = mapped_column(Text, nullable=True)  # "A1. Đánh giá quá trình" (bảng lệch cột có thể dồn cả tiêu chí vào đây)
    item_code: Mapped[str | None] = mapped_column(String(16), nullable=True)  # "A1.1"
    item_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    clo_codes: Mapped[Any | None] = mapped_column(JsonType, nullable=True)
    criteria: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration: Mapped[str | None] = mapped_column(String(128), nullable=True)
    weight_pct: Mapped[float | None] = mapped_column(Float, nullable=True)  # trọng số trong học phần
    sub_weight_pct: Mapped[float | None] = mapped_column(Float, nullable=True)  # trọng số con


class OutlineModuleLink(Base):
    """Đề cương (PDF/Docx) ↔ mã học phần theo năm CTĐT (liên kết mềm tới modules.code — không ép khóa ngoại).
    Một tài liệu có thể phục vụ nhiều mã (bản Việt/Anh, nhiều chương trình)."""

    __tablename__ = "outline_module_links"
    __table_args__ = (
        UniqueConstraint("document_id", "module_code", "ctdt_year", name="uq_outline_module_link"),
        Index("ix_outline_module_links_module_year", "module_code", "ctdt_year"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("outline_documents.id", ondelete="CASCADE"), index=True)
    module_code: Mapped[str] = mapped_column(String(64), index=True)
    ctdt_year: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    source: Mapped[str] = mapped_column(String(32), default="catalog")


class OutlineScheduleItem(Base):
    """Kế hoạch giảng dạy theo tuần/buổi."""

    __tablename__ = "outline_schedule"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("outline_documents.id", ondelete="CASCADE"), index=True)
    ord: Mapped[int] = mapped_column(Integer, default=0)
    week_label: Mapped[str | None] = mapped_column(String(128), nullable=True)  # "1", "2-3", "Ôn tập"
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    clo_codes: Mapped[Any | None] = mapped_column(JsonType, nullable=True)
    activities: Mapped[str | None] = mapped_column(Text, nullable=True)
    assessment: Mapped[str | None] = mapped_column(Text, nullable=True)


# =============================================================================
# Quy chế / quy định (RAG) — danh mục văn bản + các đoạn Điều/Khoản
# =============================================================================
class RegulationDocument(Base):
    """Văn bản quy chế (từ regulations/catalog.json). Không bịa số quyết định/ngày: trường không rõ để NULL, `verified` = đã đọc trong chính văn bản."""

    __tablename__ = "regulation_documents"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)  # doc_id
    title: Mapped[str] = mapped_column(Text)
    issuer: Mapped[str | None] = mapped_column(String(256), nullable=True)
    decision_no: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    issued_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    effective_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="active", index=True)  # active|expired|superseded|upcoming
    superseded_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    supersedes: Mapped[Any | None] = mapped_column(JsonType, nullable=True)
    applies_to_cohorts: Mapped[Any | None] = mapped_column(JsonType, nullable=True)  # ["K22","K23"] | ["all"]
    topics: Mapped[Any | None] = mapped_column(JsonType, nullable=True)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    file: Mapped[str | None] = mapped_column(String(512), nullable=True)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    rag_metadata: Mapped[dict | None] = mapped_column(JsonType, nullable=True)
    rag_articles: Mapped[list | None] = mapped_column(JsonType, nullable=True)

    chunks: Mapped[list[RegulationChunk]] = relationship(back_populates="document", cascade="all, delete-orphan")


class RegulationChunk(Base):
    """Một Điều/Khoản/Điểm nguyên văn — đơn vị truy xuất và trích dẫn của RAG. (Cột vector pgvector sẽ thêm bằng migration riêng khi bật embeddings.)"""

    __tablename__ = "regulation_chunks"
    __table_args__ = (
        UniqueConstraint("doc_id", "anchor", name="uq_regulation_chunk_anchor"),
        Index("ix_regulation_chunks_search_trgm", "search_text", postgresql_using="gin",
              postgresql_ops={"search_text": "gin_trgm_ops"}),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    doc_id: Mapped[str] = mapped_column(ForeignKey("regulation_documents.id", ondelete="CASCADE"), index=True)
    chapter: Mapped[str | None] = mapped_column(String(256), nullable=True)
    article: Mapped[str | None] = mapped_column(String(32), nullable=True)  # "10"
    clause: Mapped[str | None] = mapped_column(String(32), nullable=True)  # "2"
    point: Mapped[str | None] = mapped_column(String(8), nullable=True)  # "a"
    heading: Mapped[str | None] = mapped_column(Text, nullable=True)
    anchor: Mapped[str] = mapped_column(String(128))  # "dieu-10-khoan-2"
    page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    text: Mapped[str] = mapped_column(Text)  # NGUYÊN VĂN
    search_text: Mapped[str] = mapped_column(Text, default="")  # bản không dấu để tìm kiếm
    rag_metadata: Mapped[dict | None] = mapped_column(JsonType, nullable=True)

    document: Mapped[RegulationDocument] = relationship(back_populates="chunks")


class RegulationIndexState(Base):
    __tablename__ = "regulation_index_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    version: Mapped[str] = mapped_column(String(64), nullable=False)
    stats: Mapped[dict] = mapped_column(JsonType, nullable=False)


class RagCallBudget(Base):
    __tablename__ = "rag_call_budget"

    bucket: Mapped[str] = mapped_column(String(80), primary_key=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    calls: Mapped[int] = mapped_column(Integer, nullable=False)


class RagAnswerFeedback(Base):
    __tablename__ = "rag_answer_feedback"

    answer_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    scope: Mapped[str] = mapped_column(String(16), nullable=False)
    helpful: Mapped[bool] = mapped_column(Boolean, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


# =============================================================================
# Tài khoản sinh viên (đăng nhập Google/Facebook) và đánh giá học phần
# =============================================================================
class User(Base):
    """Email là tùy chọn, chỉ lưu nếu OAuth cấp quyền, chỉ dùng để thông báo khi bị ban, không hiển thị công khai."""

    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("provider", "subject", name="uq_user_provider_subject"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    provider: Mapped[str] = mapped_column(String(16))  # google | facebook
    subject: Mapped[str] = mapped_column(String(128))  # id do nhà cung cấp cấp
    display_name: Mapped[str] = mapped_column(String(128), default="Sinh viên")
    # Biệt danh công khai do người dùng tự đặt (thay "Sinh viên ẩn danh"); None = dùng tên ẩn danh mặc định.
    # display_name ở trên là tên do nhà cung cấp trả về và KHÔNG bao giờ hiển thị công khai.
    nickname: Mapped[str | None] = mapped_column(String(40), nullable=True)
    email: Mapped[str | None] = mapped_column(String(256), nullable=True)
    ban_level: Mapped[str | None] = mapped_column(String(16), nullable=True)  # temporary | permanent
    ban_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    banned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ban_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ban_cycle_reset_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ban_notified_email_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Review(Base):
    """Đánh giá học phần. Chỉ status='approved' mới hiển thị công khai.
    status='pending': bị bộ kiểm duyệt đánh dấu (xem app/services/moderation.py), chờ quản trị viên duyệt."""

    __tablename__ = "reviews"
    __table_args__ = (Index("ix_reviews_module_status", "module_code", "status"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    module_code: Mapped[str] = mapped_column(String(64), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    display_name: Mapped[str] = mapped_column(String(128), default="Sinh viên ẩn danh")
    semester: Mapped[str | None] = mapped_column(String(32), nullable=True)  # vd 2025-2026-1
    professor: Mapped[str | None] = mapped_column(String(256), nullable=True)
    cohort: Mapped[str | None] = mapped_column(String(8), nullable=True)  # vd K24
    rating: Mapped[int] = mapped_column(Integer)  # 1..5 sao
    difficulty: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1..5
    workload: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1..5
    content: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="approved", index=True)
    moderation_reasons: Mapped[Any | None] = mapped_column(JsonType, nullable=True)
    ip_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class BannedIp(Base):
    """Địa chỉ IP (băm SHA-256) bị khóa tạm thời hoặc vĩnh viễn do vi phạm lặp lại."""

    __tablename__ = "banned_ips"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ip_hash: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    level: Mapped[str] = mapped_column(String(16), nullable=False)  # temporary | permanent
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(32), nullable=False)  # system | <admin_id>
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lifted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lifted_by: Mapped[str | None] = mapped_column(String(32), nullable=True)
    related_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )


# =============================================================================
# Lịch năm học và sự kiện đào tạo (academic_events)
# =============================================================================
class AcademicEvent(Base):
    """Sự kiện năm học (lịch học tập, thi cử, nghỉ lễ, xét tốt nghiệp, xét học vụ...). Nguồn: TB 223/TB-ĐHKTL-ĐT."""

    __tablename__ = "academic_events"
    __table_args__ = (
        Index("ix_academic_events_year_start", "academic_year", "start_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    academic_year: Mapped[str] = mapped_column(String(16))  # vd "2026-2027"
    kind: Mapped[str] = mapped_column(String(32), index=True)  # teaching, makeup_day, midterm_exam, holiday, etc.
    title: Mapped[str] = mapped_column(String(512))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)  # NULL nếu sự kiện 1 ngày
    semester_id: Mapped[str | None] = mapped_column(String(32), nullable=True)  # FK mềm tới semesters.id (không ép khóa ngoại)
    cohorts: Mapped[list[str] | None] = mapped_column(JsonType, nullable=True, default=list)  # ["K23", "K24"] hoặc ["all"]
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    verified: Mapped[bool] = mapped_column(Boolean, default=True)
    source: Mapped[str] = mapped_column(String(128), default="TB 223/TB-ĐHKTL-ĐT")
    updated_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# =============================================================================
# Nhật ký thao tác quản trị (audit_log) và Cài đặt quản trị (admin_settings)
# =============================================================================
class AuditLog(Base):
    """Nhật ký thao tác quản trị bất biến (chỉ thêm, không sửa/xóa)."""

    __tablename__ = "audit_log"
    __table_args__ = (
        Index("ix_audit_log_created_at", "created_at"),
        Index("ix_audit_log_actor", "actor_type", "actor_id"),
        Index("ix_audit_log_entity", "entity_type", "entity_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor_type: Mapped[str] = mapped_column(String(16), index=True)  # admin | system | student | dev
    actor_id: Mapped[str | None] = mapped_column(String(128), nullable=True)  # email, user_id hoặc 'dev'
    action: Mapped[str] = mapped_column(String(64), index=True)  # e.g. update_faculty, approve_comment, ...
    entity_type: Mapped[str | None] = mapped_column(String(64), nullable=True)  # module, review, setting, ...
    entity_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    before: Mapped[Any | None] = mapped_column(JsonType, nullable=True)
    after: Mapped[Any | None] = mapped_column(JsonType, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ExchangeModuleStat(Base):
    """Số sinh viên trao đổi (SVTĐ) đã học một học phần trong một học kỳ. Chỉ lưu số đếm, không có thông tin cá nhân."""

    __tablename__ = "exchange_module_stats"
    __table_args__ = (Index("ix_exchange_module_stats_semester", "semester_id"),)

    module_code: Mapped[str] = mapped_column(String(64), primary_key=True)
    semester_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    student_count: Mapped[int] = mapped_column(Integer, nullable=False)
    class_codes: Mapped[list[str] | None] = mapped_column(JsonType, nullable=True)  # mã lớp đã thấy (để đối chiếu)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class AdminSetting(Base):
    """Cài đặt hệ thống do quản trị viên thiết lập (key-value JSON)."""

    __tablename__ = "admin_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[Any | None] = mapped_column(JsonType, nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


# =============================================================================
# Thu thập xu hướng ẩn danh (Analytics) & Thống kê TKB (Brief A2)
# =============================================================================
class AnalyticsEvent(Base):
    """Sự kiện hành vi người dùng ẩn danh (Brief A2, D-A5).
    Không lưu IP, user-agent, tên, email, token hay MSSV.
    """

    __tablename__ = "analytics_events"
    __table_args__ = (
        Index("ix_analytics_events_type_created", "event_type", "created_at"),
        Index("ix_analytics_events_module_created", "module_code", "created_at"),
        Index("ix_analytics_events_anon_sem", "anon_id", "semester_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    anon_id: Mapped[str] = mapped_column(String(36), index=True)
    event_type: Mapped[str] = mapped_column(String(32), index=True)
    module_code: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    class_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    semester_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    program_code: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    query_text: Mapped[str | None] = mapped_column(String(64), nullable=True)
    filters: Mapped[Any | None] = mapped_column(JsonType, nullable=True)
    page: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class AnalyticsDaily(Base):
    """Bảng tổng hợp sự kiện theo ngày (Brief A2). Dựng bởi CLI aggregate-analytics."""

    __tablename__ = "analytics_daily"
    __table_args__ = (
        Index("ix_analytics_daily_day_type", "day", "event_type"),
        Index("ix_analytics_daily_module_day", "module_code", "day"),
        Index("ix_analytics_daily_sem_day", "semester_id", "day"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    event_type: Mapped[str] = mapped_column(String(32), index=True)
    module_code: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    semester_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    program_code: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    count: Mapped[int] = mapped_column(Integer, default=1)


class AnalyticsPair(Base):
    """Cặp môn học thường được xếp chung trong cùng một thời khóa biểu (Brief A2)."""

    __tablename__ = "analytics_pairs"
    __table_args__ = (
        UniqueConstraint("semester_id", "module_a", "module_b", name="uq_analytics_pairs_sem_a_b"),
        Index("ix_analytics_pairs_sem_count", "semester_id", "count"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    semester_id: Mapped[str] = mapped_column(String(32), index=True)
    module_a: Mapped[str] = mapped_column(String(64), index=True)
    module_b: Mapped[str] = mapped_column(String(64), index=True)
    count: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


# =============================================================================
# Kiểm duyệt: bình luận học phần và từ khóa cấm (Brief A3, D-A6)
# =============================================================================
class ModuleComment(Base):
    """Bình luận học phần từ sinh viên (Brief A3, D-A6).
    Mặc định status='pending' (chế độ pre-moderation), chỉ status='approved' mới hiện công khai.
    """

    __tablename__ = "module_comments"
    __table_args__ = (
        Index("ix_module_comments_module_status", "module_code", "status"),
        Index("ix_module_comments_anon_module_sem", "anon_id", "module_code", "semester"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    module_code: Mapped[str] = mapped_column(String(64), index=True)
    anon_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    student_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    semester: Mapped[str | None] = mapped_column(String(32), nullable=True)  # học kỳ sinh viên đã học, vd "2026-2027-1"
    body: Mapped[str] = mapped_column(Text)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending", server_default="pending", index=True)  # pending | approved | rejected | hidden
    flag_reasons: Mapped[list[str] | None] = mapped_column(JsonType, nullable=True)
    # Biệt danh của người gửi tại thời điểm viết (chỉ có khi đã đăng nhập và đã đặt biệt danh); None = ẩn danh.
    author_name: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    moderated_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    moderated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    moderation_note: Mapped[str | None] = mapped_column(Text, nullable=True)


class BannedTerm(Base):
    """Từ khóa cấm trong nội dung bình luận / góp ý (Brief A3).
    severity='block': từ chối ngay (HTTP 422).
    severity='flag': gắn cờ chuyển vào hàng đợi kiểm duyệt.
    """

    __tablename__ = "banned_terms"
    __table_args__ = (
        UniqueConstraint("term", name="uq_banned_terms_term"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    term: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    severity: Mapped[str] = mapped_column(String(16), default="flag", server_default="flag")  # flag | block
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# =============================================================================
# Tài khoản và phiên quản trị (Brief A6, D-A2, D-A3)
# =============================================================================
class AdminUser(Base):
    """Tài khoản quản trị viên hệ thống (Brief A6)."""

    __tablename__ = "admin_users"
    __table_args__ = (
        UniqueConstraint("email", name="uq_admin_users_email"),
        Index("ix_admin_users_role", "role"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(256), index=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    role: Mapped[str] = mapped_column(String(32), default="admin", server_default="admin")  # admin | moderator | data_editor
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=sa.true())
    failed_attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    sessions: Mapped[list[AdminSession]] = relationship(back_populates="user", cascade="all, delete-orphan")


class AdminSession(Base):
    """Phiên đăng nhập quản trị viên (Brief A6)."""

    __tablename__ = "admin_sessions"
    __table_args__ = (
        Index("ix_admin_sessions_token_hash", "token_hash"),
        Index("ix_admin_sessions_user_id", "user_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("admin_users.id", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(String(128))
    csrf_token_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime())
    ip_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[AdminUser] = relationship(back_populates="sessions")
