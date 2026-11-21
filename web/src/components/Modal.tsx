"use client";
import { useEffect, useId, type ReactNode } from "react";

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
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  dismissible?: boolean;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open || !dismissible) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismissible, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px]" onMouseDown={(e) => dismissible && e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-[600px] rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-xl font-bold text-slate-900 dark:text-white">{title}</h2>
          {dismissible && (
            <button type="button" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Đóng">
              ✕
            </button>
          )}
        </div>
        <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">{children}</div>
        {actions && <div className="mt-6 flex flex-wrap justify-end gap-2">{actions}</div>}
      </div>
    </div>
  );
}
