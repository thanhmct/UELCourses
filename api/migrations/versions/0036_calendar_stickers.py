"""Add configurable sticker messages for free-day calendar states."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0037"
down_revision: Union[str, Sequence[str], None] = "0036"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    stickers = op.create_table(
        "calendar_stickers",
        sa.Column("event_type", sa.String(length=24), nullable=False),
        sa.Column("sticker_path", sa.String(length=512), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("message_en", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "event_type IN ('special_event', 'holiday', 'exam_week', 'default_free')",
            name="ck_calendar_stickers_event_type",
        ),
        sa.PrimaryKeyConstraint("event_type"),
    )
    op.bulk_insert(
        stickers,
        [
            {
                "event_type": "special_event",
                "sticker_path": "/stickers/03_ket_noi_loa.svg",
                "message": "Chúc bạn có một ngày thật vui!",
                "message_en": "Wishing you a wonderful day!",
            },
            {
                "event_type": "holiday",
                "sticker_path": "/stickers/03_ket_noi_loa.svg",
                "message": "Chúc bạn có kỳ nghỉ thật vui và thư giãn!",
                "message_en": "Enjoy a joyful and relaxing break!",
            },
            {
                "event_type": "exam_week",
                "sticker_path": "/stickers/08_nghien_cuu_doc_sach.svg",
                "message": "Chúc bạn ôn tập hiệu quả và thi thật tốt!",
                "message_en": "Good luck with your revision and exams!",
            },
            {
                "event_type": "default_free",
                "sticker_path": "/stickers/03_ket_noi_loa.svg",
                "message": "Chúc mừng bạn đã được nghỉ ngơi!",
                "message_en": "Enjoy your day off!",
            },
        ],
    )


def downgrade() -> None:
    op.drop_table("calendar_stickers")
