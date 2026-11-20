"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useMounted } from "@/lib/useMounted";
import { COHORTS, useSettings } from "@/lib/store";
import { Empty, Loading, PageHeader } from "@/components/ui";
import { useT } from "@/i18n";

export default function ProgramsPage() {
  const { t, lang } = useT();
  const mounted = useMounted();
  const savedCohort = useSettings((s) => s.cohort);
  const [cohort, setCohort] = useState<string>("all");
  const [faculty, setFaculty] = useState<string>("all");
  const [query, setQuery] = useState<string>("");

  useEffect(() => {
    if (mounted && savedCohort) {
      setCohort(savedCohort);
    }
  }, [mounted, savedCohort]);

  const programsReq = useApi(
    () => api.programs(cohort !== "all" ? { cohort } : {}),
    [cohort],
  );

  const programs = useMemo(() => programsReq.data ?? [], [programsReq.data]);

  // Get list of unique faculties for filter
  const faculties = useMemo(() => {
    const set = new Set<string>();
    programs.forEach((p) => {
      if (p.faculty) set.add(p.faculty);
    });
    return Array.from(set).sort();
  }, [programs]);

  // Filter programs by query, faculty, and only active cohorts (K23+)
  const filtered = useMemo(() => {
    return programs.filter((p) => {
      const cNum = parseInt(p.cohort.replace(/\D/g, ""), 10);
      if (!isNaN(cNum) && cNum < 23) return false;
      if (faculty !== "all" && p.faculty !== faculty) return false;
      if (query.trim()) {
        const q = query.toLowerCase().trim();
        const match =
          p.program_id.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          (p.faculty && p.faculty.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [programs, faculty, query]);

  // quick links come from the API (programs of the chosen cohort), never a hard-coded list
  const quick = filtered.slice(0, 6);

  if (!mounted) return <Loading />;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("prog.title")}
        subtitle={t("prog.subtitle")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">{t("prog.yourCohort")}</span>
            <span className="chip bg-brand-100 font-semibold text-brand-800 dark:bg-brand-950 dark:text-brand-300">
              {savedCohort || t("prog.notSet")}
            </span>
          </div>
        }
      />

      <div className="card border-l-4 border-l-brand-600">
        <p className="text-sm text-slate-700 dark:text-slate-300">
          <span className="font-semibold">{t("prog.heroKicker")}:</span> {t("prog.heroLead")}
          {quick.length > 0 && (
            <>
              {" "}{t("prog.recent")}{" "}
              {quick.map((p) => (
                <Link key={p.program_id} href={`/programs/${p.program_id}`} className="mr-2 font-semibold text-brand-700 hover:underline dark:text-brand-300">
                  {p.program_id}
                </Link>
              ))}
            </>
          )}
        </p>
      </div>

      {/* Search & Filters */}
      <div className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <label className="label" htmlFor="prog-q">{t("prog.search")}</label>
          <input
            id="prog-q"
            className="input"
            placeholder={t("prog.searchPh")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="prog-cohort">{t("prog.cohort")}</label>
          <select
            id="prog-cohort"
            className="input"
            value={cohort}
            onChange={(e) => setCohort(e.target.value)}
          >
            <option value="all">{t("prog.allCohorts")}</option>
            {COHORTS.map((c) => (
              <option key={c} value={c}>
                {t("prog.cohortN", { c })}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="prog-faculty">{t("prog.faculty")}</label>
          <select
            id="prog-faculty"
            className="input"
            value={faculty}
            onChange={(e) => setFaculty(e.target.value)}
          >
            <option value="all">{t("prog.allFaculties", { n: faculties.length })}</option>
            {faculties.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
      </div>

      {programsReq.loading ? (
        <Loading text={t("prog.loading")} />
      ) : filtered.length === 0 ? (
        <Empty>{t("prog.empty")}</Empty>
      ) : (
        <div className="space-y-3">
          <div className="text-xs text-slate-500">
            {t("prog.showing", { n: filtered.length.toLocaleString(lang === "vi" ? "vi-VN" : "en-GB") })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => (
              <div key={p.program_id} className="card flex flex-col justify-between transition hover:border-brand-400">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-brand-700 dark:text-brand-300">
                      {p.program_id}
                    </span>
                    <span className="chip bg-slate-100 text-[11px] font-semibold dark:bg-slate-800">
                      {p.cohort}
                    </span>
                  </div>

                  <h3 className="mt-2 text-base font-bold text-slate-900 dark:text-white">
                    <Link href={`/programs/${p.program_id}`} className="hover:underline">
                      {p.name}
                    </Link>
                  </h3>

                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {p.faculty || t("prog.defaultFaculty")}
                  </p>
                </div>

                <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <div className="mb-2 text-xs text-slate-600 dark:text-slate-400">
                    {t("prog.required", { n: p.total_credits })}
                  </div>
                  <Link href={`/programs/${p.program_id}`} className="btn-primary w-full text-center text-xs">
                    {t("prog.view")}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
