"""system admin: admin_users and admin_sessions

Revision ID: 0021
Revises: 0020
Create Date: 2026-11-22 19:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '0021'
down_revision: Union[str, Sequence[str], None] = '0020'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Tạo bảng admin_users
    op.create_table(
        'admin_users',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('email', sa.String(length=256), nullable=False),
        sa.Column('password_hash', sa.String(length=256), nullable=False),
        sa.Column('role', sa.String(length=32), server_default='admin', nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column('failed_attempts', sa.Integer(), server_default='0', nullable=False),
        sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email', name='uq_admin_users_email'),
    )
    op.create_index('ix_admin_users_email', 'admin_users', ['email'], unique=False)
    op.create_index('ix_admin_users_role', 'admin_users', ['role'], unique=False)

    # 2. Tạo bảng admin_sessions
    op.create_table(
        'admin_sessions',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('token_hash', sa.String(length=128), nullable=False),
        sa.Column('csrf_token_hash', sa.String(length=128), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('ip_hash', sa.String(length=64), nullable=True),
        sa.Column('user_agent', sa.String(length=512), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['admin_users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_admin_sessions_user_id', 'admin_sessions', ['user_id'], unique=False)
    op.create_index('ix_admin_sessions_token_hash', 'admin_sessions', ['token_hash'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_admin_sessions_token_hash', table_name='admin_sessions')
    op.drop_index('ix_admin_sessions_user_id', table_name='admin_sessions')
    op.drop_table('admin_sessions')

    op.drop_index('ix_admin_users_role', table_name='admin_users')
    op.drop_index('ix_admin_users_email', table_name='admin_users')
    op.drop_table('admin_users')
