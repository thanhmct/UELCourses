"""degree level for programs and modules (Brief D6)

Revision ID: 0023
Revises: 0022
Create Date: 2026-11-23 00:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '0023'
down_revision: Union[str, Sequence[str], None] = '0022'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Bổ sung cột degree vào bảng programs
    with op.batch_alter_table('programs') as batch_op:
        batch_op.add_column(
            sa.Column('degree', sa.String(length=16), server_default='dai_hoc', nullable=False)
        )
        batch_op.create_index('ix_programs_degree', ['degree'], unique=False)

    # 2. Bổ sung cột degree vào bảng modules
    with op.batch_alter_table('modules') as batch_op:
        batch_op.add_column(
            sa.Column('degree', sa.String(length=16), server_default='dai_hoc', nullable=False)
        )
        batch_op.create_index('ix_modules_degree', ['degree'], unique=False)


def downgrade() -> None:
    # 1. Xóa cột degree khỏi bảng modules
    with op.batch_alter_table('modules') as batch_op:
        batch_op.drop_index('ix_modules_degree')
        batch_op.drop_column('degree')

    # 2. Xóa cột degree khỏi bảng programs
    with op.batch_alter_table('programs') as batch_op:
        batch_op.drop_index('ix_programs_degree')
        batch_op.drop_column('degree')
