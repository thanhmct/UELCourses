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

export function ConnectionNotice() {
  const offline = useDataSource((s) => s.offline && !s.mock);
  const { t } = useT();
  return offline ? (
    <p role="status" className="mb-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
      <span aria-hidden="true" className="inline-block animate-bounce text-lg leading-none motion-reduce:animate-none">🐣</span>
      <span>{t("api.connectionError")}</span>
    </p>
  ) : null;
}
