import { describe, expect, it } from "vitest";
import { buildIcs } from "../ics";
import { formatHolidayTitle, holidayAppearanceFor, noClassDates, verifiedHolidays, vietnamDate, type AcademicHoliday } from "../holidays";
import { getSectionOccurrences } from "../occurrences";
import type { ClassSection } from "../types";
import { vietnameseLunarHolidays } from "../vietnameseLunar";

const schoolTet: AcademicHoliday = {
  id: 1, kind: "holiday", title: "Nghỉ Tết Âm lịch năm 2027",
  start_date: "2027-02-01", end_date: "2027-02-14", verified: true, cohorts: ["all"],
};

describe("Vietnamese holiday dates", () => {
  it("uses lunar dates in UTC+7, including a year that differs from the Chinese calendar", () => {
    expect(vietnameseLunarHolidays(2007)?.tet).toBe("2007-02-17");
    expect(vietnameseLunarHolidays(2027)).toEqual({ tet: "2027-02-06", hungKings: "2027-04-16" });
    expect(vietnameseLunarHolidays(2028)?.tet).toBe("2028-01-26");
    expect(vietnamDate(new Date("2026-11-23T17:05:00Z"))).toBe("2026-11-24");
  });

  it("applies the Tết theme to the school's full break", () => {
    expect(holidayAppearanceFor("2027-02-13", "2027-02-13", [schoolTet])).toMatchObject({ theme: "tet" });
    expect(holidayAppearanceFor("2027-02-13", "2027-02-13", [])).toBeNull();
  });

  it.each([
    ["tet", "2027-01-17", "2027-01-18", "2027-02-06"],
    ["hungKings", "2027-03-28", "2027-03-29", "2027-04-16"],
    ["reunification", "2025-04-13", "2025-04-14", "2025-04-30"],
    ["national", "2026-08-16", "2026-08-17", "2026-09-02"],
  ])("starts the %s theme on the Monday two weeks before the official week", (theme, dayBefore, start, date) => {
    expect(holidayAppearanceFor(dayBefore, dayBefore, [])).toBeNull();
    expect(holidayAppearanceFor(start, start, [])).toEqual({ theme, date });
  });

  it("gives the official week priority over overlapping early starts", () => {
    expect(holidayAppearanceFor("2027-04-12", "2027-04-18", [])).toEqual({ theme: "hungKings", date: "2027-04-16" });
    expect(holidayAppearanceFor("2027-04-19", "2027-04-25", [])).toEqual({ theme: "reunification", date: "2027-04-30" });
    expect(holidayAppearanceFor("2027-04-26", "2027-05-02", [])).toEqual({ theme: "reunification", date: "2027-04-30" });
    expect(holidayAppearanceFor("2027-05-01", "2027-05-01", [])).toBeNull();
  });

  it("starts Christmas after Vietnamese Culture Day and runs through December 25", () => {
    expect(holidayAppearanceFor("2026-11-24", "2026-11-24", [])).toEqual({ theme: "hungKings", date: "2026-11-24" });
    expect(holidayAppearanceFor("2026-11-23", "2026-11-29", [])).toEqual({ theme: "hungKings", date: "2026-11-24" });
    expect(holidayAppearanceFor("2026-11-25", "2026-11-25", [])).toEqual({ theme: "christmas", date: "2026-12-25" });
    expect(holidayAppearanceFor("2026-12-21", "2026-12-27", [])).toEqual({ theme: "christmas", date: "2026-12-25" });
    expect(holidayAppearanceFor("2026-12-26", "2026-12-26", [])).toBeNull();
    expect(holidayAppearanceFor("2025-11-24", "2025-11-24", [])).toBeNull();
  });

  it("recognizes Halloween without extending it to adjacent school closure dates", () => {
    const closure = { ...schoolTet, start_date: "2026-10-29", end_date: "2026-10-31" };
    expect(holidayAppearanceFor("2026-10-26", "2026-11-01", [])).toEqual({ theme: "halloween", date: "2026-10-31" });
    expect(holidayAppearanceFor("2026-10-29", "2026-10-30", [closure])).toBeNull();
    expect(noClassDates([], "2026-10-26", "2026-11-01").size).toBe(0);
  });
});

describe("UEL days off", () => {
  it("localizes calendar closure titles for the English UI", () => {
    expect(formatHolidayTitle("Nghỉ Ngày Văn hóa Việt Nam (không xếp lịch thi)", "en"))
      .toBe("Vietnamese Culture Day holiday (no exams scheduled)");
    expect(formatHolidayTitle("Nghỉ Tết Âm lịch năm 2027", "en")).toBe("Lunar New Year holiday");
    expect(formatHolidayTitle("Nghỉ Ngày Văn hóa Việt Nam", "vi")).toBe("Nghỉ Ngày Văn hóa Việt Nam");
  });

  it("uses verified closures applicable to the selected cohort and clips inclusive ranges", () => {
    const events = [schoolTet, { ...schoolTet, id: 2, cohorts: ["K26"] },
      { ...schoolTet, id: 3, kind: "makeup_day" }, { ...schoolTet, id: 4, verified: false },
      { ...schoolTet, id: 5, end_date: null, start_date: "2027-02-15" }];
    expect(verifiedHolidays(events, []).map(({ id }) => id)).toEqual([1, 5]);
    expect(verifiedHolidays(events, ["K26"]).map(({ id }) => id)).toEqual([1, 2, 5]);
    expect(verifiedHolidays(events, ["K25", "K26"]).map(({ id }) => id)).toEqual([1, 5]);
    const dates = noClassDates(verifiedHolidays(events, []), "2027-02-13", "2027-02-15");
    expect([...dates]).toEqual(["2027-02-13", "2027-02-14", "2027-02-15"]);
  });

  it("removes closed dates from actual occurrences and ICS without dropping the makeup session", () => {
    const base = { start_period: 1, end_period: 2, start_time: "07:00", end_time: "08:40" };
    const section: ClassSection = { module_code: "BIM5001", class_code: "271BIM500101", lessons: [
      { ...base, weekday: 2, date_start: "2027-01-25", date_end: "2027-02-15" },
      { ...base, weekday: 3, date_start: "2027-02-16" },
    ] };
    const options = { noClassDates: noClassDates([schoolTet], "2027-01-01", "2027-03-01") };
    expect(getSectionOccurrences(section, options).map(({ date }) => date)).toEqual(["2027-01-25", "2027-02-16"]);
    const ics = buildIcs([section], options);
    expect(ics).not.toContain("20270201T");
    expect(ics).not.toContain("20270208T");
    expect(ics).toContain("DTSTART:20270216T000000Z");
  });
});
