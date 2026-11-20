"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useDebounced } from "@/lib/useDebounced";
import { EnBadge, Empty, ErrorBox, Loading, PageHeader, TypeChip } from "@/components/ui";
import { formatOfferingPlan } from "@/lib/modules";
import { ModuleActions } from "@/components/ModuleActions";

export default function ModulesPage() {
  const [q, setQ] = useState("");
  const [credits, setCredits] = useState("");
  const [type, setType] = useState("");
  const [eqOnly, setEqOnly] = useState(false);
  const [enOnly, setEnOnly] = useState(false);
  const [faculty, setFaculty] = useState("");
  const dq = useDebounced(q, 300);
  const { data, loading, error } = useApi(() => api.modules({ q: dq, credits, type, faculty, is_english: enOnly || undefined, size: 200 }), [dq, credits, type, faculty, enOnly]);
  const all = useApi(() => api.modules({ size: 500 }), []);

  const types = useMemo(() => {
    const s = new Set(["Bắt buộc", "Tự chọn", "Điều kiện"]);
    all.data?.items.forEach((m) => m.type && s.add(m.type));
    return [...s];
  }, [all.data]);

  const faculties = useMemo(() => [...new Set((all.data?.items ?? []).map((m) => m.faculty).filter((f): f is string => !!f))].sort(), [all.data]);
  const items = (data?.items ?? []).filter((m) => (!eqOnly || m.has_equivalents) && (!enOnly || m.is_english));

  return (
    <div>
      <PageHeader title="Tra cứu học phần" subtitle="Tìm theo mã hoặc tên học phần (không cần gõ dấu)." />
      <div className="card mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="q">Từ khóa</label>
          <input id="q" className="input" placeholder="VD: ECO101, kinh te vi mo" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="credits">Số tín chỉ</label>
          <select id="credits" className="input" value={credits} onChange={(e) => setCredits(e.target.value)}>
            <option value="">Tất cả</option>
            {[1, 2, 3, 4, 5].map((c) => (
              <option key={c} value={c}>{c} tín chỉ</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="type">Loại học phần</label>
          <select id="type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Tất cả</option>
            {types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="faculty">Khoa</label>
          <select id="faculty" className="input" value={faculty} onChange={(e) => setFaculty(e.target.value)}>
            <option value="">Tất cả</option>
            {faculties.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col justify-end gap-1 text-sm sm:col-span-1 lg:col-span-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={eqOnly} onChange={(e) => setEqOnly(e.target.checked)} className="h-4 w-4 accent-brand-600" />
            Chỉ hiện học phần có học phần tương đương
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={enOnly} onChange={(e) => setEnOnly(e.target.checked)} className="h-4 w-4 accent-brand-600" />
            Chỉ hiện môn dạy bằng tiếng Anh (EN)
          </label>
        </div>
      </div>
      {error && <ErrorBox>Lỗi tải dữ liệu: {error}</ErrorBox>}
      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty>Không tìm thấy học phần phù hợp.</Empty>
      ) : (
        <>
          <p className="mb-2 text-sm text-slate-500">{items.length} học phần</p>
          <ul className="grid gap-3 md:grid-cols-2">
            {items.map((m) => (
              <li key={m.code} className="card flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link href={`/modules/${encodeURIComponent(m.code)}`} className="font-semibold text-brand-700 hover:underline dark:text-brand-300">
                      {m.code} · {m.name}
                    </Link>
                    <p className="text-xs text-slate-500">{m.faculty ?? "—"}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold">{m.credits} TC</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  <TypeChip type={m.type} />
                  {m.has_equivalents && <span className="chip bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200">Có tương đương</span>}
                  {m.is_english && <EnBadge />}
                </div>
                {formatOfferingPlan(m.offering_plan) && <p className="text-xs text-slate-500">{formatOfferingPlan(m.offering_plan)}</p>}
                <ModuleActions module={m} compact />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

