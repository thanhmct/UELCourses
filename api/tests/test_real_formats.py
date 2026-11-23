"""Importer cho các định dạng dữ liệu thật của UEL (UIS Excel, kế hoạch môn TA, TKB portal).

Toàn bộ fixture là dữ liệu GIẢ tự viết, cùng định dạng với file thật; không dùng file thật.
"""

import io
import json
from datetime import datetime

import openpyxl
import pytest

from app.services.excel_import import (
    _map_uis_header,
    import_ta_plan,
    import_uis_classes,
    parse_credit_spec,
    parse_room_capacities,
    parse_terms,
    parse_uis_timetable,
)
from app.services.importer import cohorts_from_groups, semester_from_class_code, semester_from_year_term
from app.services.portal_timetable import compress_weeks, module_code_for, session_weekday

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

UIS_TOP = ["Khoa chủ quản HP", "Mã HP", "Tên HP", "Số TC", "Mã LHP", "Loại HP", "Lớp sinh viên", "sĩ số (SS)",
           None, None, None, "Sức chứa phòng học", None, "Thông tin thời khóa biểu", None, None, "Phân công giảng dạy", None]
UIS_SUB = [None] * 7 + ["SS Tối thiểu", "SS Tối đa", "SS đã đăng ký", "SS còn trống", "Phòng học", "Độ lệch sức chứa",
                        "Ngày BĐ", "Ngày KT", "Thời khóa biểu", "Mã GVGD", "Tên GVGD"]
UIS_ROWS = [
    ["Khoa Giả định", "XYZ1001", "Nhập môn dữ liệu (E)", 3, "251XYZ100101", "Lý thuyết", "K24901E, K24902E",
     20, 40, 38, 2, "Z1.101(SC:54),Z1.102(SC:90)", "Z1.101(16),Z1.102(52)",
     datetime(2025, 9, 10), datetime(2025, 11, 12),
     "Thứ 4,tiết 1-5,tuần 4-12,Z1.101 || Thứ 4,tiết 1-5,tuần 3-3,Z1.102 || *Giảng bằng Tiếng anh", "99.001", "GV Giả Định A"],
    ["Khoa Giả định", "XYZ2002", "Pháp luật giả định", 2, "251XYZ200201", "Lý thuyết", "K234901E",
     10, 60, 61, -1, "Z2.201(SC:60)", "Z2.201(-1)",
     datetime(2025, 9, 14), datetime(2025, 11, 30),
     "Chủ nhật,tiết 10-12,tuần 3-14,Z2.201", "99.002", "GV Giả Định B"],
    ["Khoa Giả định", "XY47", "Môn chỉ có ghi chú", 3, "251XY4701", "Lý thuyết", "K23901",
     20, 40, 0, 40, "", "", None, None, "Giảng bằng Tiếng anh", None, None],
    [None] * 18,
]


def make_uis_xlsx(rows=UIS_ROWS) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(UIS_TOP)
    ws.append(UIS_SUB)
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def make_ta_xlsx() -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Thông tin môn học TA"
    ws.append(["THÔNG TIN MÔN HỌC GIẢNG DẠY BẰNG TIẾNG ANH THEO TỪNG HỌC KỲ"])
    ws.append([])
    ws.append(["Kế hoạch năm học 2026 – 2027 | Biểu mẫu nhập thông tin"])
    ws.append([])
    ws.append(["STT", "Mã học phần \nmôn học TA", "Tên học phần", "Khoa/Bộ môn", "Khoá", "Học kỳ sẽ mở",
               "% được mở (kế hoạch năm học 2026 - 2027)", "Số tín chỉ", "Ghi chú"])
    ws.append([1, "XYZ1001", "Nhập môn dữ liệu", "Bộ môn Giả định 1", None, "Học kỳ 1,3", 100, "3.0(45.0,0,0,0,0,0)", None])
    ws.append([2, "XYZ3003", "Môn mới chưa có lớp", "Bộ môn Giả định 2", None, "Cả năm học", 50, "2.0(30.0,0,0,0,0,0)", "ghi chú"])
    ws.append([3, "XYZ4004", "Môn học kỳ 2", "Bộ môn Giả định 2", None, "Học kỳ 2", 100, "4.0(60.0,0,0,0,0,0)", None])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def portal_session(sid, name, code, group, thu, dow, period, n, ca, start, end, room, week_start, date, **kw):
    s = {
        "CurriculumName": name, "WeekScheduleID": 1, "ScheduleStudyUnitID": sid, "Credits": 3, "Unit": 0,
        "PeriodID": period, "NumberOfPeriods": n, "DayOfWeek": dow, "Thu": thu, "Date": date, "CaHoc": ca,
        "Week": 1, "RoomID": f"{room}</br>(Cơ sở giả định)", "Year": 2030, "CampusName": "Cơ sở giả định",
        "GioHocBatDau": start, "GioHocKetThuc": end, "StartDate": week_start, "EndDate": week_start,
        "BuildingName": room.split(".")[0], "YearStudy": "2030-2031", "TermID": "HK02", "GroupName": group,
        "ClassStudent": "K30999", "ProfessorName": "", "PeriodName": f"Tiết {ca.split(' ')[0]}",
        "TKHHienThi": f"<span style=\"color: red\">{name} ({code})</span><br/><span>LHP: {sid}</span>",
        "DayName": "", "_year": 2031, "_week": 1,
    }
    s.update(kw)
    return s


PORTAL = {
    "source": "fake", "fetched_at": "2030-01-01T00:00:00", "time_schedule": None, "weeks": [],
    "sessions": [
        portal_session("302ZZ1107", "Môn giả định (3TC)", "ZZ11", "07", "Thứ Ba", 2, 1, 3, "1-3 (07:00)",
                       "07:00", "09:30", "Q1.101", "06/01/2031", "07/01/2031"),
        portal_session("302ZZ1107", "Môn giả định (3TC)", "ZZ11", "07", "Thứ Ba", 2, 1, 3, "1-3 (07:00)",
                       "07:00", "09:30", "Q1.101", "13/01/2031", "14/01/2031"),
        portal_session("302ZZ1107", "Môn giả định (3TC)", "ZZ11", "07", "Thứ Ba", 2, 1, 3, "1-3 (07:00)",
                       "07:00", "09:30", "Q1.101", "27/01/2031", "28/01/2031"),
        portal_session("302ZZ1107", "Môn giả định (3TC)", "ZZ11", "07", "Chủ Nhật", 7, 7, 4.5, "7-11 (12:30)",
                       "12:30", "16h30", "Q1.202", "13/01/2031", "19/01/2031"),
        portal_session("302YY2201", "Môn khác", "YY22", "01", "Thứ Hai", 1, 10, 3, "10-12 (15:15)",
                       "15:15", "17:45", "Q2.303", "06/01/2031", "06/01/2031"),
    ],
}


# ------------------------------------------------------------------ đơn vị
@pytest.mark.parametrize("text, lessons, notes", [
    ("Thứ 4,tiết 1-5,tuần 4-12,B2.202 || Thứ 4,tiết 1-5,tuần 3-3,B2.204 || *Giảng bằng Tiếng anh",
     [(4, 1, 5, "B2.202", "4-12"), (4, 1, 5, "B2.204", "3-3")], ["Giảng bằng Tiếng anh"]),
    ("Thứ 7,tiết 7-11,tuần 4-14,B1.403", [(7, 7, 11, "B1.403", "4-14")], []),
    ("Chủ nhật,tiết 13-15,tuần 3-12,A.901", [(8, 13, 15, "A.901", "3-12")], []),
    ("Giảng bằng Tiếng anh", [], ["Giảng bằng Tiếng anh"]),
    ("Thứ 4,tiết 1-5,tuần 4-4,. Hoc ngoai khoa 1", [(4, 1, 5, None, "4-4")], []),
    ("", [], []),
    (None, [], []),
])
def test_parse_uis_timetable(text, lessons, notes):
    got, got_notes, unparsed = parse_uis_timetable(text)
    assert [(l.weekday, l.start_period, l.end_period, l.room, l.weeks) for l in got] == lessons
    assert got_notes == notes
    assert unparsed == []


def test_parse_uis_timetable_unparsed_kept_as_note():
    lessons, notes, unparsed = parse_uis_timetable("Thứ 2,tiết ?,tuần 1-2,X")
    assert lessons == [] and unparsed == ["Thứ 2,tiết ?,tuần 1-2,X"] and notes == unparsed


def test_helpers():
    assert parse_room_capacities("B2.202(SC:54),B2.204(SC:90)", "B2.202(14),B2.204(-2)") == [
        {"room": "B2.202", "capacity": 54, "capacity_gap": 14},
        {"room": "B2.204", "capacity": 90, "capacity_gap": -2}]
    assert parse_room_capacities("", "") == []
    assert parse_terms("Học kỳ 1,3") == [1, 3]
    assert parse_terms("Học kỳ 2") == [2]
    assert parse_terms("Cả năm học") == [1, 2, 3]
    assert parse_terms(None) == []
    assert parse_credit_spec("3.0(45.0,0,0,0,0,0)") == (3, 45.0)
    assert parse_credit_spec(2) == (2, None)
    assert semester_from_class_code("251EIE300401") == "2025-2026-1"
    assert semester_from_class_code("243ABC01") == "2024-2025-3"
    assert semester_from_class_code("ECO101.01") is None
    assert semester_from_year_term("2022-2023", "HK05") == "2022-2023-5"
    assert cohorts_from_groups(["K24404E", "K24413E", "K234111E", "abc"]) == ["K23", "K24"]
    assert compress_weeks({1, 2, 3, 5, 7, 8}) == "1-3,5,7-8"


def test_portal_helpers():
    s = PORTAL["sessions"][0]
    assert session_weekday(s) == 3  # Thu = "Thứ Ba" dù DayOfWeek = 2
    assert session_weekday({"DayOfWeek": 7}) == 8 and session_weekday({"DayOfWeek": 1}) == 2
    assert module_code_for(s) == "ZZ11"
    assert module_code_for({"ScheduleStudyUnitID": "222KT4913", "GroupName": "13"}) == "KT49"


# ------------------------------------------------------------------ UIS qua API
def upload_xlsx(client, url, data, name):
    return client.post(url, files={"file": (name, io.BytesIO(data), XLSX)})


def test_import_uis_api(client):
    r = upload_xlsx(client, "/api/import/uis-classes", make_uis_xlsx(), "UIS-DanhSachThongTinLHPDangKy_2025-2026_HK01.xlsx")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["imported"] == 3 and body["skipped"] == 0 and body["semesters"] == ["2025-2026-1"]
    # idempotent
    assert upload_xlsx(client, "/api/import/uis-classes", make_uis_xlsx(), "x.xlsx").json()["imported"] == 3

    m = client.get("/api/modules/XYZ1001").json()
    assert m["is_english"] is True and m["faculty"] is None and m["department"] is None and m["credits"] == 3
    assert client.get("/api/modules/XYZ2002").json()["is_english"] is False
    assert client.get("/api/modules/XY47").json()["is_english"] is True  # từ ghi chú

    # Kiểm tra parser đọc đúng cột Khoa từ file UIS (theo Brief B6b: modules.faculty chỉ nhận từ đề cương)
    wb_uis = openpyxl.load_workbook(io.BytesIO(make_uis_xlsx()), data_only=True)
    uis_rows = [tuple(r) for r in wb_uis.worksheets[0].iter_rows(values_only=True)]
    col, first = _map_uis_header(uis_rows)
    assert uis_rows[first][col["faculty"]] == "Khoa Giả định"

    c = client.get("/api/modules/XYZ1001/classes").json()[0]
    assert c["class_code"] == "251XYZ100101" and c["semester"] == "2025-2026-1"
    assert c["student_groups"] == ["K24901E", "K24902E"] and c["cohorts"] == ["K24"]
    assert (c["quota_min"], c["quota_max"], c["quota"], c["registered"], c["available"]) == (20, 40, 40, 38, 2)
    assert c["rooms"] == [{"room": "Z1.101", "capacity": 54, "capacity_gap": 16},
                          {"room": "Z1.102", "capacity": 90, "capacity_gap": 52}]
    assert c["notes"] == ["Giảng bằng Tiếng anh"]
    assert c["lecturer"] == "GV Giả Định A" and c["start_date"] == "2025-09-10"
    assert [(l["weekday"], l["start_period"], l["end_period"], l["start_time"], l["end_time"], l["room"], l["weeks"])
            for l in c["lessons"]] == [(4, 1, 5, "07:00", "11:25", "Z1.101", "4-12"),
                                       (4, 1, 5, "07:00", "11:25", "Z1.102", "3-3")]
    sun = client.get("/api/modules/XYZ2002/classes").json()[0]
    assert sun["lessons"][0]["weekday"] == 8 and sun["cohorts"] == ["K23"] and sun["available"] == -1
    only_notes = client.get("/api/modules/XY47/classes").json()[0]
    assert only_notes["lessons"] == [] and only_notes["notes"] == ["Giảng bằng Tiếng anh"]

    # Lọc theo khóa
    assert len(client.get("/api/modules/XYZ1001/classes", params={"cohort": "K24"}).json()) == 1
    assert client.get("/api/modules/XYZ1001/classes", params={"cohort": "k23"}).json() == []

    # Học kỳ: thứ Hai tuần 1 = 10/09/2025 (tuần 3) lùi 2 tuần về thứ Hai = 25/08/2025
    sem = client.get("/api/semesters").json()
    assert sem[0]["id"] == "2025-2026-1" and sem[0]["start_date"] == "2025-08-25" and sem[0]["end_date"] == "2025-11-30"
    assert sem[0]["name"] == "Học kỳ 1, năm học 2025–2026"

    venues = {v["room"]: v for v in client.get("/api/venues").json()}
    assert venues["Z1.102"]["capacity"] == 90
    assert client.get("/api/modules", params={"is_english": True}).json()["total"] == 2
    assert client.get("/api/modules", params={"semester": "2025-2026-1"}).json()["total"] == 3
    assert client.get("/api/faculties").json() == []


def test_import_uis_rejects_bad_files(client):
    assert upload_xlsx(client, "/api/import/uis-classes", b"not an xlsx", "a.xlsx").status_code == 422
    wb = openpyxl.Workbook()
    wb.active.append(["foo", "bar"])
    buf = io.BytesIO()
    wb.save(buf)
    r = upload_xlsx(client, "/api/import/uis-classes", buf.getvalue(), "a.xlsx")
    assert r.status_code == 422 and "Mã HP" in r.json()["detail"]


# ------------------------------------------------------------------ TA plan
def test_import_ta_plan_api(client):
    upload_xlsx(client, "/api/import/uis-classes", make_uis_xlsx(), "uis.xlsx")
    r = upload_xlsx(client, "/api/import/ta-plan", make_ta_xlsx(), "Thong_tin_mon_hoc_TA_2026_2027.xlsx")
    assert r.status_code == 200, r.text
    assert r.json()["imported"] == 3
    assert upload_xlsx(client, "/api/import/ta-plan", make_ta_xlsx(), "t.xlsx").json()["imported"] == 3  # upsert

    m = client.get("/api/modules/XYZ1001").json()
    assert m["name"] == "Nhập môn dữ liệu (E)"  # giữ tên từ UIS
    assert m["department"] is None and m["faculty"] is None
    assert m["offering_plan"] == [{"academic_year": "2026-2027", "terms": [1, 3], "terms_text": "Học kỳ 1,3", "open_pct": 100.0}]

    # Kiểm tra parser đọc được thông tin Khoa/Bộ môn từ file TA plan
    wb_ta = openpyxl.load_workbook(io.BytesIO(make_ta_xlsx()), data_only=True)
    ta_rows = [tuple(r) for r in wb_ta.worksheets[0].iter_rows(values_only=True)]
    assert any("Bộ môn Giả định 1" in str(cell) for row in ta_rows for cell in row)
    new = client.get("/api/modules/XYZ3003").json()
    assert new["name"] == "Môn mới chưa có lớp" and new["credits"] == 2 and new["is_english"] is True
    assert new["offering_plan"][0]["terms"] == [1, 2, 3] and new["offering_plan"][0]["open_pct"] == 50.0
    assert client.get("/api/modules/XYZ4004").json()["credits"] == 4
    items = {m["code"]: m for m in client.get("/api/modules", params={"size": 100}).json()["items"]}
    assert items["XYZ3003"]["offering_plan"][0]["academic_year"] == "2026-2027"


# ------------------------------------------------------------------ portal
def test_import_portal_timetable_api(client):
    raw = json.dumps(PORTAL, ensure_ascii=False).encode()
    r = client.post("/api/import/portal-timetable", files={"file": ("tkb.json", io.BytesIO(raw), "application/json")})
    assert r.status_code == 200, r.text
    assert r.json()["imported"] == 2 and r.json()["semesters"] == ["2030-2031-2"]
    r2 = client.post("/api/import/portal-timetable", files={"file": ("tkb.json", io.BytesIO(raw), "application/json")})
    assert r2.json()["imported"] == 2

    m = client.get("/api/modules/ZZ11").json()
    assert m["name"] == "Môn giả định (3TC)" and m["semesters"] == ["2030-2031-2"]
    c = client.get("/api/modules/ZZ11/classes").json()
    assert len(c) == 1 and c[0]["class_code"] == "302ZZ1107"
    assert [(l["weekday"], l["start_period"], l["end_period"], l["start_time"], l["end_time"], l["room"], l["weeks"])
            for l in c[0]["lessons"]] == [
        (3, 1, 3, "07:00", "09:30", "Q1.101", "1-2,4"),
        (8, 7, 11, "12:30", "16:30", "Q1.202", "2"),
    ]
    assert c[0]["start_date"] == "2031-01-07" and c[0]["end_date"] == "2031-01-28"
    # không lưu dữ liệu cá nhân
    assert "K30999" not in json.dumps(c, ensure_ascii=False)
    other = client.get("/api/modules/YY22/classes").json()[0]
    assert other["lessons"][0]["weekday"] == 2 and other["lessons"][0]["start_time"] == "15:15"


def test_portal_rejects_bad_payload(client):
    raw = json.dumps({"foo": 1}).encode()
    r = client.post("/api/import/portal-timetable", files={"file": ("x.json", io.BytesIO(raw), "application/json")})
    assert r.status_code == 422


# ------------------------------------------------------------------ seed từ file thật (giả)
def test_seed_prefers_real_files(db, tmp_path):
    from app.services.seed import run_seed

    (tmp_path / "UIS-DanhSachThongTinLHPDangKy_2025-2026_HK01.xlsx").write_bytes(make_uis_xlsx())
    (tmp_path / "Thong_tin_mon_hoc_TA_2026_2027.xlsx").write_bytes(make_ta_xlsx())
    out1 = run_seed(db, raw_dir=tmp_path)
    out2 = run_seed(db, raw_dir=tmp_path)
    assert out1["source"] == "real" and out1["classes"] == 3 and out1["offering_plans"] == 3
    assert out1 == out2
    from sqlalchemy import func, select

    from app.models import ClassSection, Module, ModuleOfferingPlan

    assert db.scalar(select(func.count()).select_from(ClassSection)) == 3
    assert db.scalar(select(func.count()).select_from(ModuleOfferingPlan)) == 3
    assert db.scalar(select(func.count()).select_from(Module).where(Module.is_sample.is_(True))) == 0
    assert run_seed(db, raw_dir=tmp_path / "empty")["source"] == "sample"


def test_cli_import_commands(db, tmp_path, capsys):
    from app.cli import main

    uis = tmp_path / "uis.xlsx"
    uis.write_bytes(make_uis_xlsx())
    ta = tmp_path / "ta.xlsx"
    ta.write_bytes(make_ta_xlsx())
    tkb = tmp_path / "tkb.json"
    tkb.write_text(json.dumps(PORTAL, ensure_ascii=False), encoding="utf-8")
    assert main(["import-uis-classes", str(uis)]) == 0
    assert '"imported": 3' in capsys.readouterr().out
    assert main(["import-ta-plan", str(ta)]) == 0
    assert '"imported": 3' in capsys.readouterr().out
    assert main(["import-portal-timetable", str(tkb)]) == 0
    assert '"imported": 2' in capsys.readouterr().out
    assert main(["seed", "--sample"]) == 0
    assert '"source": "sample"' in capsys.readouterr().out
