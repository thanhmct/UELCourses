export interface WorkloadBreakdown {
  lecture: number; // hours of lecture/class per week
  tutorial: number; // hours of tutorial/seminar per week
  practical: number; // hours of lab/practical per week
  project: number; // hours of group project per week
  self_study: number; // hours of self-study / preparation per week
  total_hours: number; // total estimated weekly workload
}

/**
 * Calculates workload breakdown based on university credit conventions:
 * 1 lecture credit ≈ 1 period (50 min ≈ 1 hour) in class + 2 hours self-study per week.
 * 1 practical credit ≈ 2-3 periods in lab + 1-2 hours self-study per week.
 */
export function calculateWorkload(credits: number, type?: string): WorkloadBreakdown {
  const cr = Math.max(0, credits || 0);
  const isPractical = type?.toLowerCase().includes("thực hành") || type?.toLowerCase().includes("lab");
  const isCondition = type?.toLowerCase().includes("điều kiện") || type?.toLowerCase().includes("thể chất");

  if (cr === 0) {
    return { lecture: 0, tutorial: 0, practical: 0, project: 0, self_study: 0, total_hours: 0 };
  }

  if (isPractical) {
    const practical = cr * 2;
    const project = Math.round(cr * 0.5);
    const self_study = cr * 1.5;
    const total_hours = Math.round((practical + project + self_study) * 10) / 10;
    return { lecture: 0, tutorial: 0, practical, project, self_study, total_hours };
  }

  if (isCondition) {
    const lecture = cr * 1;
    const practical = cr * 1;
    const self_study = cr * 1;
    const total_hours = lecture + practical + self_study;
    return { lecture, tutorial: 0, practical, project: 0, self_study, total_hours };
  }

  // Standard lecture module (Lý thuyết)
  const lecture = cr * 1;
  const tutorial = cr >= 3 ? 1 : 0;
  const project = cr >= 4 ? 1 : 0;
  const self_study = cr * 2 - (tutorial + project);
  const total_hours = lecture + tutorial + project + self_study;

  return {
    lecture,
    tutorial,
    practical: 0,
    project,
    self_study: Math.max(0, self_study),
    total_hours,
  };
}

/**
 * Formats workload into NUSMods style string: [Lecture-Tutorial-Practical-Project-Prep]
 * Example: "[3-1-0-0-5] · 9 giờ/tuần"
 */
export function formatWorkloadString(w: WorkloadBreakdown): string {
  return `[${w.lecture}-${w.tutorial}-${w.practical}-${w.project}-${w.self_study}] · ${w.total_hours}h/tuần`;
}
