"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n";
import { api, API_URL, AuthApiError } from "@/lib/api";
import { Loading } from "@/components/ui";
import type { AuthMeResponse, AuthProvidersResponse, LecturerReviewList } from "@/lib/types";

function StarPicker({ rating, onChange }: { rating: number; onChange: (r: number) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className={`text-lg transition-transform hover:scale-110 focus:outline-none ${
            star <= rating ? "text-amber-400" : "text-slate-300 dark:text-slate-600"
          }`}
          aria-label={`${star} sao`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function StarDisplay({ rating }: { rating: number }) {
  return (
    <span aria-hidden className="text-amber-400">
      {"★".repeat(rating)}
      <span className="text-slate-300 dark:text-slate-600">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

export function LecturerReviewPanel({ moduleCode }: { moduleCode: string }) {
  const { t } = useT();
  const [isExpanded, setIsExpanded] = useState(false);

  const [providers, setProviders] = useState<AuthProvidersResponse | null>(null);
  const [me, setMe] = useState<AuthMeResponse | null>(null);
  const [guidelines, setGuidelines] = useState<string[]>([]);
  const [reviewData, setReviewData] = useState<LecturerReviewList | null>(null);
  const [loading, setLoading] = useState(false);

  const [rating, setRating] = useState(0);
  const [difficulty, setDifficulty] = useState(0);
  const [workload, setWorkload] = useState(0);
  const [professor, setProfessor] = useState("");
  const [semester, setSemester] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);

  const loadAll = async () => {
    if (!moduleCode) return;
    setLoading(true);
    try {
      const [p, m, g, r] = await Promise.all([
        api.authProviders().catch(() => null),
        api.authMe().catch(() => null),
        api.reviewGuidelines().catch(() => null),
        api.moduleReviews(moduleCode).catch(() => null),
      ]);
      if (p) setProviders(p);
      if (m) setMe(m);
      if (g) setGuidelines(g.items || []);
      if (r) setReviewData(r);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isExpanded) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded, moduleCode]);

  const handleLogout = async () => {
    await api.authLogout().catch(() => null);
    setMe({ user: null });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    if (rating < 1) {
      setFormError(t("lecturerReview.ratingRequired"));
      return;
    }
    if (content.trim().length < 20) {
      setFormError(t("lecturerReview.contentTooShort"));
      return;
    }
    if (content.trim().length > 2000) {
      setFormError(t("lecturerReview.contentTooLong"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.postModuleReview(moduleCode, {
        rating,
        difficulty: difficulty || null,
        workload: workload || null,
        semester: semester.trim() || null,
        professor: professor.trim() || null,
        display_name: displayName.trim() || null,
        content: content.trim(),
      });
      setFormSuccess(res.message);
      setRating(0);
      setDifficulty(0);
      setWorkload(0);
      setProfessor("");
      setSemester("");
      setDisplayName("");
      setContent("");
      if (res.status === "approved") {
        const r = await api.moduleReviews(moduleCode).catch(() => null);
        if (r) setReviewData(r);
      }
    } catch (err) {
      if (err instanceof AuthApiError && err.status === 409) {
        setAlreadyReviewed(true);
      } else if (err instanceof AuthApiError) {
        setFormError(err.message);
      } else {
        setFormError(t("lecturerReview.errorDefault"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const user = me?.user ?? null;
  const banned = user?.banned ?? null;
  const summary = reviewData?.summary;

  return (
    <div className="mt-4 transition-all duration-200">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-ink dark:text-brand-400 dark:hover:text-brand-300 py-1 px-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition"
      >
        <span>{isExpanded ? t("lecturerReview.collapse") : t("lecturerReview.expand")}</span>
        <span className={`transform transition-transform text-[10px] ${isExpanded ? "rotate-180" : ""}`}>▼</span>
      </button>

      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-4 animate-in fade-in duration-150">
          <div>
            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
              {t("lecturerReview.guidelinesTitle")}
            </h3>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-600 dark:text-slate-400">
              {guidelines.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          </div>

          {loading ? (
            <Loading compact className="w-full justify-center py-3" />
          ) : (
            <>
              {!user && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                  <p className="text-xs text-slate-600 dark:text-slate-400 mb-2.5">{t("lecturerReview.loginPrompt")}</p>
                  <div className="flex flex-wrap gap-2">
                    {providers?.google?.ready && (
                      <a href={`${API_URL}/api/auth/google/login`} className="btn-primary py-1.5 px-4 text-xs font-medium">
                        {t("lecturerReview.loginGoogle")}
                      </a>
                    )}
                    {providers?.facebook?.ready && (
                      <a href={`${API_URL}/api/auth/facebook/login`} className="btn-primary py-1.5 px-4 text-xs font-medium">
                        {t("lecturerReview.loginFacebook")}
                      </a>
                    )}
                    {!providers?.google?.ready && !providers?.facebook?.ready && (
                      <p className="text-[11px] text-slate-400">{t("lecturerReview.noProviders")}</p>
                    )}
                  </div>
                </div>
              )}

              {user && banned && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                  {banned.level === "permanent"
                    ? t("lecturerReview.bannedPermanent", { reason: banned.reason || "" })
                    : t("lecturerReview.bannedTemporary", {
                        until: banned.expires_at ? new Date(banned.expires_at).toLocaleString("vi-VN") : "",
                        reason: banned.reason || "",
                      })}
                  <div className="mt-2">
                    <button type="button" onClick={handleLogout} className="text-[11px] underline text-rose-700 dark:text-rose-300">
                      {t("lecturerReview.logout")}
                    </button>
                  </div>
                </div>
              )}

              {user && !banned && alreadyReviewed && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                  {t("lecturerReview.alreadyReviewed")}
                </div>
              )}

              {user && !banned && !alreadyReviewed && (
                <form
                  onSubmit={handleSubmit}
                  className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/50 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">{t("lecturerReview.formTitle")}</h3>
                    <button type="button" onClick={handleLogout} className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline">
                      {t("lecturerReview.logout")}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500 dark:text-slate-400">{t("lecturerReview.ratingLabel")}</span>
                      <StarPicker rating={rating} onChange={setRating} />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500 dark:text-slate-400">{t("lecturerReview.difficultyLabel")}</span>
                      <StarPicker rating={difficulty} onChange={setDifficulty} />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500 dark:text-slate-400">{t("lecturerReview.workloadLabel")}</span>
                      <StarPicker rating={workload} onChange={setWorkload} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      value={professor}
                      onChange={(e) => setProfessor(e.target.value)}
                      placeholder={t("lecturerReview.professorPlaceholder")}
                      aria-label={t("lecturerReview.professorLabel")}
                      className="rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-900 placeholder-slate-400 focus:border-brand-focus focus:outline-none focus:ring-1 focus:ring-brand-focus dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder-slate-500"
                    />
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={
                        user?.nickname
                          ? t("lecturerReview.nicknameUsing", { name: user.nickname })
                          : t("lecturerReview.nicknamePlaceholder")
                      }
                      aria-label={t("lecturerReview.nicknameLabel")}
                      className="rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-900 placeholder-slate-400 focus:border-brand-focus focus:outline-none focus:ring-1 focus:ring-brand-focus dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder-slate-500"
                    />
                  </div>

                  <div className="relative">
                    <textarea
                      value={content}
                      onChange={(e) => {
                        setContent(e.target.value);
                        if (formError) setFormError(null);
                      }}
                      rows={3}
                      aria-label={t("lecturerReview.contentLabel")}
                      placeholder={t("lecturerReview.contentPlaceholder")}
                      className="w-full rounded-md border border-slate-300 bg-white p-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-focus focus:outline-none focus:ring-1 focus:ring-brand-focus dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder-slate-500"
                    />
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                      <span>{t("lecturerReview.lengthHint")}</span>
                      <span>{content.length}/2000</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="btn-primary py-1.5 px-4 text-xs font-medium disabled:opacity-50"
                    >
                      {submitting ? t("lecturerReview.submitting") : t("lecturerReview.submit")}
                    </button>
                    {formSuccess && <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{formSuccess}</p>}
                    {formError && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{formError}</p>}
                  </div>
                </form>
              )}

              <div className="space-y-3">
                {summary && summary.count > 0 && (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t("lecturerReview.summaryCount", { count: summary.count })}
                    {summary.avg_rating != null && ` · ${t("lecturerReview.summaryAvg", { avg: summary.avg_rating })}`}
                  </div>
                )}
                {!reviewData || reviewData.items.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-slate-800">
                    {t("lecturerReview.empty")}
                  </div>
                ) : (
                  reviewData.items.map((r) => (
                    <article
                      key={r.id}
                      className="rounded-lg border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 dark:border-slate-800">
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{r.display_name}</span>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                          <StarDisplay rating={r.rating} />
                          <span>{r.created_at ? new Date(r.created_at).toLocaleDateString("vi-VN") : ""}</span>
                        </div>
                      </div>
                      {(r.semester || r.professor) && (
                        <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          {[r.semester, r.professor].filter(Boolean).join(" · ")}
                        </div>
                      )}
                      <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                        {r.content}
                      </p>
                    </article>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
