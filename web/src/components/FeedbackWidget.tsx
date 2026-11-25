"use client";
import { Flag } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api, APP_VERSION } from "@/lib/api";
import { useT } from "@/i18n";
import { CourseReportForm, type CourseReportModule } from "./CourseReportForm";

export const FEEDBACK_CATEGORIES = [
  { value: "bug", labelKey: "fb.cat.bug" },
  { value: "feature", labelKey: "fb.cat.feature" },
  { value: "ux", labelKey: "fb.cat.ux" },
  { value: "data", labelKey: "fb.cat.data" },
  { value: "ai", labelKey: "fb.cat.ai" },
  { value: "other", labelKey: "fb.cat.other" },
];

type FeedbackRequest = "bug" | "feature" | CourseReportModule;

/** Dispatch global event to open the feedback dialog from any component. */
export const openFeedback = (request?: FeedbackRequest) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("uel:feedback", { detail: request }));
  }
};

export function ReportErrorsButton({
  course,
  iconOnly = false,
  iconOnlyOnPhone = false,
  className = "",
}: {
  course?: CourseReportModule;
  /** Luôn chỉ hiện icon cờ, ẩn chữ (tên đầy đủ chuyển sang aria-label/title). */
  iconOnly?: boolean;
  /** Chỉ icon trên điện thoại (dưới sm), đủ chữ từ sm trở lên. Một nút duy nhất — chỉ chữ ẩn/hiện theo CSS,
   * để không tạo hai nút trùng tên trong cây hỗ trợ tiếp cận (và trong truy vấn kiểm thử). */
  iconOnlyOnPhone?: boolean;
  className?: string;
}) {
  const { t } = useT();
  const label = t("fb.reportErrors");
  const compact = iconOnly || iconOnlyOnPhone;
  return (
    <button
      type="button"
      className={`btn-accent cursor-pointer justify-center ${
        iconOnly ? "size-10 shrink-0 p-0" : iconOnlyOnPhone ? "size-10 shrink-0 p-0 sm:h-auto sm:w-auto sm:px-4 sm:py-2" : ""
      } ${className}`.trim()}
      aria-haspopup="dialog"
      aria-label={label}
      title={compact ? label : undefined}
      onClick={() => openFeedback(course ?? "bug")}
    >
      <Flag aria-hidden="true" className="size-4 shrink-0" />
      {!iconOnly && <span className={iconOnlyOnPhone ? "hidden sm:inline" : ""}>{label}</span>}
    </button>
  );
}

export interface FeedbackFormProps {
  page?: string;
  initialCategory?: "bug" | "feature";
  onSuccess?: () => void;
  onCancel?: () => void;
  className?: string;
}

/** Biểu mẫu góp ý độc lập — dùng được cả trong hộp thoại lẫn trang /feedback. */
export function FeedbackForm({ page: propPage, initialCategory = "feature", onSuccess, onCancel, className = "" }: FeedbackFormProps) {
  const { t } = useT();
  const currentPath = usePathname();
  const page = propPage ?? currentPath ?? "/";
  // Không hỏi "Mức độ hài lòng" ở biểu mẫu này nữa (đã có widget đánh giá nhanh riêng) —
  // gửi rating trung tính cố định để khớp yêu cầu bắt buộc của backend.
  const NEUTRAL_RATING = 3;
  const [category, setCategory] = useState<string>(initialCategory);
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "queued" | "error">("idle");

  const reset = () => {
    setCategory(initialCategory);
    setMessage("");
    setContact("");
    setStatus("idle");
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setStatus("sending");
    try {
      const res = await api.feedback({
        page,
        rating: NEUTRAL_RATING,
        category,
        message: message.trim(),
        ...(contact.trim() ? { contact: contact.trim() } : {}),
        app_version: APP_VERSION,
      });
      setStatus(res.mock ? "queued" : "sent");
      onSuccess?.();
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent" || status === "queued") {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="rounded-lg bg-emerald-50 p-4 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          <p className="text-sm font-medium">{status === "sent" ? t("fb.thanks") : t("fb.thanksQueued")}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-outline" onClick={reset}>
            {t("fb.another")}
          </button>
          {onCancel && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                reset();
                onCancel();
              }}
            >
              {t("fb.close")}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={`space-y-3 ${className}`}>
      <div>
        <label className="label" htmlFor="fb-cat">
          {t("fb.category")}
        </label>
        <select id="fb-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
          {FEEDBACK_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {t(c.labelKey)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="fb-msg">
          {t("fb.message")}
        </label>
        <textarea
          id="fb-msg"
          className="input min-h-24"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("fb.messagePh")}
          required
        />
      </div>

      <div>
        <label className="label" htmlFor="fb-contact">
          {t("fb.contact")}
        </label>
        <input
          id="fb-contact"
          className="input"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder={t("fb.contactPh")}
        />
      </div>

      <p className="text-xs text-slate-500">{t("fb.meta", { page, v: APP_VERSION })}</p>

      {status === "error" && (
        <p className="text-sm font-medium text-red-600 dark:text-red-400">{t("fb.error")}</p>
      )}

      <button
        type="submit"
        className="btn-primary w-full"
        disabled={!message.trim() || status === "sending"}
      >
        {status === "sending" ? t("fb.sending") : t("fb.submit")}
      </button>
    </form>
  );
}

export interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
  page?: string;
  initialCategory?: "bug" | "feature";
  course?: CourseReportModule;
}

/** Hộp thoại Góp ý bật lên khi bấm từ menu (SideNav / BottomNav). */
export function FeedbackModal({ open, onClose, page, initialCategory, course }: FeedbackModalProps) {
  const { t } = useT();

  // Đóng hộp thoại khi nhấn phím Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const title = course
    ? t("fb.course.title", { code: course.code })
    : t(initialCategory === "bug" ? "fb.reportErrors" : "fb.title");

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fb-title"
        className="card max-h-full w-full max-w-md overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="fb-title" className="text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            onClick={onClose}
            aria-label={t("fb.close")}
          >
            ✕
          </button>
        </div>
        {course ? (
          <CourseReportForm key={course.code} course={course} onReportSiteBug={() => openFeedback("bug")} />
        ) : (
          <FeedbackForm key={initialCategory} page={page} initialCategory={initialCategory} onCancel={onClose} />
        )}
      </div>
    </div>
  );
}

export interface FeedbackWidgetProps {
  open?: boolean;
  onClose?: () => void;
  page?: string;
}

/**
 * FeedbackWidget gắn ở root layout:
 * - ĐÃ BỎ nút nổi (FAB) góc dưới phải theo Brief W10 (chỉ còn nút chat pop-up Quy chế & AI ở góc này).
 * - Lắng nghe sự kiện `uel:feedback` được kích hoạt từ mục "Góp ý" trong menu SideNav / BottomNav.
 */
export function FeedbackWidget(props: FeedbackWidgetProps = {}) {
  const path = usePathname();
  const [request, setRequest] = useState<FeedbackRequest | null>(null);

  const isControlled = props.open !== undefined;
  const open = isControlled ? props.open! : request !== null;
  const handleClose = () => {
    if (props.onClose) props.onClose();
    if (!isControlled) setRequest(null);
  };

  useEffect(() => {
    if (isControlled) return;
    const h = (event: Event) => setRequest((event as CustomEvent<FeedbackRequest | null>).detail ?? "feature");
    window.addEventListener("uel:feedback", h);
    return () => window.removeEventListener("uel:feedback", h);
  }, [isControlled]);

  return (
    <FeedbackModal
      open={open}
      onClose={handleClose}
      page={props.page ?? path}
      initialCategory={typeof request === "string" ? request : undefined}
      course={typeof request === "object" ? request ?? undefined : undefined}
    />
  );
}
