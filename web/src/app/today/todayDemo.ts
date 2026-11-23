import type { Lesson } from "@/lib/types";
import type { DayScheduleItem } from "./todayDates";

export interface TodayDemoLessonItem {
  code: string;
  name: string;
  class_code: string;
  lecturer?: string;
  lesson: Lesson;
}

interface DemoLessonTemplate {
  code: string;
  nameVi: string;
  nameEn: string;
  classCode: string;
  lecturer: string;
  startPeriod: number;
  endPeriod: number;
  startTime: string;
  endTime: string;
  room: string;
  oneTime?: boolean;
}

const TODAY_TEMPLATES: DemoLessonTemplate[][] = [
  [
    {
      code: "BAA2028",
      nameVi: "Nguyên lý kế toán",
      nameEn: "Principles of Accounting",
      classCode: "261BAA202801",
      lecturer: "TS. Nguyễn Minh Anh",
      startPeriod: 1,
      endPeriod: 2,
      startTime: "07:30",
      endTime: "09:10",
      room: "B2.205",
    },
    {
      code: "BFB4007",
      nameVi: "Phân tích tài chính",
      nameEn: "Financial Analysis",
      classCode: "261BFB400702",
      lecturer: "ThS. Trần Hoài Nam",
      startPeriod: 6,
      endPeriod: 8,
      startTime: "13:00",
      endTime: "15:30",
      room: "A2.304",
    },
    {
      code: "BIM4057",
      nameVi: "Tích hợp quy trình kinh doanh với hệ thống ERP",
      nameEn: "Business Process Integration with ERP Systems",
      classCode: "261BIM405701",
      lecturer: "TS. Lê Thanh Hà",
      startPeriod: 10,
      endPeriod: 12,
      startTime: "18:00",
      endTime: "20:30",
      room: "C1.301",
    },
  ],
  [
    {
      code: "BEE1037",
      nameVi: "Kinh tế vi mô",
      nameEn: "Microeconomics",
      classCode: "261BEE103703",
      lecturer: "PGS.TS. Võ Thị Lan",
      startPeriod: 3,
      endPeriod: 5,
      startTime: "09:20",
      endTime: "11:50",
      room: "A1.108",
    },
    {
      code: "ENG1002",
      nameVi: "Tiếng Anh thương mại 2",
      nameEn: "Business English 2",
      classCode: "261ENG100204",
      lecturer: "ThS. Phạm Gia Hân",
      startPeriod: 7,
      endPeriod: 9,
      startTime: "13:50",
      endTime: "16:20",
      room: "B1.402",
      oneTime: true,
    },
    {
      code: "MI71",
      nameVi: "Giáo dục thể chất 1",
      nameEn: "Physical Education 1",
      classCode: "261MI7101",
      lecturer: "ThS. Lê Minh Khang",
      startPeriod: 10,
      endPeriod: 12,
      startTime: "18:00",
      endTime: "20:30",
      room: "Sân thể thao",
    },
  ],
];

const NEXT_WEEK_TEMPLATES: DemoLessonTemplate[][] = [
  [TODAY_TEMPLATES[0][0], TODAY_TEMPLATES[0][1]],
  [TODAY_TEMPLATES[1][0]],
  [TODAY_TEMPLATES[0][2]],
  [],
  [TODAY_TEMPLATES[1][1]],
  [],
  [],
];

export function getTodayDemoLessons(
  day: DayScheduleItem,
  dayIndex: number,
  range: "today" | "next_week",
  lang: "vi" | "en",
): TodayDemoLessonItem[] {
  const templates = range === "today" ? TODAY_TEMPLATES : NEXT_WEEK_TEMPLATES;

  return (templates[dayIndex] ?? []).map((template) => ({
    code: template.code,
    name: lang === "en" ? template.nameEn : template.nameVi,
    class_code: template.classCode,
    lecturer: template.lecturer,
    lesson: {
      weekday: day.weekday,
      start_period: template.startPeriod,
      end_period: template.endPeriod,
      start_time: template.startTime,
      end_time: template.endTime,
      room: template.room,
      ...(template.oneTime
        ? { date_start: day.isoDate, date_end: day.isoDate }
        : {}),
    },
  }));
}
