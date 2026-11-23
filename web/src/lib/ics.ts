// Pure iCalendar (RFC 5545) generator for a timetable.
// Single source of truth: built directly from concrete occurrences.
import type { ClassSection } from "./types";
import { parseDateOnly } from "./dates";
import { getTimetableOccurrences, type OccurrenceOptions } from "./occurrences";

const VN_OFFSET_MIN = 7 * 60; // Asia/Ho_Chi_Minh, UTC+7 (no DST)

export interface IcsOptions extends OccurrenceOptions {
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

/** First date >= start whose weekday matches (2=Mon..8=Sun). Kept for utility. */
export function firstOccurrence(start: Date, weekday: number): Date {
  const jsDay = weekday === 8 ? 0 : weekday - 1;
  const diff = (jsDay - start.getUTCDay() + 7) % 7;
  return new Date(start.getTime() + diff * 86_400_000);
}

export function buildIcs(sections: ClassSection[], opts: IcsOptions = {}): string {
  const now = opts.now ?? new Date();
  const occurrences = getTimetableOccurrences(sections, opts);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//UELPATH//Timetable//VI",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(opts.calendarName ?? "Thời khóa biểu UELPATH")}`,
    "X-WR-TIMEZONE:Asia/Ho_Chi_Minh",
  ];

  for (const occ of occurrences) {
    const d = parseDateOnly(occ.date);
    if (!d) continue;

    const startClean = occ.start.replace(":", "");
    // Retain the original UID domain so existing subscriptions recognize each event.
    const uid = `${occ.class_code}-${occ.date}-${startClean}@uelcourses`;

    const modName = opts.moduleNames?.[occ.module_code];
    const summary = modName && modName !== occ.module_code
      ? `${occ.module_code} ${modName}`
      : occ.module_code;

    const descParts = [
      `Mã HP: ${occ.module_code}`,
      `Lớp: ${occ.class_code}`,
      `Tiết ${occ.start_period}–${occ.end_period}`,
    ];
    if (occ.section.lecturer) {
      descParts.push(`GV: ${occ.section.lecturer}`);
    }

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${escapeText(uid)}`);
    lines.push(`DTSTAMP:${utcStamp(now)}`);
    lines.push(`DTSTART:${utcStamp(vnInstant(d, occ.start))}`);
    lines.push(`DTEND:${utcStamp(vnInstant(d, occ.end))}`);
    lines.push(fold(`SUMMARY:${escapeText(summary)}`));

    if (occ.room) {
      lines.push(fold(`LOCATION:${escapeText(occ.room)}`));
    }

    lines.push(fold(`DESCRIPTION:${escapeText(descParts.join("\n"))}`));
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
