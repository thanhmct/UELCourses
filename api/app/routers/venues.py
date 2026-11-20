from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import ClassSection, Lesson, Module, Venue
from app.routers.equivalents import like_escape
from app.schemas import VenueOut, VenueSession

router = APIRouter(tags=["venues"])


@router.get("/venues", response_model=list[VenueOut], summary="Phòng học và các buổi học đang dùng phòng")
def list_venues(
    q: str | None = Query(None, description="Lọc theo tên phòng"),
    semester: str | None = Query(None, description="Chỉ lấy buổi học của học kỳ này"),
    db: Session = Depends(get_db),
):
    vstmt = select(Venue).order_by(Venue.room)
    if q and q.strip():
        vstmt = vstmt.where(Venue.room.ilike(f"%{like_escape(q.strip())}%", escape="\\"))
    venues = list(db.scalars(vstmt))
    rooms = [v.room for v in venues]
    out: dict[str, VenueOut] = {v.room: VenueOut(room=v.room, capacity=v.capacity) for v in venues}
    if not rooms:
        return []
    stmt = (
        select(Lesson, ClassSection, Module.name)
        .join(ClassSection, Lesson.class_id == ClassSection.id)
        .join(Module, ClassSection.module_code == Module.code)
        .where(Lesson.room.in_(rooms))
        .order_by(Lesson.weekday, Lesson.start_period)
    )
    if semester:
        stmt = stmt.where(ClassSection.semester_id == semester)
    for lesson, cs, module_name in db.execute(stmt):
        out[lesson.room].sessions.append(VenueSession(
            module_code=cs.module_code, module_name=module_name, class_code=cs.class_code,
            semester=cs.semester_id, weekday=lesson.weekday, start_period=lesson.start_period,
            end_period=lesson.end_period, start_time=lesson.start_time, end_time=lesson.end_time,
            weeks=lesson.weeks,
        ))
    return list(out.values())
