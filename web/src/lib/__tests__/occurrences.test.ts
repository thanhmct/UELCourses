import { describe, expect, it } from "vitest";
import {
  expandLessonOccurrences,
  getLessonTimes,
  getModuleTotalHours,
  getOccurrencesByDate,
  getOccurrencesByWeek,
  getSectionOccurrences,
  getTimetableOccurrences,
  getWorkloadStats,
} from "../occurrences";
import type { ClassSection, Lesson } from "../types";

describe("getLessonTimes", () => {
  it("calculates duration from explicit start_time and end_time", () => {
    const l: Lesson = {
      weekday: 2,
      start_period: 1,
      end_period: 3,
      start_time: "07:00",
      end_time: "09:30",
    };
    const res = getLessonTimes(l);
    expect(res.start).toBe("07:00");
    expect(res.end).toBe("09:30");
    expect(res.durationHours).toBe(2.5); // 150 min / 60
  });

  it("falls back to UEL period schedule if start_time/end_time are missing", () => {
    const l: Lesson = {
      weekday: 4,
      start_period: 7,
      end_period: 9,
      start_time: "",
      end_time: "",
    };
    const res = getLessonTimes(l);
    expect(res.start).toBe("12:30");
    expect(res.end).toBe("15:00");
    expect(res.durationHours).toBe(2.5);
  });
});

describe("occurrences with 3-tier class", () => {
  // Lớp 3 tầng ngày theo đề bài:
  // Tầng 1: tuần 1–4 Thứ 2 tiết 1–3 (07:00–09:30)
  // Tầng 2: tuần 5–8 Thứ 4 tiết 7–9 (12:30–15:00)
  // Tầng 3: một ngày thi Chủ nhật tiết 1–3 (07:00–09:30)
  const threeTierSection: ClassSection = {
    module_code: "BIM5001",
    class_code: "261BIM500101",
    lecturer: "TS. Nguyễn Văn A",
    start_date: "2026-09-07", // Week 1 Mon
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

  it("expands to exact 9 concrete sessions with accurate dates and times", () => {
    const occs = getSectionOccurrences(threeTierSection);
    expect(occs).toHaveLength(9);

    // Tier 1: 4 Mondays
    expect(occs[0].date).toBe("2026-09-07");
    expect(occs[0].weekday).toBe(2);
    expect(occs[0].start).toBe("07:00");
    expect(occs[0].end).toBe("09:30");
    expect(occs[0].room).toBe("A.201");

    expect(occs[1].date).toBe("2026-09-14");
    expect(occs[2].date).toBe("2026-09-21");
    expect(occs[3].date).toBe("2026-09-28");

    // Tier 2: 4 Wednesdays
    expect(occs[4].date).toBe("2026-10-07");
    expect(occs[4].weekday).toBe(4);
    expect(occs[4].start).toBe("12:30");
    expect(occs[4].end).toBe("15:00");
    expect(occs[4].room).toBe("B.305");

    expect(occs[5].date).toBe("2026-10-14");
    expect(occs[6].date).toBe("2026-10-21");
    expect(occs[7].date).toBe("2026-10-28");

    // Tier 3: 1 Sunday exam
    expect(occs[8].date).toBe("2026-11-15");
    expect(occs[8].weekday).toBe(8);
    expect(occs[8].start).toBe("07:00");
    expect(occs[8].end).toBe("09:30");
    expect(occs[8].room).toBe("C.102");
  });

  it("computes total module hours without hypothetical week multiplier", () => {
    const totalHours = getModuleTotalHours(threeTierSection);
    // 9 sessions * 2.5 hours = 22.5 hours
    expect(totalHours).toBe(22.5);
  });

  it("calculates weekly workload correctly for each week", () => {
    const occs = getSectionOccurrences(threeTierSection);
    const weeks = getOccurrencesByWeek(occs, {
      semesterStart: "2026-09-07",
      semesterEnd: "2026-11-22",
    });

    // Week 1 (07/09 - 13/09): Tier 1 Monday session = 2.5 hours
    const w1 = weeks.find((w) => w.startIso === "2026-09-07");
    expect(w1?.totalHours).toBe(2.5);
    expect(w1?.occurrences).toHaveLength(1);
    expect(w1?.occurrences[0].weekday).toBe(2);

    // Week 5 (05/10 - 11/10): Tier 2 Wednesday session = 2.5 hours (no Monday session)
    const w5 = weeks.find((w) => w.startIso === "2026-10-05");
    expect(w5?.totalHours).toBe(2.5);
    expect(w5?.occurrences).toHaveLength(1);
    expect(w5?.occurrences[0].weekday).toBe(4);

    // Week 9 (02/11 - 08/11): No sessions between Tier 2 and Tier 3 = 0 hours
    const w9 = weeks.find((w) => w.startIso === "2026-11-02");
    expect(w9?.totalHours).toBe(0);
    expect(w9?.occurrences).toHaveLength(0);

    // Week 10 (09/11 - 15/11): Exam session on Sunday = 2.5 hours
    const w10 = weeks.find((w) => w.startIso === "2026-11-09");
    expect(w10?.totalHours).toBe(2.5);
    expect(w10?.occurrences[0].weekday).toBe(8);
  });

  it("calculates workload stats (peak, average, total)", () => {
    const occs = getSectionOccurrences(threeTierSection);
    const weeks = getOccurrencesByWeek(occs, {
      semesterStart: "2026-09-07",
      semesterEnd: "2026-11-22",
    });
    const stats = getWorkloadStats(weeks);

    expect(stats.maxWeekHours).toBe(2.5);
    expect(stats.avgWeekHours).toBe(2.5); // 9 active weeks with 2.5h
    expect(stats.totalHours).toBe(22.5);
  });
});

describe("occurrences edge cases", () => {
  it("handles single-day session with date_start === date_end", () => {
    const sec: ClassSection = {
      module_code: "TEST01",
      class_code: "261TEST01",
      lessons: [
        {
          weekday: 7,
          start_period: 1,
          end_period: 2,
          date_start: "2026-10-10",
          date_end: "2026-10-10",
          start_time: "07:00",
          end_time: "08:40",
        },
      ],
    };
    const occs = getSectionOccurrences(sec);
    expect(occs).toHaveLength(1);
    expect(occs[0].date).toBe("2026-10-10");
  });

  it("handles legacy schedule with weeks only", () => {
    const sec: ClassSection = {
      module_code: "LEGACY",
      class_code: "261LEGACY",
      start_date: "2026-09-07",
      end_date: "2026-12-27",
      lessons: [
        {
          weekday: 2,
          start_period: 1,
          end_period: 3,
          weeks: "1-2,4",
          start_time: "07:00",
          end_time: "09:30",
        },
      ],
    };
    const occs = getSectionOccurrences(sec);
    expect(occs).toHaveLength(3);
    expect(occs[0].date).toBe("2026-09-07"); // Week 1
    expect(occs[1].date).toBe("2026-09-14"); // Week 2
    expect(occs[2].date).toBe("2026-09-28"); // Week 4
  });

  it("respects section start_date and end_date bounds", () => {
    const sec: ClassSection = {
      module_code: "BOUNDS",
      class_code: "261BOUNDS",
      start_date: "2026-09-14", // section starts on week 2
      end_date: "2026-09-21",   // section ends on week 3
      lessons: [
        {
          weekday: 2,
          start_period: 1,
          end_period: 3,
          date_start: "2026-09-07", // week 1 (before section start)
          date_end: "2026-09-28",   // week 4 (after section end)
          start_time: "07:00",
          end_time: "09:30",
        },
      ],
    };
    const occs = getSectionOccurrences(sec);
    // Only week 2 (09-14) and week 3 (09-21) fall within section bounds
    expect(occs).toHaveLength(2);
    expect(occs[0].date).toBe("2026-09-14");
    expect(occs[1].date).toBe("2026-09-21");
  });

  it("groups occurrences by date with getOccurrencesByDate", () => {
    const sec: ClassSection = {
      module_code: "MULTI",
      class_code: "261MULTI",
      lessons: [
        {
          weekday: 2,
          start_period: 1,
          end_period: 3,
          date_start: "2026-09-07",
          date_end: "2026-09-07",
          start_time: "07:00",
          end_time: "09:30",
        },
        {
          weekday: 2,
          start_period: 7,
          end_period: 9,
          date_start: "2026-09-07",
          date_end: "2026-09-07",
          start_time: "12:30",
          end_time: "15:00",
        },
      ],
    };
    const occs = getSectionOccurrences(sec);
    const byDate = getOccurrencesByDate(occs);
    expect(byDate.has("2026-09-07")).toBe(true);
    expect(byDate.get("2026-09-07")).toHaveLength(2);
    expect(byDate.get("2026-09-07")![0].start_period).toBe(1);
    expect(byDate.get("2026-09-07")![1].start_period).toBe(7);
  });
});
