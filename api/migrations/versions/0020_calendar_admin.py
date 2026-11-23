"""calendar admin (academic_events updated_by/updated_at and semesters teaching_start/teaching_end)

Revision ID: 0020
Revises: 0019
Create Date: 2026-11-22 18:30:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '0020'
down_revision: Union[str, Sequence[str], None] = '0019'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. academic_events: bổ sung updated_by, updated_at
    with op.batch_alter_table('academic_events') as batch_op:
        batch_op.add_column(sa.Column('updated_by', sa.String(length=128), nullable=True))
        batch_op.add_column(sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True))

    # 2. semesters: bổ sung teaching_start, teaching_end lưu DB
    with op.batch_alter_table('semesters') as batch_op:
        batch_op.add_column(sa.Column('teaching_start', sa.Date(), nullable=True))
        batch_op.add_column(sa.Column('teaching_end', sa.Date(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('semesters') as batch_op:
        batch_op.drop_column('teaching_end')
        batch_op.drop_column('teaching_start')

    with op.batch_alter_table('academic_events') as batch_op:
        batch_op.drop_column('updated_at')
        batch_op.drop_column('updated_by')
