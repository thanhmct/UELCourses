import type { ReactNode } from "react";
import type { EffectiveBadge } from "@/lib/regulations";
import { useT } from "@/i18n";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Loading({ text }: { text?: string }) {
  const { t } = useT();
  return <p className="py-8 text-center text-sm text-slate-500" role="status">{text ?? t("common.loading")}</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">{children}</p>;
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">{children}</p>;
}

const BADGE_CLS: Record<EffectiveBadge, string> = {
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  expiring: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  expired: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  superseded: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  upcoming: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
};

export function EffectiveBadgeChip({ badge }: { badge: EffectiveBadge }) {
  const { t } = useT();
  return <span className={`chip ${BADGE_CLS[badge]}`}>{t(`rbadge.${badge}`)}</span>;
}

/** EN = taught in English. */
export function EnBadge() {
  const { t } = useT();
  return (
    <span className="chip bg-sky-100 font-bold text-sky-800 dark:bg-sky-900/40 dark:text-sky-200" title={t("badge.enTitle")}>
      {t("badge.en")}
    </span>
  );
}

/** CNTN = talent programme. */
export function CntnBadge() {
  const { t } = useT();
  return (
    <span className="chip bg-amber-100 font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" title={t("badge.cntnTitle")}>
      {t("badge.cntn")}
    </span>
  );
}

export function TypeChip({ type }: { type: string }) {
  return <span className="chip bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">{type}</span>;
}
