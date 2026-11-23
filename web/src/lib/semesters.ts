"use client";
import { useMemo } from "react";
import { academicYearLabel, semesterTerm } from "@/i18n/names";
import { api } from "./api";
import { vietnamDate } from "./holidays";
import { useApi } from "./useApi";
import { parseProgramCode } from "./programCode";
import { useSettings } from "./store";
import type { Semester } from "./types";

/** Số năm đào tạo và số học kỳ mỗi năm (không có học kỳ hè: HK1, HK2, HK3). */
const YEARS = 4;
const TERMS_PER_YEAR = 3;

/** Khóa K26 → năm 2026 (năm nhập học). */
export function cohortStartYear(cohort: string): number | null {
  const m = /^K(\d{2})$/i.exec(cohort.trim());
  return m ? 2000 + Number(m[1]) : null;
}

/**
 * 12 học kỳ của một khóa, đúng năm học bắt đầu từ năm nhập học.
 * Ví dụ K26: 2026-2027 (HK1–HK3), 2027-2028, 2028-2029, 2029-2030.
 */
export function cohortSemesterSlots(cohort: string): { id: string; year: string; term: number }[] {
  const start = cohortStartYear(cohort);
  if (start === null) return [];
  const out: { id: string; year: string; term: number }[] = [];
  for (let y = 0; y < YEARS; y++) {
    const year = `${start + y}-${start + y + 1}`;
    for (let term = 1; term <= TERMS_PER_YEAR; term++) out.push({ id: `${year}-${term}`, year, term });
  }
  return out;
}

export function emptySemester(slot: Pick<Semester, "id" | "year" | "term">): Semester {
  return {
    ...slot,
    name: `Học kỳ ${slot.term}, ${slot.year}`,
    is_current: false,
    start_date: null,
    end_date: null,
  };
}

/**
 * Lọc danh sách học kỳ theo khóa của sinh viên: chỉ hiện 4 năm học của khóa đó (12 học kỳ),
 * kể cả học kỳ chưa có dữ liệu từ API. Không có khóa thì giữ nguyên danh sách.
 */
export function scopeSemesters(all: Semester[], cohort: string): Semester[] {
  const slots = cohortSemesterSlots(cohort);
  if (slots.length === 0) return all;
  const byId = new Map(all.map((s) => [s.id, s]));
  return slots.map((sl) => byId.get(sl.id) ?? emptySemester(sl));
}

/** The current academic year is the enrollment year of the newest cohort. */
export function latestEnrollmentCohort(current?: Semester, today = vietnamDate()): string {
  const year = /^(\d{4})/.exec(academicYearLabel(current))?.[1];
  const startYear = year ? Number(year) : Number(today.slice(0, 4)) - (today.slice(5, 7) < "08" ? 1 : 0);
  return `K${String(startYear).slice(-2)}`;
}

/** Học kỳ theo khóa của người dùng (mã lớp trong Cài đặt). */
export function useSemesters() {
  const cohort = parseProgramCode(useSettings((s) => s.programCode))?.cohort ?? "";
  const req = useApi(() => api.semesters(), []);
  const data = useMemo(() => (req.data ? scopeSemesters(req.data, cohort) : req.data), [req.data, cohort]);
  const current = useMemo(() => data?.find((s) => s.is_current) ?? data?.[0] ?? null, [data]);
  const globalCurrent = req.data?.find((s) => s.is_current);
  const academicYear = academicYearLabel(globalCurrent);
  const currentYearSecondTerm = academicYear
    ? req.data?.find((s) => semesterTerm(s) === 2 && academicYearLabel(s) === academicYear)
    : undefined;
  return { ...req, data, availableSemesters: req.data, current, globalCurrent, academicYear, currentYearSecondTerm };
}
