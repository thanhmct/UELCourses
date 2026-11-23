"""Track shared LLM budgets and anonymous answer ratings."""

import sqlalchemy as sa
from alembic import op

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "rag_call_budget",
        sa.Column("bucket", sa.String(80), primary_key=True),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("calls", sa.Integer(), nullable=False),
    )
    op.create_index("ix_rag_call_budget_day", "rag_call_budget", ["day"])
    op.create_table(
        "rag_answer_feedback",
        sa.Column("answer_id", sa.String(32), primary_key=True),
        sa.Column("scope", sa.String(16), nullable=False),
        sa.Column("helpful", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("rag_answer_feedback")
    op.drop_index("ix_rag_call_budget_day", table_name="rag_call_budget")
    op.drop_table("rag_call_budget")
