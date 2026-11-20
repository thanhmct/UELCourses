"""Import thời khóa biểu cá nhân xuất từ portal UEL
(GET portal.uel.edu.vn/backend/api/student/DrawingSchedules_v2?namhoc=&hocky=&tuan=).

Định dạng: {source, fetched_at, time_schedule, weeks[], sessions[]} hoặc trực tiếp list sessions.
Mỗi session là MỘT buổi của MỘT tuần; ta gộp các tuần của cùng ScheduleStudyUnitID thành
một lớp học phần với lessons[] + weeks.

KHÔNG lưu các trường cá nhân (ClassStudent, Address, ...).
"""

from __future__ import annotations

import html
import math
import re
from collections import defaultdict
from datetime import date

from sqlalchemy.orm import Session

from app.config import MAX_PERIOD, period_end_time, period_start_time
from app.schemas import ImportResult
from app.services.importer import (
    ImportContext,
    ImportFormatError,
    clip,
    get_ci,
    semester_from_class_code,
    semester_from_year_term,
    to_date,
    to_float,
    to_int,
)
from app.services.schedule_parser import SUNDAY, ParsedLesson, _parse_weekday_token


def extract_sessions(payload) -> list[dict]:
    if isinstance(payload, dict):
        sessions = payload.get("sessions")
        if sessions is None:
            for k in ("data", "Data", "items"):
                if isinstance(payload.get(k), list):
                    sessions = payload[k]
                    break
        payload = sessions
    if not isinstance(payload, list):
        raise ImportFormatError("Không tìm thấy danh sách 'sessions' trong file TKB portal.")
    return [s for s in payload if isinstance(s, dict)]


def session_weekday(s: dict) -> int | None:
    """Ưu tiên trường chữ (Thu="Thứ Ba", DayName="Thứ 3"). Dữ liệu thật: DayOfWeek 1=Thứ Hai … 7=Chủ nhật
    (đã đối chiếu với trường Thu); 0 cũng coi là Chủ nhật."""
    for key in ("Thu", "DayName"):
        v = s.get(key)
        if isinstance(v, str) and v.strip():
            wd = _parse_weekday_token(v)
            if wd:
                return wd
    d = to_int(s.get("DayOfWeek"))
    if d is None:
        return None
    if 1 <= d <= 6:
        return d + 1
    if d in (0, 7):
        return SUNDAY
    return None


def _hhmm(v) -> str | None:
    m = re.search(r"(\d{1,2})\s*[:hH]\s*(\d{2})", str(v or ""))
    return f"{int(m.group(1)):02d}:{m.group(2)}" if m else None


def session_periods(s: dict) -> tuple[int, int] | None:
    m = re.match(r"\s*(\d{1,2})\s*-\s*(\d{1,2})", str(s.get("CaHoc") or s.get("PeriodName", "")).replace("Tiết", ""))
    if m:
        a, b = int(m.group(1)), int(m.group(2))
    else:
        a = to_int(s.get("PeriodID"))
        n = to_float(s.get("NumberOfPeriods"))
        if a is None:
            return None
        b = a + max(1, math.ceil(n or 1)) - 1  # NumberOfPeriods có thể lẻ (4.5 -> 5 tiết)
    if not (1 <= a <= b <= MAX_PERIOD):
        return None
    return a, b


def session_room(s: dict) -> str | None:
    raw = s.get("RoomID") or s.get("RoomName")
    if not raw:
        return None
    first = re.split(r"<[^>]*>", html.unescape(str(raw)))[0].strip()
    return first or None


_CODE_IN_HTML = re.compile(r"\(([A-Za-z0-9]+)\)\s*</span>")


def module_code_for(s: dict) -> str | None:
    """Giả định: không có CurriculumID -> lấy mã trong TKHHienThi ("Tên (KT49)</span>");
    nếu không có thì bỏ 3 số đầu (năm+HK) và hậu tố GroupName khỏi ScheduleStudyUnitID
    (222KT4913, nhóm 13 -> KT49). Hai cách khớp 100% trên dữ liệu thật đã kiểm tra."""
    if code := get_ci(s, "CurriculumID", "CurriculumCode"):
        return str(code).strip()
    if m := _CODE_IN_HTML.findall(str(s.get("TKHHienThi") or "")):
        return m[-1]
    sid = str(s.get("ScheduleStudyUnitID") or "").strip()
    if not sid:
        return None
    core = re.sub(r"^\d{3}(?=[A-Za-z])", "", sid)
    group = str(s.get("GroupName") or "").strip()
    if group and core.endswith(group) and len(core) > len(group):
        core = core[: -len(group)]
    return core or sid


def compress_weeks(weeks: set[int]) -> str:
    out, items = [], sorted(weeks)
    i = 0
    while i < len(items):
        j = i
        while j + 1 < len(items) and items[j + 1] == items[j] + 1:
            j += 1
        out.append(str(items[i]) if i == j else f"{items[i]}-{items[j]}")
        i = j + 1
    return ",".join(out)


def import_portal_timetable(db: Session, payload) -> ImportResult:
    sessions = extract_sessions(payload)
    ctx = ImportContext(db, source="portal")

    # Tuần 1 của mỗi học kỳ = thứ Hai sớm nhất (StartDate) trong học kỳ đó (giả định).
    by_class: dict[tuple[str, str | None], list[dict]] = defaultdict(list)
    sem_first_week: dict[str, date] = {}
    for s in sessions:
        cid = clip(s.get("ScheduleStudyUnitID"), 128)
        if not cid:
            ctx.skipped += 1
            continue
        sem_id = semester_from_year_term(s.get("YearStudy"), s.get("TermID")) or semester_from_class_code(cid)
        by_class[(cid, sem_id)].append(s)
        wk = to_date(s.get("StartDate")) or to_date(s.get("Date"))
        if sem_id and wk and (sem_id not in sem_first_week or wk < sem_first_week[sem_id]):
            sem_first_week[sem_id] = wk

    for (cid, sem_id), items in sorted(by_class.items(), key=lambda kv: (kv[0][1] or "", kv[0][0])):
        first = items[0]
        code = module_code_for(first)
        if not code:
            ctx.skipped += 1
            continue
        name = clip(first.get("CurriculumName"), 512) or code
        ctx.module(code, name=name, credits=to_int(first.get("Credits")), is_english=name.rstrip().endswith("(E)"))
        dates = [d for s in items if (d := to_date(s.get("Date")))]
        if sem_id:
            ctx.semester(sem_id, sem_first_week.get(sem_id), max(dates) if dates else None)

        groups: dict[tuple, set[int]] = defaultdict(set)
        bad = 0
        for s in items:
            wd, per = session_weekday(s), session_periods(s)
            if wd is None or per is None:
                bad += 1
                continue
            st = _hhmm(s.get("GioHocBatDau")) or period_start_time(per[0])
            et = _hhmm(s.get("GioHocKetThuc")) or period_end_time(per[1])
            key = (wd, per[0], per[1], st, et, session_room(s))
            wk = to_date(s.get("StartDate")) or to_date(s.get("Date"))
            base = sem_first_week.get(sem_id) if sem_id else None
            if wk and base:
                groups[key].add((wk - base).days // 7 + 1)
            else:
                groups[key]
        if bad:
            ctx.unparsed += 1
            ctx.warnings.append(f"{cid}: {bad} buổi thiếu thứ/tiết")
        lessons = [
            ParsedLesson(weekday=k[0], start_period=k[1], end_period=k[2], start_time=k[3], end_time=k[4],
                         room=k[5], weeks=compress_weeks(w) if w else None,
                         raw=f"{len(w)} tuần" if w else None)
            for k, w in sorted(groups.items(), key=lambda kv: (kv[0][0], kv[0][1], min(kv[1] or {0})))
        ]
        lecturer = next((str(s["ProfessorName"]).strip() for s in items if str(s.get("ProfessorName") or "").strip()), None)
        ctx.upsert_class(
            code, cid, sem_id, lessons,
            schedule_raw="; ".join(f"Thứ {l.weekday if l.weekday < 8 else 'CN'}, tiết {l.start_period}-{l.end_period}"
                                   f"{', ' + l.room if l.room else ''}{', tuần ' + l.weeks if l.weeks else ''}"
                                   for l in lessons) or None,
            lecturer=clip(lecturer, 512), start_date=min(dates) if dates else None,
            end_date=max(dates) if dates else None,
        )
    return ctx.result()
