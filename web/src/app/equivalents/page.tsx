"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useDebounced } from "@/lib/useDebounced";
import { Empty, ErrorBox, Loading, PageHeader } from "@/components/ui";
import { useT } from "@/i18n";
import { moduleName } from "@/i18n/names";
import { matches } from "@/lib/text";
import type { ModuleRef } from "@/lib/types";

interface DisplayEquivalentGroup {
  code: string;
  name: string;
  name_en?: string | null;
  credits: number;
  displayEquivalents: ModuleRef[];
  hiddenOutsideCount: number;
}

const PAGE_SIZE = 50;

export default function EquivalentsPage() {
  const { t, lang } = useT();
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);

  const [page, setPage] = useState(1);

  const { data, loading, error } = useApi(() => api.equivalents(dq || undefined), [dq]);

  const processedGroups = useMemo(() => {
    return (data ?? []).map((g) => ({
      code: g.code,
      name: g.name,
      name_en: g.name_en,
      credits: g.credits,
      displayEquivalents: g.equivalents,
      hiddenOutsideCount: 0,
    }));
  }, [data]);

  const filteredGroups = useMemo(() => {
    if (!dq.trim()) return processedGroups;
    const needle = dq.trim().toLowerCase();
    return processedGroups.filter((g) => {
      if (matches(g.code, needle) || matches(g.name, needle) || (g.name_en && matches(g.name_en, needle))) {
        return true;
      }
      return g.displayEquivalents.some(
        (e) => matches(e.code, needle) || matches(e.name, needle) || (e.name_en && matches(e.name_en, needle)),
      );
    });
  }, [processedGroups, dq]);

  const pagedGroups = useMemo(() => {
    return filteredGroups.slice(0, page * PAGE_SIZE);
  }, [filteredGroups, page]);

  return (
    <div className="space-y-4">
      <PageHeader title={t("eq.title")} subtitle={t("eq.subtitle")} />

      <div className="card space-y-3">
        <div>
          <label className="label" htmlFor="eq">{t("eq.search")}</label>
          <input
            id="eq"
            className="input"
            placeholder={t("eq.placeholder")}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>

      </div>

      {!loading && !error && (
        <p className="border-b border-slate-200 pb-2 text-right text-sm text-slate-500 dark:border-slate-800" role="status">
          {t("eq.found", { n: filteredGroups.length })}
        </p>
      )}

      {error && <ErrorBox>{error}</ErrorBox>}

      <div className="min-h-[400px]">
        {loading ? (
          <Loading />
        ) : !filteredGroups.length ? (
          <Empty>{t("eq.none")}</Empty>
        ) : (
          <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-brand-600 text-xs uppercase text-white">
              <tr>
                <th className="px-3 py-2">{t("eq.colCode")}</th>
                <th className="px-3 py-2">{t("eq.colName")}</th>
                <th className="px-3 py-2 text-center">{t("eq.colCredits")}</th>
                <th className="px-3 py-2">{t("eq.colEqCode")}</th>
                <th className="px-3 py-2">{t("eq.colEqName")}</th>
                <th className="px-3 py-2 text-center">{t("eq.colEqCredits")}</th>
              </tr>
            </thead>
            <tbody>
              {pagedGroups.map((g) => {
                const eqList = g.displayEquivalents.length ? g.displayEquivalents : [null];
                return eqList.map((e, i) => (
                  <tr
                    key={`${g.code}-${e?.code ?? i}`}
                    className={`border-t border-slate-200 dark:border-slate-800 ${
                      i === 0 ? "border-t-2 border-t-slate-300 dark:border-t-slate-700" : ""
                    }`}
                  >
                    {i === 0 && (
                      <>
                        <td
                          className="px-3 py-2 align-top font-semibold"
                          rowSpan={Math.max(1, eqList.length)}
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Link
                              className="font-mono text-brand-700 hover:underline dark:text-brand-300"
                              href={`/modules/${encodeURIComponent(g.code)}`}
                            >
                              {g.code}
                            </Link>
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top" rowSpan={Math.max(1, eqList.length)}>
                          {moduleName(g, lang)}
                        </td>
                        <td className="px-3 py-2 text-center align-top" rowSpan={Math.max(1, eqList.length)}>
                          {g.credits}
                        </td>
                      </>
                    )}
                    <td className="px-3 py-2 font-mono text-xs">
                      {e ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link
                            className="font-mono text-brand-700 hover:underline dark:text-brand-300"
                            href={`/modules/${encodeURIComponent(e.code)}`}
                          >
                            {e.code}
                          </Link>
                        </div>
                      ) : g.hiddenOutsideCount > 0 ? (
                        <span className="text-xs text-slate-400 italic">
                          {t("eq.outsideCount", { n: g.hiddenOutsideCount })}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">{e ? moduleName(e, lang) || "—" : "—"}</td>
                    <td className="px-3 py-2 text-center">{e?.credits ?? "—"}</td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
          {filteredGroups.length > page * PAGE_SIZE && (
            <div className="p-4 text-center border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                className="btn-outline text-xs cursor-pointer"
                onClick={() => setPage((p) => p + 1)}
              >
                {t("common.loadMore", { loaded: pagedGroups.length, total: filteredGroups.length })}
              </button>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
