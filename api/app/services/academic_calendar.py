from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import and_, delete, or_, select
from sqlalchemy.orm import Session

from app.models import AcademicEvent
from app.schemas import AcademicEventOut

VN_TZ = timezone(timedelta(hours=7))


def load_seed(path: Path | None = None) -> list[dict[str, Any]]:
    if path is None:
        path = Path(__file__).resolve().parents[2] / "seed" / "academic_calendar_2026_2027.json"
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def import_academic_calendar(db: Session, path: Path | None = None) -> dict[str, Any]:
    raw_events = load_seed(path)
    if not raw_events:
        return {
            "status": "ok",
            "imported": 0,
            "rows_in": 0,
            "rows_ok": 0,
            "rows_skipped": 0,
            "rows_error": 0,
            "academic_year": None,
            "source": None,
        }

    # Gom các cặp (academic_year, source) để xóa cũ ghi mới (idempotent)
    pairs = set((item.get("academic_year"), item.get("source", "TB 223/TB-ĐHKTL-ĐT")) for item in raw_events)
    for yr, src in pairs:
        db.execute(
            delete(AcademicEvent).where(
                AcademicEvent.academic_year == yr,
                AcademicEvent.source == src,
            )
        )

    added = 0
    for item in raw_events:
        s_date = item["start_date"]
        if isinstance(s_date, str):
            s_date = date.fromisoformat(s_date)
        e_date = item.get("end_date")
        if isinstance(e_date, str):
            e_date = date.fromisoformat(e_date)

        evt = AcademicEvent(
            academic_year=item["academic_year"],
            kind=item["kind"],
            title=item["title"],
            start_date=s_date,
            end_date=e_date,
            semester_id=item.get("semester_id"),
            cohorts=item.get("cohorts", []),
            note=item.get("note"),
            verified=item.get("verified", True),
            source=item.get("source", "TB 223/TB-ĐHKTL-ĐT"),
        )
        db.add(evt)
        added += 1

    db.commit()

    return {
        "status": "ok",
        "imported": added,
        "rows_in": len(raw_events),
        "rows_ok": added,
        "rows_skipped": 0,
        "rows_error": 0,
        "academic_year": list(pairs)[0][0] if pairs else None,
        "source": list(pairs)[0][1] if pairs else None,
    }


def _matches_cohort(evt_cohorts: list[str] | None, cohort: str | None) -> bool:
    if not cohort:
        return True
    if not evt_cohorts:
        return True
    return "all" in evt_cohorts or cohort in evt_cohorts


def phase_for(db: Session, d: date, cohort: str | None = None) -> dict[str, Any]:
    """Trả về trạng thái đào tạo của ngày `d` cho khóa `cohort`:
    {
        "date": d,
        "semester_id": "2026-2027-1",
        "phase": "teaching" | "exam" | "break" | "holiday" | "reserve" | "none",
        "week_no": 3,
        "weeks_total": 13,
        "events": [...]
    }

    Xác định semester_id:
    - Với các ngày học tập, thi cử, nghỉ lễ, hoặc ngày đệm giữa các học kỳ:
      học kỳ được suy ra từ đợt giảng dạy/học tập (teaching, online_study, defense_training)
      của cùng khóa có start_date <= d gần nhất ở trước trong cùng năm học (không chọn học kỳ sau).
      Ví dụ:
        * 25/12/2026 -> HK2 '2026-2027-2' (trong đợt học HK2).
        * 24/11/2026 -> HK1 '2026-2027-1' (Ngày Văn hóa VN trong đợt thi HK1).
        * 05/02/2027 -> HK2 '2026-2027-2' (Tết Âm lịch nằm giữa HK2).
        * 20/03/2027 -> HK2 '2026-2027-2' (đợt thi cuối kỳ HK2; mọi ngày đệm trước HK3 đều thuộc HK2).
    - Các sự kiện hành chính (nộp chứng chỉ ngoại ngữ, xét tốt nghiệp...) có thể trải dài
      qua nhiều kỳ và không được dùng để suy học kỳ đào tạo.
    - Ngày ngoài năm học/trước đợt học đầu tiên của năm học: semester_id = None.
    """
    # 1. Tìm tất cả sự kiện diễn ra vào ngày d
    stmt = (
        select(AcademicEvent)
        .where(
            AcademicEvent.start_date <= d,
            or_(
                AcademicEvent.end_date >= d,
                and_(AcademicEvent.end_date.is_(None), AcademicEvent.start_date == d),
            ),
        )
        .order_by(AcademicEvent.start_date.asc(), AcademicEvent.id.asc())
    )

    all_active = list(db.scalars(stmt))
    matching_events = [e for e in all_active if _matches_cohort(e.cohorts, cohort)]

    # 2. Xác định phase
    # Thứ tự ưu tiên: holiday > exam > reserve > break > teaching > none
    kinds = {e.kind for e in matching_events}
    if "holiday" in kinds:
        phase = "holiday"
    elif any(k in ("midterm_exam", "final_exam") for k in kinds):
        phase = "exam"
    elif "reserve_week" in kinds:
        phase = "reserve"
    elif "break" in kinds:
        phase = "break"
    elif any(k in ("teaching", "online_study", "makeup_day", "defense_training") for k in kinds):
        phase = "teaching"
    else:
        phase = "none"

    # 3. Xác định semester_id
    # Ưu tiên sự kiện học tập/thi cử trực tiếp diễn ra vào ngày d có semester_id
    direct_sem_id = None
    for e in matching_events:
        if e.kind in ("teaching", "online_study", "defense_training", "midterm_exam", "final_exam") and e.semester_id:
            direct_sem_id = e.semester_id
            break

    if direct_sem_id:
        semester_id = direct_sem_id
    else:
        # Suy từ đợt teaching gần nhất ở trước (start_date <= d) trong cùng năm học của cùng khóa
        start_yr = d.year if d.month >= 8 else d.year - 1
        curr_ay = f"{start_yr}-{start_yr + 1}"

        stmt_teach = (
            select(AcademicEvent)
            .where(
                AcademicEvent.academic_year == curr_ay,
                AcademicEvent.kind.in_(("teaching", "online_study", "defense_training")),
                AcademicEvent.start_date <= d,
            )
            .order_by(AcademicEvent.start_date.desc(), AcademicEvent.id.desc())
        )
        prev_teaching_evt = None
        for cand in db.scalars(stmt_teach):
            if _matches_cohort(cand.cohorts, cohort):
                prev_teaching_evt = cand
                break
        semester_id = prev_teaching_evt.semester_id if prev_teaching_evt else None

    # 4. Xác định đợt học (teaching) tương ứng để tính week_no và weeks_total
    teaching_evt = None
    for e in matching_events:
        if e.kind in ("teaching", "online_study", "defense_training"):
            teaching_evt = e
            break

    # Nếu ngày d không có teaching event trực tiếp (vd là ngày holiday hoặc exam),
    # nhưng nằm trong khoảng thời gian đợt học của học kỳ đó:
    if teaching_evt is None and semester_id:
        sem_teach_stmt = select(AcademicEvent).where(
            AcademicEvent.semester_id == semester_id,
            AcademicEvent.kind.in_(("teaching", "online_study", "defense_training")),
            AcademicEvent.start_date <= d,
            AcademicEvent.end_date >= d,
        ).order_by(AcademicEvent.start_date.asc())
        for cand in db.scalars(sem_teach_stmt):
            if _matches_cohort(cand.cohorts, cohort):
                teaching_evt = cand
                break

    week_no = None
    weeks_total = None

    if teaching_evt and teaching_evt.start_date:
        start_monday = teaching_evt.start_date - timedelta(days=teaching_evt.start_date.weekday())
        week_no = (d - start_monday).days // 7 + 1
        if teaching_evt.end_date:
            end_sunday = teaching_evt.end_date + timedelta(days=(6 - teaching_evt.end_date.weekday()))
            weeks_total = ((end_sunday - start_monday).days + 1) // 7

    events_out = [AcademicEventOut.model_validate(e) for e in matching_events]

    return {
        "date": d,
        "semester_id": semester_id,
        "phase": phase,
        "week_no": week_no,
        "weeks_total": weeks_total,
        "events": events_out,
    }
