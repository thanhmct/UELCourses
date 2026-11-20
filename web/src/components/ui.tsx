import type { ReactNode } from "react";
import { BADGE_LABEL, type EffectiveBadge } from "@/lib/regulations";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Loading({ text = "Đang tải…" }: { text?: string }) {
  return <p className="py-8 text-center text-sm text-slate-500" role="status">{text}</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">{children}</p>;
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">{children}</p>;
}

const BADGE_CLS: Record<EffectiveBadge, string> = {
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  expiring: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  expired: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  superseded: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  upcoming: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
};

export function EffectiveBadgeChip({ badge }: { badge: EffectiveBadge }) {
  return <span className={`chip ${BADGE_CLS[badge]}`}>{BADGE_LABEL[badge]}</span>;
}

export function EnBadge() {
  return (
    <span className="chip bg-sky-100 font-bold text-sky-800 dark:bg-sky-900/40 dark:text-sky-200" title="Môn dạy bằng tiếng Anh">
      EN
    </span>
  );
}

export function TypeChip({ type }: { type: string }) {
  return <span className="chip bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">{type}</span>;
}
