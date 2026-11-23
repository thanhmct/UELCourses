"use client";
import { useEffect, useId, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useDebounced } from "@/lib/useDebounced";
import { useProgramProfile } from "@/lib/myProgram";
import type { ModuleSummary } from "@/lib/types";
import { useT } from "@/i18n";
import { creditsLine, moduleName } from "@/i18n/names";
import { Loading, NoScheduleBadge, RequiredBadge } from "@/components/ui";
import { getCachedFinalAssessmentKind } from "@/lib/finalAssessment";

/** Search box with a dropdown of matching modules. */
export function ModuleSearch({
  onPick,
  exclude = [],
  placeholder,
  programId,
  programIds,
  semester,
  programRequiredMap,
  inheritProgramProfile = true,
}: {
  onPick: (m: ModuleSummary) => void;
  exclude?: string[];
  placeholder?: string;
  /** chỉ tìm học phần trong CTĐT này (vd K23406) */
  programId?: string;
  /** chỉ tìm học phần trong các CTĐT này (union) */
  programIds?: string[];
  /** học kỳ đang xem: học phần không có lớp mở trong học kỳ này được ghi "Không có lịch" */
  semester?: string;
  /** bản đồ trạng thái bắt buộc theo mã môn (true = Bắt buộc, false = Tự chọn) */
  programRequiredMap?: Record<string, boolean> | Map<string, boolean>;
  /** Có tự lấy CTĐT toàn cục để gắn nhãn bắt buộc/tự chọn hay không. */
  inheritProgramProfile?: boolean;
}) {
  const { t, lang } = useT();
  const listId = useId();
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const dq = useDebounced(q, 250);
  const pidsKey = programIds ? programIds.join(",") : "";

  // Tự động phân giải trạng thái Bắt buộc / Tự chọn nếu không truyền trực tiếp map
  const profile = useProgramProfile();
  const effectiveProgIds = useMemo(() => {
    if (programRequiredMap) return [];
    if (programIds?.length) return programIds;
    if (programId) return [programId];
    return inheritProgramProfile ? profile.programIds : [];
  }, [programRequiredMap, programIds, programId, inheritProgramProfile, profile.programIds]);

  const [internalReqMap, setInternalReqMap] = useState<Map<string, boolean>>(new Map());

  useEffect(() => {
    if (programRequiredMap || effectiveProgIds.length === 0) return;
    let alive = true;
    Promise.all(effectiveProgIds.map((pid) => api.program(pid))).then((results) => {
      if (!alive) return;
      const map = new Map<string, boolean>();
      for (const res of results) {
        if (!res.data) continue;
        for (const block of res.data.blocks) {
          for (const mod of block.modules) {
            if (!map.has(mod.code)) {
              map.set(mod.code, mod.required);
            }
          }
        }
      }
      setInternalReqMap(map);
    });
    return () => {
      alive = false;
    };
  }, [programRequiredMap, effectiveProgIds]);

  const getRequired = (code: string): boolean | undefined => {
    if (programRequiredMap) {
      if (programRequiredMap instanceof Map) return programRequiredMap.get(code);
      return (programRequiredMap as Record<string, boolean>)[code];
    }
    return internalReqMap.get(code);
  };

  const { data, loading } = useApi(
    () =>
      dq.trim()
        ? api.modules({
            q: dq,
            size: 10,
            program_id: programId || undefined,
            program_ids: programIds && programIds.length > 0 ? programIds : undefined,
          })
        : Promise.resolve({ data: { items: [], total: 0 }, mock: false }),
    [dq, programId, pidsKey],
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
          {loading && <li className="px-3 py-2 text-sm text-slate-500"><Loading compact /></li>}
          {!loading && items.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">{t("mod.facetNone")}</li>}
          {items.map((m) => {
            // Không có lớp mở (có lịch) trong học kỳ đang xem thì ghi chú ngay trong danh sách.
            const open = (m.open_semesters ?? []).filter((o) => o.classes > 0);
            const noSchedule = semester ? !open.some((o) => o.semester === semester) : open.length === 0;
            const req = getRequired(m.code);

            return (
              <li key={m.code} role="option" aria-selected={false}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-brand-50 dark:hover:bg-slate-800 min-h-[38px]"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onPick(m);
                    setQ("");
                  }}
                >
                  <span className="flex flex-wrap items-center gap-x-2 min-w-0 flex-1">
                    <span className="font-mono font-semibold">{m.code}</span>
                    <span>{moduleName(m, lang)}</span>
                    <RequiredBadge required={req} lang={lang} />
                  </span>
                  <span className="flex shrink-0 items-center justify-end gap-2 text-slate-500 whitespace-nowrap">
                    {noSchedule && <NoScheduleBadge lang={lang} />}
                    <span>
                      {creditsLine({ credits: m.credits, finalAssessment: m.final_assessment || getCachedFinalAssessmentKind(m.code) }, lang)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
