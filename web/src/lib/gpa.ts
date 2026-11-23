export interface GradeItem {
  code: string;
  name?: string;
  credits: number;
  score10?: number;
  grade: string; // "A+", "A", "B+", "B", "C", "D+", "D", "F", or ""
  term?: string;
}

export const GRADE_POINTS: Record<string, number> = {
  "A+": 4.0,
  "A": 3.5,
  "B+": 3.0,
  "B": 2.5,
  "C": 2.0,
  "D+": 1.5,
  "D": 1.0,
  "F": 0.0,
};

export interface GpaResult {
  gpa4: number;
  gpa10: number;
  totalCredits: number;
  gradedCredits: number;
  classification: {
    label: "excellent" | "good" | "fair" | "average" | "weak";
    color: string;
  };
}

/**
 * Đổi điểm hệ 10 sang điểm chữ theo Điều 25 khoản 5 QĐ 1268/QĐ-ĐHKTL.
 * Bảng này tiếp tục xuất hiện trong đề cương UEL năm 2025.
 */
export function scoreToLetter(score: number): string | null {
  if (!Number.isFinite(score) || score < 0 || score > 10) return null;
  if (score >= 9) return "A+";
  if (score >= 8) return "A";
  if (score >= 7) return "B+";
  if (score >= 6) return "B";
  if (score >= 5) return "C";
  if (score >= 4) return "D+";
  if (score >= 3) return "D";
  return "F";
}

/** Nhận cả dấu chấm và dấu phẩy thập phân; trả null nếu ngoài khoảng 0–10. */
export function parseScore10Input(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 && value <= 10 ? value : null;
}

export function gradeToPoints(grade: string): number | null {
  const norm = grade.trim().toUpperCase();
  if (norm in GRADE_POINTS) return GRADE_POINTS[norm];
  return null;
}

export function getGpaClassification(gpa10: number): GpaResult["classification"] {
  if (gpa10 >= 9) return { label: "excellent", color: "text-emerald-700 bg-emerald-100 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200" };
  if (gpa10 >= 8) return { label: "good", color: "text-blue-700 bg-blue-100 border-blue-300 dark:bg-blue-950 dark:text-blue-200" };
  if (gpa10 >= 7) return { label: "fair", color: "text-amber-700 bg-amber-100 border-amber-300 dark:bg-amber-950 dark:text-amber-200" };
  if (gpa10 >= 5) return { label: "average", color: "text-orange-700 bg-orange-100 border-orange-300 dark:bg-orange-950 dark:text-orange-200" };
  return { label: "weak", color: "text-red-700 bg-red-100 border-red-300 dark:bg-red-950 dark:text-red-200" };
}

/**
 * Các môn KHÔNG tính vào GPA: Giáo dục thể chất, Học phần quốc phòng, Tiếng Anh 1 → 4.
 * Nhận diện theo tên môn (tên có thể là tiếng Việt hoặc tiếng Anh).
 */
const NOT_IN_GPA = /giáo\s*dục\s*thể\s*chất|quốc\s*phòng|tiếng\s*anh\s*[1-4]\b|english\s*[1-4]\b/i;

export function isExcludedFromGpa(name?: string | null): boolean {
  return !!name && NOT_IN_GPA.test(name);
}

/** Môn Tiếng Anh 1 → 4 trong CTĐT (được miễn khi có chứng chỉ đầu ra tiếng Anh). */
export function isEnglishCourse(name?: string | null): boolean {
  return !!name && /tiếng\s*anh\s*[1-4]\b|english\s*[1-4]\b/i.test(name);
}

export function calculateGpa(items: { credits: number; score10?: number; grade?: string; name?: string | null }[]): GpaResult {
  let totalCredits = 0;
  let gradedCredits = 0;
  let totalScore10 = 0;
  let totalGradePoints = 0;

  for (const item of items) {
    if (isExcludedFromGpa(item.name)) continue;
    const cr = Math.max(0, item.credits || 0);
    totalCredits += cr;
    const score10 = item.score10;
    const letter = score10 === undefined ? null : scoreToLetter(score10);
    const pt = letter ? gradeToPoints(letter) : null;
    if (score10 !== undefined && letter && pt !== null) {
      gradedCredits += cr;
      totalScore10 += score10 * cr;
      totalGradePoints += pt * cr;
    }
  }

  const gpa4 = gradedCredits > 0 ? Math.round((totalGradePoints / gradedCredits) * 100) / 100 : 0;
  const gpa10 = gradedCredits > 0 ? Math.round((totalScore10 / gradedCredits) * 100) / 100 : 0;

  return {
    gpa4,
    gpa10,
    totalCredits,
    gradedCredits,
    classification: getGpaClassification(gpa10),
  };
}

export interface TargetSimulationResult {
  neededGpa: number;
  feasible: boolean;
  messageKey: string;
  messageVars?: Record<string, string | number>;
}

export function simulateTargetGpa(
  currentCpa: number,
  earnedCredits: number,
  remainingCredits: number,
  targetCpa: number,
): TargetSimulationResult {
  if (remainingCredits <= 0) {
    return {
      neededGpa: currentCpa,
      feasible: currentCpa >= targetCpa,
      messageKey: currentCpa >= targetCpa ? "gpa.sim.targetMet" : "gpa.sim.noCredits",
    };
  }

  const totalCredits = earnedCredits + remainingCredits;
  const neededPoints = (targetCpa * totalCredits) - (currentCpa * earnedCredits);
  const neededGpa = Math.round((neededPoints / remainingCredits) * 100) / 100;

  if (neededGpa <= 0) {
    return {
      neededGpa: 0,
      feasible: true,
      messageKey: "gpa.sim.passOnly",
    };
  }

  if (neededGpa > 4.0) {
    return {
      neededGpa,
      feasible: false,
      messageKey: "gpa.sim.impossible",
      messageVars: { gpa: neededGpa },
    };
  }

  let letter = "A";
  if (neededGpa <= 2.0) letter = "C";
  else if (neededGpa <= 2.5) letter = "C+";
  else if (neededGpa <= 3.0) letter = "B";
  else if (neededGpa <= 3.5) letter = "B+";

  return {
    neededGpa,
    feasible: true,
    messageKey: "gpa.sim.required",
    messageVars: { gpa: neededGpa, letter, credits: remainingCredits },
  };
}
