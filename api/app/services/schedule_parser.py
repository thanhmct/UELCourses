"""Chuyển trường `Schedules` của API DKHP UEL thành danh sách buổi học (`lessons`).

Định dạng thật của `Schedules` CHƯA được xác minh. Parser này chịu lỗi và hỗ trợ
nhiều dạng giả định:

* chuỗi: "Thứ 2, Tiết 1-3, Phòng B.101", "T2 (1-3) B.101", "Thứ Hai: tiết 1→3 - P.A1.203",
  "CN, 07:00-09:30, Online", nhiều buổi ngăn bởi ";", xuống dòng, "|" hoặc <br>;
* chuỗi JSON của list/object;
* list chuỗi / list object; object kiểu {"DayOfWeek": 2, "BeginPeriod": 1, "NumberOfPeriods": 3, "RoomName": "B.101"}.

Phần không parse được được giữ nguyên trong `unparsed`, chuỗi gốc trong `raw`.
"""

from __future__ import annotations

import html
import json
import re
import unicodedata
from dataclasses import asdict, dataclass, field
from typing import Any

from app.config import MAX_PERIOD, period_end_time, period_from_time, period_start_time

SUNDAY = 8


@dataclass
class ParsedLesson:
    weekday: int
    start_period: int
    end_period: int
    start_time: str
    end_time: str
    room: str | None = None
    weeks: str | None = None
    raw: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ParseResult:
    lessons: list[ParsedLesson] = field(default_factory=list)
    unparsed: list[str] = field(default_factory=list)
    raw: str | None = None

    @property
    def ok(self) -> bool:
        return bool(self.lessons) and not self.unparsed


# ---------------------------------------------------------------------------
# Chuẩn hóa: bỏ dấu nhưng GIỮ độ dài chuỗi để cắt lại chuỗi gốc theo vị trí.
# ---------------------------------------------------------------------------
def _fold_char(ch: str) -> str:
    if ch in "đĐ":
        return "d"
    base = [c for c in unicodedata.normalize("NFD", ch) if not unicodedata.combining(c)]
    return base[0].lower() if len(base) == 1 else ch.lower()


def _fold(text: str) -> str:
    return "".join(_fold_char(c) for c in text)


_WEEKDAY_WORDS = {
    "2": 2, "hai": 2,
    "3": 3, "ba": 3,
    "4": 4, "tu": 4, "bon": 4,
    "5": 5, "nam": 5,
    "6": 6, "sau": 6,
    "7": 7, "bay": 7,
}
_WEEKDAY_RE = re.compile(
    r"\b(?:thu|t)\s*[:.]?\s*(2|3|4|5|6|7|hai|ba|tu|bon|nam|sau|bay)\b|\b(cn|chu\s*nhat)\b"
)
_RANGE_SEP = r"\s*(?:-|–|—|→|->|~|den|toi)\s*"
_PERIOD_RANGE_RE = re.compile(r"tiet\s*(?:hoc)?\s*[:.]?\s*(\d{1,2})" + _RANGE_SEP + r"(\d{1,2})\b")
_PERIOD_LIST_RE = re.compile(r"tiet\s*(?:hoc)?\s*[:.]?\s*(\d{1,2}(?:\s*,\s*\d{1,2})+)")
_PERIOD_START_RE = re.compile(r"tiet\s*bat\s*dau\s*[:=]?\s*(\d{1,2})")
_PERIOD_COUNT_RE = re.compile(r"so\s*tiet\s*[:=]?\s*(\d{1,2})")
_PERIOD_SINGLE_RE = re.compile(r"tiet\s*[:.]?\s*(\d{1,2})\b")
_BARE_RANGE_RE = re.compile(r"(?<![\d./:])(\d{1,2})\s*(?:-|–|—|→|->|~)\s*(\d{1,2})(?![\d./:])")
_TIME_RANGE_RE = re.compile(r"(\d{1,2})\s*[:h]\s*(\d{2})\s*(?:-|–|—|→|->|~|den)\s*(\d{1,2})\s*[:h]\s*(\d{2})")
_WEEKS_RE = re.compile(r"\btuan\s*(?:hoc)?\s*[:.]?\s*(\d[\d\s,\-–]*)")
_ROOM_PHONG_RE = re.compile(r"\bphong\s*(?:hoc)?\s*[:.]?\s*([^\s,;()]+)")
_ROOM_P_RE = re.compile(r"\bp(?:\.\s*([a-z0-9][\w.\-/]*)|(?::\s*|\s+)([a-z0-9][\w.\-/]*\d[\w.\-/]*))")
_ROOM_HALL_RE = re.compile(r"\bhoi\s*truong(?:\s+[a-z0-9][\w.\-]*)?")
_ROOM_ONLINE_RE = re.compile(r"\b(online|truc\s*tuyen|e-?learning|ms\s*teams|zoom)\b")
_ROOM_CODE_RE = re.compile(r"(?<![\w.])([A-Za-z]{1,2}\d{0,2}[.\-]\d{2,4}[A-Za-z]?)(?![\w])")
_DATE_RE = re.compile(r"\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4}")


def _clean_room(text: str) -> str:
    return text.strip().rstrip(".,;:-)").strip()


def _make_lesson(weekday, start, end, room, weeks, raw, start_time=None, end_time=None) -> ParsedLesson | None:
    if weekday is None or start is None:
        return None
    if end is None:
        end = start
    if start > end:
        start, end = end, start
    if not (1 <= start <= MAX_PERIOD and 1 <= end <= MAX_PERIOD):
        return None
    return ParsedLesson(
        weekday=weekday,
        start_period=start,
        end_period=end,
        start_time=start_time or period_start_time(start),
        end_time=end_time or period_end_time(end),
        room=room or None,
        weeks=weeks or None,
        raw=raw,
    )


def _blank(text: str, span: tuple[int, int]) -> str:
    """Thay đoạn đã dùng bằng khoảng trắng (giữ độ dài)."""
    a, b = span
    return text[:a] + " " * (b - a) + text[b:]


def _parse_weekday_token(value: Any) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        v = int(value)
        if 2 <= v <= 8:
            return v
        if v in (0, 1):  # giả định: 0/1 = Chủ nhật
            return SUNDAY
        return None
    s = str(value).strip()
    if s.isdigit():
        return _parse_weekday_token(int(s))
    m = _WEEKDAY_RE.search(_fold(s))
    if not m:
        return None
    return SUNDAY if m.group(2) else _WEEKDAY_WORDS[m.group(1)]


def parse_segment(segment: str) -> ParsedLesson | None:
    """Parse một buổi học dạng chuỗi. Trả None nếu không đủ thông tin (thứ + tiết)."""
    original = unicodedata.normalize("NFC", segment).strip()
    if not original:
        return None
    work = _fold(original)

    m = _WEEKDAY_RE.search(work)
    if not m:
        return None
    weekday = SUNDAY if m.group(2) else _WEEKDAY_WORDS[m.group(1)]
    work = _blank(work, m.span())

    weeks = None
    m = _WEEKS_RE.search(work)
    if m:
        weeks = re.sub(r"\s+", "", m.group(1)).strip(",-–") or None
        work = _blank(work, m.span())
    for dm in list(_DATE_RE.finditer(work)):
        work = _blank(work, dm.span())

    room = None
    for rx in (_ROOM_PHONG_RE, _ROOM_P_RE):
        m = rx.search(work)
        if m:
            g = next(i for i in range(1, (m.lastindex or 1) + 1) if m.group(i) is not None)
            room = _clean_room(original[m.start(g):m.end(g)])
            work = _blank(work, m.span())
            break
    if room is None:
        m = _ROOM_HALL_RE.search(work)
        if m:
            room = _clean_room(original[m.start():m.end()])
            work = _blank(work, m.span())
    if room is None:
        m = _ROOM_ONLINE_RE.search(work)
        if m:
            room = "Online"
            work = _blank(work, m.span())

    start = end = None
    start_time = end_time = None
    m = _TIME_RANGE_RE.search(work)
    if m:
        h1, m1, h2, m2 = (int(x) for x in m.groups())
        start_time, end_time = f"{h1:02d}:{m1:02d}", f"{h2:02d}:{m2:02d}"
        work = _blank(work, m.span())

    if (m := _PERIOD_RANGE_RE.search(work)) is not None:
        start, end = int(m.group(1)), int(m.group(2))
        work = _blank(work, m.span())
    elif (m := _PERIOD_LIST_RE.search(work)) is not None:
        nums = [int(x) for x in re.findall(r"\d+", m.group(1))]
        start, end = min(nums), max(nums)
        work = _blank(work, m.span())
    elif (m := _PERIOD_START_RE.search(work)) is not None:
        start = int(m.group(1))
        work = _blank(work, m.span())
        c = _PERIOD_COUNT_RE.search(work)
        if c:
            end = start + int(c.group(1)) - 1
            work = _blank(work, c.span())
    elif (m := _PERIOD_SINGLE_RE.search(work)) is not None:
        start = end = int(m.group(1))
        work = _blank(work, m.span())

    if room is None:
        # chỉ nhận mã phòng nằm ở phần chưa dùng (work và original cùng độ dài)
        for m in _ROOM_CODE_RE.finditer(original):
            if work[m.start():m.end()].strip() == _fold(m.group(0)):
                room = m.group(1)
                work = _blank(work, m.span())
                break

    if start is None:
        m = _BARE_RANGE_RE.search(work)
        if m:
            start, end = int(m.group(1)), int(m.group(2))
            work = _blank(work, m.span())

    if start is None and start_time and end_time:
        start = period_from_time(start_time)
        end = period_from_time(end_time, end=True)

    return _make_lesson(weekday, start, end, room, weeks, original, start_time, end_time)


def _split_string(text: str) -> list[str]:
    text = html.unescape(text)
    text = re.sub(r"(?i)<\s*br\s*/?>|</\s*(p|div|li|tr)\s*>", "\n", text)
    text = re.sub(r"<[^>]+>", " ", text)
    parts: list[str] = []
    for chunk in re.split(r"[\n;|]+", text):
        chunk = chunk.strip(" \t\r,")
        if not chunk:
            continue
        # Một đoạn có nhiều "Thứ ..." -> tách tại vị trí mỗi thứ.
        folded = _fold(chunk)
        starts = [m.start() for m in _WEEKDAY_RE.finditer(folded)]
        if len(starts) <= 1:
            parts.append(chunk)
            continue
        bounds = [0, *starts[1:], len(chunk)]
        for a, b in zip(bounds, bounds[1:]):
            piece = chunk[a:b].strip(" \t\r,-")
            if piece:
                parts.append(piece)
    return parts


# --------------------------- dạng object ----------------------------------
def _norm_key(k: str) -> str:
    return re.sub(r"[^a-z0-9]", "", _fold(str(k)))


_KEYS = {
    "weekday": ("dayofweek", "weekday", "day", "thu", "dayname", "thutrongtuan", "studyday", "ngayhoc", "weekdayname"),
    "start": ("beginperiod", "startperiod", "periodid", "fromperiod", "tietbatdau", "periodstart", "start", "begin", "tietbd", "fromlesson", "beginlesson"),
    "end": ("endperiod", "toperiod", "tietketthuc", "periodend", "end", "tietkt", "tolesson", "endlesson"),
    "count": ("numberofperiods", "numperiods", "periodcount", "sotiet", "periods", "numberoflessons", "lessoncount"),
    "period": ("period", "tiet", "lesson", "lessons", "tiethoc"),
    "room": ("roomname", "room", "roomid", "roomcode", "phong", "phonghoc", "location", "venue", "classroom"),
    "weeks": ("weeks", "week", "tuan", "tuanhoc", "studyweeks", "weekstudy"),
    "start_time": ("starttime", "begintime", "timestart", "giobatdau", "fromtime"),
    "end_time": ("endtime", "timeend", "gioketthuc", "totime"),
}


def _pick(d: dict, role: str):
    norm = {_norm_key(k): v for k, v in d.items()}
    for key in _KEYS[role]:
        if key in norm and norm[key] not in (None, ""):
            return norm[key]
    return None


def _to_int(v) -> int | None:
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return int(v)
    m = re.search(r"\d+", str(v))
    return int(m.group()) if m else None


def _hhmm(v) -> str | None:
    if v is None:
        return None
    m = re.search(r"(\d{1,2})[:h](\d{2})", str(v))
    return f"{int(m.group(1)):02d}:{m.group(2)}" if m else None


def _parse_dict(d: dict, result: ParseResult) -> None:
    raw = json.dumps(d, ensure_ascii=False, default=str)
    # Object bọc list, vd {"data": [...]}
    for v in d.values():
        if isinstance(v, list) and v and all(isinstance(x, (dict, str)) for x in v):
            if _pick(d, "weekday") is None:
                _parse_any(v, result)
                return

    # Ưu tiên trường chữ ("Thứ Ba") vì quy ước số DayOfWeek khác nhau giữa các API UEL
    # (portal TKB: 1=Thứ 2 … 7=CN). Với số đơn thuần: 2..8 giữ nguyên, 0/1 = CN (giả định).
    norm = {_norm_key(k): v for k, v in d.items()}
    weekday = None
    for key in ("thu", "dayname", "weekdayname", "ngayhoc"):
        v = norm.get(key)
        if isinstance(v, str) and not v.strip().isdigit():
            weekday = _parse_weekday_token(v)
            if weekday:
                break
    if weekday is None:
        weekday = _parse_weekday_token(_pick(d, "weekday"))
    start = _to_int(_pick(d, "start"))
    end = _to_int(_pick(d, "end"))
    count = _to_int(_pick(d, "count"))
    period = _pick(d, "period")
    if start is None and period is not None:
        nums = [int(x) for x in re.findall(r"\d+", str(period))]
        if nums:
            start, end = min(nums), max(nums)
    if start is not None and end is None and count:
        end = start + count - 1
    room = _pick(d, "room")
    weeks = _pick(d, "weeks")
    if isinstance(weeks, list):
        weeks = ",".join(str(w) for w in weeks)
    st, et = _hhmm(_pick(d, "start_time")), _hhmm(_pick(d, "end_time"))
    if start is None and st and et:
        start, end = period_from_time(st), period_from_time(et, end=True)

    lesson = _make_lesson(
        weekday, start, end,
        str(room).strip() if room is not None else None,
        str(weeks).strip() if weeks is not None else None,
        raw, st, et,
    )
    if lesson:
        result.lessons.append(lesson)
        return
    # Không có trường cấu trúc -> thử ghép các chuỗi trong object rồi parse.
    texts = [str(v) for v in d.values() if isinstance(v, (str, int)) and not isinstance(v, bool)]
    seg = parse_segment(", ".join(texts)) if texts else None
    if seg:
        seg.raw = raw
        result.lessons.append(seg)
    else:
        result.unparsed.append(raw)


def _parse_any(value: Any, result: ParseResult) -> None:
    if value is None:
        return
    if isinstance(value, list):
        for item in value:
            _parse_any(item, result)
        return
    if isinstance(value, dict):
        _parse_dict(value, result)
        return
    text = str(value).strip()
    if not text:
        return
    if text[0] in "[{":
        try:
            _parse_any(json.loads(text), result)
            return
        except (ValueError, TypeError):
            pass
    for seg in _split_string(text):
        lesson = parse_segment(seg)
        if lesson:
            result.lessons.append(lesson)
        else:
            result.unparsed.append(seg)


def parse_schedules(value: Any) -> ParseResult:
    """Điểm vào chính. Không bao giờ ném lỗi."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return ParseResult(raw=None)
    raw = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, default=str)
    result = ParseResult(raw=raw)
    try:
        _parse_any(value, result)
    except Exception:  # noqa: BLE001 — parser phải chịu lỗi
        result.lessons = []
        result.unparsed = [raw]
    # Bỏ trùng (cùng thứ/tiết/phòng/tuần)
    seen, unique = set(), []
    for l in result.lessons:
        key = (l.weekday, l.start_period, l.end_period, l.room, l.weeks)
        if key not in seen:
            seen.add(key)
            unique.append(l)
    result.lessons = unique
    return result
