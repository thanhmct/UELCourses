import type { ClassSection, OfferingPlan } from "./types";

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

export function capacityText(s: ClassSection): string {
  const cap = s.quota_max ?? s.quota;
  const left = seatsAvailable(s);
  const parts: string[] = [];
  if (typeof s.registered === "number" && typeof cap === "number") parts.push(`${s.registered}/${cap}`);
  else if (typeof cap === "number") parts.push(`Tối đa ${cap}`);
  if (left !== null) parts.push(left === 0 ? "Hết chỗ" : `còn ${left} chỗ`);
  return parts.join(" · ") || "—";
}
