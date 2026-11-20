import { describe, expect, it } from "vitest";
import { buildIcs, firstOccurrence } from "../ics";
import type { ClassSection } from "../types";

describe("firstOccurrence", () => {
  it("finds the first matching weekday on or after start", () => {
    const mon = new Date(Date.UTC(2026, 8, 7)); // 2026-09-07 is a Monday
    expect(firstOccurrence(mon, 2).toISOString().slice(0, 10)).toBe("2026-09-07");
    expect(firstOccurrence(mon, 4).toISOString().slice(0, 10)).toBe("2026-09-09");
    expect(firstOccurrence(mon, 8).toISOString().slice(0, 10)).toBe("2026-09-13");
  });
});

describe("buildIcs", () => {
  const sec: ClassSection = {
    module_code: "EIE3004",
    class_code: "261EIE300401",
    lecturer: "TS. A",
    start_date: "2026-09-07",
    end_date: "2026-12-27",
    lessons: [
      { weekday: 3, start_period: 1, end_period: 3, start_time: "07:00", end_time: "09:30", room: "B.203" },
      { weekday: 5, start_period: 7, end_period: 8, start_time: "12:30", end_time: "14:10", room: "A.101", weeks: "4-5" },
    ],
  };
  const ics = buildIcs([sec], { moduleNames: { EIE3004: "International Business" }, now: new Date(Date.UTC(2026, 0, 1)) });

  it("produces a valid calendar envelope with CRLF", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics.split("BEGIN:VEVENT").length - 1).toBe(3); // 1 weekly + 2 explicit weeks
  });
  it("converts VN local time to UTC and adds weekly rule", () => {
    expect(ics).toContain("DTSTART:20260908T000000Z"); // Tue 07:00 +07 -> 00:00Z
    expect(ics).toContain("DTEND:20260908T023000Z");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;UNTIL=20261227T165900Z");
    expect(ics).toContain("SUMMARY:International Business (261EIE300401)");
    expect(ics).toContain("LOCATION:B.203");
  });
  it("expands explicit week lists", () => {
    // week 4 Thursday = 2026-09-10 + 21 days = 2026-10-01
    expect(ics).toContain("DTSTART:20261001T053000Z");
    expect(ics).toContain("DTSTART:20261008T053000Z");
  });
  it("skips sections without any dates", () => {
    const out = buildIcs([{ ...sec, start_date: undefined, end_date: undefined }]);
    expect(out).not.toContain("BEGIN:VEVENT");
    const withFallback = buildIcs([{ ...sec, start_date: undefined }], { fallbackStart: "2026-09-07" });
    expect(withFallback).toContain("BEGIN:VEVENT");
  });
  it("escapes special characters", () => {
    const out = buildIcs([{ ...sec, lessons: [sec.lessons[0]] }], { moduleNames: { EIE3004: "A, B; C" } });
    expect(out).toContain("SUMMARY:A\\, B\\; C (261EIE300401)");
  });
});
