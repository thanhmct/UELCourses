// Cohort convention: "K" + last two digits of the admission year (K23 = admitted 2023).
// Derivation runs only in the browser; student IDs are never sent to the server.

export const COHORT_MIN = 23;
export const COHORT_MAX = 26;

export const COHORTS: string[] = Array.from({ length: COHORT_MAX - COHORT_MIN + 1 }, (_, i) => `K${COHORT_MIN + i}`);

/**
 * Guess the cohort from a student ID ("K224040496" -> "K22") or a student class code
 * ("K24404E" -> "K24"). Returns null when nothing plausible is found.
 */
export function cohortFromId(input: string): string | null {
  const s = input.trim().toUpperCase();
  const m = /^K(\d{2})/.exec(s);
  if (!m) return null;
  const yy = Number(m[1]);
  if (yy < 10 || yy > 99) return null;
  return `K${m[1]}`;
}

export function admissionYear(cohort: string): number | null {
  const m = /^K(\d{2})$/i.exec(cohort.trim());
  return m ? 2000 + Number(m[1]) : null;
}
