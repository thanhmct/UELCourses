"""outline_assessments.component: varchar(256) -> text (bảng đánh giá lệch cột dồn cả tiêu chí vào ô thành phần; giữ nguyên văn)

Revision ID: 0014
Revises: 0013
Create Date: 2026-11-21 13:40:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '0014'
down_revision: Union[str, Sequence[str], None] = '0013'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("outline_assessments") as batch:
        batch.alter_column("component", existing_type=sa.String(256), type_=sa.Text(), existing_nullable=True)


def downgrade() -> None:
    # Cắt về 256 ký tự (Postgres báo lỗi nếu có giá trị dài hơn).
    with op.batch_alter_table("outline_assessments") as batch:
        batch.alter_column("component", existing_type=sa.Text(), type_=sa.String(256), existing_nullable=True)
