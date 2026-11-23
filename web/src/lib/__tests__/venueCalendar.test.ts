import { describe, expect, it } from "vitest";
import { dateKey, defaultMonth, monthGrid, monthLabel, monthsOf, occurrencesByDay, sessionDates } from "../venueCalendar";
import type { VenueSession } from "../types";

const S = (weekday: number, start: number, end: number, extra: Partial<VenueSession> = {}): VenueSession =>
  ({ weekday, start_period: start, end_period: end, ...extra }) as VenueSession;

const sem = { start_date: "2026-07-07", end_date: "2027-03-04" };

describe("lịch phòng theo tháng", () => {
  it("suy ra ngày từ tuần học và ngày bắt đầu học kỳ (tuần 1 = tuần chứa ngày bắt đầu)", () => {
    // 2026-07-07 là thứ Ba → tuần 1 bắt đầu thứ Hai 2026-07-06
    const dates = sessionDates(S(2, 1, 3, { weeks: "1-2" }), sem).map(dateKey);
    expect(dates).toEqual(["2026-07-06", "2026-07-13"]);
    expect(sessionDates(S(8, 1, 3, { weeks: "1" }), sem).map(dateKey)).toEqual(["2026-07-12"]);
  });

  it("ưu tiên date_start/date_end khi có", () => {
    const dates = sessionDates(S(3, 1, 3, { date_start: "2026-07-06", date_end: "2026-07-20" }), sem).map(dateKey);
    expect(dates).toEqual(["2026-07-07", "2026-07-14"]);
  });

  it("gom buổi học theo ngày trong đúng tháng", () => {
    const byDay = occurrencesByDay([S(2, 1, 3, { weeks: "1-6" })], sem, "2026-07");
    expect([...byDay.keys()]).toEqual(["2026-07-06", "2026-07-13", "2026-07-20", "2026-07-27"]);
  });

  it("liệt kê các tháng của học kỳ và chọn tháng mặc định", () => {
    const months = monthsOf(sem);
    expect(months).toHaveLength(9);
    expect(months[0]).toBe("2026-07");
    expect(months[8]).toBe("2027-03");
    expect(defaultMonth(months, new Date(2026, 8, 15))).toBe("2026-09");
    expect(defaultMonth(months, new Date(2025, 0, 1))).toBe("2026-07");
    expect(monthsOf({ start_date: null, end_date: null })).toEqual([]);
  });

  it("lưới tháng bắt đầu từ thứ Hai và kết thúc cuối tuần, đủ bội số của 7", () => {
    const cells = monthGrid("2026-07");
    expect(dateKey(cells[0])).toBe("2026-06-29");
    expect(cells.length % 7).toBe(0);
    expect(dateKey(cells[cells.length - 1])).toBe("2026-08-02");
  });

  it("định dạng nhãn tháng theo ngôn ngữ VI và EN", () => {
    expect(monthLabel("2026-07", "vi")).toBe("07/2026");
    expect(monthLabel("2026-07", "en")).toBe("07/2026");
    expect(monthLabel("2027-11", "en")).toBe("11/2027");
  });
});
