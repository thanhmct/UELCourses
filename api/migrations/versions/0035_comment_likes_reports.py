"""Add like_count on module_comments, plus comment_likes and comment_reports tables."""

import sqlalchemy as sa
from alembic import op

revision = "0035"
down_revision = "0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("module_comments") as batch_op:
        batch_op.add_column(sa.Column("like_count", sa.Integer(), nullable=False, server_default="0"))

    op.create_table(
        "comment_likes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("comment_id", sa.Integer(), nullable=False),
        sa.Column("anon_id", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["comment_id"],
            ["module_comments.id"],
            name="fk_comment_likes_comment_id_module_comments",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("comment_id", "anon_id", name="uq_comment_likes_comment_anon"),
    )
    op.create_index("ix_comment_likes_comment_id", "comment_likes", ["comment_id"], unique=False)

    op.create_table(
        "comment_reports",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("comment_id", sa.Integer(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("ip_hash", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["comment_id"],
            ["module_comments.id"],
            name="fk_comment_reports_comment_id_module_comments",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_comment_reports_comment_id", "comment_reports", ["comment_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_comment_reports_comment_id", table_name="comment_reports")
    op.drop_table("comment_reports")

    op.drop_index("ix_comment_likes_comment_id", table_name="comment_likes")
    op.drop_table("comment_likes")

    with op.batch_alter_table("module_comments") as batch_op:
        batch_op.drop_column("like_count")
