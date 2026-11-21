"""chỉ mục còn thiếu: khóa ngoại import_run_id và tra cứu PDF theo tên file

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-21 12:00:00

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '0011'
down_revision: Union[str, Sequence[str], None] = '0010'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Khóa ngoại không có chỉ mục -> xóa import_runs lúc nào cũng quét toàn bảng program_catalog_entries.
    op.create_index('ix_program_catalog_entries_import_run_id', 'program_catalog_entries', ['import_run_id'], unique=False)
    # Importer và tra cứu đề cương theo tên file (tên file không trùng trong dữ liệu hiện tại).
    op.create_index('ix_outline_documents_file_name', 'outline_documents', ['file_name'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_outline_documents_file_name', table_name='outline_documents')
    op.drop_index('ix_program_catalog_entries_import_run_id', table_name='program_catalog_entries')
