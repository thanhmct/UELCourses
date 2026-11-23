"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { ErrorBox, Loading } from "@/components/ui";
import { useT } from "@/i18n";
import { cleanMajorName, MAJOR_EN } from "@/lib/programCode";

/**
 * Trang mở đầu: chọn khóa và ngành, rồi chuyển sang Học phần đã lọc theo CTĐT.
 * Mã CTĐT dạng K23406 = khóa 23 (K23) + ngành 406.
 */
export default function StartPage() {
  const { t, lang } = useT();
  const router = useRouter();
  const programs = useApi(() => api.programs(), []);
  const [cohort, setCohort] = useState("");
  const [programId, setProgramId] = useState("");

  const cohorts = useMemo(
    () => [...new Set((programs.data ?? []).map((p) => p.cohort))].filter(Boolean).sort((a, b) => b.localeCompare(a, "en", { numeric: true })),
    [programs.data],
  );
  const inCohort = useMemo(
    () => (programs.data ?? []).filter((p) => p.cohort === cohort).sort((a, b) => a.program_id.localeCompare(b.program_id)),
    [programs.data, cohort],
  );

  const go = () => {
    if (programId) router.push(`/modules?program=${encodeURIComponent(programId)}`);
  };

  return (
    <div className="mx-auto max-w-xl space-y-6 py-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{t("start.title")}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t("start.descBefore")} <span className="font-mono">K23406</span> {t("start.descAfter")}
        </p>
      </header>

      {programs.error && <ErrorBox>{programs.offline ? t("api.connectionError") : t("start.loadError", { error: programs.error })}</ErrorBox>}

      <div className="card space-y-4">
        <div>
          <label htmlFor="cohort" className="label">{t("start.cohort")}</label>
          <select
            id="cohort"
            className="input"
            value={cohort}
            disabled={programs.loading}
            onChange={(e) => {
              setCohort(e.target.value);
              setProgramId("");
            }}
          >
            <option value="">{t("start.selectCohort")}</option>
            {cohorts.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {programs.loading && <Loading compact className="mt-2" />}
        </div>

        <div>
          <label htmlFor="program" className="label">{t("start.major")}</label>
          <select id="program" className="input" value={programId} onChange={(e) => setProgramId(e.target.value)} disabled={!cohort}>
            <option value="">{cohort ? t("start.selectMajor") : t("start.selectCohortFirst")}</option>
            {inCohort.map((p) => (
              <option key={p.program_id} value={p.program_id}>
                {p.program_id.slice(p.cohort.length)} · {lang === "en" ? (MAJOR_EN[cleanMajorName(p.name).toLowerCase()] ?? cleanMajorName(p.name)) : p.name}
              </option>
            ))}
          </select>
          {cohort && inCohort.length === 0 && !programs.loading && (
            <p className="mt-1 text-xs text-slate-500">{t("start.noProgram", { cohort })}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button type="button" className="btn-primary" onClick={go} disabled={!programId}>{t("start.viewMajor")}</button>
          <Link href="/modules" className="text-sm text-brand-700 hover:underline dark:text-brand-300">{t("start.viewAll")}</Link>
        </div>
      </div>
    </div>
  );
}
