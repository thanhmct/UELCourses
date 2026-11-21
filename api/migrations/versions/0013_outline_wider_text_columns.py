"""đề cương: nới các cột chuỗi ngắn (varchar(32)) — Postgres từ chối giá trị dài hơn, SQLite thì không

Ví dụ cohort_range của đề cương Luật: "2023 – 2027, 2024 – 2028, 2025 - 2029" (37 ký tự) làm cả lượt parse-outlines chết ở lần commit đầu.

Revision ID: 0013
Revises: 0012
Create Date: 2026-11-21 13:10:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '0013'
down_revision: Union[str, Sequence[str], None] = '0012'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (bảng, cột, độ dài cũ, độ dài mới)
COLUMNS = [
    ("outline_courses", "cohort_range", 32, 128),
    ("outline_courses", "academic_year", 32, 64),
    ("outline_courses", "term", 32, 64),
    ("outline_objectives", "competency_level", 32, 128),
    ("outline_clos", "teaching_levels", 32, 128),
    ("outline_schedule", "week_label", 32, 128),
]


def upgrade() -> None:
    for table, col, old, new in COLUMNS:
        with op.batch_alter_table(table) as batch:
            batch.alter_column(col, existing_type=sa.String(old), type_=sa.String(new), existing_nullable=True)


def downgrade() -> None:
    # Có thể làm lỗi nếu đã có giá trị dài hơn độ dài cũ.
    for table, col, old, new in COLUMNS:
        with op.batch_alter_table(table) as batch:
            batch.alter_column(col, existing_type=sa.String(new), type_=sa.String(old), existing_nullable=True)
