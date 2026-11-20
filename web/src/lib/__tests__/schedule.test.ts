import { describe, expect, it } from "vitest";
import { parseSchedules, parseWeekList, parseWeekday } from "../schedule";
import { periodEndTime, periodStartTime, timeToPeriod, PERIOD_COUNT } from "../periods";

describe("periods config", () => {
  it("matches confirmed UEL period start times", () => {
    expect(periodStartTime(1)).toBe("07:00");
    expect(periodStartTime(2)).toBe("07:50");
    expect(periodStartTime(4)).toBe("09:45");
    expect(periodStartTime(7)).toBe("12:30");
    expect(periodStartTime(8)).toBe("13:20");
    expect(periodStartTime(10)).toBe("15:15");
    expect(periodEndTime(1)).toBe("07:50");
    expect(PERIOD_COUNT).toBe(15);
  });
  it("maps clock time to period", () => {
    expect(timeToPeriod("07:00")).toBe(1);
    expect(timeToPeriod("09:40")).toBe(4); // in break -> next period
    expect(timeToPeriod("13:25")).toBe(8);
    expect(timeToPeriod("06:00")).toBeNull();
    expect(timeToPeriod("abc")).toBeNull();
  });
});

describe("parseWeekday", () => {
  it("understands several notations", () => {
    expect(parseWeekday("Thứ 2")).toBe(2);
    expect(parseWeekday("T5")).toBe(5);
    expect(parseWeekday("Chủ nhật")).toBe(8);
    expect(parseWeekday("CN")).toBe(8);
    expect(parseWeekday("thu 7")).toBe(7);
    expect(parseWeekday("xyz")).toBeNull();
  });
});

describe("parseSchedules", () => {
  it("parses a Vietnamese text schedule with multiple segments", () => {
    const r = parseSchedules("Thứ 2, tiết 1-3, phòng B.203; Thứ 5, tiết 7-9, phòng A.101, tuần 4-12");
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ weekday: 2, start_period: 1, end_period: 3, room: "B.203", start_time: "07:00", end_time: "09:30" });
    expect(r[1]).toMatchObject({ weekday: 5, start_period: 7, end_period: 9, room: "A.101", weeks: "4-12" });
  });
  it("parses compact T2(1-3) style", () => {
    const r = parseSchedules("T3(4-6) C.105");
    expect(r[0]).toMatchObject({ weekday: 3, start_period: 4, end_period: 6, room: "C.105" });
  });
  it("parses time ranges", () => {
    const r = parseSchedules("Thứ 4 07:00 - 09:30 P. B.302");
    expect(r[0]).toMatchObject({ weekday: 4, start_period: 1, end_period: 3 });
  });
  it("parses arrays of objects with various field names", () => {
    const r = parseSchedules([
      { DayOfWeek: 6, BeginPeriod: 2, NumberOfPeriods: 3, RoomName: "D.201" },
      { weekday: "Chủ nhật", start_period: 13, end_period: 15 },
    ]);
    expect(r).toEqual([
      expect.objectContaining({ weekday: 6, start_period: 2, end_period: 4, room: "D.201" }),
      expect.objectContaining({ weekday: 8, start_period: 13, end_period: 15 }),
    ]);
  });
  it("parses JSON strings", () => {
    expect(parseSchedules('[{"weekday":2,"start_period":1,"end_period":2}]')).toHaveLength(1);
  });
  it("never throws on garbage", () => {
    expect(parseSchedules(undefined)).toEqual([]);
    expect(parseSchedules(42)).toEqual([]);
    expect(parseSchedules("không có lịch")).toEqual([]);
    expect(parseSchedules("{bad json")).toEqual([]);
    expect(parseSchedules([{ weekday: 99, start_period: 1 }])).toEqual([]);
  });
  it("swaps reversed periods and clamps out-of-range", () => {
    const r = parseSchedules({ weekday: 2, start_period: 5, end_period: 3 });
    expect(r[0]).toMatchObject({ start_period: 3, end_period: 5 });
    const c = parseSchedules({ weekday: 2, start_period: 14, end_period: 20 });
    expect(c[0].end_period).toBe(15);
  });
});

describe("parseWeekList", () => {
  it("expands ranges and lists", () => {
    expect([...parseWeekList("4-12")!]).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect([...parseWeekList("1,3,5-6")!]).toEqual([1, 3, 5, 6]);
    expect(parseWeekList("")).toBeNull();
    expect(parseWeekList(undefined)).toBeNull();
  });
});
