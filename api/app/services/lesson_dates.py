"""Nạp lại ngày cụ thể (date_start/date_end) cho buổi học từ `class_sections.schedule_raw`.

Vì sao cần: lịch phòng/thời khóa biểu dựng ngày học từ date_start/date_end. Buổi nào thiếu hai cột này thì giao diện phải suy từ
"tuần học"; nếu không có tuần thì buổi bị lặp lại hằng tuần suốt học kỳ (một buổi học một ngày hiện thành 25 buổi trùng nhau).
Cột ngày mới được thêm sau nên DB cũ (vd SQLite dev) có toàn bộ buổi học chưa có ngày, dù `schedule_raw` vẫn giữ nguyên văn
lịch có khoảng ngày ("Thứ 3, Tiết 7->9, 13/10/2026->13/10/2026, Phòng A.305").

Quy tắc an toàn (không bịa dữ liệu):
- Chỉ đụng tới lớp mà MỌI buổi hiện tại đều chưa có ngày.
- Chỉ thay khi phân tích `schedule_raw` ra được buổi có ngày và KHÔNG còn đoạn buổi học nào không hiểu (không làm mất buổi);
  đoạn ghi chú (không có chữ "tiết") được bỏ qua.
- Lịch kiểu cũ chỉ có "tuần 5-8" (không có ngày trong nguồn) giữ nguyên: giao diện đã tính từ tuần học + ngày bắt đầu học kỳ.
Chạy lại bao nhiêu lần cũng được.
"""

from __future__ import annotations

from collections import Counter
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import ClassSection, Lesson
from app.services.importer import ImportContext, clip
from app.services.schedule_parser import _fold, parse_schedules


def _lesson_like(segment: str) -> bool:
    """Đoạn không phân tích được mà có chữ "tiết" là buổi học thật chưa hiểu; còn lại (vd "*Giảng bằng Tiếng anh") là ghi chú."""
    return "tiet" in _fold(segment).lower()


def backfill_lesson_dates(db: Session, *, dry_run: bool = False) -> dict:
    ctx = ImportContext(db)  # dùng lại quy tắc tạo phòng (venue) của importer
    stats: Counter = Counter()
    sections = db.scalars(
        select(ClassSection).where(ClassSection.schedule_raw.is_not(None)).options(selectinload(ClassSection.lessons))
    ).all()
    for cs in sections:
        stats["classes_with_schedule"] += 1
        res = parse_schedules(cs.schedule_raw)
        dated = [pl for pl in res.lessons if pl.date_start]
        if not dated:
            stats["source_has_no_dates"] += 1  # lịch kiểu cũ: chỉ có tuần học
            continue
        if cs.lessons and all(l.date_start for l in cs.lessons) and len(cs.lessons) >= len(res.lessons):
            stats["already_dated"] += 1
            continue
        if any(_lesson_like(u) for u in res.unparsed):
            # Có đoạn tiết chưa hiểu (vd 5.5, 16–17 chưa có giờ chính thức): KHÔNG thay lớp (tránh mất buổi), chỉ điền ngày cho các
            # buổi hiện có khớp đúng (thứ, tiết, phòng) với đoạn đã hiểu; buổi khác giữ nguyên.
            filled = 0
            for pl in dated:
                for l in cs.lessons:
                    if (not l.date_start and l.weekday == pl.weekday and l.start_period == pl.start_period
                            and int(l.end_period) == int(pl.end_period)  # bản cũ lưu 10 thay vì 10.5
                            and (l.room or None) == (pl.room or None)):
                        l.date_start = date.fromisoformat(pl.date_start)
                        l.date_end = date.fromisoformat(pl.date_end or pl.date_start)
                        filled += 1
                        break
            stats["partially_dated_lessons"] += filled
            stats["classes_with_unsupported_periods"] += 1
            continue
        for pl in res.lessons:
            if pl.room:
                pl.room = ctx.venue(pl.room)
        db.flush()
        stats["lessons_before"] += len(cs.lessons)
        cs.lessons.clear()
        db.flush()
        for pl in res.lessons:
            cs.lessons.append(Lesson(
                weekday=pl.weekday, start_period=pl.start_period, end_period=pl.end_period,
                start_time=pl.start_time, end_time=pl.end_time, room=pl.room,
                weeks=clip(pl.weeks, 256), raw=pl.raw,
                date_start=date.fromisoformat(pl.date_start) if pl.date_start else None,
                date_end=date.fromisoformat(pl.date_end) if pl.date_end else None,
            ))
        stats["lessons_after"] += len(res.lessons)
        stats["classes_updated"] += 1
    if dry_run:
        db.rollback()
    else:
        db.commit()
    return {**stats, "dry_run": dry_run}
