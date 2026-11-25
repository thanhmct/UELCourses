"""Thống kê sinh viên trao đổi: quy tắc mã môn, tổng hợp, nạp file (thay theo học kỳ) và API công khai."""

import json
from pathlib import Path

import pytest

from app.models import ExchangeModuleStat, Module
from app.services.exchange_stats import SemesterRecord, aggregate, import_exchange_stats, module_code_from_class


@pytest.mark.parametrize(
    "class_code, module",
    [
        ("251ELB104801", "ELB1048"),
        ("261EKT502302", "EKT5023"),
        ("251VT0201", "VT0201"),
        ("251FB7101", "FB7101"),
        ("251EKTT02301", None),  # mã lỗi gõ: không đoán, để báo cáo chưa khớp
        ("IEVN202503", None),  # không phải lớp UEL
        ("", None),
        (None, None),
    ],
)
def test_module_code_from_class(class_code, module):
    assert module_code_from_class(class_code) == module


def test_aggregate_counts_each_student_once_per_module_and_semester():
    records = [
        SemesterRecord("2025-2026-1", "a.json", [
            ["251ELB104801", "251ELB104810"],  # cùng môn ELB1048 hai nhóm -> vẫn 1 SV
            ["251ELB104801", "251VT0201", "251EKTT02301"],
        ]),
        SemesterRecord("2025-2026-2", "b.json", [["252ELB104801"]]),
    ]
    rows, unmatched = aggregate(records)
    by = {(r.module_code, r.semester_id): r for r in rows}
    assert by[("ELB1048", "2025-2026-1")].student_count == 2
    assert by[("ELB1048", "2025-2026-1")].class_codes == ["251ELB104801", "251ELB104810"]
    assert by[("VT0201", "2025-2026-1")].student_count == 1
    assert by[("ELB1048", "2025-2026-2")].student_count == 1
    assert unmatched == {"251EKTT02301": 1}


def _write_semesters(tmp_path: Path) -> Path:
    folder = tmp_path / "processed"
    folder.mkdir()
    (folder / "exchange_2025-2026-1.json").write_text(json.dumps({
        "semester_id": "2025-2026-1",
        "students": [
            {"ref": "s01", "classes": ["251ELB104801", "251ELB104810"]},
            {"ref": "s02", "classes": ["251ELB104801", "251VT0201"]},
        ],
    }), encoding="utf-8")
    (folder / "exchange_2026-2027-1.json").write_text(json.dumps({
        "semester_id": "2026-2027-1",
        "students": [{"ref": "s01", "classes": ["261ELB104801"]}],
    }), encoding="utf-8")
    # file đối chiếu không phải nguồn nạp: không được đọc
    (folder / "exchange_module_counts_check.json").write_text("[]", encoding="utf-8")
    return folder


def test_dry_run_reports_without_writing(db, tmp_path):
    folder = _write_semesters(tmp_path)
    report = import_exchange_stats(None, folder, dry_run=True)
    assert report["dry_run"] is True
    assert report["stat_rows"] == 3  # ELB1048 + VT0201 (2025-26 HK1), ELB1048 (2026-27 HK1)
    assert [s["semester_id"] for s in report["semesters"]] == ["2025-2026-1", "2026-2027-1"]
    assert db.query(ExchangeModuleStat).count() == 0


def test_import_then_api_totals_and_reimport_replaces(client, db, tmp_path):
    folder = _write_semesters(tmp_path)
    import_exchange_stats(db, folder, dry_run=False)

    r = client.get("/api/exchange-stats", params={"codes": "elb1048, VT0201, NOPE"})
    assert r.status_code == 200
    items = {item["module_code"]: item for item in r.json()["items"]}
    assert items["ELB1048"]["total"] == 3
    assert items["ELB1048"]["by_semester"] == [
        {"semester_id": "2025-2026-1", "students": 2},
        {"semester_id": "2026-2027-1", "students": 1},
    ]
    assert items["VT0201"]["total"] == 1
    assert "NOPE" not in items

    # nạp lại cùng dữ liệu: thay thế theo học kỳ, không cộng dồn
    import_exchange_stats(db, folder, dry_run=False)
    single = client.get("/api/modules/ELB1048/exchange-stats")
    assert single.status_code == 200
    assert single.json()["total"] == 3

    empty = client.get("/api/modules/ZZZ9999/exchange-stats")
    assert empty.status_code == 200
    assert empty.json() == {"module_code": "ZZZ9999", "total": 0, "by_semester": []}


def test_list_modules_priority_then_exchange_rank(client, db):
    for code, name in [("ZZZ0001", "No stat"), ("ZZZ0002", "Selected, no stat"), ("VT0201", "Logistics"),
                       ("ELB1048", "Introduction to Law"), ("EKT5023", "International Trade Law")]:
        db.add(Module(code=code, name=name))
    db.add_all([
        ExchangeModuleStat(module_code="ELB1048", semester_id="2025-2026-1", student_count=11),
        ExchangeModuleStat(module_code="ELB1048", semester_id="2026-2027-1", student_count=11),
        ExchangeModuleStat(module_code="EKT5023", semester_id="2026-2027-1", student_count=10),
        ExchangeModuleStat(module_code="VT0201", semester_id="2025-2026-1", student_count=4),
    ])
    db.commit()

    ranked = client.get("/api/modules", params={"priority_codes": "zzz0002, VT0201", "exchange_rank": "true", "size": 20})
    assert ranked.status_code == 200
    # nhóm đã chọn trước (VT0201 có SV trao đổi nên trước ZZZ0002), rồi tới môn SV trao đổi học nhiều
    assert [m["code"] for m in ranked.json()["items"]] == ["VT0201", "ZZZ0002", "ELB1048", "EKT5023", "ZZZ0001"]

    plain = client.get("/api/modules", params={"size": 20})
    assert [m["code"] for m in plain.json()["items"]] == ["EKT5023", "ELB1048", "VT0201", "ZZZ0001", "ZZZ0002"]
