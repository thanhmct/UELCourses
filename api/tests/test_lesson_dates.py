from datetime import date

from app.models import ClassSection, Lesson, Module, Venue
from app.services.lesson_dates import backfill_lesson_dates

NEW_RAW = "Thứ 3, Tiết 7->9, 13/10/2026->13/10/2026, Phòng A.305"
OLD_RAW = "Thứ 5,tiết 12-15,tuần 9-9,DMA B3.1"


def _class(db, code, raw, lessons):
    cs = ClassSection(class_code=code, module_code="M1", semester_id=None, schedule_raw=raw)
    cs.lessons = lessons
    db.add(cs)
    return cs


def _setup(db):
    db.add(Module(code="M1", name="Môn một"))
    db.add(Venue(room="A.305"))
    db.flush()


def test_backfills_dates_and_replaces_undated_weekly_lesson(db):
    _setup(db)
    _class(db, "C-NEW", NEW_RAW, [Lesson(weekday=3, start_period=7, end_period=9, start_time="12:30", end_time="15:00", room="A.305")])
    db.commit()
    res = backfill_lesson_dates(db)
    assert res["classes_updated"] == 1
    l = db.query(ClassSection).filter_by(class_code="C-NEW").one().lessons[0]
    assert (l.date_start, l.date_end) == (date(2026, 10, 13), date(2026, 10, 13))
    assert (l.weekday, l.start_period, l.end_period, l.room) == (3, 7, 9, "A.305")


def test_old_format_without_dates_is_left_alone(db):
    _setup(db)
    _class(db, "C-OLD", OLD_RAW, [Lesson(weekday=5, start_period=12, end_period=15, start_time="x", end_time="y", weeks="9-9")])
    db.commit()
    res = backfill_lesson_dates(db)
    assert res.get("classes_updated", 0) == 0 and res["source_has_no_dates"] == 1
    l = db.query(ClassSection).filter_by(class_code="C-OLD").one().lessons[0]
    assert l.date_start is None and l.weeks == "9-9"


def test_note_segment_does_not_block_and_unknown_period_does(db):
    _setup(db)
    note = NEW_RAW + "<br/>*Giảng bằng Tiếng anh"
    _class(db, "C-NOTE", note, [Lesson(weekday=3, start_period=7, end_period=9, start_time="12:30", end_time="15:00", room="A.305")])
    evening = "Thứ 3, Tiết 13->16, 03/11/2026->01/12/2026, Phòng B1.104"
    _class(db, "C-EVE", evening, [Lesson(weekday=3, start_period=13, end_period=16, start_time="x", end_time="y", room=None)])
    db.commit()
    res = backfill_lesson_dates(db)
    assert db.query(ClassSection).filter_by(class_code="C-NOTE").one().lessons[0].date_start == date(2026, 10, 13)
    # lớp có tiết chưa hiểu (nếu parser chưa hỗ trợ) phải được giữ nguyên, không mất buổi
    eve = db.query(ClassSection).filter_by(class_code="C-EVE").one()
    assert len(eve.lessons) == 1
    assert res["classes_with_schedule"] == 2


def test_unsupported_period_only_loses_that_segment_not_the_whole_class(db):
    from app.services.schedule_parser import parse_schedules

    raw = NEW_RAW + "<br/>Thứ 6, Tiết 2->6.5, 02/10/2026->02/10/2026, Phòng A.601"  # tiết 6.5 chưa có giờ chính thức
    res = parse_schedules(raw)
    assert [(l.weekday, l.room) for l in res.lessons] == [(3, "A.305")]  # đoạn hợp lệ vẫn được giữ
    assert len(res.unparsed) == 1 and "6.5" in res.unparsed[0]

    _setup(db)
    _class(db, "C-MIX", raw, [
        Lesson(weekday=3, start_period=7, end_period=9, start_time="12:30", end_time="15:00", room="A.305"),
        Lesson(weekday=6, start_period=2, end_period=6, start_time="07:50", end_time="12:15", room="A.305"),
    ])
    db.commit()
    out = backfill_lesson_dates(db)
    ls = {l.weekday: l for l in db.query(ClassSection).filter_by(class_code="C-MIX").one().lessons}
    assert len(ls) == 2  # không mất buổi nào
    assert ls[3].date_start == date(2026, 10, 13)  # buổi hiểu được thì có ngày
    assert ls[6].date_start is None  # tiết 6.5 chưa có giờ chính thức: giữ nguyên, không đoán
    assert out["classes_with_unsupported_periods"] == 1


def test_official_half_period_times_and_last_period_cap():
    from app.services.schedule_parser import parse_segment

    l = parse_segment("Thứ 4, Tiết 2->5.5, 04/11/2026->04/11/2026, Phòng A.309")
    assert (l.start_period, l.end_period, l.start_time, l.end_time) == (2, 5.5, "07:50", "11:50")
    l = parse_segment("Thứ 3, Tiết 13->16, 03/11/2026->01/12/2026, Phòng B1.104")  # tiết 15 là tiết cuối
    assert (l.start_period, l.end_period, l.end_time) == (13, 15, "20:15")
    l = parse_segment("Thứ 2, Tiết 7->17, 09/11/2026->09/11/2026, Phòng A.809")
    assert (l.start_period, l.end_period, l.end_time) == (7, 15, "20:15")
    l = parse_segment("Thứ 2, Tiết 1->4.5, 09/11/2026->09/11/2026, Phòng A.809")
    assert l.end_time == "11:00"
    l = parse_segment("Thứ 5, Tiết 7->11, 05/11/2026->05/11/2026, Phòng A.305")
    assert l.end_time == "16:55"  # tiết 11 kết thúc 16:55 (tiết 10.5 mới kết thúc 16:30)
    l = parse_segment("Thứ 5, Tiết 7->10.5, 05/11/2026->05/11/2026, Phòng A.305")
    assert l.end_time == "16:30"


def test_dry_run_changes_nothing_and_rerun_is_idempotent(db):
    _setup(db)
    _class(db, "C-NEW", NEW_RAW, [Lesson(weekday=3, start_period=7, end_period=9, start_time="12:30", end_time="15:00", room="A.305")])
    db.commit()
    assert backfill_lesson_dates(db, dry_run=True)["classes_updated"] == 1
    assert db.query(Lesson).filter(Lesson.date_start.is_not(None)).count() == 0
    backfill_lesson_dates(db)
    again = backfill_lesson_dates(db)
    assert again.get("classes_updated", 0) == 0 and again["already_dated"] == 1
    assert db.query(Lesson).count() == 1
