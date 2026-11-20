// Pure iCalendar (RFC 5545) generator for a timetable.
import type { ClassSection } from "./types";
import { parseDateOnly } from "./dates";
import { parseWeekList } from "./schedule";

const VN_OFFSET_MIN = 7 * 60; // Asia/Ho_Chi_Minh, no DST

export interface IcsOptions {
  /** Used when a section has no start/end date. ISO "YYYY-MM-DD". */
  fallbackStart?: string;
  fallbackEnd?: string;
  moduleNames?: Record<string, string>;
  calendarName?: string;
  /** Deterministic stamp for tests. */
  now?: Date;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function utcStamp(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** Local VN date (UTC-midnight Date) + "HH:MM" -> UTC instant. */
function vnInstant(date: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(date.getTime() + (h * 60 + (m || 0) - VN_OFFSET_MIN) * 60_000);
}

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Fold lines longer than 75 octets (approximate by chars). */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return parts.join("\r\n");
}

/** First date >= start whose weekday matches (2=Mon..8=Sun). */
export function firstOccurrence(start: Date, weekday: number): Date {
  const jsDay = weekday === 8 ? 0 : weekday - 1;
  const diff = (jsDay - start.getUTCDay() + 7) % 7;
  return new Date(start.getTime() + diff * 86_400_000);
}

export function buildIcs(sections: ClassSection[], opts: IcsOptions = {}): string {
  const now = opts.now ?? new Date();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//UELPlan//Timetable//VI",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(opts.calendarName ?? "Thời khóa biểu UELPlan")}`,
    "X-WR-TIMEZONE:Asia/Ho_Chi_Minh",
  ];
  for (const sec of sections) {
    const start = parseDateOnly(sec.start_date) ?? parseDateOnly(opts.fallbackStart);
    const end = parseDateOnly(sec.end_date) ?? parseDateOnly(opts.fallbackEnd);
    if (!start) continue;
    const name = opts.moduleNames?.[sec.module_code] ?? sec.module_code;
    sec.lessons.forEach((lesson, idx) => {
      const first = firstOccurrence(start, lesson.weekday);
      const weeks = parseWeekList(lesson.weeks);
      const dates: Date[] = weeks
        ? [...weeks].sort((a, b) => a - b).map((w) => new Date(first.getTime() + (w - 1) * 7 * 86_400_000))
        : [first];
      dates.forEach((d, k) => {
        if (end && d.getTime() > end.getTime()) return;
        const uid = `${sec.module_code}-${sec.class_code}-${idx}-${k}@uelplan`;
        lines.push("BEGIN:VEVENT");
        lines.push(`UID:${escapeText(uid)}`);
        lines.push(`DTSTAMP:${utcStamp(now)}`);
        lines.push(`DTSTART:${utcStamp(vnInstant(d, lesson.start_time))}`);
        lines.push(`DTEND:${utcStamp(vnInstant(d, lesson.end_time))}`);
        if (!weeks && end) {
          const until = new Date(end.getTime() + (24 * 60 - 1 - VN_OFFSET_MIN) * 60_000);
          lines.push(`RRULE:FREQ=WEEKLY;UNTIL=${utcStamp(until)}`);
        }
        lines.push(fold(`SUMMARY:${escapeText(`${name} (${sec.class_code})`)}`));
        if (lesson.room) lines.push(fold(`LOCATION:${escapeText(lesson.room)}`));
        const desc = [
          `Mã HP: ${sec.module_code}`,
          `Lớp: ${sec.class_code}`,
          `Tiết ${lesson.start_period}–${lesson.end_period}`,
          sec.lecturer ? `GV: ${sec.lecturer}` : "",
        ]
          .filter(Boolean)
          .join("\n");
        lines.push(fold(`DESCRIPTION:${escapeText(desc)}`));
        lines.push("END:VEVENT");
      });
    });
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
