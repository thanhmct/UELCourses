"""admin audit log and settings

Revision ID: 0017
Revises: 0016
Create Date: 2026-11-22 15:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0017'
down_revision: Union[str, Sequence[str], None] = '0016'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    json_type = sa.JSON(none_as_null=True).with_variant(postgresql.JSONB(none_as_null=True), "postgresql")

    # 1. audit_log
    op.create_table(
        'audit_log',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('actor_type', sa.String(length=16), nullable=False),
        sa.Column('actor_id', sa.String(length=128), nullable=True),
        sa.Column('action', sa.String(length=64), nullable=False),
        sa.Column('entity_type', sa.String(length=64), nullable=True),
        sa.Column('entity_id', sa.String(length=128), nullable=True),
        sa.Column('before', json_type, nullable=True),
        sa.Column('after', json_type, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_audit_log_actor_type', 'audit_log', ['actor_type'], unique=False)
    op.create_index('ix_audit_log_action', 'audit_log', ['action'], unique=False)
    op.create_index('ix_audit_log_created_at', 'audit_log', ['created_at'], unique=False)
    op.create_index('ix_audit_log_actor', 'audit_log', ['actor_type', 'actor_id'], unique=False)
    op.create_index('ix_audit_log_entity', 'audit_log', ['entity_type', 'entity_id'], unique=False)

    # 2. admin_settings
    op.create_table(
        'admin_settings',
        sa.Column('key', sa.String(length=64), nullable=False),
        sa.Column('value', json_type, nullable=True),
        sa.Column('updated_by', sa.String(length=128), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('key'),
    )

    # 3. modules faculty_source columns
    with op.batch_alter_table("modules") as batch:
        batch.add_column(sa.Column('faculty_source', sa.String(length=32), nullable=True))
        batch.add_column(sa.Column('faculty_set_by', sa.String(length=128), nullable=True))
        batch.add_column(sa.Column('faculty_set_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("modules") as batch:
        batch.drop_column('faculty_set_at')
        batch.drop_column('faculty_set_by')
        batch.drop_column('faculty_source')

    op.drop_table('admin_settings')

    op.drop_index('ix_audit_log_entity', table_name='audit_log')
    op.drop_index('ix_audit_log_actor', table_name='audit_log')
    op.drop_index('ix_audit_log_created_at', table_name='audit_log')
    op.drop_index('ix_audit_log_action', table_name='audit_log')
    op.drop_index('ix_audit_log_actor_type', table_name='audit_log')
    op.drop_table('audit_log')
