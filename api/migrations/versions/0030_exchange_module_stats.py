"""Thống kê sinh viên trao đổi đã học từng học phần theo học kỳ."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "exchange_module_stats",
        sa.Column("module_code", sa.String(64), primary_key=True),
        sa.Column("semester_id", sa.String(32), primary_key=True),
        sa.Column("student_count", sa.Integer(), nullable=False),
        sa.Column(
            "class_codes",
            sa.JSON(none_as_null=True).with_variant(postgresql.JSONB(none_as_null=True, astext_type=sa.Text()), "postgresql"),
            nullable=True,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_exchange_module_stats_semester", "exchange_module_stats", ["semester_id"])


def downgrade() -> None:
    op.drop_index("ix_exchange_module_stats_semester", table_name="exchange_module_stats")
    op.drop_table("exchange_module_stats")
