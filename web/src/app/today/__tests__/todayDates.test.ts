import { describe, expect, it } from "vitest";
import {
  formatDateWithWeekday,
  formatDayMonth,
  getNextWeekDays,
  getTodayAndTomorrowDays,
  getWeekdayLabel,
  getWeekdayNumber,
  isoDay,
} from "../todayDates";

describe("todayDates helpers", () => {
  describe("getWeekdayNumber & getWeekdayLabel", () => {
    it("ánh xạ đúng thứ theo quy ước UEL (2=T2, 8=CN)", () => {
      // 2026-11-23 is Monday
      const monday = new Date(2026, 10, 23);
      expect(getWeekdayNumber(monday)).toBe(2);
      expect(getWeekdayLabel(2, "vi")).toBe("Thứ hai");
      expect(getWeekdayLabel(2, "en")).toBe("Monday");

      // 2026-11-28 is Saturday
      const saturday = new Date(2026, 10, 28);
      expect(getWeekdayNumber(saturday)).toBe(7);
      expect(getWeekdayLabel(7, "vi")).toBe("Thứ bảy");
      expect(getWeekdayLabel(7, "en")).toBe("Saturday");

      // 2026-11-29 is Sunday
      const sunday = new Date(2026, 10, 29);
      expect(getWeekdayNumber(sunday)).toBe(8);
      expect(getWeekdayLabel(8, "vi")).toBe("Chủ nhật");
      expect(getWeekdayLabel(8, "en")).toBe("Sunday");
    });

    it("đủ 7 thứ cả tiếng Việt và tiếng Anh", () => {
      const expectedVi = [
        "Thứ hai",
        "Thứ ba",
        "Thứ tư",
        "Thứ năm",
        "Thứ sáu",
        "Thứ bảy",
        "Chủ nhật",
      ];
      const expectedEn = [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ];
      for (let w = 2; w <= 8; w++) {
        expect(getWeekdayLabel(w, "vi")).toBe(expectedVi[w - 2]);
        expect(getWeekdayLabel(w, "en")).toBe(expectedEn[w - 2]);
      }
    });
  });

  describe("formatDateWithWeekday & formatDayMonth", () => {
    it("định dạng đúng thứ + ngày/tháng (Thứ hai, 23/11)", () => {
      const mon = new Date(2026, 10, 23); // 23 Nov 2026
      expect(formatDayMonth(mon)).toBe("23/11");
      expect(formatDateWithWeekday(mon, "vi")).toBe("Thứ hai, 23/11");
      expect(formatDateWithWeekday(mon, "en")).toBe("Monday, 23/11");

      const sun = new Date(2026, 10, 29); // 29 Nov 2026
      expect(formatDateWithWeekday(sun, "vi")).toBe("Chủ nhật, 29/11");
      expect(formatDateWithWeekday(sun, "en")).toBe("Sunday, 29/11");
    });

    it("định dạng ngày 1 chữ số có số 0 đệm", () => {
      const dec1 = new Date(2026, 11, 1); // 1 Dec 2026 (Tuesday)
      expect(formatDayMonth(dec1)).toBe("01/12");
      expect(formatDateWithWeekday(dec1, "vi")).toBe("Thứ ba, 01/12");
      expect(isoDay(dec1)).toBe("2026-12-01");
    });
  });

  describe("getTodayAndTomorrowDays", () => {
    it("khi hôm nay là Thứ hai: trả về 2 ngày (Thứ hai và Thứ ba)", () => {
      const monday = new Date(2026, 10, 23);
      const days = getTodayAndTomorrowDays(monday, "vi");
      expect(days).toHaveLength(2);
      expect(days[0].weekday).toBe(2);
      expect(days[0].label).toBe("Thứ hai, 23/11");
      expect(days[0].isToday).toBe(true);

      expect(days[1].weekday).toBe(3);
      expect(days[1].label).toBe("Thứ ba, 24/11");
      expect(days[1].isToday).toBe(false);
    });

    it("khi hôm nay là Thứ bảy: trả về 2 ngày (Thứ bảy và Chủ nhật của tuần này)", () => {
      const saturday = new Date(2026, 10, 28);
      const days = getTodayAndTomorrowDays(saturday, "vi");
      expect(days).toHaveLength(2);
      expect(days[0].weekday).toBe(7);
      expect(days[0].label).toBe("Thứ bảy, 28/11");
      expect(days[0].isToday).toBe(true);

      expect(days[1].weekday).toBe(8);
      expect(days[1].label).toBe("Chủ nhật, 29/11");
      expect(days[1].isToday).toBe(false);
    });

    it("biên Chủ nhật: nếu hôm nay là Chủ nhật thì CHỈ trả về hôm nay", () => {
      const sunday = new Date(2026, 10, 29);
      const days = getTodayAndTomorrowDays(sunday, "vi");
      expect(days).toHaveLength(1);
      expect(days[0].weekday).toBe(8);
      expect(days[0].label).toBe("Chủ nhật, 29/11");
      expect(days[0].isToday).toBe(true);
    });
  });

  describe("getNextWeekDays", () => {
    it("luôn trả về đúng 7 ngày từ Thứ hai đến Chủ nhật của tuần kế tiếp", () => {
      const wednesday = new Date(2026, 10, 25);
      const nextWeek = getNextWeekDays(wednesday, "vi");
      expect(nextWeek).toHaveLength(7);

      // Thứ tự các ngày từ 2 (Thứ hai) đến 8 (Chủ nhật)
      for (let i = 0; i < 7; i++) {
        expect(nextWeek[i].weekday).toBe(i + 2);
        expect(nextWeek[i].isToday).toBe(false);
      }

      // Next Monday should be 2026-11-30
      expect(nextWeek[0].label).toBe("Thứ hai, 30/11");
      expect(nextWeek[0].isoDate).toBe("2026-11-30");

      // Next Tuesday is 2026-12-01 (qua tháng mới)
      expect(nextWeek[1].label).toBe("Thứ ba, 01/12");
      expect(nextWeek[1].isoDate).toBe("2026-12-01");

      // Next Sunday is 2026-12-06
      expect(nextWeek[6].label).toBe("Chủ nhật, 06/12");
      expect(nextWeek[6].isoDate).toBe("2026-12-06");
    });

    it("khi hôm nay là Chủ nhật: tuần sau bắt đầu ngay ngày mai (Thứ hai)", () => {
      const sunday = new Date(2026, 10, 22);
      const nextWeek = getNextWeekDays(sunday, "vi");
      expect(nextWeek).toHaveLength(7);
      expect(nextWeek[0].label).toBe("Thứ hai, 23/11");
      expect(nextWeek[0].isoDate).toBe("2026-11-23");
      expect(nextWeek[6].label).toBe("Chủ nhật, 29/11");
      expect(nextWeek[6].isoDate).toBe("2026-11-29");
    });

    it("khi hôm nay là Thứ hai: tuần sau bắt đầu sau 7 ngày", () => {
      const monday = new Date(2026, 10, 23);
      const nextWeek = getNextWeekDays(monday, "en");
      expect(nextWeek).toHaveLength(7);
      expect(nextWeek[0].label).toBe("Monday, 30/11");
      expect(nextWeek[0].isoDate).toBe("2026-11-30");
      expect(nextWeek[6].label).toBe("Sunday, 06/12");
      expect(nextWeek[6].isoDate).toBe("2026-12-06");
    });
  });
});
