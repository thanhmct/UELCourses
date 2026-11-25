import { describe, expect, it } from "vitest";
import {
  EXPORT_HEADERS,
  buildExportRows,
  buildTimetableCsv,
  buildTimetableXlsx,
  formatLessonSchedule,
  formatSectionClassroom,
  formatSectionSchedule,
  formatSectionStartEndDate,
  type TimetableExportRow,
} from "../timetableExport";
import type { ClassSection, Lesson } from "../types";
import type { TimetableModuleInfo } from "../store";

const mockT = (key: string, params?: Record<string, string | number>) => {
  if (key === "det.periods") return `tiết ${params?.s}–${params?.e}`;
  if (key === "wd.long.2") return "Thứ Hai";
  if (key === "wd.long.3") return "Thứ Ba";
  if (key === "wd.long.4") return "Thứ Tư";
  if (key === "wd.long.8") return "Chủ nhật";
  return key;
};

describe("timetableExport", () => {
  const sampleLesson1: Lesson = {
    weekday: 2,
    start_period: 1,
    end_period: 3,
    start_time: "07:00",
    end_time: "09:35",
    room: "B1.406",
    date_start: "2025-09-08",
    date_end: "2025-11-10",
  };

  const sampleLesson2: Lesson = {
    weekday: 4,
    start_period: 7,
    end_period: 9,
    start_time: "12:30",
    end_time: "15:05",
    room: "B1.502",
    date_start: "2025-09-10",
    date_end: "2025-11-12",
  };

  const sampleSection: ClassSection = {
    class_code: "251ECO10101",
    module_code: "ECO101",
    lecturer: "TS. Nguyễn Văn A",
    lecturer_email: "an.nv@uel.edu.vn",
    start_date: "2025-09-08",
    end_date: "2025-11-12",
    lessons: [sampleLesson1, sampleLesson2],
  };

  const sampleInfoMap: Record<string, TimetableModuleInfo> = {
    ECO101: {
      code: "ECO101",
      name: "Kinh tế vi mô",
      name_en: "Microeconomics",
      credits: 3,
      faculty: "Khoa Kinh tế",
      faculty_en: "Faculty of Economics",
      lecturer_email: "an.nv@uel.edu.vn",
    },
  };

  describe("formatLessonSchedule", () => {
    it("formats a single lesson with weekday, periods and GMT+7 time", () => {
      const res = formatLessonSchedule(sampleLesson1, mockT);
      expect(res).toBe("Thứ Hai, tiết 1–3 (07:00 - 09:35)");
    });
  });

  describe("formatSectionSchedule", () => {
    it("joins multiple lessons with semicolon", () => {
      const res = formatSectionSchedule(sampleSection, mockT);
      expect(res).toBe(
        "Thứ Hai, tiết 1–3 (07:00 - 09:35); Thứ Tư, tiết 7–9 (12:30 - 15:05)",
      );
    });

    it("falls back to schedule_raw if no lessons", () => {
      const noLessonsSection: ClassSection = {
        class_code: "TEST01",
        module_code: "TEST",
        lessons: [],
        schedule_raw: "Thứ 6, tiết 1-3",
      };
      expect(formatSectionSchedule(noLessonsSection, mockT)).toBe("Thứ 6, tiết 1-3");
    });
  });

  describe("formatSectionClassroom", () => {
    it("extracts unique classrooms", () => {
      expect(formatSectionClassroom(sampleSection)).toBe("B1.406, B1.502");
    });

    it("falls back to rooms array if lessons lack room", () => {
      const sec: ClassSection = {
        class_code: "TEST01",
        module_code: "TEST",
        lessons: [{ weekday: 2, start_period: 1, end_period: 2, start_time: "07:00", end_time: "08:40" }],
        rooms: ["A2.101"],
      };
      expect(formatSectionClassroom(sec)).toBe("A2.101");
    });
  });

  describe("formatSectionStartEndDate", () => {
    it("formats start - end date as dd/mm/yyyy - dd/mm/yyyy", () => {
      expect(formatSectionStartEndDate(sampleSection)).toBe("08/09/2025 - 12/11/2025");
    });

    it("uses lesson dates if section dates are missing", () => {
      const sec: ClassSection = {
        class_code: "TEST01",
        module_code: "TEST",
        lessons: [
          { weekday: 2, start_period: 1, end_period: 2, start_time: "07:00", end_time: "08:40", date_start: "2025-10-01", date_end: "2025-10-31" },
        ],
      };
      expect(formatSectionStartEndDate(sec)).toBe("01/10/2025 - 31/10/2025");
    });

    it("returns single date if start and end are identical", () => {
      const sec: ClassSection = {
        class_code: "TEST01",
        module_code: "TEST",
        start_date: "2025-10-01",
        end_date: "2025-10-01",
        lessons: [],
      };
      expect(formatSectionStartEndDate(sec)).toBe("01/10/2025");
    });
  });

  describe("buildExportRows", () => {
    it("maps all 9 columns accurately", () => {
      const rows = buildExportRows([sampleSection], sampleInfoMap, "vi", mockT);
      expect(rows).toHaveLength(1);
      const r = rows[0];
      expect(r.faculty).toBe("Khoa Kinh tế");
      expect(r.courseCode).toBe("251ECO10101");
      expect(r.courseName).toBe("Kinh tế vi mô");
      expect(r.credit).toBe(3);
      expect(r.schedule).toBe("Thứ Hai, tiết 1–3 (07:00 - 09:35); Thứ Tư, tiết 7–9 (12:30 - 15:05)");
      expect(r.classroom).toBe("B1.406, B1.502");
      expect(r.startEndDate).toBe("08/09/2025 - 12/11/2025");
      expect(r.lecturer).toBe("TS. Nguyễn Văn A");
      expect(r.lecturerEmail).toBe("an.nv@uel.edu.vn");
    });

    it("uses English faculty and course name when lang is en", () => {
      const rows = buildExportRows([sampleSection], sampleInfoMap, "en", mockT);
      expect(rows[0].faculty).toBe("Faculty of Economics");
      expect(rows[0].courseName).toBe("Microeconomics");
    });
  });

  describe("buildTimetableCsv", () => {
    it("includes UTF-8 BOM and correct headers", () => {
      const rows: TimetableExportRow[] = [
        {
          faculty: "Khoa Kinh tế",
          courseCode: "ECO101",
          courseName: "Kinh tế vi mô",
          credit: 3,
          schedule: "Thứ Hai, tiết 1–3 (07:00 - 09:35)",
          classroom: "B1.406",
          startEndDate: "08/09/2025 - 12/11/2025",
          lecturer: "TS. Nguyễn Văn A",
          lecturerEmail: "an.nv@uel.edu.vn",
        },
      ];
      const csv = buildTimetableCsv(rows);
      expect(csv.startsWith("\uFEFF")).toBe(true);

      const lines = csv.replace("\uFEFF", "").split("\r\n");
      expect(lines[0]).toBe(EXPORT_HEADERS.join(","));
      expect(lines[1]).toContain("Khoa Kinh tế");
      expect(lines[1]).toContain("ECO101");
      expect(lines[1]).toContain("an.nv@uel.edu.vn");
    });

    it("escapes cells containing commas or quotes", () => {
      const rows: TimetableExportRow[] = [
        {
          faculty: "Khoa Kế toán, Kiểm toán",
          courseCode: "BAA2028",
          courseName: 'Nguyên lý "Kế toán"',
          credit: 3,
          schedule: "Thứ Hai",
          classroom: "B1",
          startEndDate: "",
          lecturer: "",
          lecturerEmail: "",
        },
      ];
      const csv = buildTimetableCsv(rows);
      expect(csv).toContain('"Khoa Kế toán, Kiểm toán"');
      expect(csv).toContain('"Nguyên lý ""Kế toán"""');
    });
  });

  describe("buildTimetableXlsx", () => {
    it("creates a valid ZIP binary with PK signature", () => {
      const rows: TimetableExportRow[] = [
        {
          faculty: "Khoa Kinh tế",
          courseCode: "ECO101",
          courseName: "Kinh tế vi mô",
          credit: 3,
          schedule: "Thứ Hai, tiết 1–3 (07:00 - 09:35)",
          classroom: "B1.406",
          startEndDate: "08/09/2025 - 12/11/2025",
          lecturer: "TS. Nguyễn Văn A",
          lecturerEmail: "an.nv@uel.edu.vn",
        },
      ];
      const bytes = buildTimetableXlsx(rows);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(1000);
      // Check PK signature at index 0 (0x50, 0x4B, 0x03, 0x04)
      expect(bytes[0]).toBe(0x50);
      expect(bytes[1]).toBe(0x4b);
      expect(bytes[2]).toBe(0x03);
      expect(bytes[3]).toBe(0x04);
    });
  });
});
