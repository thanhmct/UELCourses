"""master data assessments and textbooks (Brief D4)

Revision ID: 0022
Revises: 0021
Create Date: 2026-11-22 22:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '0022'
down_revision: Union[str, Sequence[str], None] = '0021'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Bổ sung các cột vào bảng modules
    with op.batch_alter_table('modules') as batch_op:
        batch_op.add_column(sa.Column('final_assessment', sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column('head_lecturer', sa.String(length=512), nullable=True))
        batch_op.add_column(sa.Column('outline_url', sa.Text(), nullable=True))
        batch_op.create_index('ix_modules_final_assessment', ['final_assessment'], unique=False)

    # 2. Tạo bảng module_assessments
    op.create_table(
        'module_assessments',
        sa.Column('module_code', sa.String(length=64), nullable=False),
        sa.Column('process_ratio', sa.Float(), nullable=True),
        sa.Column('process_form', sa.String(length=256), nullable=True),
        sa.Column('midterm_ratio', sa.Float(), nullable=True),
        sa.Column('midterm_form', sa.String(length=256), nullable=True),
        sa.Column('final_ratio', sa.Float(), nullable=True),
        sa.Column('final_form', sa.String(length=256), nullable=True),
        sa.Column('advanced_ratio', sa.Float(), nullable=True),
        sa.Column('advanced_form', sa.String(length=256), nullable=True),
        sa.Column('exam_type', sa.String(length=128), nullable=True),
        sa.Column('exam_duration', sa.String(length=64), nullable=True),
        sa.Column('final_assessment_kind', sa.String(length=64), nullable=True),
        sa.Column('source', sa.String(length=64), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['module_code'], ['modules.code'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('module_code'),
    )
    op.create_index('ix_module_assessments_final_assessment_kind', 'module_assessments', ['final_assessment_kind'], unique=False)

    # 3. Tạo bảng module_textbooks
    op.create_table(
        'module_textbooks',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('module_code', sa.String(length=64), nullable=False),
        sa.Column('name', sa.Text(), nullable=True),
        sa.Column('url', sa.Text(), nullable=True),
        sa.Column('document_code', sa.String(length=128), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('is_main', sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.ForeignKeyConstraint(['module_code'], ['modules.code'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_module_textbooks_module_code', 'module_textbooks', ['module_code'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_module_textbooks_module_code', table_name='module_textbooks')
    op.drop_table('module_textbooks')

    op.drop_index('ix_module_assessments_final_assessment_kind', table_name='module_assessments')
    op.drop_table('module_assessments')

    with op.batch_alter_table('modules') as batch_op:
        batch_op.drop_index('ix_modules_final_assessment')
        batch_op.drop_column('outline_url')
        batch_op.drop_column('head_lecturer')
        batch_op.drop_column('final_assessment')
