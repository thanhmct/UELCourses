"use client";

import { Loading } from "@/components/ui";
import { useEffect, useState } from "react";
import { localeOf, useT } from "@/i18n";
import { api } from "@/lib/api";
import { getAnonId } from "@/lib/analytics";
import type { ModuleComment } from "@/lib/types";

function StarRating({ rating }: { rating: number }) {
  const { t } = useT();
  return (
    <div className="flex items-center gap-0.5" aria-label={t("rev.stars", { n: rating })}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          className={`text-base ${star <= rating ? "text-amber-400" : "text-slate-300 dark:text-slate-600"}`}
          aria-hidden
        >
          ★
        </span>
      ))}
    </div>
  );
}

function StarPicker({
  rating,
  onChange,
}: {
  rating: number | null;
  onChange: (r: number | null) => void;
}) {
  const { t } = useT();
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-slate-500 dark:text-slate-400 mr-1.5">{t("comments.ratingLabel")}</span>
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(rating === star ? null : star)}
            className={`text-lg transition-transform hover:scale-110 focus:outline-none ${
              rating && star <= rating ? "text-amber-400" : "text-slate-300 dark:text-slate-600"
            }`}
            aria-label={t("comments.starAria", { n: star })}
          >
            ★
          </button>
        ))}
      </div>
      {rating !== null && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="ml-2 text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline"
        >
          {t("comments.ratingClear")}
        </button>
      )}
    </div>
  );
}

export function ModuleReviews({ moduleCode }: { moduleCode: string; moduleName?: string }) {
  const { t, lang } = useT();
  // Khối thu gọn mặc định theo Brief A3 item 7, không làm nhảy layout
  const [isExpanded, setIsExpanded] = useState(false);
  const [comments, setComments] = useState<ModuleComment[]>([]);
  const [averageRating, setAverageRating] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // Form states
  const [bodyText, setBodyText] = useState("");
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchComments = async () => {
    if (!moduleCode) return;
    setLoading(true);
    try {
      const res = await api.moduleComments(moduleCode, 1, 50);
      const data = res?.data || res;
      if (data && Array.isArray(data.items)) {
        setComments(data.items);
        setAverageRating(data.average_rating ?? null);
      }
    } catch {
      // Ignored: keep existing or empty
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();
  }, [moduleCode]);

  // Biết người dùng đã đăng nhập và đã đặt biệt danh chưa để báo trước tên sẽ hiện cạnh bình luận.
  // undefined = chưa tải/chưa đăng nhập (không hiện gợi ý); null = đã đăng nhập nhưng chưa đặt biệt danh.
  const [postingNickname, setPostingNickname] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!isExpanded) return;
    let active = true;
    Promise.resolve()
      .then(() => api.authMe())
      .then((me) => {
        if (active) setPostingNickname(me?.user ? (me.user.nickname ?? null) : undefined);
      })
      .catch(() => {
        if (active) setPostingNickname(undefined);
      });
    return () => {
      active = false;
    };
  }, [isExpanded]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSuccess(false);
    setFormError(null);

    const trimmed = bodyText.trim();
    if (trimmed.length < 5) {
      setFormError(t("comments.tooShort"));
      return;
    }
    if (trimmed.length > 1000) {
      setFormError(t("comments.tooLong"));
      return;
    }

    setSubmitting(true);
    try {
      const anonId = getAnonId();
      await api.postModuleComment(moduleCode, {
        body: trimmed,
        rating: selectedRating ?? undefined,
        anon_id: anonId,
      });

      setFormSuccess(true);
      setBodyText("");
      setSelectedRating(null);
    } catch (err: any) {
      const msg = err?.data?.detail || err?.message || t("comments.errorDefault");
      setFormError(typeof msg === "string" ? msg : t("comments.errorDefault"));
    } finally {
      setSubmitting(false);
    }
  };

  const totalCount = comments.length;

  return (
    <div className="transition-all duration-200">
      {/* Header bar: luôn hiển thị gọn gàng, bấm để mở rộng hoặc thu gọn */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            {t("comments.title")}
          </h2>
          {averageRating !== null && averageRating > 0 && (
            <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              <span className="text-amber-500">★</span>
              <span>{averageRating.toFixed(1)}</span>
              <span className="text-[11px] font-normal text-slate-400">({totalCount})</span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-ink dark:text-brand-400 dark:hover:text-brand-300 py-1 px-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          <span>{isExpanded ? t("comments.collapse") : t("comments.expand", { count: totalCount })}</span>
          <span className={`transform transition-transform text-[10px] ${isExpanded ? "rotate-180" : ""}`}>
            ▼
          </span>
        </button>
      </div>

      {/* Nội dung chi tiết chỉ render khi mở rộng (thu gọn mặc định) */}
      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-5 animate-in fade-in duration-150">
          {/* Form gửi bình luận */}
          <form
            onSubmit={handleSubmit}
            className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/50"
          >
            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">
              {t("comments.formTitle")}
            </h3>

            <div className="mb-2.5">
              <StarPicker rating={selectedRating} onChange={setSelectedRating} />
            </div>

            {postingNickname !== undefined && (
              <p className="mb-2 text-[11px] text-slate-500 dark:text-slate-400" data-testid="comment-posting-as">
                {postingNickname ? t("comments.postingAs", { name: postingNickname }) : t("comments.postingAnonymous")}{" "}
                <a href="/settings" className="underline hover:text-slate-700 dark:hover:text-slate-200">
                  {t("comments.setNickname")}
                </a>
              </p>
            )}

            <div className="relative">
              <textarea
                value={bodyText}
                onChange={(e) => {
                  setBodyText(e.target.value);
                  if (formError) setFormError(null);
                }}
                rows={3}
                aria-label={t("comments.bodyLabel")}
                placeholder={t("comments.bodyPlaceholder")}
                className="w-full rounded-md border border-slate-300 bg-white p-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-focus focus:outline-none focus:ring-1 focus:ring-brand-focus dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder-slate-500"
              />
              <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                <span>{t("comments.lengthHint")}</span>
                <span>{bodyText.length}/1000</span>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
              <button
                type="submit"
                disabled={submitting || bodyText.trim().length < 5}
                className="btn-primary py-1.5 px-4 text-xs font-medium disabled:opacity-50"
              >
                {submitting ? t("comments.submitting") : t("comments.submit")}
              </button>

              {/* Thông báo inline trong form (không toast lớn) */}
              {formSuccess && (
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  {t("comments.successNotice")}
                </p>
              )}
              {formError && (
                <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                  {formError}
                </p>
              )}
            </div>
          </form>

          {/* Danh sách bình luận đã duyệt */}
          <div className="space-y-3">
            {loading ? (
              <Loading compact className="w-full justify-center py-3" />
            ) : comments.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-slate-800">
                {t("comments.empty")}
              </div>
            ) : (
              comments.map((c) => (
                <article
                  key={c.id}
                  className="rounded-lg border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 dark:border-slate-800">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {c.author_name || t("comments.anonymousAuthor")}
                    </span>
                    <div className="flex items-center gap-2">
                      {c.rating && <StarRating rating={c.rating} />}
                      <span className="text-[11px] text-slate-400">
                        {c.created_at ? new Date(c.created_at).toLocaleDateString(localeOf(lang)) : ""}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                    {c.body}
                  </p>
                </article>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
