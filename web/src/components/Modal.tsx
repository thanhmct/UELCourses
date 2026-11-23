"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { useT } from "@/i18n";

/**
 * Hộp thoại nổi dùng chung cho toàn ứng dụng (thay cho hộp thoại mặc định của trình duyệt).
 * Rộng khoảng 600px (lớn hơn hộp của trình duyệt 50%), đóng bằng Esc hoặc nút đóng.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  actions,
  dismissible = true,
  compact = false,
  backdropClassName = "bg-slate-900/50 backdrop-blur-[1px]",
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  dismissible?: boolean;
  compact?: boolean;
  backdropClassName?: string;
}) {
  const { t } = useT();
  const titleId = useId();
  const bodyId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !compact) return;
    const opener = document.activeElement;
    panel.current?.querySelector("button")?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [open, compact]);

  useEffect(() => {
    if (!open || !dismissible) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismissible, onClose]);

  if (!open) return null;
  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 ${backdropClassName}`} onMouseDown={(e) => dismissible && e.target === e.currentTarget && onClose()}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={compact ? bodyId : undefined}
        onKeyDown={compact ? (event) => {
          if (event.key !== "Tab") return;
          const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
          const first = buttons[0];
          const last = buttons[buttons.length - 1];
          if (event.shiftKey && event.target === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && event.target === last) {
            event.preventDefault();
            first?.focus();
          }
        } : undefined}
        className={compact
          ? "w-fit min-w-0 max-w-sm rounded-xl border border-brand-200 bg-white p-4 shadow-xl dark:border-brand-800 dark:bg-slate-900"
          : "w-full max-w-[600px] rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900"}
      >
        <div className={compact ? "mb-2" : "mb-4 flex items-start justify-between gap-4"}>
          <h2 id={titleId} className={compact ? "font-bold text-brand-ink" : "text-xl font-bold text-slate-900 dark:text-white"}>{title}</h2>
          {dismissible && !compact && (
            <button type="button" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={t("common.close")}>
              ✕
            </button>
          )}
        </div>
        <div id={bodyId} className="space-y-3 break-words text-sm text-slate-700 dark:text-slate-300">{children}</div>
        {actions && <div className={`${compact ? "mt-4" : "mt-6"} flex flex-wrap justify-end gap-2`}>{actions}</div>}
      </div>
    </div>
  );
}
