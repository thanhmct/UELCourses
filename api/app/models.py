from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

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

from app.db import Base


# JSON: JSONB trên PostgreSQL (lập chỉ mục được), JSON trên SQLite. none_as_null: None -> SQL NULL (không phải JSON "null").
JsonType = JSON(none_as_null=True).with_variant(JSONB(none_as_null=True), "postgresql")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Semester(Base):
    __tablename__ = "semesters"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)  # vd "2026-2027-1"
    name: Mapped[str] = mapped_column(String(128))
    year: Mapped[str] = mapped_column(String(16))  # "2026-2027"
    term: Mapped[int] = mapped_column(Integer)  # 1, 2, 3 — cả ba đều là học kỳ chính thức (HK3 không phải học kỳ hè)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_current_override: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)


class Module(Base):
    __tablename__ = "modules"
    __table_args__ = (
        Index("ix_modules_search_trgm", "search_text", postgresql_using="gin", postgresql_ops={"search_text": "gin_trgm_ops"}),
    )

    code: Mapped[str] = mapped_column(String(64), primary_key=True)
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
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    classes: Mapped[list[ClassSection]] = relationship(back_populates="module", cascade="all, delete-orphan")
    offering_plans: Mapped[list[ModuleOfferingPlan]] = relationship(
        back_populates="module", cascade="all, delete-orphan", order_by="ModuleOfferingPlan.academic_year"
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
    text_status: Mapped[str] = mapped_column(String(16), default="pending", index=True)  # pending|extracted|needs_ocr|failed
    text_method: Mapped[str | None] = mapped_column(String(16), nullable=True)  # pdf_text | ocr
    text_chars: Mapped[int | None] = mapped_column(Integer, nullable=True)
    language: Mapped[str | None] = mapped_column(String(8), nullable=True)
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    extracted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

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
    cohort_range: Mapped[str | None] = mapped_column(String(32), nullable=True)  # "2025 - 2029"
    academic_year: Mapped[str | None] = mapped_column(String(32), nullable=True)
    term: Mapped[str | None] = mapped_column(String(32), nullable=True)
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
    kind: Mapped[str] = mapped_column(String(16))  # textbook | reference
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
    competency_level: Mapped[str | None] = mapped_column(String(32), nullable=True)  # TĐNL


class OutlineClo(Base):
    """Chuẩn đầu ra học phần (CLO1, CLO2…) và mức độ giảng dạy (I, T, U)."""

    __tablename__ = "outline_clos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("outline_documents.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(16))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    teaching_levels: Mapped[str | None] = mapped_column(String(32), nullable=True)  # "I, T" / "T, U"


class OutlineAssessment(Base):
    """Một bài đánh giá (A1.1, A2.1…): thành phần, CLO, tiêu chí, thời lượng, trọng số."""

    __tablename__ = "outline_assessments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("outline_documents.id", ondelete="CASCADE"), index=True)
    ord: Mapped[int] = mapped_column(Integer, default=0)
    component: Mapped[str | None] = mapped_column(String(256), nullable=True)  # "A1. Đánh giá quá trình"
    item_code: Mapped[str | None] = mapped_column(String(16), nullable=True)  # "A1.1"
    item_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    clo_codes: Mapped[Any | None] = mapped_column(JsonType, nullable=True)
    criteria: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration: Mapped[str | None] = mapped_column(String(128), nullable=True)
    weight_pct: Mapped[float | None] = mapped_column(Float, nullable=True)  # trọng số trong học phần
    sub_weight_pct: Mapped[float | None] = mapped_column(Float, nullable=True)  # trọng số con


class OutlineModuleLink(Base):
    """Đề cương (PDF) ↔ mã học phần, lấy từ danh mục CTĐT 2025 (liên kết mềm tới modules.code — không ép khóa ngoại).
    Một PDF có thể phục vụ nhiều mã (bản Việt/Anh, nhiều chương trình)."""

    __tablename__ = "outline_module_links"
    __table_args__ = (UniqueConstraint("document_id", "module_code", name="uq_outline_module_link"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("outline_documents.id", ondelete="CASCADE"), index=True)
    module_code: Mapped[str] = mapped_column(String(64), index=True)
    source: Mapped[str] = mapped_column(String(16), default="catalog")


class OutlineScheduleItem(Base):
    """Kế hoạch giảng dạy theo tuần/buổi."""

    __tablename__ = "outline_schedule"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("outline_documents.id", ondelete="CASCADE"), index=True)
    ord: Mapped[int] = mapped_column(Integer, default=0)
    week_label: Mapped[str | None] = mapped_column(String(32), nullable=True)  # "1", "2-3", "Ôn tập"
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

    document: Mapped[RegulationDocument] = relationship(back_populates="chunks")


# =============================================================================
# Tài khoản sinh viên (đăng nhập Google/Facebook) và đánh giá học phần
# =============================================================================
class User(Base):
    """Chỉ lưu định danh từ nhà cung cấp và tên hiển thị. KHÔNG lưu email."""

    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("provider", "subject", name="uq_user_provider_subject"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    provider: Mapped[str] = mapped_column(String(16))  # google | facebook
    subject: Mapped[str] = mapped_column(String(128))  # id do nhà cung cấp cấp
    display_name: Mapped[str] = mapped_column(String(128), default="Sinh viên")
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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
