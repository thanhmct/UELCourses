export interface Creditable {
  credits: number;
  hidden?: boolean;
}

export function totalCredits(items: Creditable[], includeHidden = true): number {
  return items.reduce((sum, m) => {
    if (!includeHidden && m.hidden) return sum;
    const c = Number(m.credits);
    return sum + (Number.isFinite(c) && c > 0 ? c : 0);
  }, 0);
}

export type CreditLoad = "empty" | "low" | "normal" | "high";

/** UEL-ish guideline: < 14 low, > 25 high per regular semester (configurable). */
export function creditLoad(credits: number, min = 14, max = 25): CreditLoad {
  if (credits <= 0) return "empty";
  if (credits < min) return "low";
  if (credits > max) return "high";
  return "normal";
}
