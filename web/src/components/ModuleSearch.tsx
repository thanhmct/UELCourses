"use client";
import { useId, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useDebounced } from "@/lib/useDebounced";
import type { ModuleSummary } from "@/lib/types";
import { useT } from "@/i18n";
import { moduleName } from "@/i18n/names";

/** Search box with a dropdown of matching modules. */
export function ModuleSearch({
  onPick,
  exclude = [],
  placeholder,
  programId,
  semester,
}: {
  onPick: (m: ModuleSummary) => void;
  exclude?: string[];
  placeholder?: string;
  /** chỉ tìm học phần trong CTĐT này (vd K23406) */
  programId?: string;
  /** học kỳ đang xem: học phần không có lớp mở trong học kỳ này được ghi "Không có lịch" */
  semester?: string;
}) {
  const { t, lang } = useT();
  const listId = useId();
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const dq = useDebounced(q, 250);
  const { data, loading } = useApi(
    () =>
      dq.trim()
        ? api.modules({ q: dq, size: 10, program_id: programId || undefined })
        : Promise.resolve({ data: { items: [], total: 0 }, mock: false }),
    [dq, programId],
  );
  const items = (data?.items ?? []).filter((m) => !exclude.includes(m.code));
  return (
    <div className="relative">
      <input
        className="input"
        value={q}
        placeholder={placeholder ?? t("tt.addPlaceholder")}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setTimeout(() => setFocus(false), 150)}
        aria-label={t("mod.searchAria")}
        role="combobox"
        aria-controls={listId}
        aria-expanded={!!(focus && q.trim())}
        aria-autocomplete="list"
      />
      {focus && q.trim() && (
        <ul id={listId} className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900" role="listbox">
          {loading && <li className="px-3 py-2 text-sm text-slate-500">{t("mod.foundLoading")}</li>}
          {!loading && items.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">{t("mod.facetNone")}</li>}
          {items.map((m) => {
            // Không có lớp mở (có lịch) trong học kỳ đang xem thì ghi chú ngay trong danh sách.
            const open = (m.open_semesters ?? []).filter((o) => o.classes > 0);
            const noSchedule = semester ? !open.some((o) => o.semester === semester) : open.length === 0;
            return (
              <li key={m.code} role="option" aria-selected={false}>
                <button
                  className="flex w-full justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-brand-50 dark:hover:bg-slate-800"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onPick(m);
                    setQ("");
                  }}
                >
                  <span className="flex flex-wrap items-center gap-x-2">
                    <span><span className="font-mono font-semibold">{m.code}</span> {moduleName(m, lang)}</span>
                    {noSchedule && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                        Không có lịch
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-slate-500">{t("common.credits", { n: m.credits })}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
