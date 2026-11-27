from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CalendarSticker, StickerAsset


DEFAULT_CALENDAR_STICKERS = (
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

STICKER_ASSETS = tuple(
    {
        "id": file_name.removesuffix(".svg"),
        "file_name": file_name,
        "sticker_path": f"/stickers/{file_name}",
    }
    for file_name in (
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
)


def ensure_calendar_sticker_defaults(db: Session) -> None:
    """Add missing built-in sticker records without overwriting database edits."""
    existing = set(db.scalars(select(CalendarSticker.event_type)))
    missing = [row for row in DEFAULT_CALENDAR_STICKERS if row["event_type"] not in existing]
    if missing:
        db.add_all(CalendarSticker(**row) for row in missing)
        db.commit()


def ensure_sticker_assets(db: Session) -> None:
    """Register every bundled sticker asset without overwriting existing rows."""
    existing = set(db.scalars(select(StickerAsset.id)))
    missing = [row for row in STICKER_ASSETS if row["id"] not in existing]
    if missing:
        db.add_all(StickerAsset(**row) for row in missing)
        db.commit()
