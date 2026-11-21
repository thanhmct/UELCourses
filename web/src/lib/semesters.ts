"use client";
import { useMemo } from "react";
import { api } from "./api";
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

/**
 * Lọc danh sách học kỳ theo khóa của sinh viên: chỉ hiện 4 năm học của khóa đó (12 học kỳ),
 * kể cả học kỳ chưa có dữ liệu từ API. Không có khóa thì giữ nguyên danh sách.
 */
export function scopeSemesters(all: Semester[], cohort: string): Semester[] {
  const slots = cohortSemesterSlots(cohort);
  if (slots.length === 0) return all;
  const byId = new Map(all.map((s) => [s.id, s]));
  return slots.map(
    (sl) =>
      byId.get(sl.id) ?? {
        id: sl.id,
        name: `Học kỳ ${sl.term}, ${sl.year}`,
        year: sl.year,
        term: sl.term,
        is_current: false,
        start_date: null,
        end_date: null,
      },
  );
}

/** Học kỳ theo khóa của người dùng (mã lớp trong Cài đặt). */
export function useSemesters() {
  const cohort = parseProgramCode(useSettings((s) => s.programCode))?.cohort ?? "";
  const req = useApi(() => api.semesters(), []);
  const data = useMemo(() => (req.data ? scopeSemesters(req.data, cohort) : req.data), [req.data, cohort]);
  return { ...req, data };
}
