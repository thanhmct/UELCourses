from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Semester(Base):
    __tablename__ = "semesters"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)  # vd "2026-2027-1"
    name: Mapped[str] = mapped_column(String(128))
    year: Mapped[str] = mapped_column(String(16))  # "2026-2027"
    term: Mapped[int] = mapped_column(Integer)  # 1, 2, 3 (hè)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_current_override: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)


class Module(Base):
    __tablename__ = "modules"

    code: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(512))
    credits: Mapped[int | None] = mapped_column(Integer, nullable=True)
    type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    faculty: Mapped[str | None] = mapped_column(String(256), nullable=True)
    department: Mapped[str | None] = mapped_column(String(256), nullable=True)  # Bộ môn
    is_english: Mapped[bool] = mapped_column(Boolean, default=False)  # dạy bằng tiếng Anh
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    prerequisites: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    search_text: Mapped[str] = mapped_column(Text, default="", index=True)
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
    terms: Mapped[list[int]] = mapped_column(JSON, default=list)
    terms_text: Mapped[str | None] = mapped_column(String(128), nullable=True)  # nguyên văn "Học kỳ 1,3"
    open_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    lecture_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str | None] = mapped_column(String(64), nullable=True)

    module: Mapped[Module] = relationship(back_populates="offering_plans")


class ClassSection(Base):
    __tablename__ = "class_sections"
    __table_args__ = (UniqueConstraint("class_code", "semester_id", name="uq_class_semester"),)

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
    student_groups: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)  # "K24404E", ...
    cohorts: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)  # "K24", suy từ student_groups
    rooms: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)  # [{room, capacity, capacity_gap}]
    notes: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
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

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("class_sections.id", ondelete="CASCADE"), index=True)
    weekday: Mapped[int] = mapped_column(Integer)  # 2..8 (8 = Chủ nhật)
    start_period: Mapped[int] = mapped_column(Integer)
    end_period: Mapped[int] = mapped_column(Integer)
    start_time: Mapped[str] = mapped_column(String(5))
    end_time: Mapped[str] = mapped_column(String(5))
    room: Mapped[str | None] = mapped_column(ForeignKey("venues.room", ondelete="SET NULL"), nullable=True, index=True)
    weeks: Mapped[str | None] = mapped_column(String(256), nullable=True)
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
    prereq_tree: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    previous_tree: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    coreq_tree: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    program: Mapped[Program] = relationship(back_populates="modules")
    module: Mapped[Module] = relationship()


class ModuleRelation(Base):
    """Cạnh source -> target: phải có `source` (tiên quyết/học trước/song hành) mới học `target`;
    type=equivalent: source thay thế được target."""

    __tablename__ = "module_relations"
    __table_args__ = (UniqueConstraint("source", "target", "type", "program_id", name="uq_module_relation"),)

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
