import type { ReactNode } from "react";
import type { EffectiveBadge } from "@/lib/regulations";
import { translate, useLang, useT } from "@/i18n";
import { formatModuleType } from "@/lib/moduleFormat";
import { BackButton } from "./BackButton";

export function PageHeader({
  title,
  subtitle,
  actions,
  backHref,
  backLabel,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0">
        {backHref && <BackButton href={backHref} label={backLabel} />}
        <div className="min-w-0">
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function BouncingChick() {
  return <span className="inline-block shrink-0 text-4xl leading-none motion-safe:animate-bounce" aria-hidden="true">🐣</span>;
}

/** Ba dấu chấm nhảy lần lượt, đặt sau chữ "chờ xíu nhe". */
export function LoadingDots() {
  return (
    <span aria-hidden="true" className="ml-1.5 inline-flex">
      {[0, 1, 2].map((i) => (
        <span key={i} className="inline-block motion-safe:animate-bounce" style={{ animationDelay: `${i * 150}ms` }}>.</span>
      ))}
    </span>
  );
}

/** `page`: the whole page is loading, so the chick sits in the middle of the screen (clicks pass through). */
export function Loading({ compact = false, page = false, className = "" }: { compact?: boolean; page?: boolean; className?: string }) {
  // Đọc ngôn ngữ đã lưu ngay (không đợi mounted) để màn chờ không hiện tiếng Việt khi giao diện đang là tiếng Anh.
  const lang = useLang((s) => s.lang);
  const layout = page
    ? "pointer-events-none fixed inset-0 z-10 flex justify-center px-3 text-center"
    : compact ? "inline-flex" : "flex min-h-40 justify-center py-8";
  return (
    <span className={`${layout} items-center gap-2 font-sans text-[1.75rem] leading-tight font-medium text-slate-600 dark:text-slate-400 ${className}`} role="status">
      <BouncingChick />
      <span suppressHydrationWarning>{translate(lang, "common.loading")}<LoadingDots /></span>
    </span>
  );
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
    <span className="chip info-chip font-bold" title={t("badge.enTitle")}>
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
  const { lang } = useT();
  return <span className="chip bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">{formatModuleType(type, lang)}</span>;
}

export { BackButton } from "./BackButton";
export { RequiredBadge, NoScheduleBadge, ModuleTitleLine } from "./ModuleTitleLine";
