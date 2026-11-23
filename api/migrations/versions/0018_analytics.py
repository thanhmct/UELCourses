"""analytics tables (events, daily, pairs)

Revision ID: 0018
Revises: 0017
Create Date: 2026-11-22 17:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0018'
down_revision: Union[str, Sequence[str], None] = '0017'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    json_type = sa.JSON(none_as_null=True).with_variant(postgresql.JSONB(none_as_null=True), "postgresql")

    # 1. analytics_events
    op.create_table(
        'analytics_events',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('anon_id', sa.String(length=36), nullable=False),
        sa.Column('event_type', sa.String(length=32), nullable=False),
        sa.Column('module_code', sa.String(length=64), nullable=True),
        sa.Column('class_code', sa.String(length=64), nullable=True),
        sa.Column('semester_id', sa.String(length=32), nullable=True),
        sa.Column('program_code', sa.String(length=32), nullable=True),
        sa.Column('query_text', sa.String(length=64), nullable=True),
        sa.Column('filters', json_type, nullable=True),
        sa.Column('page', sa.String(length=128), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_analytics_events_anon_id', 'analytics_events', ['anon_id'], unique=False)
    op.create_index('ix_analytics_events_event_type', 'analytics_events', ['event_type'], unique=False)
    op.create_index('ix_analytics_events_module_code', 'analytics_events', ['module_code'], unique=False)
    op.create_index('ix_analytics_events_semester_id', 'analytics_events', ['semester_id'], unique=False)
    op.create_index('ix_analytics_events_program_code', 'analytics_events', ['program_code'], unique=False)
    op.create_index('ix_analytics_events_created_at', 'analytics_events', ['created_at'], unique=False)
    op.create_index('ix_analytics_events_type_created', 'analytics_events', ['event_type', 'created_at'], unique=False)
    op.create_index('ix_analytics_events_module_created', 'analytics_events', ['module_code', 'created_at'], unique=False)
    op.create_index('ix_analytics_events_anon_sem', 'analytics_events', ['anon_id', 'semester_id'], unique=False)

    # 2. analytics_daily
    op.create_table(
        'analytics_daily',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('day', sa.Date(), nullable=False),
        sa.Column('event_type', sa.String(length=32), nullable=False),
        sa.Column('module_code', sa.String(length=64), nullable=True),
        sa.Column('semester_id', sa.String(length=32), nullable=True),
        sa.Column('program_code', sa.String(length=32), nullable=True),
        sa.Column('count', sa.Integer(), nullable=False, server_default='1'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_analytics_daily_day', 'analytics_daily', ['day'], unique=False)
    op.create_index('ix_analytics_daily_event_type', 'analytics_daily', ['event_type'], unique=False)
    op.create_index('ix_analytics_daily_module_code', 'analytics_daily', ['module_code'], unique=False)
    op.create_index('ix_analytics_daily_semester_id', 'analytics_daily', ['semester_id'], unique=False)
    op.create_index('ix_analytics_daily_program_code', 'analytics_daily', ['program_code'], unique=False)
    op.create_index('ix_analytics_daily_day_type', 'analytics_daily', ['day', 'event_type'], unique=False)
    op.create_index('ix_analytics_daily_module_day', 'analytics_daily', ['module_code', 'day'], unique=False)
    op.create_index('ix_analytics_daily_sem_day', 'analytics_daily', ['semester_id', 'day'], unique=False)

    # 3. analytics_pairs
    op.create_table(
        'analytics_pairs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('semester_id', sa.String(length=32), nullable=False),
        sa.Column('module_a', sa.String(length=64), nullable=False),
        sa.Column('module_b', sa.String(length=64), nullable=False),
        sa.Column('count', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('semester_id', 'module_a', 'module_b', name='uq_analytics_pairs_sem_a_b'),
    )
    op.create_index('ix_analytics_pairs_semester_id', 'analytics_pairs', ['semester_id'], unique=False)
    op.create_index('ix_analytics_pairs_module_a', 'analytics_pairs', ['module_a'], unique=False)
    op.create_index('ix_analytics_pairs_module_b', 'analytics_pairs', ['module_b'], unique=False)
    op.create_index('ix_analytics_pairs_sem_count', 'analytics_pairs', ['semester_id', 'count'], unique=False)


def downgrade() -> None:
    op.drop_table('analytics_pairs')
    op.drop_table('analytics_daily')
    op.drop_table('analytics_events')
