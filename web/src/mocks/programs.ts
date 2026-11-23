import type {
  CheckResult,
  ElectiveGroup,
  ModuleTreeNode,
  ProgramDetail,
  ProgramGraph,
  ProgramSummary,
  ValidProgramGroup,
} from "@/lib/types";
import catalog from "@/data/programs_catalog.json";
import { allModules, buildModuleTree, checkPlan, programGraph, type RelationSource } from "@/lib/programs";
import { matches } from "@/lib/text";

const summaries = catalog.summaries as ProgramSummary[];
const details = catalog.details as Record<string, ProgramDetail>;

const sampleThsPrograms: ProgramSummary[] = [
  {
    program_id: "M601NC",
    name: "Kinh tế chính trị – Thạc sĩ nghiên cứu",
    cohort: "2025-2026",
    faculty: "Khoa Kinh tế",
    total_credits: 60,
    degree: "thac_si",
  },
  {
    program_id: "M601UD",
    name: "Kinh tế chính trị – Thạc sĩ ứng dụng",
    cohort: "2025-2026",
    faculty: "Khoa Kinh tế",
    total_credits: 60,
    degree: "thac_si",
  },
  {
    program_id: "M602",
    name: "Kinh tế quốc tế – Thạc sĩ",
    cohort: "2025-2026",
    faculty: "Khoa Kinh tế đối ngoại",
    total_credits: 60,
    degree: "thac_si",
  },
  {
    program_id: "M605",
    name: "Kế toán – Thạc sĩ",
    cohort: "2025-2026",
    faculty: "Khoa Kế toán - Kiểm toán",
    total_credits: 60,
    degree: "thac_si",
  },
  {
    program_id: "M607NC",
    name: "Quản trị kinh doanh – Thạc sĩ nghiên cứu",
    cohort: "2025-2026",
    faculty: "Khoa Quản trị kinh doanh",
    total_credits: 60,
    degree: "thac_si",
  },
  {
    program_id: "M610UD",
    name: "Luật kinh tế – Thạc sĩ ứng dụng",
    cohort: "2025-2026",
    faculty: "Khoa Luật Kinh tế",
    total_credits: 60,
    degree: "thac_si",
  },
  {
    program_id: "M611",
    name: "Thương mại điện tử – Thạc sĩ",
    cohort: "2025-2026",
    faculty: "Khoa Hệ thống thông tin",
    total_credits: 60,
    degree: "thac_si",
  },
];

export function mockPrograms(filter?: { cohort?: string; q?: string; degree?: string }): ProgramSummary[] {
  const degree = filter?.degree || "dai_hoc";
  let list: ProgramSummary[] = summaries.map((p) => ({ ...p, degree: p.degree || "dai_hoc" }));
  if (degree === "thac_si") {
    list = [...list.filter((p) => p.degree === "thac_si"), ...sampleThsPrograms];
  } else if (degree !== "all") {
    list = list.filter((p) => (p.degree || "dai_hoc") === degree);
  }
  if (filter?.cohort && filter.cohort !== "all") {
    const c = filter.cohort.toUpperCase().trim();
    list = list.filter((p) => p.cohort.toUpperCase() === c);
  } else if (degree === "dai_hoc") {
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

export function mockElectiveGroups(id: string): ElectiveGroup[] {
  const p = mockProgram(id);
  if (!p) return [];
  const groups: ElectiveGroup[] = [];
  for (const block of p.blocks) {
    const electives = block.modules.filter((m) => !m.required);
    if (electives.length > 0) {
      const avail = electives.reduce((sum, m) => sum + (m.credits || 0), 0);
      const req = block.required_credits || (avail > 6 ? 6 : avail);
      groups.push({
        block: block.name,
        required_credits: req,
        available_credits: avail,
        modules: electives,
      });
    }
  }
  return groups;
}

export function mockValidProgramGroups(): ValidProgramGroup[] {
  return [
    // 401 (Kinh tế học)
    { code: "K24401", cohort: "K24", major: "401", suffix: "", kind: "standard", program_id: "K24401", source: "catalog" },
    { code: "K24401A", cohort: "K24", major: "401", suffix: "A", kind: "standard", program_id: "K24401", source: "class_sections" },

    // 404: K23404, K23404A/B, K24404A/B/E, K25404A/B/E, K26404A/B/C/E
    { code: "K23404", cohort: "K23", major: "404", suffix: "", kind: "standard", program_id: "K23404", source: "class_sections" },
    { code: "K23404A", cohort: "K23", major: "404", suffix: "A", kind: "standard", program_id: "K23404", source: "class_sections" },
    { code: "K23404B", cohort: "K23", major: "404", suffix: "B", kind: "standard", program_id: "K23404", source: "class_sections" },
    { code: "K24404A", cohort: "K24", major: "404", suffix: "A", kind: "standard", program_id: "K24404", source: "class_sections" },
    { code: "K24404B", cohort: "K24", major: "404", suffix: "B", kind: "standard", program_id: "K24404", source: "class_sections" },
    { code: "K24404E", cohort: "K24", major: "404", suffix: "E", kind: "english", program_id: "K24404", source: "class_sections" },
    { code: "K24404T", cohort: "K24", major: "404", suffix: "T", kind: "talent", program_id: "K24404", source: "class_sections" },
    { code: "K25404A", cohort: "K25", major: "404", suffix: "A", kind: "standard", program_id: "K25404", source: "class_sections" },
    { code: "K25404B", cohort: "K25", major: "404", suffix: "B", kind: "standard", program_id: "K25404", source: "class_sections" },
    { code: "K25404E", cohort: "K25", major: "404", suffix: "E", kind: "english", program_id: "K25404", source: "class_sections" },
    { code: "K26404A", cohort: "K26", major: "404", suffix: "A", kind: "standard", program_id: "K26404", source: "class_sections" },
    { code: "K26404B", cohort: "K26", major: "404", suffix: "B", kind: "standard", program_id: "K26404", source: "class_sections" },
    { code: "K26404C", cohort: "K26", major: "404", suffix: "C", kind: "standard", program_id: "K26404", source: "class_sections" },
    { code: "K26404E", cohort: "K26", major: "404", suffix: "E", kind: "english", program_id: "K26404", source: "class_sections" },

    // 405 (Kế toán)
    { code: "K25405", cohort: "K25", major: "405", suffix: "", kind: "standard", program_id: "K25405", source: "catalog" },
    { code: "K25405A", cohort: "K25", major: "405", suffix: "A", kind: "standard", program_id: "K25405", source: "class_sections" },

    // 406 (HTTT)
    { code: "K22406", cohort: "K22", major: "406", suffix: "", kind: "standard", program_id: "K22406", source: "class_sections" },
    { code: "K23406", cohort: "K23", major: "406", suffix: "", kind: "standard", program_id: "K23406", source: "class_sections" },
    { code: "K23406A", cohort: "K23", major: "406", suffix: "A", kind: "standard", program_id: "K23406", source: "class_sections" },
    { code: "K23406E", cohort: "K23", major: "406", suffix: "E", kind: "english", program_id: "K23406", source: "class_sections" },
    { code: "K23406E1", cohort: "K23", major: "406", suffix: "E1", kind: "english", program_id: "K23406", source: "class_sections" },
    { code: "K23406H", cohort: "K23", major: "406", suffix: "H", kind: "coop", program_id: "K23406", source: "class_sections" },
    { code: "K24406", cohort: "K24", major: "406", suffix: "", kind: "standard", program_id: "K24406", source: "class_sections" },
    { code: "K24406A", cohort: "K24", major: "406", suffix: "A", kind: "standard", program_id: "K24406", source: "class_sections" },

    // 409 (Luật / Kiểm toán)
    { code: "K24409", cohort: "K24", major: "409", suffix: "", kind: "standard", program_id: "K24409", source: "catalog" },
    { code: "K24409A", cohort: "K24", major: "409", suffix: "A", kind: "standard", program_id: "K24409", source: "class_sections" },
    { code: "K26409", cohort: "K26", major: "409", suffix: "", kind: "standard", program_id: "K26409", source: "catalog" },
    { code: "K26409E", cohort: "K26", major: "409", suffix: "E", kind: "english", program_id: "K26409", source: "catalog" },

    // 414: K23414A/B, K24414, K24414H, K25414, K25414H, K26414A/B/H - NO E!
    { code: "K23414A", cohort: "K23", major: "414", suffix: "A", kind: "standard", program_id: "K23414", source: "class_sections" },
    { code: "K23414B", cohort: "K23", major: "414", suffix: "B", kind: "standard", program_id: "K23414", source: "class_sections" },
    { code: "K24414", cohort: "K24", major: "414", suffix: "", kind: "standard", program_id: "K24414", source: "class_sections" },
    { code: "K24414H", cohort: "K24", major: "414", suffix: "H", kind: "coop", program_id: "K24414", source: "class_sections" },
    { code: "K25414", cohort: "K25", major: "414", suffix: "", kind: "standard", program_id: "K25414", source: "class_sections" },
    { code: "K25414H", cohort: "K25", major: "414", suffix: "H", kind: "coop", program_id: "K25414", source: "class_sections" },
    { code: "K26414A", cohort: "K26", major: "414", suffix: "A", kind: "standard", program_id: "K26414", source: "class_sections" },
    { code: "K26414B", cohort: "K26", major: "414", suffix: "B", kind: "standard", program_id: "K26414", source: "class_sections" },
    { code: "K26414H", cohort: "K26", major: "414", suffix: "H", kind: "coop", program_id: "K26414", source: "class_sections" },
  ];
}
