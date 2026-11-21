import io
import json

from app.services.seed import run_seed

SAMPLE_CLASSES = [
    {
        "CurriculumID": "ECO101",
        "ScheduleStudyUnitAlias": "ECO101.01",
        "ScheduleStudyUnitName": "Kinh tế vi mô",
        "Credits": 3,
        "StudyUnitTypeName": "Bắt buộc",
        "Schedules": "Thứ 2, Tiết 1-3, Phòng B.101; Thứ 5, Tiết 6-8, Phòng A.203",
        "ProfessorName": "Nguyễn Văn A",
        "StudentQuotas": "80",
        "BeginDate": "2026-09-07T00:00:00",
        "EndDate": "2026-12-27T00:00:00",
    },
    {
        "CurriculumID": "ECO101",
        "ScheduleStudyUnitAlias": "ECO101.02",
        "ScheduleStudyUnitName": "Kinh tế vi mô",
        "Credits": "3",
        "StudyUnitTypeName": "Bắt buộc",
        "Schedules": "Lịch sẽ thông báo sau",
        "ProfessorName": None,
        "StudentQuotas": 60,
        "BeginDate": "18/01/2027",
        "EndDate": "30/05/2027",
    },
    {
        "CurriculumID": "LAW201",
        "ScheduleStudyUnitAlias": "LAW201.01",
        "ScheduleStudyUnitName": "Luật dân sự",
        "Credits": 2.0,
        "StudyUnitTypeName": "Tự chọn",
        "Schedules": [{"DayOfWeek": 3, "BeginPeriod": 4, "NumberOfPeriods": 2, "RoomName": "B.101"}],
        "BeginDate": "2026-09-07",
        "EndDate": "2026-12-27",
    },
    {"ScheduleStudyUnitName": "thiếu mã"},
]

SAMPLE_EQ = [
    {"MaMon": "ECO101", "TenMon": "Kinh tế vi mô", "STC": 3,
     "MaMonTuongDuong": "ECO100", "TenMonTuongDuong": "Kinh tế học", "STCTuongDuong": "3"},
    {"MaMon": "LAW201", "TenMon": "Luật dân sự", "STC": 2,
     "MaMonTuongDuong": "LAW200", "TenMonTuongDuong": "Dân luật", "STCTuongDuong": 2},
    {"MaMon": "X", "TenMon": "thiếu mã tương đương"},
]


def upload(client, url, data, name="courses.json"):
    raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
    return client.post(url, files={"file": (name, io.BytesIO(raw), "application/json")})


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_docs_available(client):
    assert client.get("/docs").status_code == 200
    spec = client.get("/openapi.json").json()
    for path in ["/api/modules", "/api/modules/{code}", "/api/modules/{code}/classes", "/api/semesters",
                 "/api/equivalents", "/api/equivalents/{code}", "/api/venues", "/api/import/classes",
                 "/api/import/equivalents", "/api/sync/equivalents", "/api/feedback", "/api/feedback/stats",
                 "/api/feedback/export.csv"]:
        assert path in spec["paths"], path


def test_cors_localhost_3000(client):
    r = client.options("/api/modules", headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"})
    assert r.headers.get("access-control-allow-origin") == "http://localhost:3000"


def test_import_classes_and_query(client):
    r = upload(client, "/api/import/classes", SAMPLE_CLASSES)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["imported"] == 3
    assert body["skipped"] == 1
    # "Lịch sẽ thông báo sau" không có thứ/tiết -> là ghi chú (notes), không tính là lịch lỗi.
    assert body["unparsed_schedules"] == 0
    assert body["semesters"] == ["2026-2027-1", "2026-2027-2"]

    # Re-import idempotent
    r2 = upload(client, "/api/import/classes", SAMPLE_CLASSES).json()
    assert r2["imported"] == 3
    lst = client.get("/api/modules").json()
    assert lst["total"] == 2

    classes = client.get("/api/modules/ECO101/classes").json()
    assert [c["class_code"] for c in classes] == ["ECO101.01", "ECO101.02"]
    c1 = classes[0]
    assert c1["quota"] == 80 and c1["semester"] == "2026-2027-1" and c1["start_date"] == "2026-09-07"
    assert c1["lessons"] == [
        {"weekday": 2, "start_period": 1, "end_period": 3, "start_time": "07:00", "end_time": "09:30", "room": "B.101", "weeks": None, "date_start": None, "date_end": None},
        {"weekday": 5, "start_period": 6, "end_period": 8, "start_time": "11:25", "end_time": "14:10", "room": "A.203", "weeks": None, "date_start": None, "date_end": None},
    ]
    c2 = classes[1]
    assert c2["lessons"] == [] and c2["schedule_raw"] == "Lịch sẽ thông báo sau" and c2["schedule_parsed"] is False

    only = client.get("/api/modules/ECO101/classes", params={"semester": "2026-2027-2"}).json()
    assert [c["class_code"] for c in only] == ["ECO101.02"]

    detail = client.get("/api/modules/ECO101").json()
    assert detail["name"] == "Kinh tế vi mô" and detail["credits"] == 3
    assert detail["semesters"] == ["2026-2027-1", "2026-2027-2"]
    assert detail["equivalents"] == [] and detail["has_equivalents"] is False

    sems = client.get("/api/semesters").json()
    assert [s["id"] for s in sems] == ["2026-2027-1", "2026-2027-2"]
    assert sum(s["is_current"] for s in sems) == 1


def test_module_search_filters(client):
    upload(client, "/api/import/classes", SAMPLE_CLASSES)
    q = lambda **p: client.get("/api/modules", params=p).json()  # noqa: E731
    assert [m["code"] for m in q(q="kinh te")["items"]] == ["ECO101"]  # không dấu
    assert [m["code"] for m in q(q="Luật")["items"]] == ["LAW201"]
    assert [m["code"] for m in q(q="eco")["items"]] == ["ECO101"]
    assert [m["code"] for m in q(credits=2)["items"]] == ["LAW201"]
    assert [m["code"] for m in q(type="tự chọn")["items"]] == ["LAW201"]
    assert q(q="%")["total"] == 0
    page = q(size=1, page=2)
    assert page["total"] == 2 and [m["code"] for m in page["items"]] == ["LAW201"]
    assert client.get("/api/modules", params={"size": 0}).status_code == 422


def test_module_404(client):
    assert client.get("/api/modules/NOPE").status_code == 404
    assert client.get("/api/modules/NOPE/classes").status_code == 404


def test_venues(client):
    upload(client, "/api/import/classes", SAMPLE_CLASSES)
    venues = client.get("/api/venues").json()
    rooms = {v["room"]: v for v in venues}
    assert set(rooms) == {"A.203", "B.101"}
    b101 = rooms["B.101"]["sessions"]
    assert [(s["class_code"], s["weekday"], s["start_period"]) for s in b101] == [("ECO101.01", 2, 1), ("LAW201.01", 3, 4)]
    assert b101[0]["module_name"] == "Kinh tế vi mô"
    assert [v["room"] for v in client.get("/api/venues", params={"q": "a.2"}).json()] == ["A.203"]
    assert client.get("/api/venues", params={"semester": "2026-2027-2"}).json()[0]["sessions"] == []


def test_import_equivalents_and_query(client):
    upload(client, "/api/import/classes", SAMPLE_CLASSES)
    r = upload(client, "/api/import/equivalents", SAMPLE_EQ)
    assert r.json()["imported"] == 2 and r.json()["skipped"] == 1
    assert upload(client, "/api/import/equivalents", SAMPLE_EQ).json()["imported"] == 2  # upsert

    items = client.get("/api/equivalents").json()
    assert [i["code"] for i in items] == ["ECO101", "LAW201"]
    assert items[0]["equivalents"] == [{"code": "ECO100", "name": "Kinh tế học", "name_en": None, "credits": 3}]
    assert [i["code"] for i in client.get("/api/equivalents", params={"q": "dan luat"}).json()] == ["LAW201"]

    one = client.get("/api/equivalents/ECO101").json()
    assert one["name"] == "Kinh tế vi mô" and one["credits"] == 3
    # chiều ngược lại
    rev = client.get("/api/equivalents/ECO100").json()
    assert rev["equivalents"][0]["code"] == "ECO101"
    assert client.get("/api/equivalents/NOPE").status_code == 404

    lst = client.get("/api/modules").json()["items"]
    assert all(m["has_equivalents"] for m in lst)
    assert client.get("/api/modules/ECO101").json()["equivalents"][0]["code"] == "ECO100"


def test_import_rejects_bad_files(client):
    r = client.post("/api/import/classes", files={"file": ("x.json", io.BytesIO(b"not json"), "application/json")})
    assert r.status_code == 422
    assert upload(client, "/api/import/classes", {"foo": 1}).status_code == 422
    assert upload(client, "/api/import/classes", {"data": SAMPLE_CLASSES[:1]}).json()["imported"] == 1
    bom = "﻿".encode() + json.dumps(SAMPLE_EQ).encode()
    r = client.post("/api/import/equivalents", files={"file": ("e.json", io.BytesIO(bom), "application/json")})
    assert r.status_code == 200


def test_admin_key(client, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "admin_key", "s3cret")
    assert upload(client, "/api/import/classes", SAMPLE_CLASSES).status_code == 401
    raw = json.dumps(SAMPLE_CLASSES).encode()
    r = client.post("/api/import/classes", files={"file": ("c.json", io.BytesIO(raw))}, headers={"X-Admin-Key": "s3cret"})
    assert r.status_code == 200
    assert client.get("/api/feedback/export.csv").status_code == 401


def test_seed_idempotent(db, client):
    first = run_seed(db)
    assert first["modules"] >= 40 and first["classes"] >= 100 and first["semesters"] == 2
    totals = client.get("/api/modules").json()["total"]
    classes = sum(len(client.get(f"/api/modules/{m['code']}/classes").json())
                  for m in client.get("/api/modules", params={"size": 200}).json()["items"])
    eq = len(client.get("/api/equivalents").json())
    run_seed(db)
    run_seed(db)
    assert client.get("/api/modules").json()["total"] == totals
    assert sum(len(client.get(f"/api/modules/{m['code']}/classes").json())
               for m in client.get("/api/modules", params={"size": 200}).json()["items"]) == classes
    assert len(client.get("/api/equivalents").json()) == eq
    m = client.get("/api/modules", params={"size": 1}).json()["items"][0]
    assert m["is_sample"] is True and m["faculty"]
    sems = client.get("/api/semesters").json()
    assert len(sems) == 2 and all(s["is_sample"] for s in sems)
    # mọi lớp mẫu parse được lịch
    for mod in client.get("/api/modules", params={"size": 200}).json()["items"]:
        for c in client.get(f"/api/modules/{mod['code']}/classes").json():
            assert c["lessons"] and c["schedule_parsed"], c


def test_clear_sample_keeps_real(db, client):
    from app.services.importer import clear_sample_data

    run_seed(db)
    upload(client, "/api/import/classes", SAMPLE_CLASSES)
    clear_sample_data(db)
    codes = [m["code"] for m in client.get("/api/modules", params={"size": 200}).json()["items"]]
    assert codes == ["ECO101", "LAW201"]
