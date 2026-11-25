import type { ModuleRef, ProgramDetail } from "./types";
import { allModules, requiredByTerm, splitCodes, type TermGroup } from "./programs";
import { admissionYear } from "./cohort";
import { parseSemesterId } from "./modules";
import { parseProgramCode } from "./programCode";
import { fold } from "./text";
export {
  formatPlannerTerm,
  formatPlannerTermStats,
  formatSemesterLabel,
  plannerSemesterLabel,
} from "@/i18n/names";

export interface PlannedModule extends ModuleRef {
  prerequisites?: string[];
  equivalents?: ModuleRef[];
  suggested_order?: number | null;
  suggested_term?: number | null;
  suggested_semester?: string | null;
  required?: boolean;
}

export interface PlanTerm {
  id: string;
  name: string;
  modules: string[]; // module codes, ordered
}

export interface PlannerAcademicYears {
  admission: number;
  graduation: number;
}

export interface PlanState {
  terms: PlanTerm[];
  /** codes not yet placed into a term */
  backlog: string[];
  completed: string[];
  catalog: Record<string, PlannedModule>;
}

export interface PrereqWarning {
  termId: string;
  code: string;
  missing: string[];
}

/** 4 năm × 3 học kỳ chính thức (HK1, HK2, HK3) = 12 học kỳ. */
export const PROGRAM_PLAN_TERMS: PlanTerm[] = Array.from({ length: 12 }, (_, i) => {
  const year = Math.floor(i / 3) + 1;
  const term = (i % 3) + 1;
  return { id: `t${i + 1}`, name: `Năm ${year} – HK${term}`, modules: [] };
});

function plannerTermDates(name: string) {
  const normalized = fold(name);
  const termMatch = /(?:hoc\s*(?:ky|ki)|hk|ky|ki|term|semester|sem)\s*(?:thu\s*)?[:.#-]?\s*0*([1-9]\d*)/i.exec(normalized);
  const studyYearMatch = /(?:^|[^a-z0-9])(?:nam|year|n|y)\s*(?:thu\s*)?[:.#-]?\s*0*([1-9]\d*)(?=$|[^0-9])/i.exec(normalized);
  const academicYear = /\b(\d{4})\s*[-–—/]\s*(\d{4})\b/.exec(normalized);
  return {
    term: Number(termMatch?.[1] ?? parseSemesterId(normalized)?.term ?? 0),
    studyYear: studyYearMatch ? Number(studyYearMatch[1]) : null,
    academicYear,
  };
}

function plannerTermChronology(name: string): [number, number, number] {
  const { term, studyYear, academicYear } = plannerTermDates(name);
  if (studyYear !== null) return [0, studyYear, term];
  if (academicYear) return [1, Number(academicYear[1]), term];
  if (term > 0) return [2, 0, term];
  return [3, 0, 0];
}

export function plannerEnrollmentYear(programCode: string, cohort: string): number | null {
  const program = parseProgramCode(programCode.split("+", 1)[0]);
  const year = admissionYear(program?.cohort.replace(/^[BCN]/, "K") ?? "");
  return year ?? (program && program.degree !== "dai_hoc" ? null : admissionYear(cohort));
}

/** An academic year in the name takes precedence over a year relative to enrollment. */
export function plannerSemesterId(name: string, enrollmentYear: number | null): string | null {
  const { term, studyYear, academicYear } = plannerTermDates(name);
  if (term < 1 || term > 3) return null;
  const start = academicYear ? Number(academicYear[1])
    : enrollmentYear !== null && studyYear !== null ? enrollmentYear + studyYear - 1 : null;
  if (start === null || start < 1000 || start >= 9999) return null;
  if (academicYear && Number(academicYear[2]) !== start + 1) return null;
  return `${start}-${start + 1}-${term}`;
}

export interface CompletePlannerYearsResult {
  terms: PlanTerm[];
  /** Mã học phần của các học kỳ bị loại vì nằm ngoài khoảng năm học mới (mâu thuẫn) — cần đưa về "Dự định học". */
  movedToBacklog: string[];
}

/**
 * Fill the selected academic years and preserve every term that already contains courses.
 * A term whose resolved semester falls outside the new [admission, graduation] range conflicts with the
 * new selection: it is dropped, and any courses it held are reported via `movedToBacklog` so the caller
 * can move them back to "Dự định học" instead of losing them.
 */
export function completePlannerYears(terms: PlanTerm[], years: PlannerAcademicYears, previousAdmission: number): CompletePlannerYearsResult {
  const existing = new Set<string>();
  const ids = new Set(terms.map(({ id }) => id));
  const movedToBacklog: string[] = [];
  const next = terms.flatMap((term) => {
    const explicit = plannerSemesterId(term.name, null);
    const resolved = explicit ?? plannerSemesterId(term.name, term.modules.length ? previousAdmission : years.admission);
    if (!resolved) return [term];
    const semester = parseSemesterId(resolved)!;
    const start = Number(semester.year.slice(0, 4));
    if (start < years.admission || start > years.graduation) {
      if (term.modules.length) movedToBacklog.push(...term.modules);
      return [];
    }
    existing.add(resolved);
    return [explicit ? term : { ...term, name: `HK${semester.term} ${semester.year}` }];
  });

  for (let start = years.admission; start <= years.graduation; start++) {
    const year = `${start}-${start + 1}`;
    for (let term = 1; term <= 3; term++) {
      const semester = `${year}-${term}`;
      if (existing.has(semester)) continue;
      const base = `academic-${semester}`;
      let id = base;
      for (let suffix = 2; ids.has(id); suffix++) id = `${base}-${suffix}`;
      ids.add(id);
      next.push({ id, name: `HK${term} ${year}`, modules: [] });
    }
  }
  return { terms: next, movedToBacklog };
}

/** Sắp xếp học kỳ theo thời gian học (năm → kỳ), giữ ổn định tên không nhận dạng được. */
export function sortPlannerTermsChronologically(terms: PlanTerm[]): PlanTerm[] {
  return terms
    .map((term, index) => ({ term, index, key: plannerTermChronology(term.name) }))
    .sort((a, b) =>
      a.key[0] - b.key[0]
      || a.key[1] - b.key[1]
      || a.key[2] - b.key[2]
      || a.index - b.index,
    )
    .map(({ term }) => term);
}

/**
 * A prerequisite is satisfied only if it (or an equivalent of it) is marked completed
 * ("Đã học / hoàn thành" ticked) — merely being placed in an earlier term is not enough.
 */
export function prerequisiteWarnings(state: PlanState): PrereqWarning[] {
  const completed = new Set(state.completed);
  const warnings: PrereqWarning[] = [];
  const satisfied = (code: string) => {
    if (completed.has(code)) return true;
    // accept any known module that lists `code` as an equivalent
    for (const m of Object.values(state.catalog)) {
      if (completed.has(m.code) && m.equivalents?.some((e) => e.code === code)) {
        return true;
      }
    }
    return false;
  };
  for (const term of state.terms) {
    for (const code of term.modules) {
      if (completed.has(code)) continue;
      const prereqs = state.catalog[code]?.prerequisites ?? [];
      const missing = prereqs.filter((p) => !satisfied(p));
      if (missing.length) warnings.push({ termId: term.id, code, missing });
    }
  }
  return warnings;
}

export function termCredits(state: PlanState, termId: string): number {
  const term = state.terms.find((t) => t.id === termId);
  if (!term) return 0;
  return term.modules.reduce((s, c) => s + (state.catalog[c]?.credits ?? 0), 0);
}

/** Move a module code to a target container ("backlog" or term id). Pure. */
export function moveModule(state: PlanState, code: string, target: string): PlanState {
  const terms = state.terms.map((t) => ({ ...t, modules: t.modules.filter((c) => c !== code) }));
  let backlog = state.backlog.filter((c) => c !== code);
  if (target === "backlog") backlog = [...backlog, code];
  else {
    const t = terms.find((x) => x.id === target);
    if (!t) return state;
    t.modules = [...t.modules, code];
  }
  return { ...state, terms, backlog };
}

/** Equivalent modules that could replace `code` and are not already in the plan. */
export function suggestReplacements(state: PlanState, code: string): ModuleRef[] {
  const planned = new Set([...state.backlog, ...state.terms.flatMap((t) => t.modules)]);
  return (state.catalog[code]?.equivalents ?? []).filter((e) => !planned.has(e.code));
}

export interface BacklogTermGroup {
  order: number | null;
  name: string;
  modules: string[];
  credits: number;
}

/**
 * Nhóm danh sách chờ (backlog) theo học kỳ gợi ý:
 * - Dùng thông tin từ TermGroup[] (CTĐT) hoặc `catalog[code].suggested_order`.
 * - Các kỳ 1..12 được sắp xếp theo thứ tự kỳ tăng dần.
 * - Nhóm chưa phân học kỳ (order null) nằm ở cuối.
 */
export function groupBacklogByTerm(
  backlog: string[],
  catalog: Record<string, PlannedModule>,
  termGroups?: TermGroup[],
): BacklogTermGroup[] {
  const codeSet = new Set(backlog);
  const groups: BacklogTermGroup[] = [];
  const processed = new Set<string>();

  if (termGroups && termGroups.length > 0) {
    for (const tg of termGroups) {
      const groupCodes = [...new Set(tg.modules.map((m) => m.code))]
        .filter((c) => codeSet.has(c) && !processed.has(c));
      if (groupCodes.length > 0) {
        groupCodes.forEach((c) => processed.add(c));
        const credits = groupCodes.reduce((sum, c) => sum + (catalog[c]?.credits ?? 0), 0);
        const name = tg.order !== null ? `Học kỳ ${tg.order}` : "Chưa phân học kỳ";
        groups.push({
          order: tg.order,
          name,
          modules: groupCodes,
          credits,
        });
      }
    }
  }

  const remaining = backlog.filter((c) => !processed.has(c));
  if (remaining.length > 0) {
    const remByOrder = new Map<number | null, string[]>();
    for (const code of remaining) {
      const order = catalog[code]?.suggested_order ?? null;
      const list = remByOrder.get(order) ?? [];
      list.push(code);
      remByOrder.set(order, list);
    }
    for (const [order, codes] of remByOrder.entries()) {
      const existing = groups.find((g) => g.order === order);
      if (existing) {
        existing.modules = Array.from(new Set([...existing.modules, ...codes]));
        existing.credits = existing.modules.reduce((sum, c) => sum + (catalog[c]?.credits ?? 0), 0);
      } else {
        const name = order !== null ? `Học kỳ ${order}` : "Chưa phân học kỳ";
        const credits = codes.reduce((sum, c) => sum + (catalog[c]?.credits ?? 0), 0);
        groups.push({ order, name, modules: codes, credits });
      }
    }
  }

  return groups.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
}

/**
 * Áp dụng lộ trình chuẩn của CTĐT vào kế hoạch học tập:
 * - Đưa các môn bắt buộc có suggested_order (1..12) vào học kỳ tương ứng.
 * - Không ghi đè môn người dùng đã xếp tay (nếu môn đã được xếp ở bất kỳ học kỳ nào, giữ nguyên vị trí đó;
 *   các môn đã có sẵn trong học kỳ đích cũng được giữ nguyên).
 * - Bỏ môn đã đạt (các môn trong completed không đưa vào học kỳ).
 * - Môn chưa phân học kỳ chỉ nằm trong danh sách chờ nếu đã được thêm vào đó.
 */
export function applyStandardPlan(
  state: PlanState,
  program: ProgramDetail | TermGroup[],
): PlanState {
  const groups: TermGroup[] = Array.isArray(program) ? program : requiredByTerm(program);
  const newCatalog: Record<string, PlannedModule> = { ...state.catalog };

  if (!Array.isArray(program)) {
    for (const m of allModules(program)) {
      newCatalog[m.code] = {
        ...newCatalog[m.code],
        code: m.code,
        name: m.name,
        name_en: m.name_en ?? null,
        credits: m.credits,
        prerequisites: splitCodes(m.prereq),
        equivalents: splitCodes(m.equivalents).map((c) => ({ code: c, name: c, credits: 0 })),
        suggested_order: m.suggested_order ?? null,
        suggested_term: m.suggested_term ?? null,
        suggested_semester: m.suggested_semester ?? null,
        required: m.required,
      };
    }
  } else {
    for (const g of program) {
      for (const m of g.modules) {
        if (!newCatalog[m.code]) {
          newCatalog[m.code] = {
            code: m.code,
            name: m.name,
            name_en: m.name_en ?? null,
            credits: m.credits,
            prerequisites: splitCodes(m.prereq),
            equivalents: splitCodes(m.equivalents).map((c) => ({ code: c, name: c, credits: 0 })),
            suggested_order: m.suggested_order ?? g.order ?? null,
            suggested_term: m.suggested_term ?? null,
            suggested_semester: m.suggested_semester ?? null,
            required: m.required,
          };
        }
      }
    }
  }

  const completed = new Set(state.completed);
  const placedInAnyTerm = new Set<string>();
  for (const t of state.terms) {
    for (const c of t.modules) {
      placedInAnyTerm.add(c);
    }
  }

  const existingTerms = new Map<string, PlanTerm>();
  for (const term of state.terms) {
    const previous = existingTerms.get(term.id);
    const modules = [...new Set([...(previous?.modules ?? []), ...term.modules])];
    existingTerms.set(term.id, { ...term, name: previous?.name ?? term.name, modules });
  }
  const standardOrders = new Set(PROGRAM_PLAN_TERMS.map((_, index) => index + 1));
  for (const { order } of groups) {
    if (order !== null && Number.isSafeInteger(order) && order > 0) standardOrders.add(order);
  }
  const standardTerms = new Map([...standardOrders].sort((a, b) => a - b).map((order) => {
    const id = `t${order}`;
    const existing = existingTerms.get(id);
    existingTerms.delete(id);
    const index = order - 1;
    return [order, existing ?? { id, name: `Năm ${Math.floor(index / 3) + 1} – HK${(index % 3) + 1}`, modules: [] }];
  }));
  for (const group of groups) {
    const target = group.order === null ? undefined : standardTerms.get(group.order);
    if (!target) continue;
    for (const course of group.modules) {
      if (completed.has(course.code) || placedInAnyTerm.has(course.code)) continue;
      target.modules.push(course.code);
      placedInAnyTerm.add(course.code);
    }
  }

  return {
    ...state,
    terms: [...standardTerms.values(), ...existingTerms.values()],
    backlog: [...new Set(state.backlog.filter((c) => !placedInAnyTerm.has(c) && !completed.has(c)))],
    catalog: newCatalog,
  };
}

export const buildStandardPlan = applyStandardPlan;
