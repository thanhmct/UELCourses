"""Kiểm tra chốt chặn an toàn môi trường production (Brief D1).

Khi ENV=production:
- SESSION_SECRET là 'dev-only-change-me' hoặc rỗng -> ném RuntimeError.
- CORS_ORIGINS chứa 'localhost' hoặc '127.0.0.1' -> ném RuntimeError.
- Cấu hình an toàn -> không ném lỗi.
Ở môi trường khác (ENV=development):
- Cấu hình mặc định (dev-only-change-me, localhost) -> không ném lỗi.
"""

from __future__ import annotations

import pytest

from app.config import Settings, validate_production


def test_development_mode_allows_defaults():
    """Ở môi trường development, cho phép dùng secret mặc định và localhost."""
    settings = Settings(
        env="development",
        session_secret="dev-only-change-me",
        cors_origins="http://localhost:3000",
    )
    # Không ném lỗi
    validate_production(settings)


def test_production_rejects_default_session_secret():
    """Ở production, cấm dùng SESSION_SECRET mặc định 'dev-only-change-me'."""
    settings = Settings(
        env="production",
        session_secret="dev-only-change-me",
        cors_origins="https://uelcourses.vercel.app",
    )
    with pytest.raises(RuntimeError, match="SESSION_SECRET"):
        validate_production(settings)


def test_production_rejects_empty_session_secret():
    """Ở production, cấm để trống SESSION_SECRET."""
    settings = Settings(
        env="production",
        session_secret="",
        cors_origins="https://uelcourses.vercel.app",
    )
    with pytest.raises(RuntimeError, match="SESSION_SECRET"):
        validate_production(settings)


def test_production_rejects_whitespace_session_secret():
    """Ở production, cấm đặt SESSION_SECRET chỉ toàn khoảng trắng."""
    settings = Settings(
        env="production",
        session_secret="   ",
        cors_origins="https://uelcourses.vercel.app",
    )
    with pytest.raises(RuntimeError, match="SESSION_SECRET"):
        validate_production(settings)


def test_production_rejects_localhost_cors():
    """Ở production, cấm CORS_ORIGINS chứa localhost."""
    settings = Settings(
        env="production",
        session_secret="a-secure-random-production-secret-123456",
        cors_origins="http://localhost:3000",
    )
    with pytest.raises(RuntimeError, match="CORS_ORIGINS"):
        validate_production(settings)


def test_production_rejects_127_0_0_1_cors():
    """Ở production, cấm CORS_ORIGINS chứa 127.0.0.1."""
    settings = Settings(
        env="production",
        session_secret="a-secure-random-production-secret-123456",
        cors_origins="http://127.0.0.1:3000",
    )
    with pytest.raises(RuntimeError, match="CORS_ORIGINS"):
        validate_production(settings)


def test_production_rejects_mixed_cors_containing_localhost():
    """Ở production, nếu danh sách CORS có cả domain thật lẫn localhost thì vẫn bị từ chối."""
    settings = Settings(
        env="production",
        session_secret="a-secure-random-production-secret-123456",
        cors_origins="https://uelcourses.vercel.app, http://localhost:3000",
    )
    with pytest.raises(RuntimeError, match="CORS_ORIGINS"):
        validate_production(settings)


def test_production_allows_secure_config():
    """Ở production, secret an toàn và domain công khai thì vượt qua kiểm tra."""
    settings = Settings(
        env="production",
        session_secret="super-strong-random-key-for-session-uelcourses-2026",
        cors_origins="https://uelcourses.vercel.app, https://uelcourses.edu.vn",
    )
    # Không ném lỗi
    validate_production(settings)


def test_validate_production_default_argument(monkeypatch):
    """Khi không truyền settings, hàm tự lấy từ get_settings()."""
    from app.config import get_settings

    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("SESSION_SECRET", "dev-only-change-me")
    get_settings.cache_clear()
    try:
        with pytest.raises(RuntimeError, match="SESSION_SECRET"):
            validate_production()
    finally:
        get_settings.cache_clear()
