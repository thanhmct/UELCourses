from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


def normalize_db_url(url: str) -> str:
    """postgres:// hoặc postgresql:// (không ghi driver) -> dùng driver psycopg 3."""
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


def _make_engine(url: str):
    url = normalize_db_url(url)
    parsed = make_url(url)
    kwargs: dict = {"pool_pre_ping": True}
    if parsed.get_backend_name() == "sqlite":
        kwargs["connect_args"] = {"check_same_thread": False}
        if parsed.database and parsed.database != ":memory:":
            Path(parsed.database).parent.mkdir(parents=True, exist_ok=True)
    eng = create_engine(url, **kwargs)
    if parsed.get_backend_name() == "sqlite":

        @event.listens_for(eng, "connect")
        def _fk_on(dbapi_conn, _record):  # bật ràng buộc khóa ngoại cho SQLite
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()

    return eng


engine = _make_engine(get_settings().resolved_database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def init_db() -> None:
    """SQLite (dev/test): tự tạo bảng. PostgreSQL: schema do Alembic quản lý (`alembic upgrade head`)."""
    from sqlalchemy import inspect

    from app import models  # noqa: F401  (đăng ký bảng)

    if engine.dialect.name == "sqlite":
        Base.metadata.create_all(bind=engine)
        _sync_sqlite_schema()
        return
    if not inspect(engine).has_table("modules"):
        raise RuntimeError(
            "Database chưa có schema. Chạy migration trước: `alembic upgrade head` "
            "(hoặc `.\\scripts\\dev.ps1 migrate`)."
        )


def _sync_sqlite_schema() -> list[str]:
    """Dev SQLite không chạy Alembic: `create_all` chỉ tạo bảng MỚI, không thêm cột/chỉ mục mới vào bảng cũ
    -> file DB cũ bị lệch schema và mọi truy vấn trả 500. Hàm này bổ sung cột + chỉ mục còn thiếu (chỉ thêm, không xóa/sửa)
    rồi điền lại các cột suy diễn (language_track, name_en). Trả về danh sách thay đổi."""
    import logging

    from sqlalchemy import inspect, text

    log = logging.getLogger("uelcourses")
    insp = inspect(engine)
    changes: list[str] = []
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if not insp.has_table(table.name):
                continue
            have = {c["name"] for c in insp.get_columns(table.name)}
            for col in table.columns:
                if col.name in have:
                    continue
                ddl = f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {col.type.compile(dialect=engine.dialect)}'
                default = None
                if col.server_default is not None:
                    default = str(col.server_default.arg.text if hasattr(col.server_default.arg, "text") else col.server_default.arg)
                    default = {"false": "0", "true": "1"}.get(default.lower(), default)  # Boolean trên SQLite = 0/1
                    ddl += f" DEFAULT '{default}'" if not default.lstrip("-").replace(".", "", 1).isdigit() else f" DEFAULT {default}"
                elif col.default is not None and getattr(col.default, "is_scalar", False):
                    v = col.default.arg
                    ddl += f" DEFAULT {int(v)}" if isinstance(v, bool) else (f" DEFAULT {v}" if isinstance(v, (int, float)) else f" DEFAULT '{v}'")
                conn.execute(text(ddl))  # SQLite: cột mới luôn nullable trừ khi có DEFAULT -> an toàn với dữ liệu cũ
                changes.append(f"+{table.name}.{col.name}")
            existing_idx = {i["name"] for i in insp.get_indexes(table.name)}
            for idx in table.indexes:
                if idx.dialect_options["postgresql"].get("using"):
                    continue  # GIN/trigram chỉ có ý nghĩa trên PostgreSQL
                if idx.name and idx.name not in existing_idx:
                    idx.create(bind=conn, checkfirst=True)
                    changes.append(f"+index {idx.name}")
    if changes:
        log.warning("SQLite schema đã được bổ sung: %s", ", ".join(changes))
        if any(c.startswith("+modules.") for c in changes):
            try:  # điền cột suy diễn cho dữ liệu cũ
                from app.services.english_names import fill_english_names
                from app.services.language import classify_languages

                with SessionLocal() as s:
                    classify_languages(s)
                    fill_english_names(s)
            except Exception:  # noqa: BLE001 — không để lỗi điền dữ liệu chặn khởi động
                log.exception("Không điền được language_track/name_en sau khi bổ sung schema")
    return changes


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
