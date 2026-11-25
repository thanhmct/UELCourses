import type { Semester } from "@/lib/types";

/** Trạng thái góp ý đã gửi trên thiết bị: đã đăng, chờ duyệt, hoặc đã góp ý trước đó (409). */
export type SubmittedStatus = "approved" | "pending" | "sent";
export type SubmittedMap = Record<string, SubmittedStatus>;

export const COURSE_REVIEWS_KEY = "uelcourses-course-reviews";

export function submittedKey(semesterId: string, code: string): string {
  return `${semesterId}::${code}`;
}

export function readSubmitted(): SubmittedMap {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(COURSE_REVIEWS_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as SubmittedMap) : {};
  } catch {
    return {};
  }
}

export function saveSubmitted(key: string, status: SubmittedStatus): SubmittedMap {
  const next = { ...readSubmitted(), [key]: status };
  try {
    window.localStorage.setItem(COURSE_REVIEWS_KEY, JSON.stringify(next));
  } catch {
    // Bộ nhớ bị chặn hoặc đầy: trạng thái vẫn hiển thị trong phiên hiện tại.
  }
  return next;
}

/** Hai học kỳ cần góp ý, theo thứ tự thời gian: học kỳ trước rồi học kỳ hiện tại. */
export function pickReviewSemesters(all: Semester[]): Semester[] {
  if (all.length === 0) return [];
  const sorted = [...all].sort(
    (a, b) => String(a.year).localeCompare(String(b.year)) || Number(a.term) - Number(b.term),
  );
  let idx = sorted.findIndex((s) => s.is_current);
  if (idx < 0) idx = sorted.length - 1;
  const current = sorted[idx];
  const previous = idx > 0 ? sorted[idx - 1] : null;
  return previous ? [previous, current] : [current];
}

/** Mã học phần không trùng, giữ thứ tự xuất hiện trong thời khóa biểu. */
export function uniqueCourseCodes(entries: { code: string }[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of entries) {
    const code = entry.code.trim();
    if (code && !seen.has(code)) {
      seen.add(code);
      out.push(code);
    }
  }
  return out;
}
