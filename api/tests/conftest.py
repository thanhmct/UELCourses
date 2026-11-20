"""Cấu hình test chung: DB SQLite tạm, không auto-seed, không gọi mạng thật."""

import os
import shutil
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="uelcourses-test-"))
os.environ["DATA_DIR"] = str(_TMP)
os.environ["DATABASE_URL"] = f"sqlite:///{(_TMP / 'test.db').as_posix()}"
os.environ["AUTO_SEED"] = "false"
os.environ["MIN_PROGRAM_COHORT"] = "0"  # test dùng chương trình mẫu K22; test_legacy_codes.py bật lại riêng
os.environ["SKIP_LEGACY_CODES"] = "false"  # test định dạng dùng mã mẫu 4 ký tự; test_legacy_codes.py bật lại riêng
os.environ["RAW_DATA_DIR"] = str(_TMP / "raw")  # không bao giờ đọc file thật trong test
os.environ.pop("ADMIN_KEY", None)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.config import get_settings  # noqa: E402

get_settings.cache_clear()

from app.db import Base, SessionLocal, engine, init_db  # noqa: E402


@pytest.fixture
def db():
    init_db()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db):
    from app.main import app

    with TestClient(app) as c:
        yield c


def pytest_sessionfinish(session, exitstatus):
    engine.dispose()
    shutil.rmtree(_TMP, ignore_errors=True)
