"use client";
import { useEffect, useRef, useState } from "react";
import { ThumbsUp } from "lucide-react";
import { useT } from "@/i18n";
import type { ExchangeStatItem } from "@/lib/exchangeStats";

/**
 * Biểu tượng "recommend" nhỏ: số SV trao đổi đã học học phần ở các học kỳ trước.
 * Máy tính: di chuột vào hiện hộp chi tiết. Điện thoại: chạm vào mở hộp bên cạnh nút, chạm lại hoặc chạm ngoài để đóng.
 * Không có dữ liệu hoặc bằng 0 thì không hiện.
 */
export function ExchangeStatBadge({ stat }: { stat?: ExchangeStatItem }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (!stat || stat.total <= 0) return null;
  const label = stat.total === 1 ? t("exchange.stat.one") : t("exchange.stat.many", { n: stat.total });

  return (
    <div ref={ref} data-testid="exchange-stat" className="group relative inline-flex shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center justify-center rounded-full bg-sky-50 p-1 text-sky-700 hover:bg-sky-100 dark:bg-sky-950/60 dark:text-sky-300 dark:hover:bg-sky-900/60"
      >
        <ThumbsUp aria-hidden="true" className="size-3.5" />
      </button>
      <div
        role="tooltip"
        className={`absolute left-0 top-full z-50 mt-1.5 w-max max-w-[min(11rem,calc(100vw-3rem))] rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-xs font-medium text-sky-800 shadow-lg sm:max-w-[16rem] dark:border-sky-900 dark:bg-slate-900 dark:text-sky-300 ${
          open ? "block" : "hidden group-hover:block group-focus-within:block"
        }`}
      >
        {label}
      </div>
    </div>
  );
}
