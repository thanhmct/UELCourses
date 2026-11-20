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
