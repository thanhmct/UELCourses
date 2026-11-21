"""outline_documents: cột OCR để làm sau (ocr_status, ocr_text, ocr_engine, ocr_at)

PDF scan (không có lớp chữ) được đánh dấu ocr_status='pending' để OCR khi rảnh. Bản OCR chạy thử ngày 2026-11-21
(12 file, Tesseract vie+eng) được chuyển từ `text` sang `ocr_text`; `text` của các file này trả về NULL /
text_status='needs_ocr' để không lẫn vào dữ liệu đã phân tích cho tới khi chủ dự án làm OCR chính thức.

Revision ID: 0015
Revises: 0014
Create Date: 2026-11-21 20:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '0015'
down_revision: Union[str, Sequence[str], None] = '0014'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("outline_documents") as batch:
        batch.add_column(sa.Column("ocr_status", sa.String(16), nullable=True))
        batch.add_column(sa.Column("ocr_text", sa.Text(), nullable=True))
        batch.add_column(sa.Column("ocr_engine", sa.String(64), nullable=True))
        batch.add_column(sa.Column("ocr_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_outline_documents_ocr_status", "outline_documents", ["ocr_status"], unique=False)
    # bản OCR chạy thử -> ocr_text (giữ lại, chưa dùng); tài liệu trở về trạng thái chờ OCR
    op.execute("""
        update outline_documents
           set ocr_text = text, ocr_engine = 'tesseract vie+eng psm4 300dpi (chạy thử)', ocr_at = extracted_at,
               text = null, text_chars = null, text_method = null, text_status = 'needs_ocr'
         where text_method = 'ocr_tesseract'
    """)
    op.execute("update outline_documents set ocr_status = 'pending' where text_status = 'needs_ocr'")


def downgrade() -> None:
    op.execute("""
        update outline_documents
           set text = ocr_text, text_chars = length(ocr_text), text_method = 'ocr_tesseract', text_status = 'extracted'
         where ocr_text is not null and text is null
    """)
    op.drop_index("ix_outline_documents_ocr_status", table_name="outline_documents")
    with op.batch_alter_table("outline_documents") as batch:
        batch.drop_column("ocr_at")
        batch.drop_column("ocr_engine")
        batch.drop_column("ocr_text")
        batch.drop_column("ocr_status")
