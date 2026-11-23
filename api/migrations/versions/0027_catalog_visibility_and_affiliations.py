"""Hide AGU catalog entries and apply verified course affiliations."""

import sqlalchemy as sa
from alembic import op

from app.services.text import normalize_search

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None

_AFFILIATIONS = {
    **{code: ("Phòng Bảo đảm chất lượng", "Bộ môn Ngoại ngữ") for code in (
        "ADD00031", "ADD00032", "ADD00033", "ADD00034",
    )},
    **{code: ("Phòng Đào tạo", "Phòng Đào tạo") for code in (
        "BAA00021", "BAA00022", "BAA00030",
    )},
}


def upgrade() -> None:
    op.add_column("modules", sa.Column("is_hidden", sa.Boolean(), server_default=sa.false(), nullable=False))
    modules = sa.table(
        "modules", sa.column("code"), sa.column("name"), sa.column("name_en"),
        sa.column("faculty"), sa.column("department"), sa.column("faculty_source"),
        sa.column("search_text"), sa.column("is_hidden", sa.Boolean()),
    )
    conn = op.get_bind()
    conn.execute(modules.update().where(modules.c.code.in_(("COS101", "PHT121"))).values(is_hidden=True))
    for row in conn.execute(sa.select(modules.c.code, modules.c.name, modules.c.name_en).where(
        modules.c.code.in_(_AFFILIATIONS)
    )):
        faculty, department = _AFFILIATIONS[row.code]
        conn.execute(modules.update().where(modules.c.code == row.code).values(
            faculty=faculty,
            department=department,
            faculty_source="override",
            search_text=normalize_search(f"{row.code} {row.name} {row.name_en or ''} {faculty} {department}"),
        ))


def downgrade() -> None:
    op.drop_column("modules", "is_hidden")
