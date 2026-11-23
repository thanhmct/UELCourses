import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Semester } from "@/lib/types";
import type { ClassOccurrence } from "@/lib/occurrences";
import {
  formatWeekOptionLabel,
  getDefaultSelectedWeek,
  getSemesterDateRange,
  getSemesterWeeks,
  resolveSelectedWeekOnSemesterChange,
} from "@/lib/semesterWeeks";

describe("semesterWeeks unit tests (Brief W21)", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("1. getSemesterDateRange — Thứ tự ưu tiên khoảng thời gian học kỳ", () => {
    it("(a) ưu tiên teaching_start và teaching_end (lịch năm học / chuẩn hóa) thay vì start_date/end_date quá rộng", () => {
      const wideSemester: Semester = {
        id: "2026-2027-1",
        name: "HK1 2026–2027",
        year: "2026-2027",
        term: 1,
        is_current: true,
        // Ngày DB cũ quá rộng (34 tuần từ 06/07 đến 28/02)
        start_date: "2026-07-06",
        end_date: "2027-02-28",
        // Ngày học thực tế chuẩn hóa (10 tuần từ 07/09 đến 15/11)
        teaching_start: "2026-09-07",
        teaching_end: "2026-11-15",
      };

      const range = getSemesterDateRange(wideSemester);
      expect(range).not.toBeNull();
      expect(range?.startIso).toBe("2026-09-07");
      expect(range?.endIso).toBe("2026-11-15");
      expect(range?.weeksTotal).toBe(10);
    });

    it("(b) nếu không có teaching_start/end và không có start_date/end_date, lấy từ occurrences", () => {
      const semNoDates: Semester = {
        id: "2026-2027-1",
        name: "HK1 2026–2027",
        year: "2026-2027",
        term: 1,
        is_current: true,
      };

      const mockOccurrences: ClassOccurrence[] = [
        {
          date: "2026-09-09",
          class_code: "261MTH01",
          module_code: "MTH01",
          start: "07:00",
          end: "09:30",
          start_period: 1,
          end_period: 3,
          weekday: 4,
          durationHours: 2.5,
          lesson: {} as any,
          section: {} as any,
        },
        {
          date: "2026-11-11",
          class_code: "261MTH01",
          module_code: "MTH01",
          start: "07:00",
          end: "09:30",
          start_period: 1,
          end_period: 3,
          weekday: 4,
          durationHours: 2.5,
          lesson: {} as any,
          section: {} as any,
        },
      ];

      const range = getSemesterDateRange(semNoDates, mockOccurrences);
      expect(range).not.toBeNull();
      expect(range?.startIso).toBe("2026-09-09");
      expect(range?.endIso).toBe("2026-11-11");
      // Tuần chứa 09/09 là Thứ 2 07/09, tuần chứa 11/11 kết thúc Chủ nhật 15/11 -> đúng 10 tuần
      expect(range?.weeksTotal).toBe(10);
    });

    it("(c) cuối cùng mới dùng start_date / end_date của Semester nếu không có teaching_start/end", () => {
      const normalSem: Semester = {
        id: "2026-2027-1",
        name: "HK1",
        year: "2026-2027",
        term: 1,
        is_current: true,
        start_date: "2026-09-07",
        end_date: "2026-11-15",
      };

      const range = getSemesterDateRange(normalSem);
      expect(range).not.toBeNull();
      expect(range?.startIso).toBe("2026-09-07");
      expect(range?.endIso).toBe("2026-11-15");
      expect(range?.weeksTotal).toBe(10);
    });
  });

  describe("2. getSemesterWeeks — Danh sách tuần đúng khoảng thực tế của kỳ", () => {
    it("kỳ có khoảng 07/09–15/11 sinh đúng 10 tuần, không còn tuần 0 giờ ngoài khoảng", () => {
      const semester: Semester = {
        id: "2026-2027-1",
        name: "HK1 2026–2027",
        year: "2026-2027",
        term: 1,
        is_current: true,
        start_date: "2026-07-06", // dữ liệu DB cũ rộng
        end_date: "2027-02-28",
        teaching_start: "2026-09-07", // chuẩn hóa đúng kỳ
        teaching_end: "2026-11-15",
      };

      // Chỉ có giờ học ở Tuần 1 (07/09) và Tuần 10 (09/11)
      const mockOccurrences: ClassOccurrence[] = [
        {
          date: "2026-09-07",
          class_code: "261MTH01",
          module_code: "MTH01",
          start: "07:00",
          end: "10:00",
          start_period: 1,
          end_period: 3,
          weekday: 2,
          durationHours: 3,
          lesson: {} as any,
          section: {} as any,
        },
        {
          date: "2026-11-09",
          class_code: "261MTH01",
          module_code: "MTH01",
          start: "07:00",
          end: "10:00",
          start_period: 1,
          end_period: 3,
          weekday: 2,
          durationHours: 3,
          lesson: {} as any,
          section: {} as any,
        },
      ];

      const weeks = getSemesterWeeks(semester, mockOccurrences);

      // Đúng 10 tuần
      expect(weeks).toHaveLength(10);
      expect(weeks[0].weekNumber).toBe(1);
      expect(weeks[0].startIso).toBe("2026-09-07");
      expect(weeks[0].endIso).toBe("2026-09-13"); // Thứ 2 07/09 -> CN 13/09
      expect(weeks[0].label).toBe("Tuần 1 (07/09 – 13/09)");
      expect(weeks[0].totalHours).toBe(3);

      expect(weeks[9].weekNumber).toBe(10);
      expect(weeks[9].startIso).toBe("2026-11-09");
      expect(weeks[9].endIso).toBe("2026-11-15");
      expect(weeks[9].label).toBe("Tuần 10 (09/11 – 15/11)");
      expect(weeks[9].totalHours).toBe(3);

      // Các tuần giữa kỳ không có giờ học (X = 0) vẫn được giữ (để biết tuần nghỉ)
      const week2 = weeks[1];
      expect(week2.weekNumber).toBe(2);
      expect(week2.label).toBe("Tuần 2 (14/09 – 20/09)");
      expect(week2.totalHours).toBe(0);

      // Không còn tuần thừa nào trước 07/09 (tháng 7, 8) hoặc sau 15/11 (tháng 12, 1, 2)
      expect(weeks.some((w) => w.startIso < "2026-09-07")).toBe(false);
      expect(weeks.some((w) => w.endIso > "2026-11-15")).toBe(false);
    });
  });

  describe("3. getDefaultSelectedWeek — Mặc định tuần hiện tại nếu trong kỳ", () => {
    const semester: Semester = {
      id: "2026-2027-1",
      name: "HK1",
      year: "2026-2027",
      term: 1,
      is_current: true,
      teaching_start: "2026-09-07",
      teaching_end: "2026-11-15",
    };

    it("chọn đúng tuần hiện tại khi ngày hôm nay nằm trong kỳ (vd: 16/09/2026 -> Tuần 2)", () => {
      // Fake timers vào giữa Tuần 2 (14/09 - 20/09/2026)
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-16T10:00:00Z"));

      const weeks = getSemesterWeeks(semester, [], { now: new Date("2026-09-16T10:00:00Z") });
      const defaultWeek = getDefaultSelectedWeek(weeks);

      expect(defaultWeek).toBe(2);
      expect(weeks.find((w) => w.isCurrent)?.weekNumber).toBe(2);
    });

    it("chọn 'all' (Tất cả các tuần) khi ngày hôm nay nằm ngoài kỳ (vd: hè 10/08/2026)", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-10T10:00:00Z"));

      const weeks = getSemesterWeeks(semester, [], { now: new Date("2026-08-10T10:00:00Z") });
      const defaultWeek = getDefaultSelectedWeek(weeks);

      expect(defaultWeek).toBe("all");
      expect(weeks.some((w) => w.isCurrent)).toBe(false);
    });

    it("chọn 'all' khi ngày hôm nay sau khi kỳ đã kết thúc (vd: 01/12/2026)", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-12-01T10:00:00Z"));

      const weeks = getSemesterWeeks(semester, [], { now: new Date("2026-12-01T10:00:00Z") });
      const defaultWeek = getDefaultSelectedWeek(weeks);

      expect(defaultWeek).toBe("all");
    });
  });

  describe("4. resolveSelectedWeekOnSemesterChange — Cập nhật lựa chọn khi đổi học kỳ", () => {
    const tenWeeks = getSemesterWeeks({
      id: "sem-10",
      name: "10 weeks",
      year: "2026-2027",
      term: 1,
      is_current: false,
      teaching_start: "2026-09-07",
      teaching_end: "2026-11-15",
    });

    it("nếu tuần đang chọn thuộc kỳ mới (vd Tuần 4 trong kỳ 10 tuần), giữ nguyên Tuần 4", () => {
      const resolved = resolveSelectedWeekOnSemesterChange(4, tenWeeks);
      expect(resolved).toBe(4);
    });

    it("nếu tuần đang chọn không thuộc kỳ mới (vd Tuần 12 trong kỳ 10 tuần), tự động về 'all'", () => {
      const resolved = resolveSelectedWeekOnSemesterChange(12, tenWeeks);
      expect(resolved).toBe("all");
    });

    it("nếu đang chọn 'all', tiếp tục giữ 'all'", () => {
      const resolved = resolveSelectedWeekOnSemesterChange("all", tenWeeks);
      expect(resolved).toBe("all");
    });
  });

  describe("5. formatWeekOptionLabel", () => {
    it("định dạng nhãn tuần kèm số giờ học thực tế", () => {
      const w = {
        weekNumber: 1,
        startIso: "2026-09-07",
        endIso: "2026-09-13",
        label: "Tuần 1 (07/09 – 13/09)",
        totalHours: 18.5,
        occurrences: [],
        isCurrent: false,
      };
      expect(formatWeekOptionLabel(w)).toBe("Tuần 1 (07/09 – 13/09)");

      const w0 = {
        weekNumber: 2,
        startIso: "2026-09-14",
        endIso: "2026-09-20",
        label: "Tuần 2 (14/09 – 20/09)",
        totalHours: 0,
        occurrences: [],
        isCurrent: false,
      };
      expect(formatWeekOptionLabel(w0)).toBe("Tuần 2 (14/09 – 20/09)");
    });
  });
});
