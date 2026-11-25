"""Học kỳ của góp ý học phần (module_comments.semester), dùng để chống góp ý trùng theo học kỳ."""

import sqlalchemy as sa
from alembic import op

revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("module_comments", sa.Column("semester", sa.String(32), nullable=True))
    op.create_index(
        "ix_module_comments_anon_module_sem",
        "module_comments",
        ["anon_id", "module_code", "semester"],
    )


def downgrade() -> None:
    op.drop_index("ix_module_comments_anon_module_sem", table_name="module_comments")
    op.drop_column("module_comments", "semester")
