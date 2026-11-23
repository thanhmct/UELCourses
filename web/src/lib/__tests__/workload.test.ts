import { describe, expect, it } from "vitest";
import { calculateTimetableTotalHours, calculateWorkload, formatWorkloadString } from "../workload";

describe("workload calculation", () => {
  it("calculates standard 3-credit lecture workload", () => {
    const w = calculateWorkload(3, "Bắt buộc");
    expect(w.lecture).toBe(3);
    expect(w.total_hours).toBe(9);
    expect(formatWorkloadString(w)).toContain("9h/tuần");
    expect(formatWorkloadString(w, "en")).toContain("9h/week");
  });

  it("handles practical / lab modules", () => {
    const w = calculateWorkload(2, "Thực hành");
    expect(w.practical).toBe(4);
    expect(w.total_hours).toBeGreaterThan(5);
  });

  it("handles 0 credits safely", () => {
    const w = calculateWorkload(0);
    expect(w.total_hours).toBe(0);
  });

  it("calculates timetable total hours from real occurrences", () => {
    const sec = {
      module_code: "BIM5001",
      class_code: "261BIM500101",
      lessons: [
        {
          weekday: 2,
          start_period: 1,
          end_period: 3,
          start_time: "07:00",
          end_time: "09:30",
          date_start: "2026-09-07",
          date_end: "2026-09-21", // 3 Mondays: 07, 14, 21
        },
      ],
    };
    // 3 sessions * 2.5h = 7.5h
    const total = calculateTimetableTotalHours([sec]);
    expect(total).toBe(7.5);
  });
});
