"""Upsert local public-schema rows into Supabase without deleting remote rows.

Connections are supplied only through LOCAL_DATABASE_URL and SUPABASE_DATABASE_URL.
The script never prints either URL and commits the remote transaction only after
every eligible table succeeds.
"""

from __future__ import annotations

import os
import sys
from collections.abc import Iterable

from sqlalchemy import Integer, MetaData, create_engine, inspect, select, text
from sqlalchemy.dialects.postgresql import insert


CHUNK_SIZE = 500


def chunks(rows: Iterable[dict], size: int) -> Iterable[list[dict]]:
    batch: list[dict] = []
    for row in rows:
        batch.append(row)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch


def required_env(name: str) -> str:
    value = os.environ.get(name, "")
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def main() -> int:
    local_engine = create_engine(required_env("LOCAL_DATABASE_URL"))
    remote_engine = create_engine(required_env("SUPABASE_DATABASE_URL"), pool_pre_ping=True)

    local_meta = MetaData(schema="public")
    remote_meta = MetaData(schema="public")
    local_meta.reflect(bind=local_engine)
    remote_meta.reflect(bind=remote_engine)

    local_tables = set(local_meta.tables)
    remote_tables = set(remote_meta.tables)
    missing_remote = sorted(local_tables - remote_tables)
    if missing_remote:
        print("ERROR: Supabase is missing tables: " + ", ".join(missing_remote), file=sys.stderr)
        print("Apply non-destructive schema migrations before upserting data.", file=sys.stderr)
        return 2

    remote_inspector = inspect(remote_engine)
    sorted_names = [
        name for name, _ in remote_inspector.get_sorted_table_and_fkc_names(schema="public")
        if name and f"public.{name}" in local_tables
    ]
    # Alembic has no useful application data and can have no primary key.
    sorted_names = [name for name in sorted_names if name != "alembic_version"]

    processed_rows = 0
    skipped: list[str] = []
    with local_engine.connect() as local, remote_engine.begin() as remote:
        remote.execute(text("SET LOCAL statement_timeout = 0"))
        for name in sorted_names:
            local_table = local_meta.tables[f"public.{name}"]
            remote_table = remote_meta.tables[f"public.{name}"]
            remote_columns = {column.name for column in remote_table.columns if column.computed is None}
            columns = [column for column in local_table.columns if column.name in remote_columns and column.computed is None]
            primary_keys = [column.name for column in remote_table.primary_key.columns]
            if not primary_keys:
                skipped.append(name)
                continue
            if not columns or any(key not in {column.name for column in columns} for key in primary_keys):
                raise RuntimeError(f"Cannot build safe upsert for public.{name}")

            query = select(*columns).execution_options(stream_results=True)
            result = local.execute(query).mappings()
            table_rows = 0
            for batch in chunks((dict(row) for row in result), CHUNK_SIZE):
                statement = insert(remote_table).values(batch)
                update_columns = {
                    column.name: getattr(statement.excluded, column.name)
                    for column in columns
                    if column.name not in primary_keys
                }
                if update_columns:
                    statement = statement.on_conflict_do_update(
                        index_elements=[remote_table.c[key] for key in primary_keys],
                        set_=update_columns,
                    )
                else:
                    statement = statement.on_conflict_do_nothing(
                        index_elements=[remote_table.c[key] for key in primary_keys]
                    )
                remote.execute(statement)
                table_rows += len(batch)
            processed_rows += table_rows
            print(f"UPSERT public.{name}: {table_rows} local rows")

            if len(primary_keys) == 1 and isinstance(remote_table.c[primary_keys[0]].type, Integer):
                key = primary_keys[0]
                remote.execute(
                    text(
                        "SELECT setval(seq, greatest(coalesce((SELECT max(\"" + key + "\") "
                        "FROM public.\"" + name + "\"), 1), 1), true) "
                        "FROM (SELECT pg_get_serial_sequence('public.\"" + name + "\"', '" + key + "')::regclass AS seq) s "
                        "WHERE seq IS NOT NULL"
                    )
                )

        local_version = local.execute(text("SELECT version_num FROM public.alembic_version LIMIT 1")).scalar_one_or_none()
        remote_version = remote.execute(text("SELECT version_num FROM public.alembic_version LIMIT 1")).scalar_one_or_none()
        if local_version != remote_version:
            raise RuntimeError(
                f"Alembic mismatch after upsert (local={local_version}, remote={remote_version}); transaction rolled back"
            )

    print(f"COMMIT: {processed_rows} local rows processed")
    if skipped:
        print("SKIPPED tables without primary key: " + ", ".join(skipped))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
