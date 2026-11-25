from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import hmac
import secrets
import string
from typing import Any
from sqlalchemy.orm import Session

from app.models import AuditLog
from app.services.ip_utils import hash_client_ip

try:
    from argon2 import PasswordHasher
    from argon2.exceptions import VerifyMismatchError
    _argon2_hasher = PasswordHasher(
        time_cost=2,
        memory_cost=65536,
        parallelism=1,
        hash_len=32,
        salt_len=16,
    )
except ImportError:
    _argon2_hasher = None


def hash_password(password: str) -> str:
    """Băm mật khẩu an toàn.
    Ưu tiên sử dụng Argon2id nếu có thư viện argon2-cffi.
    Fallback an toàn sang PBKDF2-HMAC-SHA256 100.000 vòng lặp (thư viện chuẩn).
    """
    if _argon2_hasher is not None:
        return _argon2_hasher.hash(password)

    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000)
    return f"pbkdf2:sha256:100000${salt}${key.hex()}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Kiểm tra mật khẩu khớp với chuỗi băm (so sánh hằng thời gian an toàn).
    Hỗ trợ cả Argon2id và PBKDF2.
    """
    if not hashed_password:
        return False

    # 1. Định dạng Argon2
    if hashed_password.startswith("$argon2"):
        if _argon2_hasher is not None:
            try:
                return _argon2_hasher.verify(hashed_password, plain_password)
            except Exception:
                return False
        return False

    # 2. Định dạng PBKDF2
    if "$" in hashed_password:
        parts = hashed_password.split("$")
        if len(parts) == 3 and parts[0] == "pbkdf2:sha256:100000":
            salt = parts[1]
            expected_key = parts[2]
            key = hashlib.pbkdf2_hmac("sha256", plain_password.encode("utf-8"), salt.encode("utf-8"), 100_000)
            return hmac.compare_digest(key.hex(), expected_key)

    return False


def generate_session_token() -> str:
    """Sinh token phiên ngẫu nhiên 32 byte an toàn mật mã."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Băm token (phiên hoặc CSRF) bằng SHA-256 trước khi lưu vào CSDL."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_csrf_token() -> str:
    """Sinh CSRF token ngẫu nhiên 32 byte an toàn mật mã."""
    return secrets.token_urlsafe(32)


def verify_csrf_token(plain_csrf: str, hashed_csrf: str) -> bool:
    """Xác thực CSRF token so sánh hằng thời gian an toàn."""
    if not plain_csrf or not hashed_csrf:
        return False
    token_hash = hash_token(plain_csrf)
    return hmac.compare_digest(token_hash, hashed_csrf)


def generate_temp_password(length: int = 16) -> str:
    """Sinh mật khẩu tạm ngẫu nhiên an toàn gồm chữ hoa, chữ thường, chữ số và ký tự đặc biệt."""
    specials = "!@#$%^&*"
    chars = [
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.digits),
        secrets.choice(specials),
    ]
    all_chars = string.ascii_letters + string.digits + specials
    chars += [secrets.choice(all_chars) for _ in range(length - len(chars))]
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)


def audit(
    db: Session,
    actor: str,
    action: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    actor_type: str = "admin",
) -> AuditLog:
    """Ghi nhật ký thao tác quản trị bất biến (AuditLog). TUYỆT ĐỐI không lưu mật khẩu thô."""
    safe_before = dict(before) if before else None
    safe_after = dict(after) if after else None

    # Loại bỏ các trường nhạy cảm nếu có
    for d in (safe_before, safe_after):
        if d:
            for sensitive_key in ("password", "password_hash", "token", "token_hash", "csrf_token"):
                if sensitive_key in d:
                    d[sensitive_key] = "***"

    entry = AuditLog(
        actor_type=actor_type,
        actor_id=actor,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        before=safe_before,
        after=safe_after,
        created_at=datetime.now(timezone.utc),
    )
    db.add(entry)
    db.commit()
    return entry
