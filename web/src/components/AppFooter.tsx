"use client";
import { useT } from "@/i18n";
import { LogoMark } from "./icons";

export function AppFooter() {
  const { t } = useT();
  return (
    <footer className="border-t border-slate-200 px-3 py-4 pb-20 text-center text-xs text-slate-500 desk:pb-4 dark:border-slate-800">
      <span className="inline-flex items-center gap-2">
        <LogoMark className="h-5 w-5 shrink-0" />
        <span>{t("footer.text")}</span>
      </span>
    </footer>
  );
}
