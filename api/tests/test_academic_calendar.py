from __future__ import annotations

from datetime import date

from sqlalchemy import select

from app.models import AcademicEvent
from app.services.academic_calendar import import_academic_calendar, load_seed, phase_for


def test_import_academic_calendar_idempotent(db):
    """Kiểm tra nạp seed idempotent: chạy 2 lần số lượng bản ghi không đổi."""
    res1 = import_academic_calendar(db)
    assert res1["status"] == "ok"
    assert res1["imported"] > 0
    total1 = db.scalar(select(AcademicEvent.id).order_by(AcademicEvent.id.desc()).limit(1))
    count1 = len(list(db.scalars(select(AcademicEvent))))
    assert count1 == res1["imported"]

    # Chạy lần 2
    res2 = import_academic_calendar(db)
    assert res2["status"] == "ok"
    count2 = len(list(db.scalars(select(AcademicEvent))))
    assert count2 == count1


def test_key_milestones(db):
    """Kiểm tra đúng ngày các mốc chính theo brief:
    - HK1 K26: 24/08/2026 - 19/11/2026
    - Tết Âm lịch: 01/02/2027 - 14/02/2027
    - Bù UEL's Day: 12/11/2026
    - Bù Quốc khánh 2/9: 09/11, 10/11, 11/11/2026
    - GDQP K26: 29/03/2027 - 17/04/2027
    """
    import_academic_calendar(db)

    # HK1 K26
    hk1_k26 = db.scalar(
        select(AcademicEvent).where(
            AcademicEvent.kind == "teaching",
            AcademicEvent.semester_id == "2026-2027-1",
            AcademicEvent.start_date == date(2026, 8, 24),
        )
    )
    assert hk1_k26 is not None
    assert hk1_k26.end_date == date(2026, 11, 19)
    assert "K26" in hk1_k26.cohorts

    # Tết Âm lịch 2027
    tet = db.scalar(
        select(AcademicEvent).where(
            AcademicEvent.kind == "holiday",
            AcademicEvent.start_date == date(2027, 2, 1),
        )
    )
    assert tet is not None
    assert tet.end_date == date(2027, 2, 14)

    # Bù UEL's Day
    uel_bu = db.scalar(
        select(AcademicEvent).where(
            AcademicEvent.kind == "makeup_day",
            AcademicEvent.start_date == date(2026, 11, 12),
        )
    )
    assert uel_bu is not None
    assert "UEL" in uel_bu.title

    # Bù Quốc khánh
    qk_bu = list(
        db.scalars(
            select(AcademicEvent)
            .where(
                AcademicEvent.kind == "makeup_day",
                AcademicEvent.start_date.in_([date(2026, 11, 9), date(2026, 11, 10), date(2026, 11, 11)]),
            )
            .order_by(AcademicEvent.start_date)
        )
    )
    assert len(qk_bu) == 3

    # GDQP K26
    gdqp = db.scalar(
        select(AcademicEvent).where(
            AcademicEvent.kind == "defense_training",
            AcademicEvent.start_date == date(2027, 3, 29),
        )
    )
    assert gdqp is not None
    assert gdqp.end_date == date(2027, 4, 17)
    assert "K26" in gdqp.cohorts


def test_phase_for_dates(db):
    """Kiểm tra phase_for ở các mốc ngày:
    - Ngày nghỉ lễ: 01/09/2026 (Quốc khánh)
    - Tuần thi: 30/09/2026 (Giữa kỳ HK1)
    - Tuần học thứ 3: 08/09/2026 (HK1 K26 bắt đầu 24/08)
    - Nghỉ Tết Âm lịch: 05/02/2027
    - Ngoài kỳ học: 01/08/2026
    """
    import_academic_calendar(db)

    # 1. Ngày nghỉ lễ (Quốc khánh)
    res_holiday = phase_for(db, date(2026, 9, 1), cohort="K26")
    assert res_holiday["phase"] == "holiday"
    assert res_holiday["semester_id"] == "2026-2027-1"
    assert len(res_holiday["events"]) >= 1

    # 2. Tuần học thứ 3 của K26 (bắt đầu 24/08/2026 -> tuần 1: 24-30/8, tuần 2: 31/8-6/9, tuần 3: 7-13/9)
    res_week3 = phase_for(db, date(2026, 9, 8), cohort="K26")
    assert res_week3["phase"] == "teaching"
    assert res_week3["week_no"] == 3
    assert res_week3["weeks_total"] == 13
    assert res_week3["semester_id"] == "2026-2027-1"

    # 3. Tuần thi giữa kỳ (28/09 - 04/10/2026)
    res_exam = phase_for(db, date(2026, 9, 30), cohort="K26")
    assert res_exam["phase"] == "exam"
    assert res_exam["semester_id"] == "2026-2027-1"

    # 4. Tết Âm lịch 2027
    res_tet = phase_for(db, date(2027, 2, 5), cohort="K26")
    assert res_tet["phase"] == "holiday"
    assert res_tet["semester_id"] == "2026-2027-2"

    # 5. Ngày ngoài kỳ học (01/08/2026)
    res_none = phase_for(db, date(2026, 8, 1), cohort="K26")
    assert res_none["phase"] == "none"
    assert res_none["week_no"] is None
    assert res_none["weeks_total"] is None

    # 6. Các mốc ngày kiểm tra theo Brief F4:
    # - 25/12/2026: trong đợt học HK2 của K26
    res_xmas = phase_for(db, date(2026, 12, 25), cohort="K26")
    assert res_xmas["phase"] == "teaching"
    assert res_xmas["semester_id"] == "2026-2027-2"

    # - 24/11/2026: Ngày Văn hóa VN (ngày nghỉ trong đợt thi HK1) -> HK1
    res_vhvn = phase_for(db, date(2026, 11, 24), cohort="K26")
    assert res_vhvn["phase"] == "holiday"
    assert res_vhvn["semester_id"] == "2026-2027-1"

    # - 20/03/2027: ngày giữa HK2 và HK3 (thi cuối kỳ HK2 của K26) -> HK2
    res_mid = phase_for(db, date(2027, 3, 20), cohort="K26")
    assert res_mid["semester_id"] == "2026-2027-2"


def test_cohort_filtering(db):
    """Kiểm tra lọc theo khóa:
    Ngày 25/08/2026:
    - K26 đã bắt đầu HK1 (từ 24/08) -> phase == teaching, week_no == 1
    - K24 chưa bắt đầu HK1 (từ 03/09) -> phase == none
    """
    import_academic_calendar(db)

    res_k26 = phase_for(db, date(2026, 8, 25), cohort="K26")
    assert res_k26["phase"] == "teaching"
    assert res_k26["week_no"] == 1

    res_k24 = phase_for(db, date(2026, 8, 25), cohort="K24")
    assert res_k24["phase"] == "none"
    assert res_k24["week_no"] is None


def test_calendar_api(client, db):
    """Kiểm tra các endpoint REST API:
    - GET /api/calendar?from=...&to=...&cohort=...
    - GET /api/calendar/today?cohort=...&date=...
    """
    import_academic_calendar(db)

    # 1. Tra cứu theo khoảng ngày
    resp = client.get("/api/calendar", params={"from": "2026-09-01", "to": "2026-09-30", "cohort": "K26"})
    assert resp.status_code == 200
    events = resp.json()
    assert isinstance(events, list)
    assert len(events) > 0
    # Mọi sự kiện trả về phải có cohort chứa K26 hoặc "all"
    for ev in events:
        assert "K26" in ev["cohorts"] or "all" in ev["cohorts"]

    # 2. Tra cứu today với date chỉ định (tuần 3 HK1 K26)
    resp_today = client.get("/api/calendar/today", params={"cohort": "K26", "date": "2026-09-08"})
    assert resp_today.status_code == 200
    data = resp_today.json()
    assert data["phase"] == "teaching"
    assert data["week_no"] == 3
    assert data["semester_id"] == "2026-2027-1"
    assert len(data["events"]) > 0

    # 3. Tra cứu today với Tết Âm lịch
    resp_tet = client.get("/api/calendar/today", params={"date": "2027-02-05"})
    assert resp_tet.status_code == 200
    data_tet = resp_tet.json()
    assert data_tet["phase"] == "holiday"
