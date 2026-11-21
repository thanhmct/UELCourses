"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useDebounced } from "@/lib/useDebounced";
import { Empty, ErrorBox, Loading, PageHeader } from "@/components/ui";
import { useT } from "@/i18n";
import { moduleName } from "@/i18n/names";

export default function EquivalentsPage() {
  const { t, lang } = useT();
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const { data, loading, error } = useApi(() => api.equivalents(dq || undefined), [dq]);

  return (
    <div className="space-y-4">
      <PageHeader title={t("eq.title")} subtitle={t("eq.subtitle")} />
      <div className="card">
        <label className="label" htmlFor="eq">{t("eq.search")}</label>
        <input id="eq" className="input" placeholder={t("eq.placeholder")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {loading ? <Loading /> : !data?.length ? <Empty>{t("eq.none")}</Empty> : (
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
              {data.map((g) =>
                (g.equivalents.length ? g.equivalents : [null]).map((e, i) => (
                  <tr key={`${g.code}-${e?.code ?? i}`} className={`border-t border-slate-200 dark:border-slate-800 ${i === 0 ? "border-t-2 border-t-slate-300 dark:border-t-slate-700" : ""}`}>
                    {i === 0 && (
                      <>
                        <td className="px-3 py-2 align-top font-semibold" rowSpan={Math.max(1, g.equivalents.length)}>
                          <Link className="font-mono text-brand-700 hover:underline dark:text-brand-300" href={`/modules/${encodeURIComponent(g.code)}`}>{g.code}</Link>
                        </td>
                        <td className="px-3 py-2 align-top" rowSpan={Math.max(1, g.equivalents.length)}>{moduleName(g, lang)}</td>
                        <td className="px-3 py-2 text-center align-top" rowSpan={Math.max(1, g.equivalents.length)}>{g.credits}</td>
                      </>
                    )}
                    <td className="px-3 py-2 font-mono text-xs">{e?.code ?? "—"}</td>
                    <td className="px-3 py-2">{e ? moduleName(e, lang) || "—" : "—"}</td>
                    <td className="px-3 py-2 text-center">{e?.credits ?? "—"}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
