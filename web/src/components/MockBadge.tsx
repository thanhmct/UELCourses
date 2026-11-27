"use client";
import { LoadingDots } from "@/components/ui";
import { OfflineSafeSticker } from "@/components/OfflineSafeSticker";
import { useDataSource } from "@/lib/dataSource";
import { useUiStatus } from "@/lib/uiStatus";
import { useT } from "@/i18n";

export function MockBadge({ className = "" }: { className?: string }) {
  const mock = useDataSource((s) => s.mock);
  const { t } = useT();
  if (!mock) return null;
  return (
    <span
      title={t("common.sampleTitle")}
      className={`chip bg-amber-100 text-amber-800 ring-1 ring-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:ring-amber-700 ${className}`}
    >
      {t("common.sample")}
    </span>
  );
}

export function ConnectionNotice() {
  const offline = useDataSource((s) => s.offline && !s.mock);
  const hasPageError = useUiStatus((s) => Object.keys(s.errors).length > 0);
  const { t } = useT();
  return offline && !hasPageError ? (
    <p role="status" className="mb-3 flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-medium text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
      <OfflineSafeSticker
        src="/stickers/05_vuot_troi_may_tinh_bang.svg"
        alt=""
        aria-hidden="true"
        width={52}
        height={42}
        className="h-10 w-12 shrink-0 object-contain"
      />
      <span>{t("api.connectionWaiting")}<LoadingDots /></span>
    </p>
  ) : null;
}
