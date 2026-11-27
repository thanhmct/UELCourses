import { useEffect, useId, type ReactNode } from "react";
import type { EffectiveBadge } from "@/lib/regulations";
import { translate, useLang, useT } from "@/i18n";
import { formatModuleType } from "@/lib/moduleFormat";
import { BackButton } from "./BackButton";
import { OfflineSafeSticker } from "./OfflineSafeSticker";
import { highestPriorityErrorId, useUiStatus, type ErrorSeverity } from "@/lib/uiStatus";

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

/** Ba dấu chấm nhảy lần lượt sau thông báo đang kết nối. */
export function LoadingDots() {
  return (
    <span aria-hidden="true" className="ml-1.5 inline-flex">
      {[0, 1, 2].map((i) => (
        <span key={i} className="inline-block motion-safe:animate-bounce" style={{ animationDelay: `${i * 150}ms` }}>.</span>
      ))}
    </span>
  );
}

/** `page`: the whole page is loading, so the sticker sits in the middle of the screen (clicks pass through). */
export function Loading({ compact = false, page = false, className = "" }: { compact?: boolean; page?: boolean; className?: string }) {
  // Đọc ngôn ngữ đã lưu ngay (không đợi mounted) để màn chờ không hiện tiếng Việt khi giao diện đang là tiếng Anh.
  const lang = useLang((s) => s.lang);
  const layout = page
    ? "pointer-events-none fixed inset-0 z-10 flex justify-center px-3 text-center"
    : compact ? "inline-flex" : "flex min-h-40 justify-center py-8";
  const stickerSize = page ? 88 : compact ? 44 : 64;
  return (
    <span className={`${layout} items-center gap-2 font-sans text-[1.75rem] leading-tight font-medium text-slate-600 dark:text-slate-400 ${className}`} role="status">
      <OfflineSafeSticker
        src="/stickers/05_vuot_troi_may_tinh_bang.svg"
        alt=""
        aria-hidden="true"
        width={stickerSize}
        height={Math.round(stickerSize * 0.79)}
        className="shrink-0 object-contain"
      />
      <span suppressHydrationWarning>{translate(lang, "common.loading")}<LoadingDots /></span>
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">{children}</p>;
}

export function LoadFailureMessage({ className = "" }: { className?: string }) {
  const { t } = useT();
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <OfflineSafeSticker
        src="/stickers/02_mat_sau.svg"
        alt=""
        aria-hidden="true"
        width={18}
        height={18}
        className="size-[1em] shrink-0 object-contain"
      />
      <span>{t("common.loadFailure")}</span>
    </span>
  );
}

export function ErrorBox({ severity = "error" }: { children: ReactNode; severity?: ErrorSeverity }) {
  const id = useId();
  const registerError = useUiStatus((state) => state.registerError);
  const unregisterError = useUiStatus((state) => state.unregisterError);
  const visibleId = useUiStatus((state) => highestPriorityErrorId(state.errors));

  useEffect(() => {
    registerError(id, severity);
    return () => unregisterError(id);
  }, [id, registerError, severity, unregisterError]);

  if (visibleId !== id) return null;
  return <div role="alert" className="text-sm font-medium text-slate-600 dark:text-slate-300"><LoadFailureMessage /></div>;
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
