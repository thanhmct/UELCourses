"""Add quick-rating tracking columns to feedback."""

import sqlalchemy as sa
from alembic import op

revision = "0032"
down_revision = "0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("feedback") as batch_op:
        batch_op.add_column(sa.Column("rater_ip_hash", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("account_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("is_quick_rating", sa.Boolean(), server_default=sa.false(), nullable=False))
        batch_op.create_foreign_key(
            "fk_feedback_account_id_users", "users", ["account_id"], ["id"], ondelete="SET NULL"
        )
        batch_op.create_index("ix_feedback_rater_ip_hash", ["rater_ip_hash"], unique=False)
        batch_op.create_index("ix_feedback_account_id", ["account_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("feedback") as batch_op:
        batch_op.drop_index("ix_feedback_account_id")
        batch_op.drop_index("ix_feedback_rater_ip_hash")
        batch_op.drop_constraint("fk_feedback_account_id_users", type_="foreignkey")
        batch_op.drop_column("is_quick_rating")
        batch_op.drop_column("account_id")
        batch_op.drop_column("rater_ip_hash")
