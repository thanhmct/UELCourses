"""moderation tables and columns (module_comments, banned_terms, feedback status)

Revision ID: 0019
Revises: 0018
Create Date: 2026-11-22 18:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0019'
down_revision: Union[str, Sequence[str], None] = '0018'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    json_type = sa.JSON(none_as_null=True).with_variant(postgresql.JSONB(none_as_null=True), "postgresql")

    # 1. module_comments
    op.create_table(
        'module_comments',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('module_code', sa.String(length=64), nullable=False),
        sa.Column('anon_id', sa.String(length=36), nullable=True),
        sa.Column('student_id', sa.Integer(), nullable=True),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('rating', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(length=16), nullable=False, server_default='pending'),
        sa.Column('flag_reasons', json_type, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('moderated_by', sa.String(length=128), nullable=True),
        sa.Column('moderated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('moderation_note', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_module_comments_module_code', 'module_comments', ['module_code'], unique=False)
    op.create_index('ix_module_comments_status', 'module_comments', ['status'], unique=False)
    op.create_index('ix_module_comments_anon_id', 'module_comments', ['anon_id'], unique=False)
    op.create_index('ix_module_comments_created_at', 'module_comments', ['created_at'], unique=False)
    op.create_index('ix_module_comments_module_status', 'module_comments', ['module_code', 'status'], unique=False)

    # 2. banned_terms
    op.create_table(
        'banned_terms',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('term', sa.String(length=128), nullable=False),
        sa.Column('severity', sa.String(length=16), nullable=False, server_default='flag'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('term', name='uq_banned_terms_term'),
    )
    op.create_index('ix_banned_terms_term', 'banned_terms', ['term'], unique=True)

    # 3. Alter table feedback
    with op.batch_alter_table('feedback') as batch_op:
        batch_op.add_column(sa.Column('status', sa.String(length=16), nullable=False, server_default='pending'))
        batch_op.add_column(sa.Column('moderated_by', sa.String(length=128), nullable=True))
        batch_op.add_column(sa.Column('moderated_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column('moderation_note', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('flag_reasons', json_type, nullable=True))
        batch_op.create_index('ix_feedback_status', ['status'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('feedback') as batch_op:
        batch_op.drop_index('ix_feedback_status')
        batch_op.drop_column('flag_reasons')
        batch_op.drop_column('moderation_note')
        batch_op.drop_column('moderated_at')
        batch_op.drop_column('moderated_by')
        batch_op.drop_column('status')

    op.drop_table('banned_terms')
    op.drop_table('module_comments')
