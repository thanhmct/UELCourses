import { translate, type Lang } from "@/i18n";
import type { ClassSection, ModuleSummary, OfferingPlan } from "./types";

/** "Dự kiến mở: HK1, HK3 năm 2026-2027; HK2 năm 2027-2028" */
export function formatOfferingPlan(plan?: OfferingPlan[] | null): string {
  if (!plan?.length) return "";
  const parts = plan
    .filter((p) => p.terms?.length)
    .map((p) => `${[...p.terms].sort((a, b) => a - b).map((t) => `HK${t}`).join(", ")} năm ${p.academic_year}`);
  return parts.length ? `Dự kiến mở: ${parts.join("; ")}` : "";
}

/** Seats left: prefer `available`, else quota_max/quota − registered. null if unknown. */
export function seatsAvailable(s: Pick<ClassSection, "available" | "quota_max" | "quota" | "registered">): number | null {
  if (typeof s.available === "number") return Math.max(0, s.available);
  const cap = s.quota_max ?? s.quota;
  if (typeof cap === "number" && typeof s.registered === "number") return Math.max(0, cap - s.registered);
  return null;
}

export function capacityText(s: ClassSection, lang: Lang = "vi"): string {
  const cap = s.quota_max ?? s.quota;
  const left = seatsAvailable(s);
  const parts: string[] = [];
  if (typeof s.registered === "number" && typeof cap === "number") parts.push(`${s.registered}/${cap}`);
  else if (typeof cap === "number") parts.push(translate(lang, "det.seatsMaximum", { n: cap }));
  if (left !== null) parts.push(translate(lang, left === 0 ? "det.seatsFull" : "det.seatsLeft", { n: left }));
  return parts.join(" · ") || "—";
}

/** Terms (1..3) a module is planned to open in the given academic year ("2026-2027"); all years if omitted. */
export function openTerms(m: Pick<ModuleSummary, "offering_plan">, year?: string): Set<number> {
  const s = new Set<number>();
  for (const p of m.offering_plan ?? []) if (!year || p.academic_year === year) p.terms?.forEach((t) => s.add(t));
  return s;
}

/** "2026-2027-1" -> { year: "2026-2027", term: 1 } (null if the id has another shape). */
/** Môn học ghép (vd "… - Học ghép 261BAU304502 +1TC"): trong sơ đồ quan hệ chỉ hiện mã, không hiện tên và chi tiết. */
export function isJointCourse(name?: string | null): boolean {
  return !!name && /học ghép/i.test(name);
}

export function parseSemesterId(id: string): { year: string; term: number } | null {
  const m = /^(\d{4}-\d{4})-(\d+)$/.exec(id);
  return m ? { year: m[1], term: Number(m[2]) } : null;
}

/** Open classes per term (1..3) in an academic year, from open_semesters. Terms with no classes are absent. */
export function openClassesByTerm(m: Pick<ModuleSummary, "open_semesters">, year?: string): Map<number, number> {
  const out = new Map<number, number>();
  for (const s of m.open_semesters ?? []) {
    const p = parseSemesterId(s.semester);
    if (!p || (year && p.year !== year) || !(s.classes > 0)) continue;
    out.set(p.term, (out.get(p.term) ?? 0) + s.classes);
  }
  return out;
}
