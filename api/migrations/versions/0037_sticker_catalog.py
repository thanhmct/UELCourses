"""Register mascot sticker assets and repair missing calendar sticker defaults."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0037"
down_revision: Union[str, Sequence[str], None] = "0036"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CALENDAR_STICKERS = (
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
)

STICKER_FILES = (
    "01_mat_truoc.svg",
    "02_mat_sau.svg",
    "03_ket_noi_loa.svg",
    "04_ket_noi_co.svg",
    "05_vuot_troi_may_tinh_bang.svg",
    "06_vuot_troi_laptop.svg",
    "07_nghien_cuu_kinh_lup.svg",
    "08_nghien_cuu_doc_sach.svg",
    "09_tien_phong_cam_co.svg",
    "10_tien_phong_dia_cau.svg",
)


def _insert_missing(table: sa.Table, key: str, rows: tuple[dict, ...]) -> None:
    connection = op.get_bind()
    for row in rows:
        exists = connection.execute(
            sa.select(table.c[key]).where(table.c[key] == row[key])
        ).first()
        if not exists:
            connection.execute(table.insert().values(**row))


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("calendar_stickers"):
        calendar_stickers = op.create_table(
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
    else:
        calendar_stickers = sa.table(
            "calendar_stickers",
            sa.column("event_type", sa.String(length=24)),
            sa.column("sticker_path", sa.String(length=512)),
            sa.column("message", sa.Text()),
            sa.column("message_en", sa.Text()),
        )
    _insert_missing(calendar_stickers, "event_type", CALENDAR_STICKERS)

    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("stickers"):
        stickers = op.create_table(
            "stickers",
            sa.Column("id", sa.String(length=64), nullable=False),
            sa.Column("file_name", sa.String(length=128), nullable=False),
            sa.Column("sticker_path", sa.String(length=512), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("file_name", name="uq_stickers_file_name"),
            sa.UniqueConstraint("sticker_path", name="uq_stickers_sticker_path"),
        )
    else:
        stickers = sa.table(
            "stickers",
            sa.column("id", sa.String(length=64)),
            sa.column("file_name", sa.String(length=128)),
            sa.column("sticker_path", sa.String(length=512)),
        )
    _insert_missing(
        stickers,
        "id",
        tuple(
            {
                "id": file_name.removesuffix(".svg"),
                "file_name": file_name,
                "sticker_path": f"/stickers/{file_name}",
            }
            for file_name in STICKER_FILES
        ),
    )


def downgrade() -> None:
    op.drop_table("stickers")
