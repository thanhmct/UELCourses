import { describe, expect, it } from "vitest";
import type { ClassSection, Lesson } from "../types";
import { buildIcs } from "../ics";
import {
  applyOneDayOverrides,
  expandLessonOccurrences,
  getOccurrencesByWeek,
  getSectionOccurrences,
  getTimetableOccurrences,
  isOneDayLesson,
} from "../occurrences";

const lesson = (over: Partial<Lesson>): Lesson => ({
  weekday: 7,
  start_period: 1,
  end_period: 3,
  start_time: "07:00",
  end_time: "09:30",
  room: "B1.205",
  ...over,
});

const section = (lessons: Lesson[], class_code = "261BAA202802"): ClassSection => ({
  class_code,
  module_code: "BAA2028",
  start_date: "2026-09-07",
  end_date: "2026-11-15",
  lessons,
});

describe("isOneDayLesson", () => {
  it("nhận date_start === date_end là một ngày, và thiếu date_end cũng là một ngày", () => {
    expect(isOneDayLesson(lesson({ date_start: "2026-09-28", date_end: "2026-09-28" }))).toBe(true);
    expect(isOneDayLesson(lesson({ date_start: "2026-09-28" }))).toBe(true);
    expect(isOneDayLesson(lesson({ date_start: "2026-09-28", date_end: "2026-09-28T00:00:00" }))).toBe(true);
    expect(isOneDayLesson(lesson({ date_start: "2026-09-19", date_end: "2026-10-31" }))).toBe(false);
    expect(isOneDayLesson(lesson({}))).toBe(false);
  });
});

describe("applyOneDayOverrides", () => {
  // 28/09/2026 là Thứ 2. Lịch lặp là Thứ 2 tiết 1-3 từ 21/09 đến 12/10; buổi một ngày dạy bù cùng ngày 28/09 ở phòng khác.
  const recurring = lesson({ weekday: 2, date_start: "2026-09-21", date_end: "2026-10-12", room: "A.802" });
  const makeup = lesson({ weekday: 2, start_period: 7, end_period: 9, start_time: "12:30", end_time: "15:00", date_start: "2026-09-28", date_end: "2026-09-28", room: "B2.101" });

  it("buổi một ngày loại buổi lặp rơi đúng ngày đó của cùng lớp", () => {
    const occ = getSectionOccurrences(section([recurring, makeup]));
    const on28 = occ.filter((o) => o.date === "2026-09-28");
    expect(on28).toHaveLength(1);
    expect(on28[0].room).toBe("B2.101");
    // các ngày khác của lịch lặp vẫn còn: 21/09, 05/10, 12/10
    expect(occ.map((o) => o.date)).toEqual(["2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12"]);
  });

  it("thay buổi thứ Bảy bằng buổi thứ Hai trong tuần và giữ lịch các tuần lân cận", () => {
    const saturday = lesson({ date_start: "2026-09-19", date_end: "2026-10-31" });
    const selected = section([saturday, makeup]);
    const weeks = getOccurrencesByWeek(getTimetableOccurrences([selected]));
    const prev = weeks.find((w) => w.startIso === "2026-09-21");
    const replaced = weeks.find((w) => w.startIso === "2026-09-28");
    const next = weeks.find((w) => w.startIso === "2026-10-05");

    expect(prev?.occurrences.map((o) => o.date)).toEqual(["2026-09-26"]);
    expect(replaced?.occurrences).toMatchObject([{ date: "2026-09-28", room: "B2.101" }]);
    expect(replaced?.totalHours).toBe(2.5);
    expect(next?.occurrences.map((o) => o.date)).toEqual(["2026-10-10"]);

    const ics = buildIcs([selected]);
    expect(ics).toContain("DTSTART:20260928T053000Z");
    expect(ics).not.toContain("DTSTART:20261003");
  });

  it("chỉ thay lịch lặp của cùng mã lớp và mã học phần", () => {
    const a = section([recurring, makeup]);
    const b = section([recurring], "261BAA202803");
    const c = { ...section([recurring]), module_code: "OTHER" };
    const expanded = [a, b, c].flatMap((s) => s.lessons.flatMap((l) => expandLessonOccurrences(s, l)));
    const on28 = applyOneDayOverrides(expanded).filter((o) => o.date === "2026-09-28");

    expect(on28.map((o) => [o.class_code, o.module_code, o.room])).toEqual([
      [a.class_code, a.module_code, makeup.room],
      [b.class_code, b.module_code, recurring.room],
      [c.class_code, c.module_code, recurring.room],
    ]);
  });

  it("Chủ nhật vẫn thuộc tuần cũ khi có buổi Một ngày vào thứ Hai kế tiếp", () => {
    const sunday = lesson({ weekday: 8, weeks: "3-4" });
    const occ = getSectionOccurrences(section([sunday, { ...makeup, date_end: undefined }]));

    expect(occ.map((o) => o.date)).toEqual(["2026-09-27", "2026-09-28"]);
  });

  it("giữ các buổi Một ngày và bỏ các buổi lặp của lớp trong cùng tuần", () => {
    const saturday = lesson({ date_start: "2026-09-19", date_end: "2026-10-31" });
    const m2 = lesson({ weekday: 4, date_start: "2026-09-30", room: "B2.102" });
    const occ = getSectionOccurrences(section([recurring, saturday, makeup, m2]));
    const week = occ.filter((o) => o.date >= "2026-09-28" && o.date <= "2026-10-04");
    expect(week.map((o) => o.lesson)).toEqual([makeup, m2]);
  });

  it("không có buổi một ngày thì không đổi gì", () => {
    const occ = getSectionOccurrences(section([recurring]));
    expect(occ.map((o) => o.date)).toEqual(["2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12"]);
  });
});
