"use client";

import { BouncingChick } from "@/components/ui";
import { useT } from "@/i18n";

export default function NotFound() {
  const { t } = useT();

  return (
    <div className="grid min-h-[55dvh] place-items-center px-3 text-center">
      <h1 className="flex items-center gap-2 font-sans text-[1.75rem] leading-tight font-medium text-slate-600 dark:text-slate-400">
        <BouncingChick />
        <span>{t("common.pageNotFound")}</span>
      </h1>
    </div>
  );
}
