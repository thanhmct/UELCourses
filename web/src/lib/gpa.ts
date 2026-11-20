export interface GradeItem {
  code: string;
  name?: string;
  credits: number;
  grade: string; // "A+", "A", "B+", "B", "C+", "C", "D+", "D", "F", or ""
  term?: string;
}

export const GRADE_POINTS: Record<string, number> = {
  "A+": 4.0,
  "A": 4.0,
  "B+": 3.5,
  "B": 3.0,
  "C+": 2.5,
  "C": 2.0,
  "D+": 1.5,
  "D": 1.0,
  "F": 0.0,
};

export const GRADE_10_SCALE: Record<string, string> = {
  "A+": "9.0 – 10.0",
  "A": "8.5 – 8.9",
  "B+": "8.0 – 8.4",
  "B": "7.0 – 7.9",
  "C+": "6.5 – 6.9",
  "C": "5.5 – 6.4",
  "D+": "5.0 – 5.4",
  "D": "4.0 – 4.9",
  "F": "< 4.0 (Rớt)",
};

export interface GpaResult {
  gpa4: number;
  gpa10: number;
  totalCredits: number;
  gradedCredits: number;
  classification: {
    label: string;
    color: string;
  };
}

export function gradeToPoints(grade: string): number | null {
  const norm = grade.trim().toUpperCase();
  if (norm in GRADE_POINTS) return GRADE_POINTS[norm];
  return null;
}

export function getGpaClassification(gpa4: number): { label: string; color: string } {
  if (gpa4 >= 3.6) return { label: "Xuất sắc", color: "text-emerald-700 bg-emerald-100 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200" };
  if (gpa4 >= 3.2) return { label: "Giỏi", color: "text-blue-700 bg-blue-100 border-blue-300 dark:bg-blue-950 dark:text-blue-200" };
  if (gpa4 >= 2.5) return { label: "Khá", color: "text-amber-700 bg-amber-100 border-amber-300 dark:bg-amber-950 dark:text-amber-200" };
  if (gpa4 >= 2.0) return { label: "Trung bình", color: "text-orange-700 bg-orange-100 border-orange-300 dark:bg-orange-950 dark:text-orange-200" };
  return { label: "Yếu / Kém", color: "text-red-700 bg-red-100 border-red-300 dark:bg-red-950 dark:text-red-200" };
}

export function calculateGpa(items: { credits: number; grade: string }[]): GpaResult {
  let totalCredits = 0;
  let gradedCredits = 0;
  let totalGradePoints = 0;

  for (const item of items) {
    const cr = Math.max(0, item.credits || 0);
    totalCredits += cr;
    const pt = gradeToPoints(item.grade);
    if (pt !== null) {
      gradedCredits += cr;
      totalGradePoints += pt * cr;
    }
  }

  const gpa4 = gradedCredits > 0 ? Math.round((totalGradePoints / gradedCredits) * 100) / 100 : 0;
  // Standard conversion approximation to scale 10: gpa10 ≈ gpa4 * 2.5 (adjusted)
  const gpa10 = Math.round((gpa4 * 2.5) * 10) / 10;

  return {
    gpa4,
    gpa10,
    totalCredits,
    gradedCredits,
    classification: getGpaClassification(gpa4),
  };
}

export interface TargetSimulationResult {
  neededGpa: number;
  feasible: boolean;
  message: string;
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
      message: currentCpa >= targetCpa ? "Bạn đã đạt mục tiêu tốt nghiệp!" : "Không còn tín chỉ để cải thiện điểm.",
    };
  }

  const totalCredits = earnedCredits + remainingCredits;
  const neededPoints = (targetCpa * totalCredits) - (currentCpa * earnedCredits);
  const neededGpa = Math.round((neededPoints / remainingCredits) * 100) / 100;

  if (neededGpa <= 0) {
    return {
      neededGpa: 0,
      feasible: true,
      message: "Bạn đã thừa điểm để đạt mục tiêu này, chỉ cần qua môn!",
    };
  }

  if (neededGpa > 4.0) {
    return {
      neededGpa,
      feasible: false,
      message: `Cần đạt trung bình ${neededGpa} (vượt quá trần 4.0). Mục tiêu này không khả thi về mặt toán học nếu không học cải thiện các môn cũ.`,
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
    message: `Cần đạt trung bình ${neededGpa}/4.0 (tương đương mức điểm ${letter}) cho toàn bộ ${remainingCredits} tín chỉ còn lại.`,
  };
}
