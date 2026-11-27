from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import AcademicEvent, CalendarSticker
from app.schemas import AcademicEventOut, CalendarPhaseOut, FreeDayDisplayOut
from app.services.academic_calendar import _matches_cohort, phase_for

VN_TZ = timezone(timedelta(hours=7))

router = APIRouter(prefix="", tags=["calendar"])


@router.get("/calendar", response_model=list[AcademicEventOut], summary="Tra cứu lịch sự kiện năm học")
def get_calendar_events(
    from_date: date | None = Query(None, alias="from", description="Từ ngày (YYYY-MM-DD)"),
    to_date: date | None = Query(None, alias="to", description="Đến ngày (YYYY-MM-DD)"),
    cohort: str | None = Query(None, description="Khóa sinh viên, vd K24, K26"),
    kind: str | None = Query(None, description="Loại sự kiện, vd teaching, midterm_exam, holiday..."),
    academic_year: str | None = Query(None, description="Năm học, vd 2026-2027"),
    semester_id: str | None = Query(None, description="Mã học kỳ, vd 2026-2027-1"),
    db: Session = Depends(get_db),
):
    stmt = select(AcademicEvent)

    # Sự kiện giao với khoảng [from_date, to_date]:
    # Giao nhau khi: event.start_date <= to_date AND coalesce(event.end_date, event.start_date) >= from_date
    if to_date is not None:
        stmt = stmt.where(AcademicEvent.start_date <= to_date)
    if from_date is not None:
        stmt = stmt.where(func.coalesce(AcademicEvent.end_date, AcademicEvent.start_date) >= from_date)

    if kind:
        stmt = stmt.where(AcademicEvent.kind == kind)
    if academic_year:
        stmt = stmt.where(AcademicEvent.academic_year == academic_year)
    if semester_id:
        stmt = stmt.where(AcademicEvent.semester_id == semester_id)

    stmt = stmt.order_by(AcademicEvent.start_date.asc(), AcademicEvent.id.asc())
    events = list(db.scalars(stmt))

    if cohort:
        events = [e for e in events if _matches_cohort(e.cohorts, cohort)]

    return [AcademicEventOut.model_validate(e) for e in events]


@router.get(
    "/calendar/free-day-display",
    response_model=FreeDayDisplayOut,
    summary="Sticker và lời chúc cho khoảng ngày không có lịch",
)
def get_free_day_display(
    from_date: date = Query(..., alias="from", description="Ngày bắt đầu (YYYY-MM-DD)"),
    to_date: date = Query(..., alias="to", description="Ngày kết thúc (YYYY-MM-DD)"),
    cohort: str | None = Query(None, description="Khóa sinh viên, vd K24, K26"),
    db: Session = Depends(get_db),
):
    if from_date > to_date:
        raise HTTPException(status_code=422, detail="'from' must be on or before 'to'")

    stmt = (
        select(AcademicEvent)
        .where(
            AcademicEvent.verified.is_(True),
            AcademicEvent.start_date <= to_date,
            func.coalesce(AcademicEvent.end_date, AcademicEvent.start_date) >= from_date,
        )
        .order_by(AcademicEvent.start_date.asc(), AcademicEvent.id.asc())
    )
    matching = [
        event
        for event in db.scalars(stmt)
        if (
            _matches_cohort(event.cohorts, cohort)
            if cohort
            else not event.cohorts or "all" in event.cohorts
        )
    ]

    event_types = {
        "special_event": [e for e in matching if e.kind in {"special_event", "ceremony"}],
        "holiday": [e for e in matching if e.kind in {"holiday", "break"}],
        "exam_week": [e for e in matching if e.kind in {"midterm_exam", "final_exam"}],
    }
    selected_type = next((kind for kind, events in event_types.items() if events), "default_free")
    sticker = db.get(CalendarSticker, selected_type)
    if sticker is None:
        raise HTTPException(status_code=503, detail=f"Missing calendar sticker configuration: {selected_type}")

    event = event_types.get(selected_type, [])
    return FreeDayDisplayOut(
        event_type=sticker.event_type,
        sticker_path=sticker.sticker_path,
        message=sticker.message,
        message_en=sticker.message_en,
        event_title=event[0].title if event else None,
    )


@router.get("/calendar/today", response_model=CalendarPhaseOut, summary="Giai đoạn đào tạo hôm nay hoặc ngày chỉ định")
def get_calendar_today(
    cohort: str | None = Query(None, description="Khóa sinh viên, vd K24, K26"),
    target_date: date | None = Query(None, alias="date", description="Ngày cần tra cứu (mặc định hôm nay giờ VN, UTC+7)"),
    db: Session = Depends(get_db),
):
    d = target_date if target_date is not None else datetime.now(VN_TZ).date()
    res = phase_for(db, d, cohort=cohort)
    return CalendarPhaseOut(**res)
