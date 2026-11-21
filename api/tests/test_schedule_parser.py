import json

import pytest

from app.services.schedule_parser import parse_schedules


def simple(value):
    res = parse_schedules(value)
    return [(l.weekday, l.start_period, l.end_period, l.room) for l in res.lessons], res


@pytest.mark.parametrize(
    "text, expected",
    [
        ("Thứ 2, Tiết 1-3, Phòng B.101", [(2, 1, 3, "B.101")]),
        ("Thứ Hai: tiết 1→3 - P.A1.203", [(2, 1, 3, "A1.203")]),
        ("thu 3, tiet 4 - 5, phong A.102", [(3, 4, 5, "A.102")]),
        ("T5 (6-8) B.104", [(5, 6, 8, "B.104")]),
        ("T7: tiết 11-13, phòng C.308, tuần 1-15", [(7, 11, 13, "C.308")]),
        ("Thứ 4 Tiết bắt đầu: 2, Số tiết: 3, Phòng C.106", [(4, 2, 4, "C.106")]),
        ("Thứ 3, tiết 1,2,3, phòng A.101", [(3, 1, 3, "A.101")]),
        ("Chủ nhật, Tiết 1-4, Phòng HT.A", [(8, 1, 4, "HT.A")]),
        ("CN (tiết 6-9) - P.HT.A", [(8, 6, 9, "HT.A")]),
        ("Thứ Sáu, tiết 9 đến 10, Hội trường A", [(6, 9, 10, "Hội trường A")]),
        ("Thứ 2, Tiết 1-3, Online", [(2, 1, 3, "Online")]),
        ("Thứ 6 tiết 7-9", [(6, 7, 9, None)]),
    ],
)
def test_string_forms(text, expected):
    lessons, res = simple(text)
    assert lessons == expected
    assert res.unparsed == []
    assert res.raw == text


def test_times_computed_from_periods():
    res = parse_schedules("Thứ 2, Tiết 1-3, Phòng B.101")
    l = res.lessons[0]
    assert (l.start_time, l.end_time) == ("07:00", "09:30")
    l = parse_schedules("Thứ 3, Tiết 7-9, Phòng B.101").lessons[0]
    assert (l.start_time, l.end_time) == ("12:30", "15:00")
    l = parse_schedules("Thứ 3, Tiết 4-6, Phòng B.101").lessons[0]
    assert (l.start_time, l.end_time) == ("09:45", "12:15")
    l = parse_schedules("Thứ 3, Tiết 10-12, Phòng B.101").lessons[0]
    assert (l.start_time, l.end_time) == ("15:15", "17:45")


def test_period_table_matches_real_timetable():
    from app.config import period_end_time, period_start_time

    starts = {1: "07:00", 2: "07:50", 4: "09:45", 7: "12:30", 8: "13:20", 10: "15:15"}
    assert {p: period_start_time(p) for p in starts} == starts
    ends = {3: "09:30", 5: "11:25", 6: "12:15", 9: "15:00", 12: "17:45", 4.5: "11:00", 10.5: "16:30"}
    assert {p: period_end_time(p) for p in ends} == ends


def test_explicit_time_range_maps_to_periods():
    l = parse_schedules("CN, 07:00-09:30, Online").lessons[0]
    assert (l.weekday, l.start_period, l.end_period) == (8, 1, 3)
    assert (l.start_time, l.end_time) == ("07:00", "09:30")


def test_weeks_extracted():
    l = parse_schedules("T2: tiết 1-3, phòng A.101, tuần 1-15").lessons[0]
    assert l.weeks == "1-15"


@pytest.mark.parametrize("sep", ["; ", "\n", " | ", "<br>", "<br/>"])
def test_multiple_segments(sep):
    text = f"Thứ 2, Tiết 1-3, Phòng B.101{sep}Thứ 5, Tiết 6-8, Phòng A.203"
    lessons, res = simple(text)
    assert lessons == [(2, 1, 3, "B.101"), (5, 6, 8, "A.203")]


def test_multiple_weekdays_in_one_chunk():
    lessons, _ = simple("Thứ 7 tiết 1-3 B.101, Thứ 2 tiết 4-5 B.102")
    assert lessons == [(7, 1, 3, "B.101"), (2, 4, 5, "B.102")]


def test_list_of_objects():
    value = [
        {"DayOfWeek": 2, "BeginPeriod": 1, "NumberOfPeriods": 3, "RoomName": "B.101", "Weeks": "1-15"},
        {"Thu": "Thứ 4", "TietBatDau": 6, "TietKetThuc": 8, "Phong": "A.305"},
        {"weekday": "CN", "period": "1-2", "room": "C.106"},
    ]
    lessons, res = simple(value)
    assert lessons == [(2, 1, 3, "B.101"), (4, 6, 8, "A.305"), (8, 1, 2, "C.106")]
    assert res.lessons[0].weeks == "1-15"
    assert json.loads(res.raw)[0]["RoomName"] == "B.101"


def test_text_weekday_preferred_over_number():
    # kiểu portal: DayOfWeek=2 nhưng Thu="Thứ Ba"
    lessons, _ = simple({"DayOfWeek": 2, "Thu": "Thứ Ba", "PeriodID": 1, "NumberOfPeriods": 3, "RoomID": "B1.203"})
    assert lessons[0][0] == 3


def test_json_string_and_wrapped_object():
    value = json.dumps({"data": [{"DayOfWeek": 3, "StartPeriod": 4, "EndPeriod": 5, "Room": "B.201"}]})
    lessons, res = simple(value)
    assert lessons == [(3, 4, 5, "B.201")]
    assert res.raw == value


def test_object_with_times_only():
    lessons, _ = simple({"DayOfWeek": 5, "StartTime": "12:30", "EndTime": "15:00", "RoomName": "B.104"})
    assert lessons == [(5, 7, 9, "B.104")]


def test_list_of_strings():
    lessons, _ = simple(["Thứ 2, Tiết 1-3, Phòng B.101", "Thứ 4, Tiết 4-5, Phòng B.101"])
    assert lessons == [(2, 1, 3, "B.101"), (4, 4, 5, "B.101")]


@pytest.mark.parametrize("value", [None, "", "   ", []])
def test_empty(value):
    res = parse_schedules(value)
    assert res.lessons == [] and res.unparsed == []


@pytest.mark.parametrize("value", ["abc", "Chưa xếp lịch", "Tiết 1-3 phòng B.101", "Thứ 2 tiết 1-20", 12345, {"foo": "bar"}])
def test_unparseable_keeps_raw(value):
    res = parse_schedules(value)
    assert res.lessons == []
    assert res.raw is not None
    assert res.unparsed  # phần không parse được được giữ lại


def test_partial_parse_keeps_unparsed_segment():
    res = parse_schedules("Thứ 2, Tiết 1-3, Phòng B.101; Lịch học bù: thông báo sau")
    assert len(res.lessons) == 1
    assert res.unparsed == ["Lịch học bù: thông báo sau"]
    assert not res.ok


def test_duplicates_removed():
    lessons, _ = simple("Thứ 2, Tiết 1-3, Phòng B.101; Thứ 2, Tiết 1-3, Phòng B.101")
    assert lessons == [(2, 1, 3, "B.101")]


def test_never_raises_on_weird_input():
    for v in [object(), ["x", None, 3, {"a": [1, 2]}], "{not json", "<b>Thứ 2</b>", "Thứ 2, tiết 3-1, P.B101"]:
        parse_schedules(v)
    # tiết ngược thứ tự được đảo lại
    assert simple("Thứ 2, tiết 3-1, P.B101")[0] == [(2, 1, 3, "B101")]


def test_multi_tier_same_weekday_and_room_distinct_dates():
    # Lớp có lịch nhiều tầng ngày (cùng thứ, tiết, phòng nhưng khác khoảng ngày)
    # Lỗi trước đây: deduplication chỉ xét (thứ, tiết_đầu, tiết_cuối, phòng, tuần)
    # nên nuốt mất các tầng sau của cùng một phòng/tiết.
    raw = (
        "Thứ 2, Tiết 7->10.5, 07/09/2026->16/11/2026, Phòng B1.204<br/>"
        "Thứ 2, Tiết 7->10.5, 26/10/2026->26/10/2026, Phòng B1.204"
    )
    res = parse_schedules(raw)
    assert len(res.lessons) == 2
    l1, l2 = res.lessons
    assert (l1.weekday, l1.start_period, l1.end_period, l1.room) == (2, 7, 10.5, "B1.204")
    assert (l1.date_start, l1.date_end) == ("2026-09-07", "2026-11-16")
    assert (l2.weekday, l2.start_period, l2.end_period, l2.room) == (2, 7, 10.5, "B1.204")
    assert (l2.date_start, l2.date_end) == ("2026-10-26", "2026-10-26")


def test_three_tier_schedule_extracted_completely():
    # Mẫu 3 tầng ngày thật: môn Ngân hàng đầu tư / Luật doanh nghiệp có 3 đợt ngày khác nhau
    raw = (
        "Thứ 2, Tiết 7->10.5, 04/05/2026->08/06/2026, Phòng B1.204<br/>"
        "Thứ 2, Tiết 7->10.5, 15/06/2026->29/06/2026, Phòng A.609<br/>"
        "Thứ 2, Tiết 7->10.5, 06/07/2026->06/07/2026, Phòng B1.401"
    )
    res = parse_schedules(raw)
    assert len(res.lessons) == 3
    assert [l.room for l in res.lessons] == ["B1.204", "A.609", "B1.401"]
    assert [(l.date_start, l.date_end) for l in res.lessons] == [
        ("2026-05-04", "2026-06-08"),
        ("2026-06-15", "2026-06-29"),
        ("2026-07-06", "2026-07-06"),
    ]
    assert all(l.weekday == 2 and l.start_period == 7 and l.end_period == 10.5 for l in res.lessons)
    assert all(l.start_time == "12:30" and l.end_time == "16:30" for l in res.lessons)


def test_four_tier_schedule_with_online_room_and_note():
    # Mẫu 4 tầng ngày: kết hợp phòng online ("Phòng . Online 007"), phòng học thường, và ghi chú cuối
    raw = (
        "Thứ 2, Tiết 7->10.5, 05/10/2026->05/10/2026, Phòng . Online 007<br/>"
        "Thứ 2, Tiết 7->10.5, 07/09/2026->26/10/2026, Phòng B1.505<br/>"
        "Thứ 2, Tiết 7->10.5, 16/11/2026->16/11/2026, Phòng B1.506<br/>"
        "Thứ 7, Tiết 1->4.5, 03/10/2026->03/10/2026, Phòng A.309<br/>"
        "*Giảng bằng Tiếng anh"
    )
    res = parse_schedules(raw)
    assert len(res.lessons) == 4
    assert res.unparsed == ["*Giảng bằng Tiếng anh"]
    assert res.lessons[0].room == "Online 007"
    assert (res.lessons[0].date_start, res.lessons[0].date_end) == ("2026-10-05", "2026-10-05")
    assert (res.lessons[1].room, res.lessons[1].date_start) == ("B1.505", "2026-09-07")
    assert (res.lessons[2].room, res.lessons[2].date_start) == ("B1.506", "2026-11-16")
    assert (res.lessons[3].weekday, res.lessons[3].start_period, res.lessons[3].end_period) == (7, 1, 4.5)
    assert res.lessons[3].room == "A.309"


def test_exact_duplicates_with_dates_still_deduplicated():
    # Khi chuỗi nguồn lặp lại đúng từng dòng (cùng thứ/tiết/phòng/khoảng ngày) -> vẫn lọc trùng
    raw = (
        "Thứ 2, Tiết 7->10.5, 07/09/2026->16/11/2026, Phòng B1.204<br/>"
        "Thứ 2, Tiết 7->10.5, 07/09/2026->16/11/2026, Phòng B1.204"
    )
    res = parse_schedules(raw)
    assert len(res.lessons) == 1


def test_multi_tier_different_separators():
    # Phân tách tầng bằng newline hoặc chấm phẩy
    raw = (
        "Thứ 2, Tiết 7->10.5, 04/05/2026->08/06/2026, Phòng B1.204\n"
        "Thứ 2, Tiết 7->10.5, 15/06/2026->29/06/2026, Phòng B1.204;\n"
        "Thứ 2, Tiết 7->10.5, 06/07/2026->06/07/2026, Phòng B1.204"
    )
    res = parse_schedules(raw)
    assert len(res.lessons) == 3
    assert [(l.date_start, l.date_end) for l in res.lessons] == [
        ("2026-05-04", "2026-06-08"),
        ("2026-06-15", "2026-06-29"),
        ("2026-07-06", "2026-07-06"),
    ]


def test_dict_with_dates_extracted():
    # Dạng object có chứa trường ngày
    data = {
        "DayOfWeek": 2,
        "StartPeriod": 7,
        "EndPeriod": 10,
        "Room": "B1.204",
        "StartDate": "2026-09-07",
        "EndDate": "2026-11-16",
    }
    res = parse_schedules(data)
    assert len(res.lessons) == 1
    assert (res.lessons[0].date_start, res.lessons[0].date_end) == ("2026-09-07", "2026-11-16")

