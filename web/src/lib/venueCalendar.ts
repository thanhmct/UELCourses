import { parseWeekList } from "./schedule";
import type { VenueSession } from "./types";

/** Khoảng thời gian học kỳ (yyyy-mm-dd) lấy từ API /semesters. */
export interface SemesterRange {
  start_date?: string | null;
  end_date?: string | null;
}

/** Một buổi học cụ thể rơi vào một ngày cụ thể. */
export interface Occurrence {
  s: VenueSession;
  date: Date;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** yyyy-mm-dd → Date theo giờ địa phương (tránh lệch múi giờ). */
export function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

/** Thứ Hai của tuần chứa `d`. */
export function mondayOf(d: Date): Date {
  return addDays(d, -((d.getDay() + 6) % 7));
}

/** Khóa tháng "yyyy-mm". */
export const monthKeyOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

/** Khóa ngày "yyyy-mm-dd". */
export const dateKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Nhãn tháng gọn, đồng nhất trong bộ lọc và tiêu đề: MM/YYYY. */
export const monthLabel = (month: string, lang: "vi" | "en" = "vi") => {
  void lang;
  const [y, m] = month.split("-");
  return `${m.padStart(2, "0")}/${y}`;
};

/** Mã thứ theo tiết học: 2 = Thứ Hai … 7 = Thứ Bảy, 8 = Chủ nhật → độ lệch từ thứ Hai (0..6). */
const dayOffset = (weekday: number) => weekday - 2;

const MAX_WEEKS = 25;

/**
 * Mọi ngày diễn ra một buổi học.
 * Ưu tiên date_start/date_end; nếu thiếu thì suy ra từ tuần học (weeks) và ngày bắt đầu học kỳ
 * (tuần 1 là tuần chứa ngày bắt đầu học kỳ).
 */
export function sessionDates(s: VenueSession, sem?: SemesterRange | null): Date[] {
  if (s.date_start) {
    const from = parseISO(s.date_start);
    const to = parseISO(s.date_end ?? s.date_start);
    const out: Date[] = [];
    const parsedWeeks = parseWeekList(s.weeks);
    const baseMon = sem?.start_date ? mondayOf(parseISO(sem.start_date)) : mondayOf(from);
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if ((d.getDay() + 6) % 7 === dayOffset(s.weekday)) {
        if (parsedWeeks) {
          const weekNum = Math.floor((d.getTime() - baseMon.getTime()) / (7 * 86_400_000)) + 1;
          if (!parsedWeeks.has(weekNum)) continue;
        }
        out.push(d);
      }
    }
    return out;
  }
  if (!sem?.start_date) return [];
  const week1 = mondayOf(parseISO(sem.start_date));
  const last = sem.end_date ? parseISO(sem.end_date) : null;
  const weeks = parseWeekList(s.weeks) ?? new Set(Array.from({ length: MAX_WEEKS }, (_, i) => i + 1));
  const out: Date[] = [];
  for (const w of [...weeks].sort((a, b) => a - b)) {
    const d = addDays(week1, (w - 1) * 7 + dayOffset(s.weekday));
    if (!last || d <= last) out.push(d);
  }
  return out;
}

/** Các buổi học của phòng trong một tháng, nhóm theo ngày (khóa "yyyy-mm-dd"), sắp theo tiết. */
export function occurrencesByDay(
  sessions: VenueSession[],
  sem: SemesterRange | null | undefined,
  month: string,
): Map<string, Occurrence[]> {
  const map = new Map<string, Occurrence[]>();
  for (const s of sessions) {
    for (const date of sessionDates(s, sem)) {
      if (monthKeyOf(date) !== month) continue;
      const k = dateKey(date);
      const list = map.get(k) ?? [];
      list.push({ s, date });
      map.set(k, list);
    }
  }
  for (const list of Array.from(map.values())) list.sort((a, b) => a.s.start_period - b.s.start_period);
  return map;
}

export function countOccurrences(byDay: Map<string, Occurrence[]>): number {
  let n = 0;
  for (const list of Array.from(byDay.values())) n += list.length;
  return n;
}

/** Các tháng (yyyy-mm) từ tháng bắt đầu đến tháng kết thúc học kỳ. Trống nếu thiếu ngày. */
export function monthsOf(sem?: SemesterRange | null): string[] {
  if (!sem?.start_date || !sem.end_date) return [];
  const start = parseISO(sem.start_date);
  const end = parseISO(sem.end_date);
  const stop = new Date(end.getFullYear(), end.getMonth(), 1);
  const out: string[] = [];
  for (let c = new Date(start.getFullYear(), start.getMonth(), 1); c <= stop; c = new Date(c.getFullYear(), c.getMonth() + 1, 1)) {
    out.push(monthKeyOf(c));
  }
  return out;
}

/** Tháng mặc định: tháng hiện tại nếu nằm trong danh sách, không thì tháng đầu tiên. */
export function defaultMonth(months: string[], today = new Date()): string {
  const now = monthKeyOf(today);
  if (months.includes(now)) return now;
  return months[0] ?? now;
}

/** Ô của lịch tháng: từ thứ Hai đầu tiên đến chủ nhật cuối cùng (gồm cả ngày ngoài tháng). */
export function monthGrid(month: string): Date[] {
  const [y, m] = month.split("-").map(Number);
  const start = mondayOf(new Date(y, m - 1, 1));
  const end = addDays(mondayOf(new Date(y, m, 0)), 6);
  const out: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}
