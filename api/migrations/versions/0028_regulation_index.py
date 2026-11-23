"""Persist the regulations RAG snapshot in the existing regulation tables."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None

json_type = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    op.add_column("regulation_documents", sa.Column("rag_metadata", json_type))
    op.add_column("regulation_documents", sa.Column("rag_articles", json_type))
    op.add_column("regulation_chunks", sa.Column("rag_metadata", json_type))
    op.create_table(
        "regulation_index_state",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("version", sa.String(64), nullable=False),
        sa.Column("stats", json_type, nullable=False),
    )


def downgrade() -> None:
    op.drop_table("regulation_index_state")
    op.drop_column("regulation_chunks", "rag_metadata")
    op.drop_column("regulation_documents", "rag_articles")
    op.drop_column("regulation_documents", "rag_metadata")
