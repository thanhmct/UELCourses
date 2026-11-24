"use client";

import Link from "next/link";
import { api } from "@/lib/api";
import { formatDateVi } from "@/lib/dates";
import { effectiveBadge } from "@/lib/regulations";
import { useApi } from "@/lib/useApi";
import { wikilinkHref } from "@/lib/vault";
import { useWorkspace } from "@/lib/workspace";
import { useT } from "@/i18n";
import { EffectiveBadgeChip, Empty, Loading } from "@/components/ui";

function sourceDomain(sourceUrl: string): string {
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return sourceUrl;
  }
}

export function RegulationInfoCard({ docId }: { docId: string }) {
  const { t } = useT();
  const result = useApi(() => api.regulation(docId), [docId]);

  if (result.loading) return <Loading />;
  if (!result.data) return <Empty>{t("regInfo.loadFail", { id: docId })}</Empty>;

  const doc = result.data;
  const badge = effectiveBadge(doc);
  const cohorts = doc.applies_to_cohorts?.includes("all")
    ? t("md.allCohorts")
    : doc.applies_to_cohorts?.join(", ") || t("regInfo.notAvailable");
  const metadataUnverified = doc.metadata_verified === false || doc.verified === false;

  const relationLink = (target: string) => (
    <Link
      key={target}
      href={wikilinkHref(target)}
      onNavigate={() => useWorkspace.getState().open(target)}
      className="rounded-md border border-slate-300 px-2 py-1 text-sm font-medium text-brand-ink hover:bg-brand-50 dark:border-slate-700 dark:hover:bg-slate-800"
    >
      {target}
    </Link>
  );

  return (
    <article className="space-y-6" aria-labelledby="regulation-title">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 id="regulation-title" className="text-2xl font-bold text-slate-950 dark:text-white">
              {doc.title}
            </h1>
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              {doc.decision_no || t("regInfo.notAvailable")}
            </p>
          </div>
          <EffectiveBadgeChip badge={badge} />
        </div>
        {metadataUnverified && (
          <p className="rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200" role="alert">
            {t("md.unverified")}
          </p>
        )}
      </header>

      <dl className="grid gap-x-8 gap-y-4 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-900/60 sm:grid-cols-2">
        <div>
          <dt className="font-medium text-slate-500">{t("regInfo.decisionNo")}</dt>
          <dd className="mt-1 text-slate-900 dark:text-slate-100">{doc.decision_no || t("regInfo.notAvailable")}</dd>
        </div>
        {doc.issuer && (
          <div>
            <dt className="font-medium text-slate-500">{t("regInfo.issuer")}</dt>
            <dd className="mt-1 text-slate-900 dark:text-slate-100">{doc.issuer}</dd>
          </div>
        )}
        <div>
          <dt className="font-medium text-slate-500">{t("regInfo.issuedDate")}</dt>
          <dd className="mt-1 text-slate-900 dark:text-slate-100">{formatDateVi(doc.issued_date) || t("regInfo.notAvailable")}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">{t("regInfo.effectivePeriod")}</dt>
          <dd className="mt-1 text-slate-900 dark:text-slate-100">
            {formatDateVi(doc.effective_from) || t("regInfo.notAvailable")} – {doc.effective_to ? formatDateVi(doc.effective_to) : t("regInfo.openEnded")}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">{t("regInfo.appliesTo")}</dt>
          <dd className="mt-1 text-slate-900 dark:text-slate-100">{cohorts}</dd>
        </div>
      </dl>

      {(doc.supersedes?.length || doc.superseded_by) && (
        <section className="space-y-3">
          {doc.supersedes && doc.supersedes.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold">{t("regInfo.replaces")}</h2>
              {doc.supersedes.map(relationLink)}
            </div>
          )}
          {doc.superseded_by && (
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold">{t("regInfo.replacedBy")}</h2>
              {relationLink(doc.superseded_by)}
            </div>
          )}
        </section>
      )}

      <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
        {doc.source_url ? (
          <a
            href={doc.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary inline-flex items-center gap-2"
          >
            <span>{t("regInfo.openSource")}</span>
            <span className="font-normal opacity-80">{sourceDomain(doc.source_url)} ↗</span>
          </a>
        ) : (
          <p className="text-sm text-slate-500">{t("regInfo.sourceMissing")}</p>
        )}
      </div>
    </article>
  );
}
