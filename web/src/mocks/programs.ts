import type {
  CheckResult,
  ModuleTreeNode,
  ProgramDetail,
  ProgramGraph,
  ProgramSummary,
} from "@/lib/types";
import catalog from "@/data/programs_catalog.json";
import { allModules, buildModuleTree, checkPlan, programGraph, type RelationSource } from "@/lib/programs";
import { matches } from "@/lib/text";

const summaries = catalog.summaries as ProgramSummary[];
const details = catalog.details as Record<string, ProgramDetail>;

export function mockPrograms(filter?: { cohort?: string; q?: string }): ProgramSummary[] {
  let list = summaries;
  if (filter?.cohort && filter.cohort !== "all") {
    const c = filter.cohort.toUpperCase().trim();
    list = list.filter((p) => p.cohort.toUpperCase() === c);
  } else {
    list = list.filter((p) => {
      const num = parseInt(p.cohort.replace(/\D/g, ""), 10);
      return isNaN(num) || num >= 23;
    });
  }
  if (filter?.q) {
    const q = filter.q.trim();
    list = list.filter((p) => matches(p.program_id, q) || matches(p.name, q) || matches(p.faculty ?? "", q));
  }
  return list;
}

export function mockProgram(id: string): ProgramDetail | null {
  const normId = id.trim().toUpperCase();
  return details[normId] ?? details[id.trim()] ?? null;
}

export function mockProgramGraph(id: string): ProgramGraph | null {
  const p = mockProgram(id);
  if (!p) return null;
  return programGraph(p);
}

export function mockModuleTree(
  code: string,
  options?: { program_id?: string; direction?: "prereq" | "unlocks"; depth?: number },
): ModuleTreeNode | null {
  const direction = options?.direction ?? "prereq";
  const depth = options?.depth ?? 4;
  let pool: RelationSource[] = [];

  if (options?.program_id) {
    const p = mockProgram(options.program_id);
    if (p) {
      pool = allModules(p).map((m) => ({
        code: m.code,
        name: m.name,
        prereq: m.prereq,
        previous: m.previous,
        coreq: m.coreq,
        equivalents: m.equivalents,
      }));
    }
  }

  // If no program specified or module not in program, gather from all programs
  if (!pool.some((m) => m.code === code)) {
    const map = new Map<string, RelationSource>();
    for (const prog of Object.values(details)) {
      for (const m of allModules(prog)) {
        if (!map.has(m.code)) {
          map.set(m.code, {
            code: m.code,
            name: m.name,
            prereq: m.prereq,
            previous: m.previous,
            coreq: m.coreq,
            equivalents: m.equivalents,
          });
        }
      }
    }
    pool = Array.from(map.values());
  }

  return buildModuleTree(pool, code, direction, depth);
}

export function mockCheckProgram(
  id: string,
  req: { completed: { code: string; grade?: string | number }[]; planned: Record<string, string[]> },
): CheckResult {
  const p = mockProgram(id);
  if (!p) {
    return {
      eligible_now: [],
      blocked: [],
      warnings: ["Không tìm thấy chương trình đào tạo để kiểm tra."],
      rule_refs: [],
    };
  }
  const completedCodes = req.completed.map((c) => c.code);
  return checkPlan(p, completedCodes, req.planned);
}
