"""Correct the bilingual name of BMA2045 and index English course names."""

import sqlalchemy as sa
from alembic import op

from app.services.text import normalize_search

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    modules = sa.table(
        "modules", sa.column("code"), sa.column("name"), sa.column("name_en"),
        sa.column("name_en_source"), sa.column("faculty"), sa.column("department"),
        sa.column("search_text"),
    )
    connection = op.get_bind()
    connection.execute(modules.update().where(modules.c.code == "BMA2045").values(
        name="Nhập môn Phân tích dữ liệu",
        name_en="Introduction to Data Analytics",
        name_en_source=None,
    ))
    rows = connection.execute(sa.select(
        modules.c.code, modules.c.name, modules.c.name_en, modules.c.faculty,
        modules.c.department, modules.c.search_text,
    ).where(modules.c.name_en.is_not(None))).all()
    updates = []
    for row in rows:
        search_text = normalize_search(
            f"{row.code} {row.name} {row.name_en or ''} {row.faculty or ''} {row.department or ''}"
        )
        if search_text != row.search_text:
            updates.append({"module_code": row.code, "bilingual_text": search_text})
    if updates:
        connection.execute(
            modules.update().where(modules.c.code == sa.bindparam("module_code"))
            .values(search_text=sa.bindparam("bilingual_text")),
            updates,
        )


def downgrade() -> None:
    # The verified names and search text are valid in both schema revisions.
    pass
