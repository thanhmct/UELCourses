from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import AcademicEvent, ClassSection, Lesson, Semester
from app.schemas import SemesterOut
from app.services.academic_calendar import _matches_cohort

router = APIRouter(tags=["semesters"])

ACADEMIC_KINDS = {
    "teaching",
    "online_study",
    "defense_training",
    "midterm_exam",
    "final_exam",
    "makeup_day",
    "reserve_week",
}


def current_semester_id(
    semesters: list[Semester],
    today: date | None = None,
    teaching_ranges: dict[str, tuple[date | None, date | None]] | None = None,
) -> str | None:
    """Ưu tiên cờ đặt tay; nếu không: kỳ chứa ngày hôm nay; nếu không: kỳ gần nhất đã bắt đầu."""
    today = today or date.today()
    flagged = [s for s in semesters if s.is_current_override]
    if flagged:
        return flagged[0].id
    for s in semesters:
        t_range = teaching_ranges.get(s.id, (None, None)) if teaching_ranges else (None, None)
        start = t_range[0] or s.start_date
        end = t_range[1] or s.end_date
        if start and end and start <= today <= end:
            return s.id
    started = []
    for s in semesters:
        t_range = teaching_ranges.get(s.id, (None, None)) if teaching_ranges else (None, None)
        start = t_range[0] or s.start_date
        if start and start <= today:
            started.append((start, s.id))
    if started:
        return max(started, key=lambda pair: pair[0])[1]
    return semesters[0].id if semesters else None


@router.get("/semesters", response_model=list[SemesterOut], summary="Danh sách học kỳ")
def list_semesters(
    cohort: str | None = Query(None, description="Khóa sinh viên, vd K24"),
    db: Session = Depends(get_db),
):
    sems = list(db.scalars(select(Semester).order_by(Semester.year, Semester.term)))

    # 1. Tra cứu lịch năm học (sự kiện đào tạo/thi cử)
    evt_stmt = select(AcademicEvent).where(AcademicEvent.semester_id.isnot(None))
    all_events = list(db.scalars(evt_stmt))
    cohort_events = [e for e in all_events if _matches_cohort(e.cohorts, cohort)] if cohort else all_events

    events_by_sem: dict[str, list[AcademicEvent]] = {}
    for e in cohort_events:
        if e.semester_id and e.kind in ACADEMIC_KINDS:
            events_by_sem.setdefault(e.semester_id, []).append(e)

    # Nếu lọc theo khóa mà kỳ đó không có sự kiện nào, fallback sang toàn bộ sự kiện của kỳ
    if cohort:
        for e in all_events:
            if e.semester_id and e.kind in ACADEMIC_KINDS and e.semester_id not in events_by_sem:
                events_by_sem.setdefault(e.semester_id, []).append(e)

    # 2. Tra cứu min/max ngày học từ lessons của tất cả các lớp trong từng kỳ
    lesson_ranges: dict[str, tuple[date | None, date | None]] = {
        sem_id: (d_min, d_max)
        for sem_id, d_min, d_max in db.execute(
            select(
                ClassSection.semester_id,
                func.min(Lesson.date_start),
                func.max(func.coalesce(Lesson.date_end, Lesson.date_start)),
            )
            .select_from(Lesson)
            .join(ClassSection, Lesson.class_id == ClassSection.id)
            .where(ClassSection.semester_id.isnot(None))
            .group_by(ClassSection.semester_id)
        ).all()
    }

    # Tính teaching_start / teaching_end theo thứ tự ưu tiên:
    # (0) Cột teaching_start / teaching_end lưu trong DB (do quản trị viên đặt thủ công)
    # (a) Lịch năm học (sự kiện học tập, thi cử của kỳ đó)
    # (b) Min/max ngày buổi học của tất cả các lớp trong kỳ
    # (c) start_date / end_date của Semester
    teaching_ranges: dict[str, tuple[date | None, date | None]] = {}
    for s in sems:
        if s.teaching_start is not None and s.teaching_end is not None:
            t_start, t_end = s.teaching_start, s.teaching_end
        else:
            sem_evts = events_by_sem.get(s.id, [])
            if sem_evts:
                t_start = min(e.start_date for e in sem_evts)
                t_end = max(e.end_date if e.end_date else e.start_date for e in sem_evts)
            elif s.id in lesson_ranges and lesson_ranges[s.id][0] and lesson_ranges[s.id][1]:
                t_start, t_end = lesson_ranges[s.id]
            else:
                t_start, t_end = s.start_date, s.end_date
        teaching_ranges[s.id] = (t_start, t_end)

    cur = current_semester_id(sems, teaching_ranges=teaching_ranges)

    return [
        SemesterOut(
            id=s.id,
            name=s.name,
            year=s.year,
            term=s.term,
            is_current=s.id == cur,
            start_date=s.start_date,
            end_date=s.end_date,
            teaching_start=teaching_ranges[s.id][0],
            teaching_end=teaching_ranges[s.id][1],
            is_sample=s.is_sample,
        )
        for s in sems
    ]
