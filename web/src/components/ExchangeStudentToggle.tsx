"use client";
import { Check, GraduationCap } from "lucide-react";
import { useT } from "@/i18n";
import { canOfferExchangeTick } from "@/lib/exchangeStats";
import { useSettings } from "@/lib/store";

/**
 * "Tôi là sinh viên trao đổi" — chỉ hiện trong giao diện tiếng Anh, KHÔNG cần chọn CTĐT.
 * Dùng chung cờ `exchangeStudent` trong store với phần Cài đặt (đồng bộ hai chiều).
 * - variant "checkbox" (mặc định): ô tick, dùng ở trang Cài đặt.
 * - variant "button": nút nổi bật có `aria-pressed`, dùng ở đầu hộp thoại chọn CTĐT.
 */
export function ExchangeStudentToggle({
  id = "exchange-student-toggle",
  variant = "checkbox",
}: {
  id?: string;
  variant?: "checkbox" | "button";
}) {
  const { t, lang } = useT();
  const exchangeStudent = useSettings((s) => s.exchangeStudent);
  const setExchangeStudent = useSettings((s) => s.setExchangeStudent);
  if (!canOfferExchangeTick(lang)) return null;

  if (variant === "button") {
    return (
      <button
        id={id}
        type="button"
        aria-pressed={exchangeStudent}
        onClick={() => setExchangeStudent(!exchangeStudent)}
        className={
          "flex w-full cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm font-semibold transition-colors " +
          (exchangeStudent
            ? "border-brand-600 bg-brand-600 text-white"
            : "border-brand-200 bg-brand-50 text-brand-800 hover:border-brand-400 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-100")
        }
      >
        <GraduationCap className="size-5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">{t("exchange.tick.label")}</span>
        {exchangeStudent && <Check className="size-5 shrink-0" aria-hidden />}
      </button>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        type="checkbox"
        className="mt-1 size-4 cursor-pointer accent-brand-600"
        checked={exchangeStudent}
        onChange={(e) => setExchangeStudent(e.target.checked)}
      />
      <label htmlFor={id} className="cursor-pointer text-sm font-medium text-slate-900 dark:text-white">
        {t("exchange.tick.label")}
      </label>
    </div>
  );
}
