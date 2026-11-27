"""Scope module assessments and textbooks to admission cohorts."""

import sqlalchemy as sa
from alembic import op

revision = "0036"
down_revision = "0035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("module_assessments") as batch_op:
        batch_op.add_column(sa.Column("applies_to_cohorts", sa.JSON(), nullable=True))
    with op.batch_alter_table("module_textbooks") as batch_op:
        batch_op.add_column(sa.Column("source", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("applies_to_cohorts", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("module_textbooks") as batch_op:
        batch_op.drop_column("applies_to_cohorts")
        batch_op.drop_column("source")
    with op.batch_alter_table("module_assessments") as batch_op:
        batch_op.drop_column("applies_to_cohorts")
