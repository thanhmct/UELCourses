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

describe("buildIcs with 3-tier class section", () => {
  const threeTierSection: ClassSection = {
    module_code: "BIM5001",
    class_code: "261BIM500101",
    lecturer: "TS. Nguyễn Văn A",
    start_date: "2026-09-07",
    end_date: "2026-11-22",
    lessons: [
      // Tầng 1: Tuần 1-4 Thứ 2 (2026-09-07 đến 2026-09-28)
      {
        weekday: 2,
        start_period: 1,
        end_period: 3,
        start_time: "07:00",
        end_time: "09:30",
        room: "A.201",
        date_start: "2026-09-07",
        date_end: "2026-09-28",
      },
      // Tầng 2: Tuần 5-8 Thứ 4 (2026-10-07 đến 2026-10-28)
      {
        weekday: 4,
        start_period: 7,
        end_period: 9,
        start_time: "12:30",
        end_time: "15:00",
        room: "B.305",
        date_start: "2026-10-07",
        date_end: "2026-10-28",
      },
      // Tầng 3: Một ngày thi Chủ nhật 15/11/2026
      {
        weekday: 8,
        start_period: 1,
        end_period: 3,
        start_time: "07:00",
        end_time: "09:30",
        room: "C.102",
        date_start: "2026-11-15",
        date_end: "2026-11-15",
      },
    ],
  };

  const ics = buildIcs([threeTierSection], {
    moduleNames: { BIM5001: "Quản trị thông tin" },
    now: new Date(Date.UTC(2026, 0, 1)),
  });

  it("produces valid VCALENDAR envelope with CRLF", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("X-WR-TIMEZONE:Asia/Ho_Chi_Minh");
    expect(ics).toContain("PRODID:-//UELPATH//Timetable//VI\r\n");
    expect(ics).toContain("X-WR-CALNAME:Thời khóa biểu UELPATH\r\n");
  });

  it("produces exact 9 VEVENTs for the 3-tier class without extra ghost events", () => {
    // 4 Mon + 4 Wed + 1 Sun = 9 VEVENTs
    const eventCount = ics.split("BEGIN:VEVENT").length - 1;
    expect(eventCount).toBe(9);
  });

  it("formats DTSTART and DTEND correctly in UTC (VN UTC+7)", () => {
    // Tier 1: Mon 2026-09-07 07:00 VN -> 00:00 UTC
    expect(ics).toContain("DTSTART:20260907T000000Z");
    expect(ics).toContain("DTEND:20260907T023000Z");

    // Tier 2: Wed 2026-10-07 12:30 VN -> 05:30 UTC
    expect(ics).toContain("DTSTART:20261007T053000Z");
    expect(ics).toContain("DTEND:20261007T080000Z");

    // Tier 3: Sun 2026-11-15 07:00 VN -> 00:00 UTC
    expect(ics).toContain("DTSTART:20261115T000000Z");
    expect(ics).toContain("DTEND:20261115T023000Z");
  });

  it("does not generate events in weeks where the class does not meet", () => {
    // Tier 1 only meets on Mon, NOT Wed:
    // Wednesday of week 1 was 2026-09-09 -> should NOT exist in ICS
    expect(ics).not.toContain("DTSTART:20260909");

    // Tier 2 only meets on Wed, NOT Mon:
    // Monday of week 5 was 2026-10-05 -> should NOT exist in ICS
    expect(ics).not.toContain("DTSTART:20261005");

    // Week 9 (2026-11-02 to 2026-11-08) has no classes
    expect(ics).not.toContain("20261102");
    expect(ics).not.toContain("20261104");
  });

  it("formats stable UID as classcode-date-start@uelcourses", () => {
    expect(ics).toContain("UID:261BIM500101-2026-09-07-0700@uelcourses");
    expect(ics).toContain("UID:261BIM500101-2026-10-07-1230@uelcourses");
    expect(ics).toContain("UID:261BIM500101-2026-11-15-0700@uelcourses");
  });

  it("formats summary as 'MÃ Tên môn'", () => {
    expect(ics).toContain("SUMMARY:BIM5001 Quản trị thông tin");
  });

  it("includes room as LOCATION and class/lecturer in DESCRIPTION", () => {
    // RFC 5545 line unfolding: removes CRLF + whitespace folding
    const unfolded = ics.replace(/\r?\n[ \t]/g, "");
    expect(unfolded).toContain("LOCATION:A.201");
    expect(unfolded).toContain("LOCATION:B.305");
    expect(unfolded).toContain("LOCATION:C.102");
    expect(unfolded).toContain("DESCRIPTION:Mã HP: BIM5001\\nLớp: 261BIM500101\\nTiết 1–3\\nGV: TS. Nguyễn Văn A");
  });
});

describe("buildIcs edge cases", () => {
  it("skips sections without any dates when fallback is absent", () => {
    const sec: ClassSection = {
      module_code: "NODATES",
      class_code: "261NODATES",
      lessons: [{ weekday: 2, start_period: 1, end_period: 3, start_time: "07:00", end_time: "09:30" }],
    };
    const out = buildIcs([sec]);
    expect(out).not.toContain("BEGIN:VEVENT");
  });

  it("uses fallbackStart when section has no start_date", () => {
    const sec: ClassSection = {
      module_code: "FALLBACK",
      class_code: "261FALLBACK",
      lessons: [{ weekday: 2, start_period: 1, end_period: 3, start_time: "07:00", end_time: "09:30", weeks: "1" }],
    };
    const out = buildIcs([sec], { fallbackStart: "2026-09-07" });
    expect(out).toContain("BEGIN:VEVENT");
    expect(out).toContain("DTSTART:20260907T000000Z");
  });

  it("escapes special characters properly", () => {
    const sec: ClassSection = {
      module_code: "ESC",
      class_code: "261ESC",
      start_date: "2026-09-07",
      end_date: "2026-09-07",
      lessons: [
        {
          weekday: 2,
          start_period: 1,
          end_period: 2,
          date_start: "2026-09-07",
          date_end: "2026-09-07",
          room: "Room, A; 1",
          start_time: "07:00",
          end_time: "08:40",
        },
      ],
    };
    const out = buildIcs([sec], { moduleNames: { ESC: "Module, A; B" } });
    expect(out).toContain("SUMMARY:ESC Module\\, A\\; B");
    expect(out).toContain("LOCATION:Room\\, A\\; 1");
  });
});
