"""module english names

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-21 02:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '0009'
down_revision: Union[str, Sequence[str], None] = '0008'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('modules', sa.Column('name_en', sa.String(length=512), nullable=True))
    op.add_column('modules', sa.Column('name_en_source', sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column('modules', 'name_en_source')
    op.drop_column('modules', 'name_en')
