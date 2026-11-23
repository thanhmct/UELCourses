from __future__ import annotations

from datetime import datetime, timedelta, timezone
import pytest
from app.config import Settings, get_settings, validate_production
from app.models import AnalyticsEvent, ImportRun, Module, OutlineCourse, OutlineDocument, Review, User


def test_admin_overview_returns_404_when_dev_open_is_false(client, monkeypatch):
    """Khi ADMIN_DEV_OPEN=false: mọi endpoint /api/admin/* trả về 404 (không lộ sự tồn tại)."""
    settings = get_settings()
    monkeypatch.setattr(settings, "admin_dev_open", False)
    monkeypatch.setattr(settings, "env", "development")

    res = client.get("/api/admin/overview")
    assert res.status_code == 404

    res_me = client.get("/api/admin/me")
    assert res_me.status_code == 404


def test_admin_overview_returns_404_in_production(client, monkeypatch):
    """Khi ENV=production: endpoint quản trị không cho phép truy cập qua dev mode (trả 404)."""
    settings = get_settings()
    monkeypatch.setattr(settings, "admin_dev_open", True)
    monkeypatch.setattr(settings, "env", "production")

    res = client.get("/api/admin/overview")
    assert res.status_code == 404


def test_validate_production_rejects_admin_dev_open():
    """validate_production() từ chối khởi động nếu ENV=production mà ADMIN_DEV_OPEN=true."""
    settings = Settings(
        env="production",
        session_secret="random-long-production-secret-123456",
        cors_origins="https://uelcourses.edu.vn",
        admin_dev_open=True,
    )
    with pytest.raises(RuntimeError, match="ADMIN_DEV_OPEN không được bật ở môi trường production"):
        validate_production(settings)


def test_admin_overview_and_me_success_when_dev_open(client, monkeypatch, db):
    """Khi ADMIN_DEV_OPEN=true và ENV != production: trả 200 đầy đủ 8 chỉ số KPI và me."""
    settings = get_settings()
    monkeypatch.setattr(settings, "admin_dev_open", True)
    monkeypatch.setattr(settings, "env", "development")

    # 1. Database trống -> trả các giá trị 0 / null an toàn
    res = client.get("/api/admin/overview")
    assert res.status_code == 200
    data = res.json()
    assert data["active_anon_7d"] == 0
    assert data["active_anon_30d"] == 0
    assert data["timetable_adds_7d"] == 0
    assert data["planner_adds_7d"] == 0
    assert data["moderation_pending"] == 0
    assert data["data_review_pending"] == 0
    assert data["errors_24h"] == 0
    assert data["last_import_at"] is None

    # Test /api/admin/me
    res_me = client.get("/api/admin/me")
    assert res_me.status_code == 200
    me_data = res_me.json()
    assert me_data["role"] == "admin"
    assert me_data["email"] == "dev@uelcourses.local"
    assert me_data["actor_type"] == "dev"

    # 2. Thêm dữ liệu mẫu kiểm chứng tính toán chỉ số
    now = datetime.now(timezone.utc)
    activity_at = (now - timedelta(days=1)).replace(hour=12, minute=0, second=0, microsecond=0)
    db.add(AnalyticsEvent(anon_id="overview-visitor", event_type="timetable_add", created_at=activity_at))
    reviewer = User(provider="google", subject="overview-reviewer", display_name="Sinh viên")
    document = OutlineDocument(
        file_name="syllabus.pdf", rel_path="syllabus.pdf", sha256="overview-syllabus", size_bytes=1,
    )
    db.add_all([reviewer, document])
    db.flush()
    db.add(OutlineCourse(
        document_id=document.id,
        course_code_norm="BIM5001",
        faculty="Khoa Chưa Được Ánh Xạ",
    ))
    db.add(Review(
        module_code="BIM5001",
        user_id=reviewer.id,
        rating=5,
        content="Học phần rất hay",
        status="pending",
    ))
    db.add(Module(
        code="BIM5001",
        name="Hệ thống thông tin quản lý",
        faculty=None,  # Đề cương ghi khoa chưa ánh xạ, cần duyệt
        credits=3,
    ))
    db.add(Module(
        code="BIM5002",
        name="Cơ sở dữ liệu",
        faculty="Khoa Hệ thống thông tin",
        credits=3,
    ))
    db.add(ImportRun(
        source="dkhp",
        file_name="courses.json",
        finished_at=now,
    ))
    db.commit()

    res2 = client.get("/api/admin/overview")
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["active_anon_7d"] == 1
    assert data2["timetable_adds_7d"] == 1
    assert {point["date"]: point["count"] for point in data2["activity_30d"]}[activity_at.date().isoformat()] == 1
    assert data2["moderation_pending"] == 1
    assert data2["data_review_pending"] == 1
    assert data2["last_import_at"] is not None
