"""outlines by ctdt year and source format (Brief D5)

Revision ID: 0025
Revises: 0024
Create Date: 2026-11-23 02:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0025"
down_revision: Union[str, Sequence[str], None] = "0024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Bổ sung ctdt_year và source_format vào outline_documents
    with op.batch_alter_table("outline_documents") as batch_op:
        batch_op.add_column(sa.Column("ctdt_year", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("source_format", sa.String(length=16), server_default="pdf", nullable=True))
        batch_op.create_index("ix_outline_documents_ctdt_year", ["ctdt_year"], unique=False)
        batch_op.create_index("ix_outline_documents_source_format", ["source_format"], unique=False)

    # Đặt ctdt_year = 2025 và source_format = 'pdf' cho dữ liệu hiện có
    bind = op.get_bind()
    bind.execute(sa.text("UPDATE outline_documents SET ctdt_year = 2025 WHERE ctdt_year IS NULL"))
    bind.execute(sa.text("UPDATE outline_documents SET source_format = 'pdf' WHERE source_format IS NULL"))

    # 2. Bổ sung ctdt_year vào outline_module_links và cập nhật ràng buộc unique
    with op.batch_alter_table("outline_module_links") as batch_op:
        batch_op.add_column(sa.Column("ctdt_year", sa.Integer(), nullable=True))
        batch_op.create_index("ix_outline_module_links_ctdt_year", ["ctdt_year"], unique=False)
        batch_op.create_index("ix_outline_module_links_module_year", ["module_code", "ctdt_year"], unique=False)
        # Model dùng String(32) (giá trị như 'ctdt2023_docx'); bản đầu của bảng là String(16).
        batch_op.alter_column("source", existing_type=sa.String(length=16), type_=sa.String(length=32), existing_nullable=False)

    bind.execute(sa.text("UPDATE outline_module_links SET ctdt_year = 2025 WHERE ctdt_year IS NULL"))

    # Đổi unique constraint cho phép cùng module_code có nhiều đề cương theo năm
    with op.batch_alter_table("outline_module_links") as batch_op:
        try:
            batch_op.drop_constraint("uq_outline_module_link", type_="unique")
        except Exception:
            pass
        batch_op.create_unique_constraint(
            "uq_outline_module_link", ["document_id", "module_code", "ctdt_year"]
        )


def downgrade() -> None:
    # 1. Revert outline_module_links
    with op.batch_alter_table("outline_module_links") as batch_op:
        try:
            batch_op.drop_constraint("uq_outline_module_link", type_="unique")
        except Exception:
            pass
        batch_op.create_unique_constraint("uq_outline_module_link", ["document_id", "module_code"])
        batch_op.drop_index("ix_outline_module_links_module_year")
        batch_op.drop_index("ix_outline_module_links_ctdt_year")
        batch_op.drop_column("ctdt_year")

    # 2. Revert outline_documents
    with op.batch_alter_table("outline_documents") as batch_op:
        batch_op.drop_index("ix_outline_documents_source_format")
        batch_op.drop_index("ix_outline_documents_ctdt_year")
        batch_op.drop_column("source_format")
        batch_op.drop_column("ctdt_year")
