"use client";
import { useDataSource } from "@/lib/dataSource";
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
