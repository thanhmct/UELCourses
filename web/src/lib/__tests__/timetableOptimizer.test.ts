import { describe, expect, it } from "vitest";
import { periodEndTime, periodStartTime } from "../periods";
import { optimizeTimetable, type OptimizationCourse, type OptimizationPreferences } from "../timetableOptimizer";
import type { ClassSection } from "../types";

const preferences: OptimizationPreferences = {
  freeDays: [],
  earliest: 0,
  latest: 1439,
  lunchStart: 720,
  lunchEnd: 840,
  maxConsecutive: 240,
};
const semester = { semesterStart: "2026-09-07", semesterEnd: "2026-09-27" };

function lesson(weekday: number, start_period: number, end_period: number, date_start?: string) {
  return { weekday, start_period, end_period, date_start,
    start_time: periodStartTime(start_period), end_time: periodEndTime(end_period) };
}

function section(module_code: string, class_code: string, ...lessons: ClassSection["lessons"]): ClassSection {
  return { module_code, class_code, lessons };
}

function course(code: string, sections: ClassSection[], pinned = false): OptimizationCourse {
  return { code, currentClass: sections[0].class_code, sections, pinned };
}

describe("UEL timetable optimization", () => {
  it("keeps a pinned class and evaluates all meetings of each alternative", () => {
    const courses = [
      course("A", [section("A", "A1", lesson(2, 2, 3)), section("A", "A2", lesson(3, 2, 3))], true),
      course("B", [
        section("B", "B1", lesson(2, 2, 3)),
        section("B", "B2", lesson(4, 4, 5), lesson(6, 4, 5)),
        section("B", "B3", lesson(3, 4, 5)),
        section("B", "B4", lesson(3, 1, 2)),
      ]),
    ];
    expect(optimizeTimetable({ ...semester, courses, preferences: { ...preferences, freeDays: [6], earliest: 450 } }))
      .toEqual({ status: "success", classes: { A: "A1", B: "B3" }, meetsPreferences: true });
  });

  it("allows the same time on different weeks and accounts for one-day replacements", () => {
    const courses = [
      course("A", [section("A", "A1", lesson(2, 2, 3), lesson(3, 2, 3, "2026-09-15"))]),
      course("B", [section("B", "B1", lesson(2, 2, 3, "2026-09-14"))]),
    ];
    expect(optimizeTimetable({ ...semester, courses, preferences }))
      .toMatchObject({ status: "success", classes: { A: "A1", B: "B1" } });
    courses[1] = course("B", [section("B", "B1", lesson(2, 2, 3, "2026-09-21"))]);
    expect(optimizeTimetable({ ...semester, courses, preferences })).toEqual({ status: "no-match" });
  });

  it.each([[6, 7], [12, 13], [5, 5]])("rejects periods %i and %i even when relaxing a day off would otherwise work", (first, second) => {
    const courses = [
      course("A", [section("A", "A1", lesson(2, first, first))], true),
      course("B", [section("B", "B1", lesson(2, second, second))]),
    ];
    const input = { courses, preferences: { ...preferences, freeDays: [2], lunchStart: 900, lunchEnd: 960 } };
    expect(optimizeTimetable(input)).toEqual({ status: "no-match" });
    expect(optimizeTimetable({ ...semester, ...input })).toEqual({ status: "no-match" });
  });

  it("chooses the smallest departure while relaxing at most one condition", () => {
    const courses = [course("A", [
      section("A", "A1", lesson(2, 1, 1)),
      section("A", "A2", lesson(2, 2, 2)),
      section("A", "A3", lesson(7, 4, 4)),
    ])];
    const input = { ...semester, courses, preferences: { ...preferences, earliest: 480, freeDays: [7] } };
    expect(optimizeTimetable(input)).toEqual({
      status: "success", classes: { A: "A2" }, meetsPreferences: false, relaxed: { kind: "earliest", minutes: 10 },
    });
    expect(optimizeTimetable({ ...input, courses: [{ ...courses[0], pinned: true }] })).toEqual({
      status: "success", classes: { A: "A1" }, meetsPreferences: false, relaxed: { kind: "earliest", minutes: 60 },
    });
  });

  it("does not relax two personal conditions across courses or two selected days off", () => {
    const a = course("A", [section("A", "A1", lesson(2, 1, 1))]);
    const b = course("B", [section("B", "B1", lesson(3, 4, 4))]);
    const input = { ...semester, courses: [a, b], preferences: { ...preferences, earliest: 480, freeDays: [3] } };
    expect(optimizeTimetable(input)).toEqual({ status: "no-match" });
    expect(optimizeTimetable({ ...input, preferences: { ...preferences, freeDays: [2, 3] } })).toEqual({ status: "no-match" });
    expect(optimizeTimetable({ ...input, courses: [b] })).toEqual({
      status: "success", classes: { B: "B1" }, meetsPreferences: false, relaxed: { kind: "freeDay", weekday: 3, minutes: 50 },
    });
  });

  it("does not count a clash on a verified school holiday", () => {
    const courses = [
      course("A", [section("A", "A1", lesson(6, 2, 3, "2027-04-30"), lesson(4, 2, 3, "2027-04-28"))], true),
      course("B", [section("B", "B1", lesson(6, 2, 3, "2027-04-30"), lesson(5, 2, 3, "2027-04-29"))]),
    ];
    const input = { courses, preferences };
    expect(optimizeTimetable(input)).toEqual({ status: "no-match" });
    expect(optimizeTimetable({ ...input, noClassDates: new Set(["2027-04-30"]) }))
      .toMatchObject({ status: "success", classes: { A: "A1", B: "B1" } });
  });

  it("selects the class with a lunch break and indicates when preferences are unmet", () => {
    const current = section("A", "A1", lesson(2, 7, 9));
    const alternative = section("A", "A2", lesson(2, 10, 11));
    const input = { ...semester, courses: [course("A", [current, alternative])], preferences };
    expect(optimizeTimetable(input))
      .toMatchObject({ status: "success", classes: { A: "A2" }, meetsPreferences: true });
    expect(optimizeTimetable({ ...input, preferences: { ...preferences, maxConsecutive: 60 } }))
      .toMatchObject({ status: "success", classes: { A: "A2" }, meetsPreferences: false, relaxed: { kind: "maxHours", minutes: 40 } });
  });
});
