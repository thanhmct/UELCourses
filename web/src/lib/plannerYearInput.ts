/**
 * Parses a quick-typed academic-year entry for the planner, e.g.
 *   "K26 TN 2029"            → admission 2026, graduation 2029
 *   "NK 2025 ra trường 2029" → admission 2025, graduation 2029
 *   "năm 2"                  → admission = currentYear - 1
 *   "+3" / "in 3 years"      → graduation = currentYear + 3
 *   "2025-2029"              → admission 2025, graduation 2029
 * Accepts Vietnamese and English abbreviations (see KEYWORDS). Text it cannot read is returned in `unknown`.
 */

export const KEYWORDS = {
  /** Năm nhập học / khóa: K26, khóa 26, NK 2025, ADM 2025, ENR 2025 */
  admission: ["k", "khoa", "nk", "nhap hoc", "adm", "admission", "enr", "enrol", "entry"],
  /** Năm tốt nghiệp: TN 2029, ra trường 2029, GR 2029, GRAD 2029 */
  graduation: ["tn", "tot nghiep", "ra truong", "gr", "grad", "graduation"],
  /** Năm học thứ mấy: năm 2, Y2, year 2 */
  studyYear: ["nam", "year", "yr", "y"],
  /** Tương đối: năm nay / this year, năm sau / next year, +3, sau 3 năm, in 3 years */
  thisYear: ["nam nay", "this year"],
  nextYear: ["nam sau", "next year"],
} as const;

export type ParsedYears = {
  admission?: number;
  graduation?: number;
  /** Fragments the parser could not read, to show the user. */
  unknown: string[];
};

const MIN_YEAR_OFFSET = -10;
const MAX_YEAR_OFFSET = 15;

/** Lowercase, strip Vietnamese diacritics, normalize dashes and spaces. */
export function foldText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

const alt = (words: readonly string[]) => words.map((w) => w.replace(/ /g, "\\s+")).join("|");

function fullYear(raw: string): number {
  return raw.length === 2 ? 2000 + Number(raw) : Number(raw);
}

export function parseYearInput(input: string, currentYear: number): ParsedYears {
  const result: ParsedYears = { unknown: [] };
  let text = foldText(input);
  if (!text) return result;

  const valid = (year: number) =>
    year >= currentYear + MIN_YEAR_OFFSET && year <= currentYear + MAX_YEAR_OFFSET;

  // Consume a match: record the value if the slot is still empty, then blank the matched text.
  const consume = (pattern: RegExp, apply: (m: RegExpMatchArray) => void) => {
    text = text.replace(pattern, (...args: unknown[]) => {
      const match = args.slice(0, -2) as string[];
      apply(match as unknown as RegExpMatchArray);
      return " ";
    });
  };

  // Relative words first, so "năm sau" is not read as "năm" + "sau".
  consume(new RegExp(`\\b(?:${alt(KEYWORDS.nextYear)})\\b`, "g"), () => {
    result.graduation ??= currentYear + 1;
  });
  consume(new RegExp(`\\b(?:${alt(KEYWORDS.thisYear)})\\b`, "g"), () => {
    result.graduation ??= currentYear;
  });
  consume(/\+\s*(\d{1,2})\b|\b(?:sau|in)\s+(\d{1,2})\s*(?:nam|years?|yrs?|y)?\b/g, (m) => {
    const n = Number(m[1] ?? m[2]);
    result.graduation ??= currentYear + n;
  });

  // Admission keyword + year: K26, khóa 2026, NK 2025
  consume(new RegExp(`\\b(?:${alt(KEYWORDS.admission)})\\s*[:\\-]?\\s*(\\d{4}|\\d{2})\\b`, "g"), (m) => {
    const year = fullYear(m[1]);
    if (valid(year)) result.admission ??= year;
    else result.unknown.push(m[1]);
  });

  // Graduation keyword + year: TN 2029, ra trường 2029
  consume(new RegExp(`\\b(?:${alt(KEYWORDS.graduation)})\\s*[:\\-]?\\s*(\\d{4}|\\d{2})\\b`, "g"), (m) => {
    const year = fullYear(m[1]);
    if (valid(year)) result.graduation ??= year;
    else result.unknown.push(m[1]);
  });

  // Study year: năm 2, Y2 → admission = currentYear - n + 1 (matches the picker's "Year n" label)
  consume(new RegExp(`\\b(?:${alt(KEYWORDS.studyYear)})\\s*[:\\-]?\\s*([1-6])\\b`, "g"), (m) => {
    const study = Number(m[1]);
    result.admission ??= currentYear - study + 1;
  });

  // Range: 2025-2029 or 2025-2026 → admission, graduation
  consume(/\b(20\d{2})\s*-\s*(20\d{2})\b/g, (m) => {
    const admission = Number(m[1]);
    const graduation = Number(m[2]);
    if (valid(admission)) result.admission ??= admission;
    if (valid(graduation)) result.graduation ??= graduation;
  });

  // Lone years: first fills admission, next fills graduation.
  consume(/\b(20\d{2})\b/g, (m) => {
    const year = Number(m[1]);
    if (!valid(year)) return;
    if (result.admission === undefined) result.admission = year;
    else result.graduation ??= year;
  });

  result.unknown.push(
    ...text
      .split(/[\s,;]+/)
      .map((token) => token.replace(/^[^\p{L}\p{N}+]+|[^\p{L}\p{N}]+$/gu, ""))
      .filter(Boolean),
  );

  return result;
}
