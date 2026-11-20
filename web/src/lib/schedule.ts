// Fault-tolerant parser for the raw UEL `Schedules` field.
// The real format is not verified yet, so we accept strings in several shapes
// and arrays of objects with a range of plausible field names.
import type { Lesson } from "./types";
import { PERIOD_COUNT, periodEndTime, periodStartTime, timeToPeriod } from "./periods";

function clampPeriod(n: number): number {
  return Math.min(PERIOD_COUNT, Math.max(1, Math.round(n)));
}

function makeLesson(
  weekday: number,
  start: number,
  end: number,
  room?: string,
  weeks?: string,
): Lesson | null {
  if (!Number.isFinite(weekday) || weekday < 2 || weekday > 8) return null;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  let s = clampPeriod(start);
  let e = clampPeriod(end);
  if (e < s) [s, e] = [e, s];
  return {
    weekday,
    start_period: s,
    end_period: e,
    start_time: periodStartTime(s),
    end_time: periodEndTime(e),
    ...(room ? { room } : {}),
    ...(weeks ? { weeks } : {}),
  };
}

const WEEKDAY_RE =
  /(?:th[uứ]\s*|t)([2-8])\b|(ch[uủ]\s*nh[aậ]t|\bcn\b)|(hai|ba|t[uư]|n[aă]m|s[aá]u|b[aả]y)/i;
const WORD_DAY: Record<string, number> = {
  hai: 2, ba: 3, tư: 4, tu: 4, năm: 5, nam: 5, sáu: 6, sau: 6, bảy: 7, bay: 7,
};

export function parseWeekday(text: string): number | null {
  const m = WEEKDAY_RE.exec(text);
  if (!m) return null;
  if (m[1]) return Number(m[1]);
  if (m[2]) return 8;
  if (m[3]) return WORD_DAY[m[3].toLowerCase()] ?? null;
  return null;
}

function parsePeriods(text: string): [number, number] | null {
  // "tiết 1-3", "Tiết: 1 -> 3", "tiết 1 đến 3", "(1-3)", "1→3"
  const m =
    /ti[eế]t\s*[:.]?\s*(\d{1,2})\s*(?:-|–|->|→|đến|den|tới|toi)\s*(\d{1,2})/i.exec(text) ??
    /\((\d{1,2})\s*(?:-|–|->|→)\s*(\d{1,2})\)/.exec(text) ??
    /\b(\d{1,2})\s*(?:->|→)\s*(\d{1,2})\b/.exec(text);
  if (m) return [Number(m[1]), Number(m[2])];
  const single = /ti[eế]t\s*[:.]?\s*(\d{1,2})(?!\s*[,\d])/i.exec(text);
  if (single) return [Number(single[1]), Number(single[1])];
  // "tiết 1,2,3"
  const list = /ti[eế]t\s*[:.]?\s*((?:\d{1,2}\s*,\s*)+\d{1,2})/i.exec(text);
  if (list) {
    const nums = list[1].split(",").map((x) => Number(x.trim()));
    return [Math.min(...nums), Math.max(...nums)];
  }
  // Fallback: time range "07:00 - 09:30"
  const t = /(\d{1,2}[:hH]\d{2})\s*(?:-|–|->|→|đến)\s*(\d{1,2}[:hH]\d{2})/.exec(text);
  if (t) {
    const s = timeToPeriod(t[1]);
    const endMin = t[2].replace(/[hH]/, ":");
    const [eh, em] = endMin.split(":").map(Number);
    // end time is exclusive: subtract one minute before mapping to a period
    const total = eh * 60 + em - 1;
    const e = timeToPeriod(`${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`);
    if (s && e) return [s, e];
  }
  return null;
}

function parseRoom(text: string): string | undefined {
  const m =
    /ph[oò]ng\s*(?:h[oọ]c)?\s*[:.]?\s*([A-Za-z0-9][\w.\-/]*)/i.exec(text) ??
    /\bP\.\s*([A-Za-z0-9][\w.\-/]*)/.exec(text) ??
    /\b([A-Z]{1,2}\d?\.\d{2,4}[A-Za-z]?)\b/.exec(text);
  return m ? m[1].replace(/[.,;]+$/, "") : undefined;
}

function parseWeeks(text: string): string | undefined {
  const m = /tu[aầ]n\s*(?:h[oọ]c)?\s*[:.]?\s*([\d,\s\-–]+)/i.exec(text);
  return m ? m[1].replace(/\s+/g, "").replace(/–/g, "-").replace(/[,-]+$/, "") || undefined : undefined;
}

export function parseScheduleString(raw: string): Lesson[] {
  const segments = raw
    .split(/[;\n|]+|<br\s*\/?>/i)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: Lesson[] = [];
  for (const seg of segments) {
    const weekday = parseWeekday(seg);
    const periods = parsePeriods(seg);
    if (weekday == null || periods == null) continue;
    const lesson = makeLesson(weekday, periods[0], periods[1], parseRoom(seg), parseWeeks(seg));
    if (lesson) out.push(lesson);
  }
  return out;
}

type Raw = Record<string, unknown>;

function pick(obj: Raw, keys: string[]): unknown {
  for (const k of Object.keys(obj)) {
    if (keys.includes(k.toLowerCase())) return obj[k];
  }
  return undefined;
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const d = parseWeekday(v);
    if (d != null && /[a-zA-Zà-ỹ]/.test(v)) return d;
    return Number(v);
  }
  return NaN;
}

function parseScheduleObject(o: Raw): Lesson | null {
  const weekday = num(pick(o, ["weekday", "dayofweek", "day", "thu", "thứ", "dayweek", "studyday"]));
  let start = num(pick(o, ["start_period", "startperiod", "beginperiod", "fromperiod", "tietbatdau", "tiet_bat_dau", "begin_period"]));
  let end = num(pick(o, ["end_period", "endperiod", "toperiod", "tietketthuc", "tiet_ket_thuc"]));
  const count = num(pick(o, ["numberofperiods", "periods", "sotiet", "so_tiet", "numperiod"]));
  if (Number.isFinite(start) && !Number.isFinite(end) && Number.isFinite(count)) end = start + count - 1;
  if (!Number.isFinite(start)) {
    const st = pick(o, ["start_time", "starttime", "begintime"]);
    if (typeof st === "string") start = timeToPeriod(st) ?? NaN;
  }
  if (!Number.isFinite(end)) end = start;
  const roomV = pick(o, ["room", "roomname", "roomid", "phong", "phòng", "roomcode"]);
  const weeksV = pick(o, ["weeks", "week", "tuan", "studyweeks"]);
  return makeLesson(
    weekday,
    start,
    end,
    roomV != null && roomV !== "" ? String(roomV) : undefined,
    weeksV != null && weeksV !== "" ? String(weeksV) : undefined,
  );
}

/** Parse whatever shape `Schedules` arrives in. Never throws. */
export function parseSchedules(raw: unknown): Lesson[] {
  try {
    if (raw == null) return [];
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
        try {
          return parseSchedules(JSON.parse(trimmed));
        } catch {
          /* fall through to text parsing */
        }
      }
      return parseScheduleString(trimmed);
    }
    if (Array.isArray(raw)) return raw.flatMap((item) => parseSchedules(item));
    if (typeof raw === "object") {
      const lesson = parseScheduleObject(raw as Raw);
      return lesson ? [lesson] : [];
    }
  } catch {
    /* tolerate anything */
  }
  return [];
}

/** Parse "1-4,6,8-10" style week lists into a set of week numbers. */
export function parseWeekList(weeks?: string): Set<number> | null {
  if (!weeks) return null;
  const set = new Set<number>();
  for (const part of weeks.split(",")) {
    const p = part.trim();
    if (!p) continue;
    const r = /^(\d+)\s*-\s*(\d+)$/.exec(p);
    if (r) {
      const a = Number(r[1]);
      const b = Number(r[2]);
      for (let i = Math.min(a, b); i <= Math.max(a, b) && i - a < 100; i++) set.add(i);
    } else if (/^\d+$/.test(p)) {
      set.add(Number(p));
    } else if (/^[\d_x-]+$/i.test(p)) {
      // "123456789" or "12-45678" positional style: digit at index i => week i+1
      [...p].forEach((ch, i) => {
        if (/\d/.test(ch)) set.add(i + 1);
      });
    }
  }
  return set.size ? set : null;
}
