"""academic events

Revision ID: 0016
Revises: 0015
Create Date: 2026-11-21 20:30:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0016'
down_revision: Union[str, Sequence[str], None] = '0015'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    json_type = sa.JSON(none_as_null=True).with_variant(postgresql.JSONB(none_as_null=True), "postgresql")

    op.create_table(
        'academic_events',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('academic_year', sa.String(length=16), nullable=False),
        sa.Column('kind', sa.String(length=32), nullable=False),
        sa.Column('title', sa.String(length=512), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('semester_id', sa.String(length=32), nullable=True),
        sa.Column('cohorts', json_type, nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('verified', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('source', sa.String(length=128), nullable=False, server_default='TB 223/TB-ĐHKTL-ĐT'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_academic_events_kind', 'academic_events', ['kind'], unique=False)
    op.create_index('ix_academic_events_year_start', 'academic_events', ['academic_year', 'start_date'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_academic_events_year_start', table_name='academic_events')
    op.drop_index('ix_academic_events_kind', table_name='academic_events')
    op.drop_table('academic_events')
