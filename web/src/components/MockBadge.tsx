"use client";
import { useDataSource } from "@/lib/dataSource";
import { useT } from "@/i18n";

export function MockBadge({ className = "" }: { className?: string }) {
  const mock = useDataSource((s) => s.mock);
  const offline = useDataSource((s) => s.offline);
  const { t } = useT();
  if (offline && !mock) {
    return (
      <span
        role="status"
        title={t("common.offlineTitle")}
        className={`chip bg-red-100 text-red-800 ring-1 ring-red-300 dark:bg-red-900/40 dark:text-red-200 dark:ring-red-700 ${className}`}
      >
        {t("common.offline")}
      </span>
    );
  }
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
