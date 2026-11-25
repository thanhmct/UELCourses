"use client";
import { useEffect, useId, useRef, useState } from "react";
import { api, APP_VERSION } from "@/lib/api";
import { useT } from "@/i18n";
import { FEEDBACK_CATEGORIES } from "./FeedbackWidget";
import { Fireworks } from "./Fireworks";

export interface SatisfactionRatingProps {
  page: string;
  onDone?: () => void;
  className?: string;
  /** Nhãn hiển thị cùng hàng với 5 sao (vd tiêu đề "Mức độ hài lòng"). */
  label?: React.ReactNode;
}

type RatingPhase = "stars" | "sad" | "sending" | "happy" | "sad_sent" | "error";

/**
 * 5-star quick-rating widget:
 * - 4-5 stars: submits immediately, shows thank-you + fireworks, then calls onDone (or resets if inline).
 * - 1-3 stars: expands category + message inputs with Cancel ("Nhấn nhầm á >.<") and Send ("GỬI!").
 */
export function SatisfactionRating({ page, onDone, className = "", label }: SatisfactionRatingProps) {
  const { t } = useT();
  const uid = useId();
  const categoryId = `${uid}-cat`;
  const messageId = `${uid}-msg`;

  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [category, setCategory] = useState<string>("other");
  const [message, setMessage] = useState("");
  const [phase, setPhase] = useState<RatingPhase>("stars");
  const doneTimerRef = useRef<number | null>(null);

  const clearPendingTimer = () => {
    if (doneTimerRef.current !== null) {
      window.clearTimeout(doneTimerRef.current);
      doneTimerRef.current = null;
    }
  };

  useEffect(() => clearPendingTimer, []);

  const resetAll = () => {
    clearPendingTimer();
    setRating(0);
    setHoverRating(0);
    setCategory("other");
    setMessage("");
    setPhase("stars");
  };

  // Sau khi đã gửi thành công: quay lại hàng sao nhưng GIỮ NGUYÊN số sao đã chọn
  // (khác với resetAll khi hủy) để người dùng thấy lưu lại đánh giá của mình trong thẻ này.
  const settleAfterSent = () => {
    clearPendingTimer();
    setHoverRating(0);
    setCategory("other");
    setMessage("");
    setPhase("stars");
  };

  const notifyRated = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("uel:satisfaction-rated"));
    }
  };

  const scheduleFinish = (delayMs: number) => {
    clearPendingTimer();
    doneTimerRef.current = window.setTimeout(() => {
      doneTimerRef.current = null;
      if (onDone) {
        onDone();
      } else {
        settleAfterSent();
      }
    }, delayMs);
  };

  async function handleStarClick(stars: number) {
    if (phase === "sending" || phase === "happy" || phase === "sad_sent") return;
    setRating(stars);
    if (stars >= 4) {
      setPhase("sending");
      try {
        await api.feedback({
          page,
          rating: stars,
          category: "other",
          message: "",
          quick_rating: true,
          app_version: APP_VERSION,
        });
        notifyRated();
        setPhase("happy");
        scheduleFinish(2500);
      } catch {
        setPhase("error");
      }
    } else {
      setPhase("sad");
    }
  }

  async function handleSadSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating || !message.trim() || phase === "sending") return;
    setPhase("sending");
    try {
      await api.feedback({
        page,
        rating,
        category,
        message: message.trim(),
        quick_rating: true,
        app_version: APP_VERSION,
      });
      notifyRated();
      setPhase("sad_sent");
      scheduleFinish(1800);
    } catch {
      setPhase("error");
    }
  }

  if (phase === "happy") {
    return (
      <div className={`space-y-2 ${className}`.trim()}>
        <Fireworks />
        <div
          role="status"
          className="rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
        >
          {t("fb.rating.happyThanks")}
        </div>
      </div>
    );
  }

  if (phase === "sad_sent") {
    return (
      <div className={`space-y-2 ${className}`.trim()}>
        <div
          role="status"
          className="rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
        >
          {t("fb.thanks")}
        </div>
      </div>
    );
  }

  const activeStars = hoverRating || rating;
  const showSadForm = phase === "sad" || (rating >= 1 && rating <= 3 && (phase === "sending" || phase === "error"));

  return (
    <div className={`space-y-3 ${className}`.trim()}>
      <div className="flex flex-wrap items-center gap-3">
        {label}
        <div
          className="flex flex-wrap gap-1"
          role="radiogroup"
          aria-label={t("fb.ratingAria")}
          onMouseLeave={() => setHoverRating(0)}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={t("rev.stars", { n })}
              disabled={phase === "sending"}
              onMouseEnter={() => setHoverRating(n)}
              onClick={() => handleStarClick(n)}
              className={`h-9 w-9 cursor-pointer rounded-lg text-2xl leading-none transition-colors focus-visible:outline-2 focus-visible:outline-brand-focus disabled:cursor-not-allowed disabled:opacity-60 ${
                n <= activeStars ? "text-amber-500" : "text-slate-300 hover:text-amber-400 dark:text-slate-600"
              }`}
            >
              ★
            </button>
          ))}
        </div>
      </div>

      {phase === "error" && !showSadForm && (
        <p className="text-sm font-medium text-red-600 dark:text-red-400">{t("fb.error")}</p>
      )}

      {showSadForm && (
        <form onSubmit={handleSadSubmit} className="space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("fb.rating.sadPrompt")}</p>

          <div>
            <label className="label" htmlFor={categoryId}>
              {t("fb.category")}
            </label>
            <select
              id={categoryId}
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {FEEDBACK_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {t(c.labelKey)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor={messageId}>
              {t("fb.message")}
            </label>
            <textarea
              id={messageId}
              className="input min-h-20"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("fb.messagePh")}
              required
            />
          </div>

          {phase === "error" && (
            <p className="text-sm font-medium text-red-600 dark:text-red-400">{t("fb.error")}</p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="btn-outline"
              disabled={phase === "sending"}
              onClick={resetAll}
            >
              {t("fb.rating.cancel")}
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={!message.trim() || phase === "sending"}
            >
              {phase === "sending" ? t("fb.sending") : t("fb.rating.send")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
