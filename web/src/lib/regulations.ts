import type { RegulationArticle, RegulationDoc, RegulationStatus } from "./types";
import { daysBetween, parseDateOnly, todayUtc } from "./dates";

export const EXPIRING_WITHIN_DAYS = 90;

export type EffectiveBadge = "active" | "expiring" | "expired" | "superseded" | "upcoming";

/** Compute the badge to show, taking current date into account. */
export function effectiveBadge(
  doc: Pick<RegulationDoc, "status" | "effective_from" | "effective_to">,
  now = new Date(),
  withinDays = EXPIRING_WITHIN_DAYS,
): EffectiveBadge {
  const today = todayUtc(now);
  if (doc.status === "superseded") return "superseded";
  const to = parseDateOnly(doc.effective_to ?? undefined);
  const from = parseDateOnly(doc.effective_from);
  if (doc.status === "expired" || (to && to.getTime() < today.getTime())) return "expired";
  if (doc.status === "upcoming" || (from && from.getTime() > today.getTime())) return "upcoming";
  if (to && daysBetween(today, to) <= withinDays) return "expiring";
  return "active";
}

export const BADGE_LABEL: Record<EffectiveBadge, string> = {
  active: "Còn hiệu lực",
  expiring: "Sắp hết hiệu lực",
  expired: "Hết hiệu lực",
  superseded: "Đã bị thay thế",
  upcoming: "Chưa có hiệu lực",
};

export const STATUS_LABEL: Record<RegulationStatus, string> = {
  active: "Còn hiệu lực",
  expired: "Hết hiệu lực",
  superseded: "Đã bị thay thế",
  upcoming: "Sắp có hiệu lực",
};

export function appliesToCohort(doc: Pick<RegulationDoc, "applies_to_cohorts">, cohort?: string): boolean {
  if (!cohort) return true;
  const list = doc.applies_to_cohorts ?? [];
  return list.length === 0 || list.some((c) => c.toLowerCase() === "all" || c.toUpperCase() === cohort.toUpperCase());
}

/** "Điều 12", "12", "dieu-12" -> "12" */
export function articleNumber(article: string): string {
  const m = /(\d+[a-z]?)/i.exec(article);
  return m ? m[1] : article.trim();
}

export function articleAnchor(article: string): string {
  return `dieu-${articleNumber(article)}`;
}

/** Link into the regulations workspace, opening `docId` at the article/clause anchor. */
export function citationHref(docId: string, article: string, clause?: string | null): string {
  const anchor = clause ? `${articleAnchor(article)}-khoan-${clause}` : articleAnchor(article);
  return `/regulations?doc=${encodeURIComponent(docId)}#${anchor}`;
}

/** Normalise loosely-shaped article objects from the API. */
export function normalizeArticles(raw: unknown): RegulationArticle[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a): RegulationArticle | null => {
      if (!a || typeof a !== "object") return null;
      const o = a as Record<string, unknown>;
      const article = String(o.article ?? o.number ?? o.no ?? o.id ?? "");
      if (!article) return null;
      const clausesRaw = (o.clauses ?? o.khoan) as unknown;
      const clauses = Array.isArray(clausesRaw)
        ? clausesRaw
            .map((c, i) => {
              if (typeof c === "string") return { clause: String(i + 1), text: c };
              if (c && typeof c === "object") {
                const co = c as Record<string, unknown>;
                return {
                  clause: String(co.clause ?? co.number ?? i + 1),
                  text: String(co.text ?? co.content ?? ""),
                };
              }
              return null;
            })
            .filter((c): c is { clause: string; text: string } => !!c)
        : undefined;
      return {
        article: /^đi[eề]u/i.test(article) ? article : `Điều ${article}`,
        title: o.title != null ? String(o.title) : undefined,
        text: o.text != null ? String(o.text) : o.content != null ? String(o.content) : undefined,
        clauses,
      };
    })
    .filter((a): a is RegulationArticle => !!a);
}
