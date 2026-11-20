"use client";
import { useT } from "@/i18n";

export function AppFooter() {
  const { t } = useT();
  return (
    <footer className="border-t border-slate-200 px-3 py-4 pb-20 text-center text-xs text-slate-500 md:pb-4 dark:border-slate-800">
      {t("footer.text")}
    </footer>
  );
}
