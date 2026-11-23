import type { ClassSection } from "./types";
import {
  getModuleTotalHours,
  getOccurrencesByWeek,
  getTimetableOccurrences,
  getWorkloadStats,
  type ClassOccurrence,
  type OccurrenceOptions,
  type WeekWorkload,
  type WorkloadStats,
} from "./occurrences";

export type { ClassOccurrence, OccurrenceOptions, WeekWorkload, WorkloadStats };
export { getModuleTotalHours, getOccurrencesByWeek, getTimetableOccurrences, getWorkloadStats };

export interface WorkloadBreakdown {
  lecture: number; // hours of lecture/class per week
  tutorial: number; // hours of tutorial/seminar per week
  practical: number; // hours of lab/practical per week
  project: number; // hours of group project per week
  self_study: number; // hours of self-study / preparation per week
  total_hours: number; // total estimated weekly workload
}

/**
 * Calculates theoretical workload breakdown based on university credit conventions.
 * Kept for syllabus and credit reference view.
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
export function formatWorkloadString(w: WorkloadBreakdown, lang: "vi" | "en" = "vi"): string {
  return `[${w.lecture}-${w.tutorial}-${w.practical}-${w.project}-${w.self_study}] · ${w.total_hours}h/${lang === "en" ? "week" : "tuần"}`;
}

/**
 * Total scheduled hours across the semester for a set of class sections,
 * computed strictly from actual occurrences.
 */
export function calculateTimetableTotalHours(
  sections: ClassSection[],
  opts?: OccurrenceOptions,
): number {
  const occs = getTimetableOccurrences(sections, opts);
  const total = occs.reduce((sum, o) => sum + o.durationHours, 0);
  return Math.round(total * 10) / 10;
}
