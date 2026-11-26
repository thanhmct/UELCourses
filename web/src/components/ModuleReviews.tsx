"use client";

import { Heart, Flag } from "lucide-react";
import { Loading } from "@/components/ui";
import { useEffect, useState } from "react";
import { localeOf, useT } from "@/i18n";
import { api } from "@/lib/api";
import { getAnonId } from "@/lib/analytics";
import type { ModuleComment } from "@/lib/types";

const INITIAL_VISIBLE_COMMENTS = 3;
const COMMENT_PREVIEW_CHARS = 220;
const LIKED_COMMENTS_STORAGE_KEY = "uel:likedComments";

function loadLikedIds(): Set<number> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = JSON.parse(localStorage.getItem(LIKED_COMMENTS_STORAGE_KEY) || "[]");
    return new Set(Array.isArray(raw) ? raw.filter((x) => typeof x === "number") : []);
  } catch {
    return new Set();
  }
}

function saveLikedIds(ids: Set<number>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LIKED_COMMENTS_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore: không chặn UI nếu localStorage đầy/bị tắt
  }
}

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

function CommentReportForm({
  moduleCode,
  comment,
  onDone,
}: {
  moduleCode: string;
  comment: ModuleComment;
  onDone: () => void;
}) {
  const { t } = useT();
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      setError(t("comments.reportTooShort"));
      return;
    }
    setStatus("sending");
    setError(null);
    try {
      await api.reportModuleComment(moduleCode, comment.id, trimmed);
      setStatus("sent");
    } catch {
      setStatus("error");
      setError(t("comments.reportError"));
    }
  };

  if (status === "sent") {
    return (
      <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 p-2.5 text-[11px] font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
        {t("comments.reportSuccess")}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-2 rounded-md border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-900/60 space-y-2">
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{t("comments.reportDesc")}</p>
      <textarea
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
          if (error) setError(null);
        }}
        rows={2}
        aria-label={t("comments.reportTitle")}
        placeholder={t("comments.reportPlaceholder")}
        className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-900 placeholder-slate-400 focus:border-brand-focus focus:outline-none focus:ring-1 focus:ring-brand-focus dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder-slate-500"
      />
      {error && <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={status === "sending"}
          className="btn-primary py-1 px-3 text-[11px] font-medium disabled:opacity-50"
        >
          {status === "sending" ? t("comments.reportSubmitting") : t("comments.reportSubmit")}
        </button>
        <button type="button" onClick={onDone} className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 underline">
          {t("comments.reportCancel")}
        </button>
      </div>
    </form>
  );
}

export interface ModuleReviewsProps {
  moduleCode: string;
  moduleName?: string;
  /** Học kỳ đã học (vd "2026-2027-1"): gắn kèm khi gửi bình luận để chống góp ý trùng theo học kỳ
   * (dùng khi nhúng lại component này ở trang Góp ý học phần). Bỏ trống ở trang chi tiết học phần. */
  semester?: string;
  /** Gọi lại sau khi gửi bình luận (thành công, chờ duyệt, hoặc đã gửi trước đó cho học kỳ này). */
  onSubmitted?: (status: "approved" | "pending" | "sent") => void;
}

export function ModuleReviews({ moduleCode, semester, onSubmitted }: ModuleReviewsProps) {
  const { t, lang } = useT();
  const [comments, setComments] = useState<ModuleComment[]>([]);
  const [averageRating, setAverageRating] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // Mặc định hiển thị đầy đủ: chỉ danh sách bình luận mới giới hạn số lượng + độ dài hiển thị ban đầu.
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COMMENTS);
  const [expandedBodies, setExpandedBodies] = useState<Set<number>>(new Set());
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set());
  const [likeBusyId, setLikeBusyId] = useState<number | null>(null);
  const [reportOpenId, setReportOpenId] = useState<number | null>(null);

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
    setVisibleCount(INITIAL_VISIBLE_COMMENTS);
    setExpandedBodies(new Set());
    setLikedIds(loadLikedIds());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleCode]);

  // Biết người dùng đã đăng nhập và đã đặt biệt danh chưa để báo trước tên sẽ hiện cạnh bình luận.
  // undefined = chưa tải/chưa đăng nhập (không hiện gợi ý); null = đã đăng nhập nhưng chưa đặt biệt danh.
  const [postingNickname, setPostingNickname] = useState<string | null | undefined>(undefined);
  useEffect(() => {
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
  }, []);

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
      const res = await api.postModuleComment(moduleCode, {
        body: trimmed,
        rating: selectedRating ?? undefined,
        anon_id: anonId,
        ...(semester ? { semester } : {}),
      });

      setFormSuccess(true);
      setBodyText("");
      setSelectedRating(null);
      onSubmitted?.(res.status === "approved" ? "approved" : "pending");
      if (res.status === "approved") fetchComments();
    } catch (err: any) {
      const status = err?.status;
      if (status === 409) {
        setFormError(t("comments.alreadySentSemester"));
        onSubmitted?.("sent");
      } else if (status === 422) {
        setFormError(t("comments.blockedContent"));
      } else if (status === 429) {
        setFormError(t("comments.rateLimited"));
      } else {
        const msg = err?.data?.detail || err?.message || t("comments.errorDefault");
        setFormError(typeof msg === "string" ? msg : t("comments.errorDefault"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const toggleLike = async (id: number) => {
    if (likeBusyId !== null) return;
    setLikeBusyId(id);
    try {
      const res = await api.likeModuleComment(moduleCode, id, getAnonId());
      setComments((prev) => prev.map((c) => (c.id === id ? { ...c, like_count: res.like_count } : c)));
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (res.liked) next.add(id);
        else next.delete(id);
        saveLikedIds(next);
        return next;
      });
    } catch {
      // Bỏ qua lỗi lưới tạm thời, không chặn giao diện
    } finally {
      setLikeBusyId(null);
    }
  };

  const toggleBodyExpanded = (id: number) => {
    setExpandedBodies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalCount = comments.length;
  const visibleComments = comments.slice(0, visibleCount);
  const remainingCount = totalCount - visibleComments.length;

  return (
    <div>
      {/* Tiêu đề: luôn hiển thị đầy đủ, không có nút thu gọn/mở rộng */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">{t("comments.title")}</h2>
        {averageRating !== null && averageRating > 0 && (
          <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            <span className="text-amber-500">★</span>
            <span>{averageRating.toFixed(1)}</span>
            <span className="text-[11px] font-normal text-slate-400">({totalCount})</span>
          </div>
        )}
      </div>

      <div className="mt-4 space-y-5">
        {/* Form gửi bình luận */}
        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5 sm:p-4 dark:border-slate-800 dark:bg-slate-900/50"
        >
          <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">{t("comments.formTitle")}</h3>

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
              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{t("comments.successNotice")}</p>
            )}
            {formError && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{formError}</p>}
          </div>
        </form>

        {/* Danh sách bình luận đã duyệt: mặc định tối đa 3, mỗi bình luận giới hạn ký tự hiển thị */}
        <div className="space-y-3">
          {loading ? (
            <Loading compact className="w-full justify-center py-3" />
          ) : comments.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-slate-800">
              {t("comments.empty")}
            </div>
          ) : (
            <>
              {visibleComments.map((c) => {
                const isBodyExpanded = expandedBodies.has(c.id);
                const isLong = c.body.length > COMMENT_PREVIEW_CHARS;
                const shownBody = isLong && !isBodyExpanded ? `${c.body.slice(0, COMMENT_PREVIEW_CHARS)}…` : c.body;
                const liked = likedIds.has(c.id);
                return (
                  <article
                    key={c.id}
                    className="rounded-lg border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-slate-100 pb-2 dark:border-slate-800">
                      <span className="min-w-0 max-w-full truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {c.author_name || t("comments.anonymousAuthor")}
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        {c.rating && <StarRating rating={c.rating} />}
                        <span className="text-[11px] text-slate-400">
                          {c.created_at ? new Date(c.created_at).toLocaleDateString(localeOf(lang)) : ""}
                        </span>
                      </div>
                    </div>

                    <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                      {shownBody}
                    </p>
                    {isLong && (
                      <button
                        type="button"
                        onClick={() => toggleBodyExpanded(c.id)}
                        className="mt-1 text-[11px] font-medium text-brand-600 hover:text-brand-ink dark:text-brand-400 dark:hover:text-brand-300"
                      >
                        {isBodyExpanded ? t("comments.showLessText") : t("comments.showMoreText")}
                      </button>
                    )}

                    <div className="mt-2.5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-2 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => toggleLike(c.id)}
                        disabled={likeBusyId === c.id}
                        aria-pressed={liked}
                        className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-60 ${
                          liked
                            ? "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300"
                            : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                        }`}
                      >
                        <Heart className="size-3.5" aria-hidden fill={liked ? "currentColor" : "none"} />
                        <span>{liked ? t("comments.liked") : t("comments.like")}</span>
                        {(c.like_count ?? 0) > 0 && <span>({c.like_count})</span>}
                      </button>

                      <button
                        type="button"
                        onClick={() => setReportOpenId(reportOpenId === c.id ? null : c.id)}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                      >
                        <Flag className="size-3.5" aria-hidden />
                        <span>{t("comments.report")}</span>
                      </button>
                    </div>

                    {reportOpenId === c.id && (
                      <CommentReportForm moduleCode={moduleCode} comment={c} onDone={() => setReportOpenId(null)} />
                    )}
                  </article>
                );
              })}

              {remainingCount > 0 && (
                <button
                  type="button"
                  onClick={() => setVisibleCount(totalCount)}
                  className="w-full rounded-md border border-slate-200 py-2 text-xs font-medium text-brand-600 hover:bg-slate-50 dark:border-slate-800 dark:text-brand-400 dark:hover:bg-slate-900"
                >
                  {t("comments.showMoreComments", { count: remainingCount })}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
