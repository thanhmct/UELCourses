"""Add public nickname for users and author_name snapshot for module comments."""

import sqlalchemy as sa
from alembic import op

revision = "0034"
down_revision = "0033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("nickname", sa.String(length=40), nullable=True))
    with op.batch_alter_table("module_comments") as batch_op:
        batch_op.add_column(sa.Column("author_name", sa.String(length=40), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("module_comments") as batch_op:
        batch_op.drop_column("author_name")
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("nickname")
