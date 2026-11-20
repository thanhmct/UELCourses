"use client";
import { useEffect, useMemo, useState } from "react";
import { COHORTS } from "@/lib/store";
import {
  getModuleReviews,
  getReviewStats,
  hasUpvotedReview,
  toggleUpvoteReview,
  type ModuleReview,
} from "@/lib/reviews";
import { useT } from "@/i18n";

function StarRating({ rating }: { rating: number }) {
  const { t } = useT();
  return (
    <div className="flex items-center gap-0.5" aria-label={t("rev.stars", { n: rating })}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className={`text-lg ${star <= rating ? "text-amber-400" : "text-slate-300 dark:text-slate-600"}`} aria-hidden>
          ★
        </span>
      ))}
    </div>
  );
}

/**
 * Student reviews. Read-only for now: writing a review requires sign-in (not built yet),
 * so the form is replaced by a notice and no personal information is collected.
 */
export function ModuleReviews({ moduleCode }: { moduleCode: string; moduleName?: string }) {
  const { t } = useT();
  const [reviews, setReviews] = useState<ModuleReview[]>([]);
  const [filterCohort, setFilterCohort] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"newest" | "helpful">("helpful");
  const [upvotesState, setUpvotesState] = useState<Record<string, { count: number; active: boolean }>>({});

  useEffect(() => {
    const list = getModuleReviews(moduleCode);
    setReviews(list);
    const upMap: Record<string, { count: number; active: boolean }> = {};
    for (const r of list) upMap[r.id] = { count: r.upvotes, active: hasUpvotedReview(r.id) };
    setUpvotesState(upMap);
  }, [moduleCode]);

  const stats = useMemo(() => getReviewStats(reviews), [reviews]);
  const diffLabel = (n: number) => t(`diff.${Math.min(5, Math.max(1, Math.round(n)))}`);
  const workLabel = (n: number) => t(`work.${Math.min(5, Math.max(1, Math.round(n)))}`);

  const filtered = useMemo(() => {
    let list = reviews;
    if (filterCohort !== "all") list = list.filter((r) => r.cohort === filterCohort);
    return list.slice().sort((a, b) => {
      if (sortBy === "helpful") return (upvotesState[b.id]?.count ?? b.upvotes) - (upvotesState[a.id]?.count ?? a.upvotes);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [reviews, filterCohort, sortBy, upvotesState]);

  const handleUpvote = (id: string) => {
    const added = toggleUpvoteReview(id);
    setUpvotesState((prev) => {
      const cur = prev[id] ?? { count: 0, active: false };
      return { ...prev, [id]: { count: cur.count + (added ? 1 : -1), active: added } };
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t("rev.title")}</h2>
        <p className="text-xs text-slate-500">{t("rev.sub", { code: moduleCode })}</p>
      </div>

      <div className="rounded-md border border-dashed border-brand-300 bg-brand-50/50 p-3 text-sm dark:border-brand-800 dark:bg-brand-950/30">
        <p className="font-semibold text-slate-800 dark:text-slate-100">{t("rev.loginTitle")}</p>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{t("rev.loginNote")}</p>
        <button type="button" className="btn-outline mt-2 text-xs" disabled aria-disabled="true">{t("rev.loginBtn")}</button>
      </div>

      <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50/50 p-3 sm:grid-cols-3 dark:border-slate-800 dark:bg-slate-900/50">
        <div className="flex items-center gap-3 border-b pb-2 sm:border-b-0 sm:border-r sm:pb-0 dark:border-slate-800">
          <div className="text-3xl font-extrabold text-brand-700 dark:text-brand-300">
            {stats.average_rating > 0 ? stats.average_rating.toFixed(1) : "—"}
          </div>
          <div>
            <StarRating rating={Math.round(stats.average_rating)} />
            <span className="text-xs text-slate-500">{t("rev.based", { n: stats.total_reviews })}</span>
          </div>
        </div>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between gap-2">
            <span className="text-slate-500">{t("rev.avgDifficulty")}</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {stats.average_difficulty > 0 ? `${stats.average_difficulty.toFixed(1)} / 5 (${diffLabel(stats.average_difficulty)})` : "—"}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-500">{t("rev.avgWorkload")}</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {stats.average_workload > 0 ? `${stats.average_workload.toFixed(1)} / 5 (${workLabel(stats.average_workload)})` : "—"}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 text-xs">
          <select className="input py-1 text-xs" value={filterCohort} onChange={(e) => setFilterCohort(e.target.value)} aria-label={t("rev.allCohorts")}>
            <option value="all">{t("rev.allCohorts")}</option>
            {COHORTS.map((c) => (
              <option key={c} value={c}>{t("rev.cohort", { c })}</option>
            ))}
          </select>
          <select className="input py-1 text-xs" value={sortBy} onChange={(e) => setSortBy(e.target.value as "newest" | "helpful")} aria-label={t("rev.sortHelpful")}>
            <option value="helpful">{t("rev.sortHelpful")}</option>
            <option value="newest">{t("rev.sortNewest")}</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">{t("rev.empty")}</div>
        ) : (
          filtered.map((rev) => {
            const upInfo = upvotesState[rev.id] ?? { count: rev.upvotes, active: false };
            return (
              <article key={rev.id} className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 dark:border-slate-800">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white">{rev.author}</span>
                    <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300">{rev.cohort}</span>
                    {rev.lecturer && (
                      <span className="text-xs text-slate-500">· {t("rev.lecturer")}: <strong>{rev.lecturer}</strong></span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <StarRating rating={rev.rating} />
                    <span className="text-xs text-slate-400">{rev.created_at ? new Date(rev.created_at).toLocaleDateString("vi-VN") : ""}</span>
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-300">{rev.comment}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs dark:border-slate-800">
                  <div className="flex items-center gap-4 text-slate-500">
                    <span>{t("rev.difficulty")}: <strong className="text-slate-700 dark:text-slate-200">{diffLabel(rev.difficulty)}</strong></span>
                    <span>{t("rev.workload")}: <strong className="text-slate-700 dark:text-slate-200">{workLabel(rev.workload)}</strong></span>
                  </div>
                  <button
                    onClick={() => handleUpvote(rev.id)}
                    aria-pressed={upInfo.active}
                    className={`flex items-center gap-1 rounded px-2 py-1 transition ${
                      upInfo.active
                        ? "bg-brand-100 font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                        : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    <span>{t("rev.helpful")}</span>
                    <span className="font-mono text-xs">({upInfo.count})</span>
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
