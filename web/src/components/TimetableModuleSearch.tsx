"use client";
import { Check } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useDebounced } from "@/lib/useDebounced";
import { useMaxVisibleItems } from "@/lib/useMaxVisibleItems";
import { useProgramProfile } from "@/lib/myProgram";
import type { ModuleSummary } from "@/lib/types";
import { useT } from "@/i18n";
import { useExchangeStats, useExchangeViewActive } from "@/lib/useExchangeStats";
import { ExchangeStatBadge } from "@/components/ExchangeStatBadge";
import { creditsLine, isEnglishCode, moduleName } from "@/i18n/names";
import { Loading, EnBadge, NoScheduleBadge, RequiredBadge } from "@/components/ui";
import { getCachedFinalAssessmentKind } from "@/lib/finalAssessment";
import { activeToken, finishedCodes, parseCodes, rankSuggestions, replaceActiveToken } from "@/lib/codeTokens";
import { parseSemesterId } from "@/lib/modules";

export interface TimetableModuleSearchProps {
  onPick: (m: ModuleSummary) => void;
  exclude?: string[];
  /** Mã đã có ở học kỳ khác (Kế hoạch/Thời khóa biểu): vẫn hiện trong kết quả nhưng đánh dấu "Đã thêm"; bấm vẫn thêm bình thường. */
  addedCodes?: string[];
  /** Mã -> học kỳ (id) nơi mã đó đã được thêm, nếu biết; dùng để ghi rõ "Đã thêm ở kỳ N · YY-YY" (thay cho nhãn chung). */
  addedInSemester?: Record<string, string>;
  placeholder?: string;
  /** chỉ tìm học phần trong CTĐT này (vd K23406 hoặc K23406E) */
  programId?: string;
  /** chỉ tìm học phần trong các CTĐT này (union) */
  programIds?: string[];
  degree?: string;
  /** học kỳ đang xem: học phần không có lớp mở trong học kỳ này được ghi "Không có lịch" */
  semester?: string;
  /** lớp người dùng có đuôi E (hệ tiếng Anh) */
  isEnglishTrack?: boolean;
  /** công tắc bỏ lọc: hiện cả học phần hệ tiếng Việt */
  showVietnamese?: boolean;
  /** nhãn chương trình hiển thị cho từng môn (vd: Ngành 1, Ngành 2, Cả hai ngành) */
  programLabels?: Record<string, string>;
  /** bản đồ trạng thái bắt buộc theo mã môn (true = Bắt buộc, false = Tự chọn) */
  programRequiredMap?: Record<string, boolean> | Map<string, boolean>;
}

/**
 * Ô tìm kiếm học phần cho Thời khóa biểu:
 * Hỗ trợ lọc theo hệ tiếng Anh (ưu tiên / lọc mã E), gộp 2 ngành, và gắn nhãn chương trình.
 */
export function TimetableModuleSearch({
  onPick,
  exclude = [],
  addedCodes = [],
  addedInSemester,
  placeholder,
  programId,
  programIds,
  degree,
  semester,
  isEnglishTrack = false,
  showVietnamese = false,
  programLabels = {},
  programRequiredMap,
}: TimetableModuleSearchProps) {
  const { t, lang } = useT();
  const listId = useId();
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ code: string; ok: boolean; msg?: string }[]>([]);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const { token } = activeToken(q);
  const batchCodes = useMemo(() => parseCodes(q), [q]);
  const doneCodes = finishedCodes(q);
  const hasExplicitBatchSeparator = /[,.;\r\n]/.test(q);
  const looksLikeModuleCode = (code: string) => /^[A-Z0-9-]+$/.test(code) && /\d/.test(code);
  const hasCodePrefix = doneCodes.length > 0 && doneCodes.every(looksLikeModuleCode);
  const codeEntryMode = batchCodes.length > 0 && (
    hasExplicitBatchSeparator || hasCodePrefix || (batchCodes.length === 1 && looksLikeModuleCode(batchCodes[0]))
  );
  const searchToken = token;
  const dq = useDebounced(searchToken.trim(), 250);
  const pidsKey = programIds ? programIds.join(",") : "";

  // Tự động phân giải trạng thái Bắt buộc / Tự chọn nếu không truyền trực tiếp map
  const profile = useProgramProfile();
  const effectiveProgIds = useMemo(() => {
    if (programRequiredMap) return [];
    if (programIds?.length) return programIds;
    if (programId) return [programId];
    return profile.programIds;
  }, [programRequiredMap, programIds, programId, profile.programIds]);

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

  useEffect(() => () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
  }, []);

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
            size: 20,
            degree,
            program_id: programId || undefined,
            program_ids: programIds && programIds.length > 0 ? programIds : undefined,
          })
        : Promise.resolve({ data: { items: [], total: 0 }, mock: false }),
    [dq, programId, pidsKey, degree],
  );

  const isEnglishModule = (m: ModuleSummary) =>
    m.is_english ?? (m.language_track === "en" ? true : m.code.startsWith("E") && !m.code.startsWith("ECO"));

  let items = rankSuggestions(
    (data?.items ?? []).filter((m) => !exclude.includes(m.code)),
    searchToken,
    doneCodes,
  );

  // Quy tắc lọc / ưu tiên cho hệ tiếng Anh (mã lớp có đuôi E)
  if (isEnglishTrack) {
    if (!showVietnamese) {
      // Chỉ hiện học phần mã E (hệ tiếng Anh)
      items = items.filter(isEnglishModule);
    } else {
      // Ưu tiên học phần mã E lên đầu, sau đó đến các môn khác
      items = [...items].sort((a, b) => {
        const aIsE = isEnglishModule(a) ? 1 : 0;
        const bIsE = isEnglishModule(b) ? 1 : 0;
        return bIsE - aIsE;
      });
    }
  }

  const exchangeActive = useExchangeViewActive();
  const exchangeStats = useExchangeStats(items.map((m) => m.code), exchangeActive);

  const addBatch = async () => {
    if (!codeEntryMode || busy) return;
    setBusy(true);
    const rows: { code: string; ok: boolean; msg?: string }[] = [];
    const handled = new Set(exclude.map((code) => code.toUpperCase()));

    for (const code of batchCodes) {
      if (handled.has(code)) {
        rows.push({ code, ok: true });
        continue;
      }
      try {
        const result = await api.modules({
          q: code,
          size: 20,
          degree,
          program_id: programId || undefined,
          program_ids: programIds && programIds.length > 0 ? programIds : undefined,
        });
        const exact = result.data?.items.find((item) => item.code.toUpperCase() === code);
        if (!exact || (isEnglishTrack && !showVietnamese && !isEnglishModule(exact))) {
          rows.push({ code, ok: false, msg: t("gpa.add.notFound") });
          continue;
        }
        onPick(exact);
        handled.add(code);
        rows.push({ code, ok: true, msg: moduleName(exact, lang) });
      } catch {
        rows.push({ code, ok: false, msg: t("gpa.add.loadError") });
      }
    }

    setReport(rows);
    setQ(rows.filter((row) => !row.ok).map((row) => row.code).join(", "));
    setBusy(false);
  };

  /** Enter: thêm luôn — mã/lô mã đang gõ (chế độ nhập mã) hoặc gợi ý khớp nhất (gõ tên tự do). */
  const addCurrent = async () => {
    if (busy || !q.trim()) return;
    if (codeEntryMode) {
      await addBatch();
      return;
    }
    if (items.length > 0) {
      onPick(items[0]);
      setQ("");
      setReport([]);
    }
  };

  const listOpen = !!(focus && searchToken.trim());
  useMaxVisibleItems(listRef, listOpen);

  return (
    <div className="space-y-2">
      <div className="relative h-12">
        <div className={focus ? "absolute inset-x-0 top-0 z-40" : "relative"}>
          <textarea
            rows={1}
            wrap="off"
            className={`input h-12 min-h-0 overflow-auto py-3 ${focus ? "resize-y shadow-lg" : "resize-none"}`}
            value={q}
            disabled={busy}
            placeholder={placeholder ?? t("tt.addModulePlaceholder")}
            onChange={(e) => {
              setQ(e.target.value);
              setReport([]);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
              e.preventDefault();
              void addCurrent();
            }}
            onFocus={() => {
              if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
              setFocus(true);
            }}
            onBlur={(event) => {
              const field = event.currentTarget;
              blurTimerRef.current = setTimeout(() => {
                field.style.height = "";
                setFocus(false);
              }, 200);
            }}
            aria-label={t("tt.addLabel")}
            role="combobox"
            aria-controls={listId}
            aria-expanded={!!(focus && searchToken.trim())}
            aria-autocomplete="list"
          />
          {listOpen && (
            <ul
              ref={listRef}
              id={listId}
              className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
              role="listbox"
            >
            {loading && <li className="px-3 py-2 text-sm text-slate-500"><Loading compact /></li>}
            {!loading && items.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">{t("mod.facetNone")}</li>}
            {items.map((m) => {
              const open = (m.open_semesters ?? []).filter((o) => o.classes > 0);
              const noSchedule = semester ? !open.some((o) => o.semester === semester) : open.length === 0;
              const progLabel = programLabels[m.code];
              const req = getRequired(m.code);
              const added = addedCodes.includes(m.code);
              const addedSemId = addedInSemester?.[m.code];
              const addedSlot = addedSemId ? parseSemesterId(addedSemId) : null;
              const addedLabel = addedSlot
                ? t("mod.addedInSemester", { n: addedSlot.term, y: addedSlot.year.split("-").map((yy) => yy.slice(-2)).join("-") })
                : null;

              return (
                <li key={m.code} role="option" aria-selected={false}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-brand-50 dark:hover:bg-slate-800 min-h-[38px]"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      // Bấm vào gợi ý chỉ điền mã vào ô, không thêm ngay — người dùng ấn Enter / nút Thêm để xác nhận.
                      setQ(replaceActiveToken(q, m.code));
                      setReport([]);
                    }}
                  >
                    <span className="flex flex-wrap items-center gap-x-2 min-w-0 flex-1">
                      <span className="font-mono font-semibold">{m.code}</span>
                      <span>{moduleName(m, lang)}</span>
                      <ExchangeStatBadge stat={exchangeStats[m.code]} />
                      <RequiredBadge required={req} lang={lang} />
                      {progLabel && (
                        <span className="chip bg-sky-100 font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                          {progLabel}
                        </span>
                      )}
                      {m.is_english && !isEnglishCode(m.code) && <EnBadge />}
                    </span>
                    <span className="flex shrink-0 items-center justify-end gap-2 text-slate-500 whitespace-nowrap">
                      {noSchedule && <NoScheduleBadge lang={lang} />}
                      <span>
                        {creditsLine({ credits: m.credits, finalAssessment: m.final_assessment || getCachedFinalAssessmentKind(m.code) }, lang)}
                      </span>
                      {addedLabel ? (
                        <span className="inline-flex items-center gap-1 rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                          <Check className="size-3" aria-hidden="true" /> {addedLabel}
                        </span>
                      ) : added && (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          <Check className="size-3" aria-hidden="true" /> {t("mod.alreadyAdded")}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
            </ul>
          )}
        </div>
      </div>
      {codeEntryMode && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-900/60">
          <span className="text-xs text-slate-500">{t("gpa.add.desc")}</span>
          <button type="button" className="btn-primary shrink-0" disabled={busy} onClick={() => void addBatch()}>
            {busy ? t("gpa.add.adding") : `${t("gpa.add.submit")} (${batchCodes.length})`}
          </button>
        </div>
      )}
      {/* Chỉ hiện dòng báo LỖI (không tìm thấy mã…) — việc thêm thành công đã thấy ngay qua danh sách môn, không cần dòng "✓" riêng. */}
      {report.some((row) => !row.ok) && (
        <ul className="space-y-1 text-xs" aria-live="polite">
          {report.filter((row) => !row.ok).map((row) => (
            <li key={row.code} className="text-red-600 dark:text-red-400">
              ✗ <span className="font-mono font-bold">{row.code}</span>{row.msg ? ` — ${row.msg}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

