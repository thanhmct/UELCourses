"""Một database duy nhất: DATABASE_URL > POSTGRES_* (<repo>/.env) > SQLite thử. Mặc định không tự nạp dữ liệu mẫu."""
from app.config import Settings


def _s(**kw) -> Settings:
    return Settings(_env_file=None, **kw)


def test_explicit_database_url_wins():
    s = _s(database_url="postgresql+psycopg://u:p@db:5432/x", postgres_password="khac")
    assert s.resolved_database_url == "postgresql+psycopg://u:p@db:5432/x"


def test_postgres_from_env_file_values_when_no_database_url():
    s = _s(database_url=None, postgres_password="a b/c@d", postgres_user="uelplan", postgres_db="uelplan")
    assert s.resolved_database_url == "postgresql+psycopg://uelplan:a%20b%2Fc%40d@localhost:5432/uelplan"


def test_sqlite_only_as_last_resort():
    s = _s(database_url=None, postgres_password=None)
    assert s.resolved_database_url.startswith("sqlite:///")


def test_no_auto_seed_by_default():
    assert _s(database_url=None).auto_seed is False
