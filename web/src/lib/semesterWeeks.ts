import type { ClassOccurrence, WeekWorkload } from "./occurrences";
import type { Semester } from "./types";
import { parseDateOnly } from "./dates";
import { addDaysUtc, formatDateIso, getOccurrencesByDate, mondayOfWeek } from "./occurrences";

export interface SemesterWeeksOptions {
  now?: Date;
  fallbackStart?: string;
  fallbackEnd?: string;
  cohort?: string;
}

export interface SemesterDateRange {
  startIso: string;
  endIso: string;
  startMonday: Date;
  endSunday: Date;
  weeksTotal: number;
}

/**
 * Xác định khoảng thời gian thực tế của học kỳ theo thứ tự ưu tiên:
 * (a) Lịch năm học (teaching_start, teaching_end đã được chuẩn hóa qua API)
 * (b) Khoảng ngày bao phủ các buổi học thực tế của tất cả lớp thuộc kỳ
 * (c) start_date / end_date của Semester
 * Làm tròn ra tuần Thứ 2 (startMonday) đến Chủ nhật (endSunday).
 */
export function getSemesterDateRange(
  semester?: Semester | null,
  occurrences: ClassOccurrence[] = [],
  opts: SemesterWeeksOptions = {},
): SemesterDateRange | null {
  let rawStart = semester?.teaching_start;
  let rawEnd = semester?.teaching_end;

  // (b) Nếu chưa có ngày dạy thực tế, lấy min/max từ occurrences (buổi học thực tế)
  if (!rawStart || !rawEnd) {
    if (occurrences.length > 0) {
      const dates = occurrences.map((o) => o.date).sort();
      rawStart = rawStart ?? dates[0];
      rawEnd = rawEnd ?? dates[dates.length - 1];
    }
  }

  // (c) Cuối cùng mới dùng start_date / end_date của Semester hoặc fallback
  rawStart = rawStart ?? semester?.start_date ?? opts.fallbackStart;
  rawEnd = rawEnd ?? semester?.end_date ?? opts.fallbackEnd;

  if (!rawStart || !rawEnd) return null;

  const startDate = parseDateOnly(rawStart);
  const endDate = parseDateOnly(rawEnd);
  if (!startDate || !endDate) return null;

  const startMonday = mondayOfWeek(startDate);
  const endSunday = addDaysUtc(mondayOfWeek(endDate), 6);

  if (startMonday.getTime() > endSunday.getTime()) return null;

  const daysTotal = Math.round((endSunday.getTime() - startMonday.getTime()) / 86_400_000) + 1;
  const weeksTotal = Math.max(1, Math.round(daysTotal / 7));

  return {
    startIso: formatDateIso(startDate),
    endIso: formatDateIso(endDate),
    startMonday,
    endSunday,
    weeksTotal,
  };
}

/**
 * Sinh danh sách các tuần thuộc thời gian học thực tế của học kỳ:
 * - Tuần 1 = tuần (Thứ 2) chứa ngày bắt đầu học kỳ
 * - Tuần cuối = tuần (Chủ nhật) chứa ngày kết thúc học kỳ
 * - Mỗi tuần kèm tổng số giờ học thực tế (~X giờ)
 * - Ẩn các tuần thừa ở đầu/cuối ngoài kỳ
 * - Giữ các tuần trong kỳ kể cả khi không có giờ học (X = 0) để người dùng biết tuần nghỉ
 */
export function getSemesterWeeks(
  semester?: Semester | null,
  occurrences: ClassOccurrence[] = [],
  opts: SemesterWeeksOptions = {},
): WeekWorkload[] {
  const range = getSemesterDateRange(semester, occurrences, opts);
  if (!range) return [];

  const today = opts.now ?? new Date();
  const todayIso = formatDateIso(
    new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())),
  );

  const byDate = getOccurrencesByDate(occurrences);
  const weeks: WeekWorkload[] = [];

  let curMon = range.startMonday;
  let weekIndex = 1;

  while (curMon.getTime() <= range.endSunday.getTime()) {
    const startIso = formatDateIso(curMon);
    const endSunDate = addDaysUtc(curMon, 6);
    const endIso = formatDateIso(endSunDate);

    const weekOccs: ClassOccurrence[] = [];
    for (let d = curMon; d.getTime() <= endSunDate.getTime(); d = addDaysUtc(d, 1)) {
      const iso = formatDateIso(d);
      const list = byDate.get(iso);
      if (list) weekOccs.push(...list);
    }

    const totalHours =
      Math.round(weekOccs.reduce((sum, o) => sum + o.durationHours, 0) * 10) / 10;
    const isCurrent = todayIso >= startIso && todayIso <= endIso;

    const startShort = `${startIso.slice(8, 10)}/${startIso.slice(5, 7)}`;
    const endShort = `${endIso.slice(8, 10)}/${endIso.slice(5, 7)}`;

    weeks.push({
      weekNumber: weekIndex,
      startIso,
      endIso,
      label: `Tuần ${weekIndex} (${startShort} – ${endShort})`,
      totalHours,
      occurrences: weekOccs,
      isCurrent,
    });

    curMon = addDaysUtc(curMon, 7);
    weekIndex++;
  }

  return weeks;
}

/**
 * Mặc định chọn tuần hiện tại nếu nằm trong kỳ, ngược lại "Tất cả các tuần" ("all").
 */
export function getDefaultSelectedWeek(weeks: WeekWorkload[]): number | "all" {
  const currentWeek = weeks.find((w) => w.isCurrent);
  return currentWeek ? currentWeek.weekNumber : "all";
}

/**
 * Xử lý khi đổi học kỳ: nếu tuần đang chọn không thuộc kỳ mới -> về "Tất cả các tuần" ("all").
 */
export function resolveSelectedWeekOnSemesterChange(
  currentSelected: number | "all",
  newWeeks: WeekWorkload[],
): number | "all" {
  if (currentSelected === "all") return "all";
  const exists = newWeeks.some((w) => w.weekNumber === currentSelected);
  return exists ? currentSelected : "all";
}

/**
 * Định dạng nhãn từng dòng trong bộ chọn "Xem theo tuần":
 * vd: "Tuần 1 (07/09 – 13/09) · ~15 giờ"
 */
export function formatWeekOptionLabel(w: WeekWorkload): string {
  return w.label;
}
