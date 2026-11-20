from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Semester
from app.schemas import SemesterOut

router = APIRouter(tags=["semesters"])


def current_semester_id(semesters: list[Semester], today: date | None = None) -> str | None:
    """Ưu tiên cờ đặt tay; nếu không: kỳ chứa ngày hôm nay; nếu không: kỳ gần nhất đã bắt đầu."""
    today = today or date.today()
    flagged = [s for s in semesters if s.is_current_override]
    if flagged:
        return flagged[0].id
    for s in semesters:
        if s.start_date and s.end_date and s.start_date <= today <= s.end_date:
            return s.id
    started = [s for s in semesters if s.start_date and s.start_date <= today]
    if started:
        return max(started, key=lambda s: s.start_date).id
    return semesters[0].id if semesters else None


@router.get("/semesters", response_model=list[SemesterOut], summary="Danh sách học kỳ")
def list_semesters(db: Session = Depends(get_db)):
    sems = list(db.scalars(select(Semester).order_by(Semester.year, Semester.term)))
    cur = current_semester_id(sems)
    return [
        SemesterOut(
            id=s.id, name=s.name, year=s.year, term=s.term, is_current=s.id == cur,
            start_date=s.start_date, end_date=s.end_date, is_sample=s.is_sample,
        )
        for s in sems
    ]
