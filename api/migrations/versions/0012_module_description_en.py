"""bilingual module descriptions

Revision ID: 0012
Revises: 0011
Create Date: 2026-11-21 06:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '0012'
down_revision: Union[str, Sequence[str], None] = '0011'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('modules', sa.Column('description_source', sa.String(length=16), nullable=True))
    op.add_column('modules', sa.Column('description_en', sa.Text(), nullable=True))
    op.add_column('modules', sa.Column('description_en_source', sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column('modules', 'description_en_source')
    op.drop_column('modules', 'description_en')
    op.drop_column('modules', 'description_source')
