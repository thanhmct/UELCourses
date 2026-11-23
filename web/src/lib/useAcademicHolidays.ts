"use client";

import { useMemo } from "react";
import { api } from "./api";
import { verifiedHolidays, type AcademicHoliday } from "./holidays";
import { useApi } from "./useApi";

const EMPTY: AcademicHoliday[] = [];

export function useAcademicHolidays(academicYear?: string, cohort = "", secondCohort = ""): AcademicHoliday[] {
  const scope = JSON.stringify([academicYear, cohort, secondCohort]);
  const { data } = useApi(async () => {
    if (!academicYear) return { data: { scope, holidays: EMPTY }, mock: false };
    const result = await api.academicHolidays(academicYear, secondCohort && secondCohort !== cohort ? undefined : cohort || undefined);
    return { data: { scope, holidays: result.data }, mock: result.mock };
  }, [scope]);
  return useMemo(
    () => data?.scope === scope ? verifiedHolidays(data.holidays, [cohort, secondCohort].filter(Boolean)) : EMPTY,
    [cohort, data, scope, secondCohort],
  );
}
