"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useDebounced } from "@/lib/useDebounced";
import type { ModuleSummary } from "@/lib/types";

/** Search box with a dropdown of matching modules. */
export function ModuleSearch({
  onPick,
  exclude = [],
  placeholder = "Thêm học phần: nhập mã hoặc tên…",
}: {
  onPick: (m: ModuleSummary) => void;
  exclude?: string[];
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const dq = useDebounced(q, 250);
  const { data, loading } = useApi(
    () => (dq.trim() ? api.modules({ q: dq, size: 10 }) : Promise.resolve({ data: { items: [], total: 0 }, mock: false })),
    [dq],
  );
  const items = (data?.items ?? []).filter((m) => !exclude.includes(m.code));
  return (
    <div className="relative">
      <input
        className="input"
        value={q}
        placeholder={placeholder}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setTimeout(() => setFocus(false), 150)}
        aria-label="Tìm học phần"
      />
      {focus && q.trim() && (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {loading && <li className="px-3 py-2 text-sm text-slate-500">Đang tìm…</li>}
          {!loading && items.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Không có kết quả</li>}
          {items.map((m) => (
            <li key={m.code}>
              <button
                className="flex w-full justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-brand-50 dark:hover:bg-slate-800"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(m);
                  setQ("");
                }}
              >
                <span><span className="font-semibold">{m.code}</span> · {m.name}</span>
                <span className="shrink-0 text-slate-500">{m.credits} TC</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
