"""Test bộ lõi quản trị: tài khoản, phiên, vai trò, nhật ký, CSRF, CLI (Brief A0 & PLAN_ADMIN Mục 8)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import os
import secrets
import pytest
from sqlalchemy import select

from app.config import get_settings
from app.models import AdminSession, AdminUser, AuditLog
from app.admin.security import (
    generate_csrf_token,
    generate_session_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.cli import main as cli_main


@pytest.fixture
def random_credentials():
    """Sinh email và mật khẩu ngẫu nhiên cho mỗi test để đảm bảo an toàn và độc lập."""
    suffix = secrets.token_hex(4)
    email = f"admin_{suffix}@uel.edu.vn"
    password = f"P@ss_{secrets.token_urlsafe(12)}"
    return email, password


def test_password_hashing_and_verification(random_credentials):
    """Mật khẩu được băm an toàn (Argon2id/PBKDF2 100k vòng), so sánh hằng thời gian."""
    _, password = random_credentials

    hashed = hash_password(password)
    assert hashed != password
    assert ("$argon2" in hashed) or ("pbkdf2:sha256:100000$" in hashed)

    # Khớp đúng
    assert verify_password(password, hashed) is True

    # Sai mật khẩu
    assert verify_password(password + "_wrong", hashed) is False
    assert verify_password("", hashed) is False
    assert verify_password(password, "") is False


def test_login_success_creates_session_and_cookie(client, db, random_credentials):
    """Đăng nhập thành công tạo phiên 8 giờ, đặt cookie uel_admin HttpOnly/Secure và ghi nhật ký."""
    email, password = random_credentials

    # 1. Tạo tài khoản admin trong DB
    user = AdminUser(
        email=email,
        password_hash=hash_password(password),
        role="admin",
        is_active=True,
    )
    db.add(user)
    db.commit()

    # 2. Gọi API đăng nhập
    res = client.post("/api/admin/login", json={"email": email, "password": password})
    assert res.status_code == 200
    data = res.json()

    assert data["email"] == email
    assert data["role"] == "admin"
    assert "csrf_token" in data
    assert len(data["csrf_token"]) > 20

    # 3. Kiểm tra cookie uel_admin
    assert "uel_admin" in res.cookies
    cookie_token = res.cookies["uel_admin"]
    assert len(cookie_token) > 20

    # 4. Kiểm tra CSDL: token lưu băm SHA-256, tuyệt đối không lưu token thô
    session = db.scalar(select(AdminSession).where(AdminSession.user_id == user.id))
    assert session is not None
    assert session.token_hash == hash_token(cookie_token)
    assert session.token_hash != cookie_token
    assert session.csrf_token_hash == hash_token(data["csrf_token"])
    assert session.revoked_at is None
    assert session.expires_at > datetime.now(timezone.utc)

    # 5. Kiểm tra nhật ký thao tác
    audit_entry = db.scalar(
        select(AuditLog).where(
            AuditLog.action == "admin_login_success",
            AuditLog.entity_id == str(user.id),
        )
    )
    assert audit_entry is not None
    assert audit_entry.actor_id == email


def test_login_wrong_password_and_lock_after_5_attempts(client, db, random_credentials):
    """Nhập sai mật khẩu 5 lần thì tài khoản bị tạm khóa 15 phút."""
    email, password = random_credentials

    user = AdminUser(
        email=email,
        password_hash=hash_password(password),
        role="admin",
        is_active=True,
        failed_attempts=0,
    )
    db.add(user)
    db.commit()

    # Nhập sai 4 lần đầu: trả 401, tăng failed_attempts
    for attempt in range(1, 5):
        res = client.post("/api/admin/login", json={"email": email, "password": "wrong_password"})
        assert res.status_code == 401
        assert "Email hoặc mật khẩu không đúng" in res.json()["detail"]

        db.refresh(user)
        assert user.failed_attempts == attempt
        assert user.locked_until is None

    # Lần thứ 5 nhập sai: bị khóa 15 phút
    res5 = client.post("/api/admin/login", json={"email": email, "password": "wrong_password"})
    assert res5.status_code == 401
    assert "khóa 15 phút" in res5.json()["detail"]

    db.refresh(user)
    assert user.failed_attempts == 5
    assert user.locked_until is not None
    now = datetime.now(timezone.utc)
    user_lock = user.locked_until if user.locked_until.tzinfo else user.locked_until.replace(tzinfo=timezone.utc)
    assert user_lock > now + timedelta(minutes=10)

    # Lần thứ 6 (kể cả dùng đúng mật khẩu): vẫn bị chặn 401 do đang khóa
    res6 = client.post("/api/admin/login", json={"email": email, "password": password})
    assert res6.status_code == 401
    assert "tạm khóa" in res6.json()["detail"]


def test_login_unknown_email_returns_401(client, db):
    """Email không tồn tại trả về 401 thông báo chung chung và ghi audit log."""
    unknown_email = f"unknown_{secrets.token_hex(4)}@uel.edu.vn"
    res = client.post("/api/admin/login", json={"email": unknown_email, "password": "any_password"})
    assert res.status_code == 401
    assert "Email hoặc mật khẩu không đúng" in res.json()["detail"]

    # Kiểm tra audit log ghi nhận thất bại
    audit_entry = db.scalar(
        select(AuditLog).where(
            AuditLog.action == "admin_login_failed",
            AuditLog.entity_id == unknown_email,
        )
    )
    assert audit_entry is not None


def test_me_endpoint_requires_auth(client, db, random_credentials):
    """Endpoint /api/admin/me yêu cầu phiên hợp lệ; thiếu hoặc sai cookie trả 401."""
    email, password = random_credentials
    user = AdminUser(
        email=email,
        password_hash=hash_password(password),
        role="admin",
        is_active=True,
    )
    db.add(user)
    db.commit()

    # 1. Cookie rỗng hoặc sai -> 401
    res_no_cookie = client.get("/api/admin/me", cookies={"uel_admin": ""})
    assert res_no_cookie.status_code == 401

    res_invalid_cookie = client.get("/api/admin/me", cookies={"uel_admin": "nonexistent_token_12345"})
    assert res_invalid_cookie.status_code == 401

    # 2. Đăng nhập thành công -> gọi /me trả thông tin người dùng
    login_res = client.post("/api/admin/login", json={"email": email, "password": password})
    assert login_res.status_code == 200

    res_me = client.get("/api/admin/me", cookies=login_res.cookies)
    assert res_me.status_code == 200
    data = res_me.json()
    assert data["email"] == email
    assert data["role"] == "admin"
    assert data["actor_type"] == "admin"


def test_session_expiration(client, db, random_credentials):
    """Phiên hết hạn trả về 401 và tự động đánh dấu revoked_at."""
    email, password = random_credentials
    user = AdminUser(
        email=email,
        password_hash=hash_password(password),
        role="admin",
        is_active=True,
    )
    db.add(user)
    db.commit()

    login_res = client.post("/api/admin/login", json={"email": email, "password": password})
    assert login_res.status_code == 200

    # Ép phiên hết hạn trong CSDL
    session = db.scalar(select(AdminSession).where(AdminSession.user_id == user.id))
    session.expires_at = datetime.now(timezone.utc) - timedelta(minutes=5)
    db.commit()

    # Gọi /me bằng cookie cũ
    res = client.get("/api/admin/me", cookies=login_res.cookies)
    assert res.status_code == 401
    assert "hết hạn" in res.json()["detail"]

    # Đảm bảo phiên đã được đánh dấu thu hồi
    db.refresh(session)
    assert session.revoked_at is not None


def test_logout_revokes_session(client, db, random_credentials):
    """POST /api/admin/logout thu hồi phiên trong CSDL và xóa cookie."""
    email, password = random_credentials
    user = AdminUser(
        email=email,
        password_hash=hash_password(password),
        role="admin",
        is_active=True,
    )
    db.add(user)
    db.commit()

    login_res = client.post("/api/admin/login", json={"email": email, "password": password})
    assert login_res.status_code == 200

    # Gọi đăng xuất
    logout_res = client.post("/api/admin/logout", cookies=login_res.cookies)
    assert logout_res.status_code == 200

    # Kiểm tra phiên đã bị thu hồi trong CSDL
    session = db.scalar(select(AdminSession).where(AdminSession.user_id == user.id))
    assert session.revoked_at is not None

    # Gọi lại bằng cookie cũ -> 401
    me_res = client.get("/api/admin/me", cookies=login_res.cookies)
    assert me_res.status_code == 401


def test_role_based_access_control(client, db):
    """Kiểm tra phân quyền: moderator bị 403 khi vào endpoint yêu cầu vai trò admin."""
    pwd = "ValidPassword123!"

    # Tạo moderator
    mod_user = AdminUser(
        email=f"mod_{secrets.token_hex(4)}@uel.edu.vn",
        password_hash=hash_password(pwd),
        role="moderator",
        is_active=True,
    )
    # Tạo admin
    admin_user = AdminUser(
        email=f"admin_{secrets.token_hex(4)}@uel.edu.vn",
        password_hash=hash_password(pwd),
        role="admin",
        is_active=True,
    )
    db.add_all([mod_user, admin_user])
    db.commit()

    # 1. Đăng nhập với vai trò moderator
    res_mod = client.post("/api/admin/login", json={"email": mod_user.email, "password": pwd})
    assert res_mod.status_code == 200
    mod_csrf = res_mod.json()["csrf_token"]

    # Moderator gọi route admin -> 403
    test_res_mod = client.post(
        "/api/admin/auth/test-protected",
        headers={"X-CSRF-Token": mod_csrf},
        cookies=res_mod.cookies,
    )
    assert test_res_mod.status_code == 403
    assert "không được phép" in test_res_mod.json()["detail"]

    # 2. Đăng nhập với vai trò admin -> 200
    res_admin = client.post("/api/admin/login", json={"email": admin_user.email, "password": pwd})
    assert res_admin.status_code == 200
    admin_csrf = res_admin.json()["csrf_token"]

    test_res_admin = client.post(
        "/api/admin/auth/test-protected",
        headers={"X-CSRF-Token": admin_csrf},
        cookies=res_admin.cookies,
    )
    assert test_res_admin.status_code == 200
    assert test_res_admin.json()["status"] == "ok"


def test_csrf_protection_on_mutating_requests(client, db, random_credentials):
    """Phương thức ghi bắt buộc header X-CSRF-Token hợp lệ khớp với phiên."""
    email, password = random_credentials
    user = AdminUser(
        email=email,
        password_hash=hash_password(password),
        role="admin",
        is_active=True,
    )
    db.add(user)
    db.commit()

    login_res = client.post("/api/admin/login", json={"email": email, "password": password})
    assert login_res.status_code == 200
    valid_csrf = login_res.json()["csrf_token"]

    # 1. Thiếu header X-CSRF-Token -> 403
    res_no_csrf = client.post("/api/admin/auth/test-protected", cookies=login_res.cookies)
    assert res_no_csrf.status_code == 403
    assert "Thiếu header X-CSRF-Token" in res_no_csrf.json()["detail"]

    # 2. Header X-CSRF-Token sai -> 403
    res_bad_csrf = client.post(
        "/api/admin/auth/test-protected",
        headers={"X-CSRF-Token": "invalid_csrf_token_value"},
        cookies=login_res.cookies,
    )
    assert res_bad_csrf.status_code == 403
    assert "không hợp lệ" in res_bad_csrf.json()["detail"]

    # 3. Header X-CSRF-Token đúng -> 200
    res_ok = client.post(
        "/api/admin/auth/test-protected",
        headers={"X-CSRF-Token": valid_csrf},
        cookies=login_res.cookies,
    )
    assert res_ok.status_code == 200
    assert res_ok.json()["status"] == "ok"


def test_token_and_password_stored_as_hashes_only(client, db, random_credentials):
    """Tuyệt đối không lưu mật khẩu thô hoặc token thô trong database."""
    email, password = random_credentials
    user = AdminUser(
        email=email,
        password_hash=hash_password(password),
        role="admin",
        is_active=True,
    )
    db.add(user)
    db.commit()

    # Mật khẩu trong DB không phải mật khẩu thô
    assert user.password_hash != password

    login_res = client.post("/api/admin/login", json={"email": email, "password": password})
    raw_cookie = login_res.cookies["uel_admin"]
    raw_csrf = login_res.json()["csrf_token"]

    session = db.scalar(select(AdminSession).where(AdminSession.user_id == user.id))
    # Token trong DB là mã băm SHA-256 (64 ký tự hex)
    assert session.token_hash != raw_cookie
    assert len(session.token_hash) == 64
    assert session.csrf_token_hash != raw_csrf
    assert len(session.csrf_token_hash) == 64


def test_cli_create_admin_and_reset_password(db, monkeypatch):
    """CLI create-admin và reset-admin-password hoạt động chính xác và ghi nhật ký."""
    email = f"cli_{secrets.token_hex(4)}@uel.edu.vn"
    initial_pwd = "CliAdminPassword123!"

    # 1. Tạo admin qua CLI bằng ADMIN_BOOTSTRAP_PASSWORD
    monkeypatch.setenv("ADMIN_BOOTSTRAP_PASSWORD", initial_pwd)
    ret = cli_main(["create-admin", "--email", email, "--role", "admin"])
    assert ret == 0

    user = db.scalar(select(AdminUser).where(AdminUser.email == email))
    assert user is not None
    assert user.role == "admin"
    assert verify_password(initial_pwd, user.password_hash) is True

    # 2. Đặt lại mật khẩu qua CLI reset-admin-password
    ret_reset = cli_main(["reset-admin-password", "--email", email])
    assert ret_reset == 0

    db.refresh(user)
    # Mật khẩu cũ không còn hợp lệ
    assert verify_password(initial_pwd, user.password_hash) is False
    assert user.failed_attempts == 0
    assert user.locked_until is None

    # Audit log ghi nhận cả 2 thao tác CLI
    created_audit = db.scalar(
        select(AuditLog).where(
            AuditLog.actor_id == "cli",
            AuditLog.action == "admin_user_created",
            AuditLog.entity_id == str(user.id),
        )
    )
    assert created_audit is not None

    reset_audit = db.scalar(
        select(AuditLog).where(
            AuditLog.actor_id == "cli",
            AuditLog.action == "admin_password_reset",
            AuditLog.entity_id == str(user.id),
        )
    )
    assert reset_audit is not None
