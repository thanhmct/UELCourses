from __future__ import annotations

from datetime import date

from app.models import AcademicEvent, ClassSection, Lesson, Module, Semester


def test_semesters_fallback_to_start_and_end_date(client, db):
    """(c) Khi không có lịch năm học và không có buổi học: dùng start_date/end_date của Semester."""
    db.add(
        Semester(
            id="2026-2027-1",
            name="Học kỳ 1, năm học 2026–2027",
            year="2026-2027",
            term=1,
            start_date=date(2026, 9, 7),
            end_date=date(2026, 12, 27),
            is_sample=True,
        )
    )
    db.commit()

    res = client.get("/api/semesters")
    assert res.status_code == 200
    items = res.json()
    assert len(items) == 1
    sem = items[0]
    assert sem["id"] == "2026-2027-1"
    assert sem["start_date"] == "2026-09-07"
    assert sem["end_date"] == "2026-12-27"
    assert sem["teaching_start"] == "2026-09-07"
    assert sem["teaching_end"] == "2026-12-27"


def test_semesters_normalized_from_lesson_dates(client, db):
    """(b) Khi không có lịch năm học: tính từ min/max ngày của tất cả buổi học trong kỳ."""
    # Giả lập Semester có khoảng ngày quá rộng do nhập liệu cũ (06/07/2026 đến 28/02/2027)
    db.add(
        Semester(
            id="2026-2027-1",
            name="Học kỳ 1, năm học 2026–2027",
            year="2026-2027",
            term=1,
            start_date=date(2026, 7, 6),
            end_date=date(2027, 2, 28),
        )
    )
    db.add_all([Module(code="MTH101", name="Toán"), Module(code="ENG101", name="Tiếng Anh")])
    db.flush()

    # Thêm 2 lớp học với các buổi học thực tế diễn ra trong khoảng 07/09/2026 đến 15/11/2026
    c1 = ClassSection(class_code="261MTH10101", module_code="MTH101", semester_id="2026-2027-1")
    c2 = ClassSection(class_code="261ENG10101", module_code="ENG101", semester_id="2026-2027-1")
    db.add_all([c1, c2])
    db.flush()

    db.add_all([
        Lesson(
            class_id=c1.id,
            weekday=2,
            start_period=1,
            end_period=3,
            start_time="07:00",
            end_time="09:30",
            date_start=date(2026, 9, 7),
            date_end=date(2026, 11, 2),
        ),
        Lesson(
            class_id=c2.id,
            weekday=7,
            start_period=4,
            end_period=6,
            start_time="09:45",
            end_time="12:15",
            date_start=date(2026, 9, 12),
            date_end=date(2026, 11, 15),
        ),
    ])
    db.commit()

    res = client.get("/api/semesters")
    assert res.status_code == 200
    items = res.json()
    assert len(items) == 1
    sem = items[0]
    # start_date/end_date giữ nguyên giá trị DB
    assert sem["start_date"] == "2026-07-06"
    assert sem["end_date"] == "2027-02-28"
    # teaching_start/teaching_end được chuẩn hóa chính xác theo min/max buổi học
    assert sem["teaching_start"] == "2026-09-07"
    assert sem["teaching_end"] == "2026-11-15"


def test_semesters_normalized_from_academic_calendar(client, db):
    """(a) Ưu tiên lịch năm học (academic_events) cho kỳ và theo khóa."""
    db.add(
        Semester(
            id="2026-2027-1",
            name="Học kỳ 1, năm học 2026–2027",
            year="2026-2027",
            term=1,
            start_date=date(2026, 7, 6),
            end_date=date(2027, 2, 28),
        )
    )
    db.flush()

    # Thêm sự kiện lịch năm học (K26 bắt đầu 24/08, K24 bắt đầu 03/09, thi kết thúc 01/12)
    db.add_all([
        AcademicEvent(
            academic_year="2026-2027",
            kind="teaching",
            title="Thời gian học tập Học kỳ 1 (Khóa 26)",
            start_date=date(2026, 8, 24),
            end_date=date(2026, 11, 19),
            semester_id="2026-2027-1",
            cohorts=["K26"],
        ),
        AcademicEvent(
            academic_year="2026-2027",
            kind="teaching",
            title="Thời gian học tập Học kỳ 1 (Khóa 24, 25)",
            start_date=date(2026, 9, 3),
            end_date=date(2026, 11, 19),
            semester_id="2026-2027-1",
            cohorts=["K24", "K25"],
        ),
        AcademicEvent(
            academic_year="2026-2027",
            kind="final_exam",
            title="Thi cuối kỳ Học kỳ 1",
            start_date=date(2026, 11, 20),
            end_date=date(2026, 12, 1),
            semester_id="2026-2027-1",
            cohorts=["all"],
        ),
    ])
    db.commit()

    # 1. Gọi không truyền cohort: lấy bao phủ toàn trường (từ 24/08 đến 01/12)
    res_all = client.get("/api/semesters")
    assert res_all.status_code == 200
    sem_all = res_all.json()[0]
    assert sem_all["teaching_start"] == "2026-08-24"
    assert sem_all["teaching_end"] == "2026-12-01"

    # 2. Gọi lọc theo cohort K24: K24 bắt đầu 03/09, thi chung kết thúc 01/12
    res_k24 = client.get("/api/semesters?cohort=K24")
    assert res_k24.status_code == 200
    sem_k24 = res_k24.json()[0]
    assert sem_k24["teaching_start"] == "2026-09-03"
    assert sem_k24["teaching_end"] == "2026-12-01"

    # 3. Gọi lọc theo cohort K26: K26 bắt đầu 24/08, thi chung kết thúc 01/12
    res_k26 = client.get("/api/semesters?cohort=K26")
    assert res_k26.status_code == 200
    sem_k26 = res_k26.json()[0]
    assert sem_k26["teaching_start"] == "2026-08-24"
    assert sem_k26["teaching_end"] == "2026-12-01"
