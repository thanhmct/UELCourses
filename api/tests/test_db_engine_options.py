from unittest.mock import Mock

from app import db as database


POSTGRES_URL = "postgresql+psycopg://postgres.xxxxxxxx:fake@db.invalid:6543/postgres"


def test_postgres_engine_defaults_to_transaction_pooler_options(monkeypatch):
    monkeypatch.delenv("DB_POOL_SIZE", raising=False)
    monkeypatch.delenv("DB_MAX_OVERFLOW", raising=False)
    create_engine = Mock()
    monkeypatch.setattr(database, "create_engine", create_engine)

    database._make_engine(POSTGRES_URL)

    create_engine.assert_called_once_with(
        POSTGRES_URL,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=5,
        connect_args={"prepare_threshold": None},
    )


def test_postgres_engine_reads_pool_limits_from_environment(monkeypatch):
    monkeypatch.setenv("DB_POOL_SIZE", "3")
    monkeypatch.setenv("DB_MAX_OVERFLOW", "2")
    create_engine = Mock()
    monkeypatch.setattr(database, "create_engine", create_engine)

    database._make_engine(POSTGRES_URL)

    assert create_engine.call_args.kwargs["pool_size"] == 3
    assert create_engine.call_args.kwargs["max_overflow"] == 2


def test_sqlite_engine_keeps_its_connection_options(monkeypatch):
    monkeypatch.setenv("DB_POOL_SIZE", "3")
    monkeypatch.setenv("DB_MAX_OVERFLOW", "2")
    create_engine = Mock()
    monkeypatch.setattr(database, "create_engine", create_engine)
    monkeypatch.setattr(database.event, "listens_for", Mock())

    database._make_engine("sqlite:///:memory:")

    create_engine.assert_called_once_with(
        "sqlite:///:memory:",
        pool_pre_ping=True,
        connect_args={"check_same_thread": False},
    )
