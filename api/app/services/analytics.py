from __future__ import annotations

import csv
from datetime import date, datetime, timedelta, timezone
import io
import re
import time
from typing import Any

from fastapi import HTTPException
from sqlalchemy import Date, and_, delete, distinct, func, or_, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import (
    AnalyticsDaily,
    AnalyticsEvent,
    AnalyticsPair,
    ClassSection,
    Lesson,
    Module,
)

ALLOWED_EVENT_TYPES: set[str] = {
    "module_view",
    "timetable_add",
    "timetable_remove",
    "timetable_swap_class",
    "planner_add",
    "planner_remove",
    "search",
    "search_no_result",
    "filter_use",
    "program_set",
    "ics_export",
    "share_link",
}

PROGRAM_CODE_REGEX = re.compile(r"^K\d{2}\d{3}[A-Z0-9]*$")

# In-memory sliding window rate limiting
_anon_rate_window: dict[str, list[float]] = {}
_ip_rate_window: dict[str, list[float]] = {}


def reset_rate_limits() -> None:
    """Xóa bộ đệm rate-limit (dùng cho unit test)."""
    _anon_rate_window.clear()
    _ip_rate_window.clear()


def check_rate_limits(anon_id: str, ip: str, batch_size: int) -> None:
    """Kiểm tra giới hạn tốc độ:
    - 10 sự kiện / giây / anon_id
    - 600 sự kiện / phút / IP
    Trả 429 nếu vượt ngưỡng.
    """
    now = time.time()

    # 1. Anon ID (1.0s window)
    anon_history = [t for t in _anon_rate_window.get(anon_id, []) if now - t < 1.0]
    if len(anon_history) + batch_size > 10:
        raise HTTPException(
            status_code=429,
            detail="Quá giới hạn gửi sự kiện: tối đa 10 sự kiện/giây trên mỗi anon_id",
        )

    # 2. IP (60.0s window)
    ip_history = [t for t in _ip_rate_window.get(ip, []) if now - t < 60.0]
    if len(ip_history) + batch_size > 600:
        raise HTTPException(
            status_code=429,
            detail="Quá giới hạn gửi sự kiện: tối đa 600 sự kiện/phút trên mỗi IP",
        )

    anon_history.extend([now] * batch_size)
    ip_history.extend([now] * batch_size)
    _anon_rate_window[anon_id] = anon_history
    _ip_rate_window[ip] = ip_history


def record_events(
    db: Session,
    anon_id: str,
    raw_events: list[dict[str, Any]],
    client_ip: str = "127.0.0.1",
) -> int:
    """Xử lý lô sự kiện ẩn danh từ client:
    - Bỏ qua nếu settings.analytics_enabled = False (trả 0).
    - Tối đa 50 sự kiện một lô.
    - Rate limit 10/s/anon_id và 600/min/IP (ném 429).
    - Lọc bỏ loại sự kiện không hợp lệ, cắt query 64 ký tự, kiểm tra regex program_code.
    - Không lưu IP, user-agent.
    """
    settings = get_settings()
    if not settings.analytics_enabled:
        return 0

    if not anon_id or not isinstance(anon_id, str):
        return 0

    clean_anon_id = anon_id.strip()[:36]
    events_slice = raw_events[:50]
    if not events_slice:
        return 0

    check_rate_limits(clean_anon_id, client_ip, len(events_slice))

    records: list[AnalyticsEvent] = []
    now_utc = datetime.now(timezone.utc)

    for item in events_slice:
        if not isinstance(item, dict):
            continue
        ev_type = item.get("type")
        if not ev_type or ev_type not in ALLOWED_EVENT_TYPES:
            continue

        module_code = item.get("module_code")
        if module_code and isinstance(module_code, str):
            module_code = module_code.strip()[:64] or None
        else:
            module_code = None

        class_code = item.get("class_code")
        if class_code and isinstance(class_code, str):
            class_code = class_code.strip()[:64] or None
        else:
            class_code = None

        semester_id = item.get("semester_id")
        if semester_id and isinstance(semester_id, str):
            semester_id = semester_id.strip()[:32] or None
        else:
            semester_id = None

        program_code = item.get("program_code")
        if program_code and isinstance(program_code, str):
            clean_prog = program_code.strip().upper()
            if PROGRAM_CODE_REGEX.match(clean_prog):
                program_code = clean_prog[:32]
            else:
                program_code = None
        else:
            program_code = None

        query_text = item.get("query") or item.get("query_text")
        if query_text and isinstance(query_text, str):
            query_text = query_text.strip()[:64] or None
        else:
            query_text = None

        filters = item.get("filters")
        if not isinstance(filters, dict):
            filters = None

        page = item.get("page")
        if page and isinstance(page, str):
            page = page.strip()[:128] or None
        else:
            page = None

        ts = item.get("ts")
        created_at = now_utc
        if ts:
            try:
                if isinstance(ts, (int, float)):
                    created_at = datetime.fromtimestamp(ts, tz=timezone.utc)
                elif isinstance(ts, str):
                    created_at = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            except Exception:
                created_at = now_utc

        record = AnalyticsEvent(
            anon_id=clean_anon_id,
            event_type=ev_type,
            module_code=module_code,
            class_code=class_code,
            semester_id=semester_id,
            program_code=program_code,
            query_text=query_text,
            filters=filters,
            page=page,
            created_at=created_at,
        )
        records.append(record)

    if records:
        db.add_all(records)
        db.commit()

    return len(records)


def aggregate_analytics(
    db: Session, since_date: date | str | None = None
) -> dict[str, int]:
    """Tổng hợp sự kiện vào analytics_daily và analytics_pairs. Idempotent.

    - analytics_daily: nhóm sự kiện theo ngày, event_type, module_code, semester_id, program_code.
    - analytics_pairs: tính số sinh viên cùng thêm cặp môn (module_a < module_b) trong cùng học kỳ.
    """
    since_d: date | None = None
    if isinstance(since_date, str):
        try:
            since_d = date.fromisoformat(since_date)
        except ValueError:
            since_d = None
    elif isinstance(since_date, date):
        since_d = since_date

    # 1. Xóa và tổng hợp analytics_daily
    if since_d:
        db.execute(delete(AnalyticsDaily).where(AnalyticsDaily.day >= since_d))
    else:
        db.execute(delete(AnalyticsDaily))

    # Truy vấn gom nhóm
    day_col = func.date(AnalyticsEvent.created_at, type_=Date).label("ev_day")
    q_daily = (
        select(
            day_col,
            AnalyticsEvent.event_type,
            AnalyticsEvent.module_code,
            AnalyticsEvent.semester_id,
            AnalyticsEvent.program_code,
            func.count(AnalyticsEvent.id).label("cnt"),
        )
        .group_by(
            day_col,
            AnalyticsEvent.event_type,
            AnalyticsEvent.module_code,
            AnalyticsEvent.semester_id,
            AnalyticsEvent.program_code,
        )
    )
    if since_d:
        q_daily = q_daily.where(day_col >= since_d)

    rows_daily = db.execute(q_daily).all()
    daily_objs = [
        AnalyticsDaily(
            day=r.ev_day,
            event_type=r.event_type,
            module_code=r.module_code,
            semester_id=r.semester_id,
            program_code=r.program_code,
            count=r.cnt,
        )
        for r in rows_daily
    ]
    if daily_objs:
        db.add_all(daily_objs)

    # 2. Xóa và tổng hợp analytics_pairs (cặp môn theo TKB)
    db.execute(delete(AnalyticsPair))

    # Lấy các sự kiện timetable_add và timetable_remove theo anon_id và semester_id
    q_tt = select(
        AnalyticsEvent.anon_id,
        AnalyticsEvent.semester_id,
        AnalyticsEvent.module_code,
        AnalyticsEvent.event_type,
        AnalyticsEvent.created_at,
    ).where(
        AnalyticsEvent.event_type.in_(["timetable_add", "timetable_remove"]),
        AnalyticsEvent.module_code.isnot(None),
        AnalyticsEvent.semester_id.isnot(None),
    ).order_by(AnalyticsEvent.created_at.asc())

    tt_events = db.execute(q_tt).all()

    # Dựng tập hợp môn hiện có của mỗi anon_id trong kỳ
    user_semester_modules: dict[tuple[str, str], set[str]] = {}
    for ev in tt_events:
        key = (ev.anon_id, ev.semester_id)
        if key not in user_semester_modules:
            user_semester_modules[key] = set()
        if ev.event_type == "timetable_add":
            user_semester_modules[key].add(ev.module_code)
        elif ev.event_type == "timetable_remove":
            user_semester_modules[key].discard(ev.module_code)

    # Đếm số cặp môn
    pair_counts: dict[tuple[str, str, str], int] = {}
    for (anon, sem), mods in user_semester_modules.items():
        if len(mods) < 2:
            continue
        sorted_mods = sorted(list(mods))
        for i in range(len(sorted_mods)):
            for j in range(i + 1, len(sorted_mods)):
                pair_key = (sem, sorted_mods[i], sorted_mods[j])
                pair_counts[pair_key] = pair_counts.get(pair_key, 0) + 1

    pair_objs = [
        AnalyticsPair(
            semester_id=sem,
            module_a=mod_a,
            module_b=mod_b,
            count=cnt,
        )
        for (sem, mod_a, mod_b), cnt in pair_counts.items()
    ]
    if pair_objs:
        db.add_all(pair_objs)

    db.commit()

    return {
        "daily_rows": len(daily_objs),
        "pair_rows": len(pair_objs),
    }


def purge_analytics(db: Session, retention_days: int | None = None) -> int:
    """Xóa các sự kiện thô trong analytics_events cũ hơn retention_days (mặc định 180 ngày)."""
    settings = get_settings()
    days = retention_days if retention_days is not None else settings.analytics_retention_days
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    stmt = delete(AnalyticsEvent).where(AnalyticsEvent.created_at < cutoff)
    res = db.execute(stmt)
    db.commit()
    return int(res.rowcount or 0)


# =============================================================================
# Thống kê & K-Anonymity cho Trends API
# =============================================================================
K_ANONYMITY_THRESHOLD = 5


def mask_anonymity(count: int, anon_count: int | None = None) -> Any:
    """Áp dụng k-anonymity: nếu số anon_id < 5 thì trả '<5'."""
    check_num = anon_count if anon_count is not None else count
    if check_num < K_ANONYMITY_THRESHOLD:
        return "<5"
    return count


def get_analytics_overview_numbers(db: Session) -> dict[str, Any]:
    """Lấy số liệu thật cho trang Tổng quan (A1 Overview) từ analytics_events."""
    now = datetime.now(timezone.utc)
    t_7d = now - timedelta(days=7)
    t_30d = now - timedelta(days=30)

    try:
        active_7d = db.scalar(
            select(func.count(distinct(AnalyticsEvent.anon_id))).where(
                AnalyticsEvent.created_at >= t_7d
            )
        ) or 0
        active_30d = db.scalar(
            select(func.count(distinct(AnalyticsEvent.anon_id))).where(
                AnalyticsEvent.created_at >= t_30d
            )
        ) or 0
        tt_adds_7d = db.scalar(
            select(func.count(AnalyticsEvent.id)).where(
                AnalyticsEvent.event_type == "timetable_add",
                AnalyticsEvent.created_at >= t_7d,
            )
        ) or 0
        planner_adds_7d = db.scalar(
            select(func.count(AnalyticsEvent.id)).where(
                AnalyticsEvent.event_type == "planner_add",
                AnalyticsEvent.created_at >= t_7d,
            )
        ) or 0

        # Biểu đồ hoạt động 30 ngày
        day_col = func.date(AnalyticsEvent.created_at, type_=Date).label("d")
        q_act = (
            select(day_col, func.count(AnalyticsEvent.id).label("c"))
            .where(AnalyticsEvent.created_at >= t_30d)
            .group_by(day_col)
            .order_by(day_col.asc())
        )
        activity_rows = db.execute(q_act).all()
        activity_map = {r.d.isoformat(): r.c for r in activity_rows if r.d}

        activity_30d: list[dict[str, Any]] = []
        for i in range(29, -1, -1):
            dt = (now - timedelta(days=i)).date().isoformat()
            activity_30d.append({"date": dt, "count": activity_map.get(dt, 0)})

        return {
            "active_anon_7d": active_7d,
            "active_anon_30d": active_30d,
            "timetable_adds_7d": tt_adds_7d,
            "planner_adds_7d": planner_adds_7d,
            "activity_30d": activity_30d,
        }
    except Exception:
        return {
            "active_anon_7d": 0,
            "active_anon_30d": 0,
            "timetable_adds_7d": 0,
            "planner_adds_7d": 0,
            "activity_30d": [],
        }


def get_trend_modules(
    db: Session,
    semester: str | None = None,
    program: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    days: int = 30,
) -> list[dict[str, Any]]:
    """Top môn học (lượt thêm TKB, thêm kế hoạch, xem; xu hướng ▲▼ so với khoảng trước)."""
    now = datetime.now(timezone.utc)
    if not to_date:
        to_dt = now
    else:
        to_dt = datetime.combine(to_date, datetime.max.time(), tzinfo=timezone.utc)

    if not from_date:
        from_dt = to_dt - timedelta(days=days)
    else:
        from_dt = datetime.combine(from_date, datetime.min.time(), tzinfo=timezone.utc)

    # Khoảng trước đó có độ dài tương đương
    period_length = to_dt - from_dt
    prev_from_dt = from_dt - period_length

    # Điều kiện lọc chung
    base_conds = [
        AnalyticsEvent.module_code.isnot(None),
        AnalyticsEvent.event_type.in_(["timetable_add", "planner_add", "module_view"]),
    ]
    if semester:
        base_conds.append(AnalyticsEvent.semester_id == semester)
    if program:
        base_conds.append(AnalyticsEvent.program_code.like(f"{program}%"))

    # Đếm kỳ hiện tại
    curr_conds = base_conds + [
        AnalyticsEvent.created_at >= from_dt,
        AnalyticsEvent.created_at <= to_dt,
    ]
    q_curr = (
        select(
            AnalyticsEvent.module_code,
            AnalyticsEvent.event_type,
            func.count(AnalyticsEvent.id).label("cnt"),
            func.count(distinct(AnalyticsEvent.anon_id)).label("anon_cnt"),
        )
        .where(and_(*curr_conds))
        .group_by(AnalyticsEvent.module_code, AnalyticsEvent.event_type)
    )
    curr_results = db.execute(q_curr).all()

    # Đếm kỳ trước để tính xu hướng
    prev_conds = base_conds + [
        AnalyticsEvent.created_at >= prev_from_dt,
        AnalyticsEvent.created_at < from_dt,
    ]
    q_prev = (
        select(
            AnalyticsEvent.module_code,
            AnalyticsEvent.event_type,
            func.count(AnalyticsEvent.id).label("cnt"),
        )
        .where(and_(*prev_conds))
        .group_by(AnalyticsEvent.module_code, AnalyticsEvent.event_type)
    )
    prev_results = db.execute(q_prev).all()

    prev_map: dict[tuple[str, str], int] = {(r.module_code, r.event_type): r.cnt for r in prev_results}

    # Gom nhóm theo module_code
    mod_stats: dict[str, dict[str, Any]] = {}
    for r in curr_results:
        m = r.module_code
        if m not in mod_stats:
            mod_stats[m] = {
                "module_code": m,
                "timetable_adds": 0,
                "planner_adds": 0,
                "views": 0,
                "total": 0,
                "anon_ids": set(),
                "tt_anons": 0,
                "pl_anons": 0,
                "vw_anons": 0,
            }
        if r.event_type == "timetable_add":
            mod_stats[m]["timetable_adds"] = r.cnt
            mod_stats[m]["tt_anons"] = r.anon_cnt
        elif r.event_type == "planner_add":
            mod_stats[m]["planner_adds"] = r.cnt
            mod_stats[m]["pl_anons"] = r.anon_cnt
        elif r.event_type == "module_view":
            mod_stats[m]["views"] = r.cnt
            mod_stats[m]["vw_anons"] = r.anon_cnt
        mod_stats[m]["total"] += r.cnt

    if not mod_stats:
        return []

    # Lấy tên môn từ bảng modules
    mod_codes = list(mod_stats.keys())
    name_rows = db.execute(select(Module.code, Module.name, Module.name_en).where(Module.code.in_(mod_codes))).all()
    name_map = {r.code: (r.name, r.name_en) for r in name_rows}

    output: list[dict[str, Any]] = []
    for m, stat in mod_stats.items():
        name, name_en = name_map.get(m, (m, None))
        # Xu hướng so với khoảng trước
        prev_total = (
            prev_map.get((m, "timetable_add"), 0)
            + prev_map.get((m, "planner_add"), 0)
            + prev_map.get((m, "module_view"), 0)
        )
        curr_total = stat["total"]
        if prev_total == 0:
            trend_val = 100 if curr_total > 0 else 0
            trend_dir = "up" if curr_total > 0 else "same"
        else:
            diff = curr_total - prev_total
            trend_val = round((diff / prev_total) * 100, 1)
            trend_dir = "up" if diff > 0 else ("down" if diff < 0 else "same")

        max_anons = max(stat["tt_anons"], stat["pl_anons"], stat["vw_anons"])
        output.append({
            "module_code": m,
            "module_name": name,
            "module_name_en": name_en,
            "timetable_adds": mask_anonymity(stat["timetable_adds"], stat["tt_anons"]),
            "planner_adds": mask_anonymity(stat["planner_adds"], stat["pl_anons"]),
            "views": mask_anonymity(stat["views"], stat["vw_anons"]),
            "total_raw": curr_total,
            "trend_dir": trend_dir,
            "trend_pct": trend_val,
            "anonymized": max_anons < K_ANONYMITY_THRESHOLD,
        })

    # Sắp xếp theo tổng hoạt động giảm dần
    output.sort(key=lambda x: x["total_raw"], reverse=True)
    return output


def get_trend_pairs(
    db: Session,
    semester: str | None = None,
    module: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Cặp môn thường được xếp chung thời khóa biểu."""
    q = select(AnalyticsPair)
    if semester:
        q = q.where(AnalyticsPair.semester_id == semester)
    if module:
        q = q.where(or_(AnalyticsPair.module_a == module, AnalyticsPair.module_b == module))

    q = q.order_by(AnalyticsPair.count.desc()).limit(limit)
    pairs = db.scalars(q).all()

    # Tra cứu tên môn
    all_codes = set()
    for p in pairs:
        all_codes.add(p.module_a)
        all_codes.add(p.module_b)

    names: dict[str, str] = {}
    if all_codes:
        rows = db.execute(select(Module.code, Module.name).where(Module.code.in_(list(all_codes)))).all()
        names = {r.code: r.name for r in rows}

    res: list[dict[str, Any]] = []
    for p in pairs:
        res.append({
            "semester_id": p.semester_id,
            "module_a": p.module_a,
            "module_a_name": names.get(p.module_a, p.module_a),
            "module_b": p.module_b,
            "module_b_name": names.get(p.module_b, p.module_b),
            "count": mask_anonymity(p.count),
            "count_raw": p.count,
        })
    return res


def get_trend_slots(
    db: Session,
    semester: str | None = None,
    program: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
) -> list[dict[str, Any]]:
    """Bản đồ nhiệt Thứ (2..8) × Tiết (1..16) từ các lớp được thêm vào TKB."""
    conds = [
        AnalyticsEvent.event_type == "timetable_add",
        AnalyticsEvent.class_code.isnot(None),
    ]
    if semester:
        conds.append(AnalyticsEvent.semester_id == semester)
    if program:
        conds.append(AnalyticsEvent.program_code.like(f"{program}%"))
    if from_date:
        conds.append(AnalyticsEvent.created_at >= datetime.combine(from_date, datetime.min.time(), tzinfo=timezone.utc))
    if to_date:
        conds.append(AnalyticsEvent.created_at <= datetime.combine(to_date, datetime.max.time(), tzinfo=timezone.utc))

    # Lấy các cặp (class_code, anon_id) được thêm
    q_events = select(AnalyticsEvent.class_code, AnalyticsEvent.anon_id).where(and_(*conds)).distinct()
    added_classes = db.execute(q_events).all()

    if not added_classes:
        grid = []
        for wd in range(2, 9):
            for p in range(1, 17):
                grid.append({"weekday": wd, "period": p, "count": 0, "anonymized": False})
        return grid

    class_codes = list({r.class_code for r in added_classes if r.class_code})
    class_anons: dict[str, set[str]] = {}
    for r in added_classes:
        if r.class_code:
            class_anons.setdefault(r.class_code, set()).add(r.anon_id)

    # Lấy lessons của các lớp này
    q_lessons = (
        select(ClassSection.class_code, Lesson.weekday, Lesson.start_period, Lesson.end_period)
        .join(Lesson, Lesson.class_id == ClassSection.id)
        .where(ClassSection.class_code.in_(class_codes))
    )
    lessons = db.execute(q_lessons).all()

    # Ma trận (weekday, period) -> set of anon_ids
    slot_anons: dict[tuple[int, int], set[str]] = {}
    for l in lessons:
        anons = class_anons.get(l.class_code, set())
        start_p = int(l.start_period)
        end_p = int(l.end_period)
        for p in range(start_p, end_p + 1):
            if 1 <= p <= 16 and 2 <= l.weekday <= 8:
                key = (l.weekday, p)
                slot_anons.setdefault(key, set()).update(anons)

    grid = []
    for wd in range(2, 9):
        for p in range(1, 17):
            anons = slot_anons.get((wd, p), set())
            raw_cnt = len(anons)
            grid.append({
                "weekday": wd,
                "period": p,
                "count": mask_anonymity(raw_cnt),
                "count_raw": raw_cnt,
                "anonymized": 0 < raw_cnt < K_ANONYMITY_THRESHOLD,
            })
    return grid


def get_trend_conflicts(
    db: Session,
    semester: str | None = None,
) -> dict[str, Any]:
    """Tỷ lệ thời khóa biểu có xung đột lịch / vi phạm ranh giới tiết."""
    conds = [
        AnalyticsEvent.event_type.in_(["timetable_add", "timetable_remove"]),
        AnalyticsEvent.class_code.isnot(None),
    ]
    if semester:
        conds.append(AnalyticsEvent.semester_id == semester)

    q = (
        select(
            AnalyticsEvent.anon_id,
            AnalyticsEvent.class_code,
            AnalyticsEvent.event_type,
        )
        .where(and_(*conds))
        .order_by(AnalyticsEvent.created_at.asc())
    )
    rows = db.execute(q).all()

    user_classes: dict[str, set[str]] = {}
    for r in rows:
        if r.event_type == "timetable_add":
            user_classes.setdefault(r.anon_id, set()).add(r.class_code)
        elif r.event_type == "timetable_remove" and r.anon_id in user_classes:
            user_classes[r.anon_id].discard(r.class_code)

    # Loại bỏ người dùng có < 2 lớp
    active_users = {u: classes for u, classes in user_classes.items() if len(classes) >= 2}
    total_users = len(active_users)

    if total_users == 0:
        return {
            "total_schedules": 0,
            "conflicted_schedules": 0,
            "conflict_rate_pct": 0.0,
            "anonymized": False,
        }

    # Lấy lesson của tất cả class_code liên quan
    all_codes = set()
    for cs in active_users.values():
        all_codes.update(cs)

    q_lessons = (
        select(ClassSection.class_code, Lesson.weekday, Lesson.start_period, Lesson.end_period)
        .join(Lesson, Lesson.class_id == ClassSection.id)
        .where(ClassSection.class_code.in_(list(all_codes)))
    )
    lesson_rows = db.execute(q_lessons).all()
    class_lessons: dict[str, list[tuple[int, float, float]]] = {}
    for lr in lesson_rows:
        class_lessons.setdefault(lr.class_code, []).append((lr.weekday, float(lr.start_period), float(lr.end_period)))

    conflicted_users = 0
    for u, cs in active_users.items():
        # Kiểm tra xung đột cặp buổi
        all_u_lessons: list[tuple[int, float, float]] = []
        for c in cs:
            all_u_lessons.extend(class_lessons.get(c, []))

        has_conflict = False
        for i in range(len(all_u_lessons)):
            if has_conflict:
                break
            w1, s1, e1 = all_u_lessons[i]
            for j in range(i + 1, len(all_u_lessons)):
                w2, s2, e2 = all_u_lessons[j]
                if w1 == w2:
                    # Trùng giờ: [s1, e1] giao [s2, e2]
                    if max(s1, s2) <= min(e1, e2):
                        has_conflict = True
                        break
        if has_conflict:
            conflicted_users += 1

    rate = round((conflicted_users / total_users) * 100, 1) if total_users > 0 else 0.0
    anonymized = total_users < K_ANONYMITY_THRESHOLD

    return {
        "total_schedules": mask_anonymity(total_users),
        "conflicted_schedules": mask_anonymity(conflicted_users) if not anonymized else "<5",
        "conflict_rate_pct": rate if not anonymized else 0.0,
        "anonymized": anonymized,
    }


def get_trend_search_no_results(
    db: Session,
    limit: int = 20,
    from_date: date | None = None,
    to_date: date | None = None,
) -> list[dict[str, Any]]:
    """Top từ khóa tìm kiếm không có kết quả (search_no_result)."""
    conds = [
        AnalyticsEvent.event_type == "search_no_result",
        AnalyticsEvent.query_text.isnot(None),
        AnalyticsEvent.query_text != "",
    ]
    if from_date:
        conds.append(AnalyticsEvent.created_at >= datetime.combine(from_date, datetime.min.time(), tzinfo=timezone.utc))
    if to_date:
        conds.append(AnalyticsEvent.created_at <= datetime.combine(to_date, datetime.max.time(), tzinfo=timezone.utc))

    q = (
        select(
            AnalyticsEvent.query_text,
            func.count(AnalyticsEvent.id).label("cnt"),
            func.count(distinct(AnalyticsEvent.anon_id)).label("anon_cnt"),
        )
        .where(and_(*conds))
        .group_by(AnalyticsEvent.query_text)
        .order_by(func.count(AnalyticsEvent.id).desc())
        .limit(limit)
    )
    rows = db.execute(q).all()

    res: list[dict[str, Any]] = []
    for r in rows:
        res.append({
            "query": r.query_text,
            "count": mask_anonymity(r.cnt, r.anon_cnt),
            "count_raw": r.cnt,
            "anonymized": r.anon_cnt < K_ANONYMITY_THRESHOLD,
        })
    return res


def get_trend_classes_for_module(
    db: Session,
    module_code: str,
    semester: str | None = None,
) -> list[dict[str, Any]]:
    """Lớp học phần được chọn nhiều của một môn học."""
    conds = [
        AnalyticsEvent.event_type == "timetable_add",
        AnalyticsEvent.module_code == module_code,
        AnalyticsEvent.class_code.isnot(None),
    ]
    if semester:
        conds.append(AnalyticsEvent.semester_id == semester)

    q = (
        select(
            AnalyticsEvent.class_code,
            func.count(AnalyticsEvent.id).label("cnt"),
            func.count(distinct(AnalyticsEvent.anon_id)).label("anon_cnt"),
        )
        .where(and_(*conds))
        .group_by(AnalyticsEvent.class_code)
        .order_by(func.count(AnalyticsEvent.id).desc())
    )
    rows = db.execute(q).all()

    res: list[dict[str, Any]] = []
    for r in rows:
        res.append({
            "class_code": r.class_code,
            "count": mask_anonymity(r.cnt, r.anon_cnt),
            "count_raw": r.cnt,
            "anonymized": r.anon_cnt < K_ANONYMITY_THRESHOLD,
        })
    return res


def export_to_csv_string(headers: list[str], rows: list[list[Any]]) -> str:
    """Xuất danh sách dòng ra chuỗi CSV định dạng UTF-8."""
    output = io.StringIO()
    # Ghi BOM UTF-8 để Excel hiển thị đúng dấu tiếng Việt
    output.write("\ufeff")
    writer = csv.writer(output)
    writer.writerow(headers)
    for row in rows:
        writer.writerow(row)
    return output.getvalue()
