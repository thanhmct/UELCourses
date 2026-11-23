"""Test quản trị lịch năm học & học kỳ (Brief A5)."""

from __future__ import annotations

from datetime import date
import pytest
from sqlalchemy import select

from app.config import get_settings
from app.models import AcademicEvent, AuditLog, Semester
from app.services.academic_calendar import clear_calendar_cache


def _setup_admin_env(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "env", "development")
    monkeypatch.setattr(settings, "admin_dev_open", True)
    clear_calendar_cache()


def test_calendar_events_crud_and_validation(client, monkeypatch, db):
    """CRUD sự kiện năm học + kiểm tra tính hợp lệ dữ liệu (ngày, khóa, loại) + ghi nhật ký AuditLog."""
    _setup_admin_env(monkeypatch)

    # 1. Validation khi tạo: end_date < start_date -> 422
    res_bad_date = client.post(
        "/api/admin/calendar/events",
        json={
            "academic_year": "2026-2027",
            "kind": "teaching",
            "title": "Sự kiện ngày sai",
            "start_date": "2026-10-15",
            "end_date": "2026-10-10",
            "cohorts": ["K24"],
        },
    )
    assert res_bad_date.status_code == 422
    assert "Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu" in res_bad_date.json()["detail"]

    # 2. Validation khi tạo: khóa sai định dạng -> 422
    res_bad_cohort = client.post(
        "/api/admin/calendar/events",
        json={
            "academic_year": "2026-2027",
            "kind": "teaching",
            "title": "Sự kiện khóa sai",
            "start_date": "2026-10-10",
            "end_date": "2026-10-15",
            "cohorts": ["K2024"],
        },
    )
    assert res_bad_cohort.status_code == 422
    assert "Mã khóa" in res_bad_cohort.json()["detail"]

    # 3. Validation khi tạo: loại sự kiện sai -> 422
    res_bad_kind = client.post(
        "/api/admin/calendar/events",
        json={
            "academic_year": "2026-2027",
            "kind": "loai_khong_ton_tai",
            "title": "Sự kiện loại sai",
            "start_date": "2026-10-10",
            "cohorts": ["K24"],
        },
    )
    assert res_bad_kind.status_code == 422
    assert "Loại sự kiện" in res_bad_kind.json()["detail"]

    # 4. Tạo sự kiện hợp lệ -> 201 Created
    res_create = client.post(
        "/api/admin/calendar/events",
        json={
            "academic_year": "2026-2027",
            "kind": "teaching",
            "title": "Thời gian học tập kiểm thử",
            "start_date": "2026-09-01",
            "end_date": "2026-11-20",
            "semester_id": "2026-2027-1",
            "cohorts": ["K24", "K25"],
            "note": "Kiểm thử CRUD sự kiện",
            "verified": True,
        },
    )
    assert res_create.status_code == 201
    created_data = res_create.json()
    evt_id = created_data["id"]
    assert created_data["title"] == "Thời gian học tập kiểm thử"
    assert created_data["verified"] is True
    assert created_data["cohorts"] == ["K24", "K25"]

    # Kiểm tra AuditLog được tạo
    audit_create = db.scalar(
        select(AuditLog).where(
            AuditLog.entity_id == str(evt_id),
            AuditLog.action == "create_calendar_event",
        )
    )
    assert audit_create is not None
    assert audit_create.after["title"] == "Thời gian học tập kiểm thử"

    # 5. Danh sách và lọc sự kiện (GET /api/admin/calendar/events)
    res_list = client.get("/api/admin/calendar/events?year=2026-2027&type=teaching&cohort=K24")
    assert res_list.status_code == 200
    list_data = res_list.json()
    assert list_data["total"] >= 1
    assert any(e["id"] == evt_id for e in list_data["items"])
    assert "2026-2027" in list_data["years"]
    assert "teaching" in list_data["kinds"]

    # 6. Chỉnh sửa sự kiện (PATCH /api/admin/calendar/events/{id})
    res_patch = client.patch(
        f"/api/admin/calendar/events/{evt_id}",
        json={
            "title": "Thời gian học tập kiểm thử (Đã sửa)",
            "verified": False,
            "note": "Cập nhật ghi chú mới",
        },
    )
    assert res_patch.status_code == 200
    patched_data = res_patch.json()
    assert patched_data["title"] == "Thời gian học tập kiểm thử (Đã sửa)"
    assert patched_data["verified"] is False
    assert patched_data["note"] == "Cập nhật ghi chú mới"

    audit_patch = db.scalar(
        select(AuditLog).where(
            AuditLog.entity_id == str(evt_id),
            AuditLog.action == "update_calendar_event",
        )
    )
    assert audit_patch is not None
    assert audit_patch.before["verified"] is True
    assert audit_patch.after["verified"] is False

    # 7. Xóa sự kiện (DELETE /api/admin/calendar/events/{id})
    res_del = client.delete(f"/api/admin/calendar/events/{evt_id}")
    assert res_del.status_code == 200
    assert res_del.json()["success"] is True

    audit_del = db.scalar(
        select(AuditLog).where(
            AuditLog.entity_id == str(evt_id),
            AuditLog.action == "delete_calendar_event",
        )
    )
    assert audit_del is not None

    # Xác nhận sự kiện không còn trong DB
    assert db.get(AcademicEvent, evt_id) is None


def test_calendar_role_permissions_moderator_gets_403(client, monkeypatch):
    """Vai trò 'moderator' bị từ chối 403 Forbidden khi thao tác trên lịch và học kỳ."""
    _setup_admin_env(monkeypatch)
    headers = {"x-admin-role": "moderator"}

    # 1. GET /api/admin/calendar/events -> 403
    assert client.get("/api/admin/calendar/events", headers=headers).status_code == 403

    # 2. POST /api/admin/calendar/events -> 403
    assert client.post(
        "/api/admin/calendar/events",
        json={"title": "Test", "academic_year": "2026-2027", "kind": "teaching", "start_date": "2026-09-01"},
        headers=headers,
    ).status_code == 403

    # 3. PATCH /api/admin/calendar/events/1 -> 403
    assert client.patch(
        "/api/admin/calendar/events/1",
        json={"title": "Test"},
        headers=headers,
    ).status_code == 403

    # 4. DELETE /api/admin/calendar/events/1 -> 403
    assert client.delete("/api/admin/calendar/events/1", headers=headers).status_code == 403

    # 5. POST /api/admin/calendar/import -> 403
    assert client.post("/api/admin/calendar/import", json=[], headers=headers).status_code == 403

    # 6. GET & PATCH /api/admin/semesters -> 403
    assert client.get("/api/admin/semesters", headers=headers).status_code == 403
    assert client.patch("/api/admin/semesters/2026-2027-1", json={"name": "Test"}, headers=headers).status_code == 403


def test_calendar_import_dry_run_and_confirm(client, monkeypatch, db):
    """POST /api/admin/calendar/import: dry_run=true trả khác biệt; dry_run=false nạp thật."""
    _setup_admin_env(monkeypatch)

    sample_seed = [
        {
            "academic_year": "2028-2029",
            "kind": "teaching",
            "title": "Học kỳ 1 năm học 2028-2029",
            "start_date": "2028-09-01",
            "end_date": "2028-11-20",
            "semester_id": "2028-2029-1",
            "cohorts": ["all"],
            "note": "Khóa tương lai",
            "verified": True,
            "source": "TB 999/TB-TEST",
        },
        {
            "academic_year": "2028-2029",
            "kind": "holiday",
            "title": "Nghỉ lễ 2/9 năm 2028",
            "start_date": "2028-09-02",
            "end_date": None,
            "semester_id": "2028-2029-1",
            "cohorts": ["all"],
            "note": None,
            "verified": False,
            "source": "TB 999/TB-TEST",
        },
    ]

    # 1. Thử nghiệm dry_run=true
    res_dry = client.post(
        "/api/admin/calendar/import?dry_run=true",
        json=sample_seed,
    )
    assert res_dry.status_code == 200
    dry_data = res_dry.json()
    assert dry_data["dry_run"] is True
    assert dry_data["total_incoming"] == 2
    assert dry_data["to_add"] == 2
    assert dry_data["to_delete"] == 0

    # Xác nhận chưa có gì trong DB
    events_in_db = db.scalars(select(AcademicEvent).where(AcademicEvent.academic_year == "2028-2029")).all()
    assert len(events_in_db) == 0

    # 2. Nạp thật dry_run=false
    res_real = client.post(
        "/api/admin/calendar/import?dry_run=false",
        json=sample_seed,
    )
    assert res_real.status_code == 200
    real_data = res_real.json()
    assert real_data["dry_run"] is False
    assert real_data["imported"] == 2

    # Xác nhận DB có 2 sự kiện
    events_after = db.scalars(select(AcademicEvent).where(AcademicEvent.academic_year == "2028-2029")).all()
    assert len(events_after) == 2

    # Kiểm tra audit log
    audit_imp = db.scalar(
        select(AuditLog).where(
            AuditLog.action == "import_academic_calendar",
            AuditLog.entity_id == "2028-2029",
        )
    )
    assert audit_imp is not None


def test_admin_semester_patch_is_current_uniqueness_and_teaching_dates(client, monkeypatch, db):
    """PATCH /api/admin/semesters/{id}: đặt kỳ hiện tại duy nhất, cập nhật teaching_start/end và audit."""
    _setup_admin_env(monkeypatch)

    # Dựng 2 học kỳ mẫu
    s1 = Semester(
        id="2025-2026-1",
        name="Học kỳ 1 năm học 2025-2026",
        year="2025-2026",
        term=1,
        is_current_override=True,
    )
    s2 = Semester(
        id="2025-2026-2",
        name="Học kỳ 2 năm học 2025-2026",
        year="2025-2026",
        term=2,
        is_current_override=False,
    )
    db.add_all([s1, s2])
    db.commit()

    # 1. Đặt s2 làm kỳ hiện tại -> s1 tự động thành False
    res_patch = client.patch(
        "/api/admin/semesters/2025-2026-2",
        json={
            "is_current": True,
            "teaching_start": "2026-01-15",
            "teaching_end": "2026-04-20",
            "name": "Học kỳ 2 · 2025-2026 (Đã cập nhật)",
        },
    )
    assert res_patch.status_code == 200
    data = res_patch.json()
    assert data["is_current"] is True
    assert data["name"] == "Học kỳ 2 · 2025-2026 (Đã cập nhật)"
    assert data["teaching_start"] == "2026-01-15"
    assert data["teaching_end"] == "2026-04-20"

    # Kiểm tra tính duy nhất trong DB
    db.refresh(s1)
    db.refresh(s2)
    assert s2.is_current_override is True
    assert s1.is_current_override is False

    # Kiểm tra audit log
    audit_sem = db.scalar(
        select(AuditLog).where(
            AuditLog.entity_id == "2025-2026-2",
            AuditLog.action == "update_semester",
        )
    )
    assert audit_sem is not None
    assert audit_sem.after["is_current_override"] is True

    # 2. Validation ngày học thật: teaching_end < teaching_start -> 422
    res_bad_dates = client.patch(
        "/api/admin/semesters/2025-2026-2",
        json={"teaching_start": "2026-05-01", "teaching_end": "2026-04-01"},
    )
    assert res_bad_dates.status_code == 422
    assert "Ngày kết thúc học thực tế phải lớn hơn hoặc bằng ngày bắt đầu" in res_bad_dates.json()["detail"]


def test_public_semesters_api_prioritizes_db_teaching_dates(client, monkeypatch, db):
    """API công khai /api/semesters ưu tiên teaching_start/teaching_end lưu trong DB."""
    _setup_admin_env(monkeypatch)

    s = Semester(
        id="2027-2028-1",
        name="Học kỳ 1 năm học 2027-2028",
        year="2027-2028",
        term=1,
        start_date=date(2027, 8, 1),
        end_date=date(2027, 12, 31),
        teaching_start=date(2027, 8, 25),  # Khác start_date
        teaching_end=date(2027, 11, 28),   # Khác end_date
        is_current_override=True,
    )
    db.add(s)
    db.commit()

    res = client.get("/api/semesters")
    assert res.status_code == 200
    sems_data = res.json()
    target_sem = next((item for item in sems_data if item["id"] == "2027-2028-1"), None)
    assert target_sem is not None
    # Giá trị teaching_start/end phải lấy từ DB
    assert target_sem["teaching_start"] == "2027-08-25"
    assert target_sem["teaching_end"] == "2027-11-28"
