"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useDebounced } from "@/lib/useDebounced";
import { Empty, ErrorBox, Loading, PageHeader } from "@/components/ui";

export default function EquivalentsPage() {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const { data, loading, error } = useApi(() => api.equivalents(dq || undefined), [dq]);

  return (
    <div>
      <PageHeader title="Học phần tương đương" subtitle="Mỗi nhóm là một học phần gốc và các học phần có thể học thay thế." />
      <div className="card mb-4">
        <label className="label" htmlFor="eq">Tìm theo mã hoặc tên (môn gốc hoặc môn tương đương)</label>
        <input id="eq" className="input" placeholder="VD: ECO101, Marketing" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {loading ? <Loading /> : !data?.length ? <Empty>Không có kết quả.</Empty> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-brand-600 text-xs uppercase text-white">
              <tr>
                <th className="px-3 py-2">Mã môn</th>
                <th className="px-3 py-2">Tên môn</th>
                <th className="px-3 py-2 text-center">STC</th>
                <th className="px-3 py-2">Mã môn tương đương</th>
                <th className="px-3 py-2">Tên môn tương đương</th>
                <th className="px-3 py-2 text-center">STC tương đương</th>
              </tr>
            </thead>
            <tbody>
              {data.map((g) =>
                (g.equivalents.length ? g.equivalents : [null]).map((e, i) => (
                  <tr key={`${g.code}-${e?.code ?? i}`} className={`border-t border-slate-200 dark:border-slate-800 ${i === 0 ? "border-t-2 border-t-slate-300 dark:border-t-slate-700" : ""}`}>
                    {i === 0 && (
                      <>
                        <td className="px-3 py-2 align-top font-semibold" rowSpan={Math.max(1, g.equivalents.length)}>
                          <Link className="text-brand-700 hover:underline dark:text-brand-300" href={`/modules/${encodeURIComponent(g.code)}`}>{g.code}</Link>
                        </td>
                        <td className="px-3 py-2 align-top" rowSpan={Math.max(1, g.equivalents.length)}>{g.name}</td>
                        <td className="px-3 py-2 text-center align-top" rowSpan={Math.max(1, g.equivalents.length)}>{g.credits}</td>
                      </>
                    )}
                    <td className="px-3 py-2 font-mono text-xs">{e?.code ?? "—"}</td>
                    <td className="px-3 py-2">{e?.name ?? "—"}</td>
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
