"""Add user/IP ban fields and review ip_hash for lecturer review moderation."""

import sqlalchemy as sa
from alembic import op

revision = "0033"
down_revision = "0032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("email", sa.String(length=256), nullable=True))
        batch_op.add_column(sa.Column("ban_level", sa.String(length=16), nullable=True))
        batch_op.add_column(sa.Column("ban_reason", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("banned_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("ban_expires_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("ban_cycle_reset_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("ban_notified_email_at", sa.DateTime(timezone=True), nullable=True))

    with op.batch_alter_table("reviews") as batch_op:
        batch_op.add_column(sa.Column("ip_hash", sa.String(length=64), nullable=True))
        batch_op.create_index("ix_reviews_ip_hash", ["ip_hash"], unique=False)

    op.create_table(
        "banned_ips",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("ip_hash", sa.String(length=64), nullable=False),
        sa.Column("level", sa.String(length=16), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lifted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lifted_by", sa.String(length=32), nullable=True),
        sa.Column("related_user_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["related_user_id"],
            ["users.id"],
            name="fk_banned_ips_related_user_id_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_banned_ips_ip_hash", "banned_ips", ["ip_hash"], unique=False)
    op.create_index("ix_banned_ips_related_user_id", "banned_ips", ["related_user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_banned_ips_related_user_id", table_name="banned_ips")
    op.drop_index("ix_banned_ips_ip_hash", table_name="banned_ips")
    op.drop_table("banned_ips")

    with op.batch_alter_table("reviews") as batch_op:
        batch_op.drop_index("ix_reviews_ip_hash")
        batch_op.drop_column("ip_hash")

    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("ban_notified_email_at")
        batch_op.drop_column("ban_cycle_reset_at")
        batch_op.drop_column("ban_expires_at")
        batch_op.drop_column("banned_at")
        batch_op.drop_column("ban_reason")
        batch_op.drop_column("ban_level")
        batch_op.drop_column("email")
