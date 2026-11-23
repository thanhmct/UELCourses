from __future__ import annotations

from datetime import datetime, timedelta, timezone
import pytest
from sqlalchemy import select

from app.config import get_settings
from app.models import AdminSession, AdminSetting, AdminUser, AuditLog
from app.services.admin_auth import hash_password, verify_password


@pytest.fixture(autouse=True)
def enable_admin_dev(monkeypatch):
    """Bật chế độ dev cho các test admin trong file này."""
    settings = get_settings()
    monkeypatch.setattr(settings, "admin_dev_open", True)
    monkeypatch.setattr(settings, "env", "development")


def test_system_endpoint_returns_safe_keys_no_secrets(client, db):
    """GET /api/admin/system trả về thông tin hệ thống, bảng, và TUYỆT ĐỐI không lộ bí mật."""
    res = client.get("/api/admin/system", headers={"x-admin-role": "admin"})
    assert res.status_code == 200
    data = res.json()

    # Kiểm tra các khóa bắt buộc
    assert "app_version" in data
    assert "env" in data
    assert "alembic_head" in data
    assert "alembic_match" in data
    assert "table_stats" in data
    assert "errors_24h" in data
    assert "safe_config" in data

    # Kiểm tra cấu hình an toàn
    safe_cfg = data["safe_config"]
    assert "env" in safe_cfg
    assert "cors_origins" in safe_cfg

    # Đảm bảo không chứa bất kỳ secret nào
    forbidden_keys = {
        "database_url",
        "postgres_password",
        "session_secret",
        "google_client_secret",
        "facebook_app_secret",
        "admin_key",
    }
    for k in forbidden_keys:
        assert k not in safe_cfg
        assert k not in data


def test_system_permissions_and_dev_open(client, monkeypatch):
    """Chỉ vai trò 'admin' được truy cập /system; moderator bị 403; tắt dev open trả 404."""
    # 1. Moderator bị 403
    res_mod = client.get("/api/admin/system", headers={"x-admin-role": "moderator"})
    assert res_mod.status_code == 403

    # 2. Data editor bị 403
    res_ed = client.get("/api/admin/system", headers={"x-admin-role": "data_editor"})
    assert res_ed.status_code == 403

    # 3. Khi ADMIN_DEV_OPEN=false: trả 404
    settings = get_settings()
    monkeypatch.setattr(settings, "admin_dev_open", False)
    res_closed = client.get("/api/admin/system", headers={"x-admin-role": "admin"})
    assert res_closed.status_code == 404


def test_audit_log_filtering_and_csv_export(client, db):
    """GET /api/admin/audit-log hỗ trợ lọc theo actor, action, entity_type, phân trang và xuất CSV."""
    now = datetime.now(timezone.utc)
    # Thêm bản ghi audit mẫu
    db.add(AuditLog(
        actor_type="admin",
        actor_id="admin@uel.edu.vn",
        action="update_faculty",
        entity_type="module",
        entity_id="BIM5001",
        before={"faculty": None},
        after={"faculty": "Khoa Hệ thống thông tin"},
        created_at=now - timedelta(hours=2),
    ))
    db.add(AuditLog(
        actor_type="dev",
        actor_id="dev@uelcourses.local",
        action="create_user",
        entity_type="admin_user",
        entity_id="1",
        before=None,
        after={"email": "mod@uel.edu.vn", "role": "moderator"},
        created_at=now - timedelta(hours=1),
    ))
    db.commit()

    # 1. Lọc theo action
    res_act = client.get("/api/admin/audit-log?action=update_faculty", headers={"x-admin-role": "admin"})
    assert res_act.status_code == 200
    data_act = res_act.json()
    assert data_act["total"] >= 1
    assert all(item["action"] == "update_faculty" for item in data_act["items"])

    # 2. Lọc theo actor
    res_actor = client.get("/api/admin/audit-log?actor=admin@uel.edu.vn", headers={"x-admin-role": "admin"})
    assert res_actor.status_code == 200
    data_actor = res_actor.json()
    assert data_actor["total"] >= 1
    assert any("admin@uel.edu.vn" in (item["actor_id"] or "") for item in data_actor["items"])

    # 3. Xuất file CSV
    res_csv = client.get("/api/admin/audit-log?format=csv", headers={"x-admin-role": "admin"})
    assert res_csv.status_code == 200
    assert res_csv.headers["content-type"].startswith("text/csv")
    assert "attachment; filename=audit_log.csv" in res_csv.headers.get("content-disposition", "")
    csv_text = res_csv.text
    assert "ID,Thời gian (UTC),Loại người dùng" in csv_text
    assert "update_faculty" in csv_text


def test_create_user_returns_temporary_password_once_and_hashes_db(client, db):
    """Tạo user sinh mật khẩu tạm 16 ký tự trả về đúng 1 lần; DB lưu băm; audit_log ghi nhận."""
    payload = {
        "email": "new_mod@uel.edu.vn",
        "role": "moderator",
    }
    res = client.post("/api/admin/users", json=payload, headers={"x-admin-role": "admin"})
    assert res.status_code == 201
    data = res.json()

    assert data["user"]["email"] == "new_mod@uel.edu.vn"
    assert data["user"]["role"] == "moderator"
    assert data["user"]["is_active"] is True
    temp_pwd = data["temporary_password"]
    assert len(temp_pwd) == 16

    # Kiểm tra trong DB: mật khẩu đã được băm, KHÔNG lưu thô
    user = db.scalar(select(AdminUser).where(AdminUser.email == "new_mod@uel.edu.vn"))
    assert user is not None
    assert user.password_hash != temp_pwd
    assert verify_password(temp_pwd, user.password_hash) is True

    # Kiểm tra audit_log
    audit = db.scalar(select(AuditLog).where(AuditLog.action == "create_user", AuditLog.entity_id == str(user.id)))
    assert audit is not None
    assert audit.after["email"] == "new_mod@uel.edu.vn"

    # Trùng email trả về 409 Conflict
    res_dup = client.post("/api/admin/users", json=payload, headers={"x-admin-role": "admin"})
    assert res_dup.status_code == 409


def test_cannot_demote_or_deactivate_last_admin(client, db):
    """Quy tắc an toàn: không cho tự hạ quyền hoặc vô hiệu hóa tài khoản admin cuối cùng."""
    # Đảm bảo chỉ có duy nhất 1 admin
    db.query(AdminUser).delete()
    db.commit()

    admin_single = AdminUser(
        email="sole_admin@uel.edu.vn",
        password_hash=hash_password("adminpass123"),
        role="admin",
        is_active=True,
    )
    db.add(admin_single)
    db.commit()

    # Thử hạ quyền thành moderator -> 400 Bad Request
    res_demote = client.patch(
        f"/api/admin/users/{admin_single.id}",
        json={"role": "moderator"},
        headers={"x-admin-role": "admin"},
    )
    assert res_demote.status_code == 400
    assert "admin" in res_demote.json()["detail"].lower()

    # Thử vô hiệu hóa tài khoản -> 400 Bad Request
    res_deactivate = client.patch(
        f"/api/admin/users/{admin_single.id}",
        json={"is_active": False},
        headers={"x-admin-role": "admin"},
    )
    assert res_deactivate.status_code == 400

    # Thêm 1 admin thứ 2
    admin_second = AdminUser(
        email="second_admin@uel.edu.vn",
        password_hash=hash_password("adminpass456"),
        role="admin",
        is_active=True,
    )
    db.add(admin_second)
    db.commit()

    # Giờ đã có 2 admin -> cho phép hạ quyền admin_single
    res_ok = client.patch(
        f"/api/admin/users/{admin_single.id}",
        json={"role": "data_editor"},
        headers={"x-admin-role": "admin"},
    )
    assert res_ok.status_code == 200
    assert res_ok.json()["role"] == "data_editor"


def test_reset_password_and_revoke_sessions(client, db):
    """Đặt lại mật khẩu sinh mật khẩu tạm mới, thu hồi toàn bộ phiên hoạt động."""
    user = AdminUser(
        email="user_reset@uel.edu.vn",
        password_hash=hash_password("oldpassword123"),
        role="moderator",
        is_active=True,
    )
    db.add(user)
    db.commit()

    # Thêm phiên giả lập
    now = datetime.now(timezone.utc)
    sess = AdminSession(
        user_id=user.id,
        token_hash="fake_token_hash",
        expires_at=now + timedelta(hours=8),
        created_at=now,
    )
    db.add(sess)
    db.commit()

    # Gọi reset password
    res = client.post(f"/api/admin/users/{user.id}/reset-password", headers={"x-admin-role": "admin"})
    assert res.status_code == 200
    data = res.json()
    new_temp = data["temporary_password"]
    assert len(new_temp) == 16

    # Kiểm tra phiên đã bị thu hồi (revoked_at khác None)
    db.refresh(sess)
    assert sess.revoked_at is not None

    # Kiểm tra mật khẩu mới hoạt động
    db.refresh(user)
    assert verify_password(new_temp, user.password_hash) is True


def test_change_my_password_endpoint(client, db):
    """POST /api/admin/me/password: đổi mật khẩu của mình, kiểm tra mật khẩu cũ."""
    user = AdminUser(
        email="dev@uelcourses.local",
        password_hash=hash_password("MyCurrentPass123!"),
        role="admin",
        is_active=True,
    )
    db.add(user)
    db.commit()

    # Thử sai mật khẩu cũ -> 400
    res_wrong = client.post(
        "/api/admin/me/password",
        json={"current_password": "WrongPassword", "new_password": "NewSecretPass456!"},
        headers={"x-admin-role": "admin"},
    )
    assert res_wrong.status_code == 400

    # Đổi đúng mật khẩu
    res_correct = client.post(
        "/api/admin/me/password",
        json={"current_password": "MyCurrentPass123!", "new_password": "NewSecretPass456!"},
        headers={"x-admin-role": "admin"},
    )
    assert res_correct.status_code == 200

    # Kiểm tra mật khẩu mới trong DB
    db.refresh(user)
    assert verify_password("NewSecretPass456!", user.password_hash) is True


def test_admin_settings_validation_and_audit(client, db):
    """GET/PATCH /api/admin/settings: kiểm tra giá trị hợp lệ (30-365 ngày) và audit log."""
    # 1. Đọc ban đầu
    res_get = client.get("/api/admin/settings", headers={"x-admin-role": "admin"})
    assert res_get.status_code == 200
    data = res_get.json()
    assert data["moderation_mode"] in ("pre", "post")
    assert 30 <= data["analytics_retention_days"] <= 365

    # 2. Thử đặt số ngày retention < 30 -> 422
    res_invalid_days = client.patch(
        "/api/admin/settings",
        json={"analytics_retention_days": 10},
        headers={"x-admin-role": "admin"},
    )
    assert res_invalid_days.status_code == 422

    # 3. Thử đặt moderation mode sai -> 422
    res_invalid_mode = client.patch(
        "/api/admin/settings",
        json={"moderation_mode": "invalid_mode"},
        headers={"x-admin-role": "admin"},
    )
    assert res_invalid_mode.status_code == 422

    # 4. Cập nhật hợp lệ
    res_valid = client.patch(
        "/api/admin/settings",
        json={
            "moderation_mode": "post",
            "analytics_enabled": False,
            "analytics_retention_days": 90,
        },
        headers={"x-admin-role": "admin"},
    )
    assert res_valid.status_code == 200
    data_valid = res_valid.json()
    assert data_valid["moderation_mode"] == "post"
    assert data_valid["analytics_enabled"] is False
    assert data_valid["analytics_retention_days"] == 90

    # 5. Kiểm tra audit log
    audit = db.scalar(
        select(AuditLog).where(AuditLog.action == "update_settings").order_by(AuditLog.id.desc())
    )
    assert audit is not None
    assert audit.after["moderation_mode"] == "post"
    assert audit.after["analytics_retention_days"] == 90
