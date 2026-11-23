"""Create/drop a temporary PostgreSQL clone for Brief X5 migration checks.

The script reads the existing application database configuration without
printing credentials.  It creates an empty database, migrates it to 0023,
then copies every public table from the live database in dependency order.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from datetime import datetime

import psycopg
from sqlalchemy.engine import make_url


def _app_url():
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
    from app.config import get_settings
    from app.db import normalize_db_url

    return make_url(normalize_db_url(get_settings().resolved_database_url))


def _psycopg_dsn(url, database: str) -> str:
    return url.set(database=database, drivername="postgresql").render_as_string(
        hide_password=False
    )


def _alembic_url(url, database: str) -> str:
    return url.set(database=database, drivername="postgresql+psycopg").render_as_string(
        hide_password=False
    )


def _run_alembic(url, database: str, *args: str) -> None:
    env = os.environ.copy()
    env["DATABASE_URL"] = _alembic_url(url, database)
    subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=os.path.join(os.path.dirname(__file__), "..", "api"),
        env=env,
        check=True,
    )


def _quote(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _table_order(connection: psycopg.Connection) -> list[str]:
    rows = connection.execute(
        """
        WITH RECURSIVE deps AS (
          SELECT c.relname AS table_name, 0 AS depth
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind = 'r'
          UNION ALL
          SELECT child.relname, deps.depth + 1
          FROM deps
          JOIN pg_class parent ON parent.relname = deps.table_name
          JOIN pg_namespace pn ON pn.oid = parent.relnamespace AND pn.nspname = 'public'
          JOIN pg_constraint fk ON fk.confrelid = parent.oid AND fk.contype = 'f'
          JOIN pg_class child ON child.oid = fk.conrelid
          JOIN pg_namespace cn ON cn.oid = child.relnamespace AND cn.nspname = 'public'
          WHERE deps.depth < 64
        )
        SELECT table_name
        FROM deps
        WHERE table_name <> 'alembic_version'
        GROUP BY table_name
        ORDER BY max(depth), table_name
        """
    ).fetchall()
    return [row[0] for row in rows]


def _copy_tables(url, source_db: str, target_db: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    with (
        psycopg.connect(_psycopg_dsn(url, source_db)) as source,
        psycopg.connect(_psycopg_dsn(url, target_db)) as target,
    ):
        for table in _table_order(source):
            quoted = _quote(table)
            count = source.execute(f"SELECT count(*) FROM {quoted}").fetchone()[0]
            counts[table] = count
            if not count:
                continue
            with (
                source.cursor().copy(f"COPY {quoted} TO STDOUT (FORMAT BINARY)") as copy_out,
                target.cursor().copy(f"COPY {quoted} FROM STDIN (FORMAT BINARY)") as copy_in,
            ):
                for chunk in copy_out:
                    copy_in.write(chunk)

        sequence_rows = target.execute(
            """
            SELECT table_name, column_name,
                   pg_get_serial_sequence(format('%I.%I', table_schema, table_name), column_name)
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND column_default LIKE 'nextval(%'
            """
        ).fetchall()
        for table, column, sequence in sequence_rows:
            if not sequence:
                continue
            maximum = target.execute(
                f"SELECT max({_quote(column)}) FROM {_quote(table)}"
            ).fetchone()[0]
            if maximum is not None:
                target.execute("SELECT setval(%s, %s, true)", (sequence, maximum))
    return counts


def create_clone(name: str | None) -> str:
    url = _app_url()
    source_db = url.database
    clone_db = name or f"uelplan_x5_{datetime.now():%Y%m%d_%H%M%S}"
    with psycopg.connect(_psycopg_dsn(url, "postgres"), autocommit=True) as admin:
        exists = admin.execute(
            "SELECT 1 FROM pg_database WHERE datname = %s", (clone_db,)
        ).fetchone()
        if exists:
            raise RuntimeError(f"Database tạm đã tồn tại: {clone_db}")
        admin.execute(f"CREATE DATABASE {_quote(clone_db)} TEMPLATE template0")

    try:
        _run_alembic(url, clone_db, "upgrade", "0023")
        counts = _copy_tables(url, source_db, clone_db)
    except Exception:
        drop_clone(clone_db)
        raise

    print(f"clone={clone_db}")
    print(f"tables={len(counts)} rows={sum(counts.values())}")
    for table in ("programs", "program_modules", "modules", "outline_documents"):
        if table in counts:
            print(f"{table}={counts[table]}")
    return clone_db


def drop_clone(name: str) -> None:
    url = _app_url()
    with psycopg.connect(_psycopg_dsn(url, "postgres"), autocommit=True) as admin:
        admin.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = %s AND pid <> pg_backend_pid()",
            (name,),
        )
        admin.execute(f"DROP DATABASE IF EXISTS {_quote(name)}")
    print(f"dropped={name}")


def run_alembic(name: str, arguments: list[str]) -> None:
    _run_alembic(_app_url(), name, *arguments)


def print_counts(name: str) -> None:
    url = _app_url()
    with psycopg.connect(_psycopg_dsn(url, name)) as connection:
        version = connection.execute("SELECT version_num FROM alembic_version").fetchone()[0]
        print(f"revision={version}")
        for table in ("programs", "program_modules", "modules", "outline_documents"):
            count = connection.execute(f"SELECT count(*) FROM {_quote(table)}").fetchone()[0]
            print(f"{table}={count}")
        suffixes = connection.execute(
            "SELECT count(*) FROM programs WHERE id LIKE '%-V2' OR id LIKE '%-V3'"
        ).fetchone()[0]
        print(f"legacy_program_suffixes={suffixes}")


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("create")
    create.add_argument("--name")
    drop = sub.add_parser("drop")
    drop.add_argument("name")
    alembic = sub.add_parser("alembic")
    alembic.add_argument("name")
    alembic.add_argument("arguments", nargs=argparse.REMAINDER)
    counts = sub.add_parser("counts")
    counts.add_argument("name")
    args = parser.parse_args()
    if args.command == "create":
        create_clone(args.name)
    elif args.command == "drop":
        drop_clone(args.name)
    elif args.command == "alembic":
        run_alembic(args.name, args.arguments)
    else:
        print_counts(args.name)


if __name__ == "__main__":
    main()
