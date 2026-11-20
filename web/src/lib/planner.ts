import type { ModuleRef } from "./types";

export interface PlannedModule extends ModuleRef {
  prerequisites?: string[];
  equivalents?: ModuleRef[];
}

export interface PlanTerm {
  id: string;
  name: string;
  modules: string[]; // module codes, ordered
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

/**
 * A prerequisite is satisfied if it (or an equivalent of it) is marked completed,
 * or is placed in a strictly earlier term.
 */
export function prerequisiteWarnings(state: PlanState): PrereqWarning[] {
  const completed = new Set(state.completed);
  const earlier = new Set<string>();
  const warnings: PrereqWarning[] = [];
  const satisfied = (code: string) => {
    if (completed.has(code) || earlier.has(code)) return true;
    // accept any known module that lists `code` as an equivalent
    for (const m of Object.values(state.catalog)) {
      if ((completed.has(m.code) || earlier.has(m.code)) && m.equivalents?.some((e) => e.code === code)) {
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
    term.modules.forEach((c) => earlier.add(c));
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
