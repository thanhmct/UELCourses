"""indexes and constraints (tối ưu truy vấn + chặn dữ liệu sai)

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-21 03:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '0010'
down_revision: Union[str, Sequence[str], None] = '0009'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Danh sách lớp theo học kỳ và gom học kỳ có lớp mở của học phần.
    op.create_index('ix_class_sections_semester_module', 'class_sections', ['semester_id', 'module_code'], unique=False)
    # UNIQUE thường coi NULL là khác nhau: chặn trùng cho lớp chưa rõ học kỳ và quan hệ không gắn chương trình.
    op.create_index('uq_class_code_no_semester', 'class_sections', ['class_code'], unique=True,
                    postgresql_where=sa.text('semester_id IS NULL'), sqlite_where=sa.text('semester_id IS NULL'))
    op.create_index('uq_module_relation_no_program', 'module_relations', ['source', 'target', 'type'], unique=True,
                    postgresql_where=sa.text('program_id IS NULL'), sqlite_where=sa.text('program_id IS NULL'))
    # Ràng buộc dữ liệu buổi học (batch để chạy được cả trên SQLite).
    with op.batch_alter_table('lessons') as batch:
        batch.create_check_constraint('ck_lessons_weekday', 'weekday BETWEEN 2 AND 8')
        batch.create_check_constraint('ck_lessons_period_order', 'end_period >= start_period')
    if op.get_bind().dialect.name == 'postgresql':
        op.execute('ANALYZE')  # cập nhật thống kê cho bộ lập kế hoạch truy vấn sau khi nạp dữ liệu lớn


def downgrade() -> None:
    with op.batch_alter_table('lessons') as batch:
        batch.drop_constraint('ck_lessons_period_order', type_='check')
        batch.drop_constraint('ck_lessons_weekday', type_='check')
    op.drop_index('uq_module_relation_no_program', table_name='module_relations')
    op.drop_index('uq_class_code_no_semester', table_name='class_sections')
    op.drop_index('ix_class_sections_semester_module', table_name='class_sections')
