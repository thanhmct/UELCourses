// Pure logic for training programs: graph, prerequisite trees, plan checking, credits by block.
import type { CheckResult, ModuleTreeNode, ProgramDetail, ProgramGraph, ProgramModule, RelationType } from "./types";

export const RELATION_LABEL: Record<string, string> = {
  prereq: "Tiên quyết (phải đạt)",
  previous: "Học trước (đã học)",
  coreq: "Song hành",
  equivalent: "Tương đương",
};

export function allModules(p: ProgramDetail): (ProgramModule & { block: string })[] {
  return p.blocks.flatMap((b) => b.modules.map((m) => ({ ...m, block: b.name })));
}

/** Normalise codes coming from raw fields like " TATC" or "KT48, KT49". */
export function splitCodes(v?: string | string[] | null): string[] {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr.flatMap((s) => s.split(/[,;\s]+/)).map((s) => s.trim()).filter(Boolean);
}

export function programGraph(p: ProgramDetail): ProgramGraph {
  const mods = allModules(p);
  const known = new Set(mods.map((m) => m.code));
  const edges: ProgramGraph["edges"] = [];
  const add = (source: string, target: string, type: RelationType) => {
    if (known.has(source) && known.has(target) && source !== target) edges.push({ source, target, type });
  };
  for (const m of mods) {
    splitCodes(m.prereq).forEach((c) => add(c, m.code, "prereq"));
    splitCodes(m.previous).forEach((c) => add(c, m.code, "previous"));
    splitCodes(m.coreq).forEach((c) => add(c, m.code, "coreq"));
  }
  return {
    nodes: mods.map((m) => ({ code: m.code, name: m.name, credits: m.credits, required: m.required, suggested_term: m.suggested_term ?? null, block: m.block })),
    edges,
  };
}

/** All ancestors and descendants of `code` following non-equivalent edges. */
export function relatedChain(g: ProgramGraph, code: string): Set<string> {
  const out = new Set<string>([code]);
  const walk = (start: string, dir: "up" | "down") => {
    const stack = [start];
    while (stack.length) {
      const c = stack.pop()!;
      for (const e of g.edges) {
        if (e.type === "equivalent") continue;
        const next = dir === "up" ? (e.target === c ? e.source : null) : e.source === c ? e.target : null;
        if (next && !out.has(next)) {
          out.add(next);
          stack.push(next);
        }
      }
    }
  };
  walk(code, "up");
  walk(code, "down");
  return out;
}

export interface RelationSource {
  code: string;
  name: string;
  prereq?: string[];
  previous?: string[];
  coreq?: string[];
  equivalents?: string[];
}

/**
 * Recursive tree for a module.
 * direction "prereq": what must be taken before (AND of requirements; a requirement with
 * equivalents becomes an OR group). direction "unlocks": modules that require this one.
 */
export function buildModuleTree(
  sources: RelationSource[],
  code: string,
  direction: "prereq" | "unlocks",
  depth = 4,
): ModuleTreeNode {
  const byCode = new Map<string, RelationSource>();
  sources.forEach((s) => byCode.set(s.code, { ...byCode.get(s.code), ...s }));
  const nameOf = (c: string) => byCode.get(c)?.name ?? c;

  const build = (c: string, type: string, d: number, seen: Set<string>): ModuleTreeNode => {
    const node: ModuleTreeNode = { code: c, name: nameOf(c), type, children: [] };
    if (d <= 0 || seen.has(c)) return node;
    const nextSeen = new Set(seen).add(c);
    if (direction === "prereq") {
      const src = byCode.get(c);
      const reqs: { code: string; type: string }[] = [
        ...splitCodes(src?.prereq).map((x) => ({ code: x, type: "prereq" })),
        ...splitCodes(src?.previous).map((x) => ({ code: x, type: "previous" })),
        ...splitCodes(src?.coreq).map((x) => ({ code: x, type: "coreq" })),
      ];
      const kids = reqs.map((r) => {
        const eq = splitCodes(byCode.get(r.code)?.equivalents);
        const child = build(r.code, r.type, d - 1, nextSeen);
        if (!eq.length) return child;
        return {
          code: "",
          name: "Một trong các môn",
          type: "or",
          children: [child, ...eq.map((e) => build(e, r.type, d - 1, nextSeen))],
        };
      });
      node.children = kids.length > 1 ? [{ code: "", name: "Tất cả các môn", type: "and", children: kids }] : kids;
    } else {
      for (const s of byCode.values()) {
        const t = splitCodes(s.prereq).includes(c) ? "prereq" : splitCodes(s.previous).includes(c) ? "previous" : splitCodes(s.coreq).includes(c) ? "coreq" : null;
        if (t) node.children.push(build(s.code, t, d - 1, nextSeen));
      }
    }
    return node;
  };
  return build(code, "module", depth, new Set());
}

/**
 * Check a plan. `planned` keys are term identifiers in chronological order.
 * - prereq: satisfied by a completed module, or one planned in an earlier term (assumed passed).
 * - previous: same as prereq (only needs to have been taken).
 * - coreq: completed, earlier, or same term.
 * Equivalent modules satisfy a requirement.
 */
export function checkPlan(
  p: ProgramDetail,
  completed: string[],
  planned: Record<string, string[]>,
  ruleRefs: CheckResult["rule_refs"] = [],
): CheckResult {
  const mods = new Map(allModules(p).map((m) => [m.code, m]));
  const done = new Set(completed);
  const eqOf = (c: string) => [c, ...splitCodes(mods.get(c)?.equivalents)];
  const satisfiedBy = (pool: Set<string>, c: string) => eqOf(c).some((x) => pool.has(x)) || [...pool].some((x) => splitCodes(mods.get(x)?.equivalents).includes(c));

  const blocked: CheckResult["blocked"] = [];
  const before = new Set(done);
  for (const term of Object.keys(planned)) {
    const same = new Set([...before, ...planned[term]]);
    for (const code of planned[term]) {
      if (done.has(code)) continue;
      const m = mods.get(code);
      if (!m) continue;
      const missing = [
        ...splitCodes(m.prereq).filter((c) => !satisfiedBy(before, c)).map((c) => ({ code: c, type: "prereq" })),
        ...splitCodes(m.previous).filter((c) => !satisfiedBy(before, c)).map((c) => ({ code: c, type: "previous" })),
        ...splitCodes(m.coreq).filter((c) => !satisfiedBy(same, c)).map((c) => ({ code: c, type: "coreq" })),
      ];
      if (missing.length) blocked.push({ code, missing });
    }
    planned[term].forEach((c) => before.add(c));
  }

  const eligible_now = [...mods.values()]
    .filter((m) => !done.has(m.code))
    .filter((m) => [...splitCodes(m.prereq), ...splitCodes(m.previous)].every((c) => satisfiedBy(done, c)))
    .map((m) => m.code);

  const warnings: string[] = [];
  if (blocked.some((b) => b.missing.some((x) => x.type === "previous")))
    warnings.push("Điều kiện “học trước” có thể yêu cầu điểm tối thiểu theo quy chế của khóa — xem quy định liên quan.");
  return { eligible_now, blocked, warnings, rule_refs: blocked.length ? ruleRefs : [] };
}

export interface BlockCredits {
  block: string;
  parent?: string | null;
  required: number | null;
  done: number;
  planned: number;
  total: number;
}

export function creditsByBlock(p: ProgramDetail, completed: string[], planned: string[]): BlockCredits[] {
  const done = new Set(completed);
  const plan = new Set(planned);
  return p.blocks.map((b) => {
    const sum = (f: (c: string) => boolean) => b.modules.filter((m) => f(m.code)).reduce((s, m) => s + (m.credits || 0), 0);
    return {
      block: b.name,
      parent: b.parent,
      required: b.required_credits ?? null,
      done: sum((c) => done.has(c)),
      planned: sum((c) => plan.has(c) && !done.has(c)),
      total: b.modules.reduce((s, m) => s + (m.credits || 0), 0),
    };
  });
}

/** Parse "HK02 năm học 2022-2023" -> 2, "Chưa phân học kỳ" -> null. Numbers pass through. */
export function parseSuggestedTerm(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  const m = /HK\s*0?(\d+)/i.exec(v);
  return m ? Number(m[1]) : null;
}
