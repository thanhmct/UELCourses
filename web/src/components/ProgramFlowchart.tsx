"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ProgramGraph, ProgramGraphNode } from "@/lib/types";
import { useT } from "@/i18n";
import { formatPlannerTerm, formatPlannerTermStats, moduleName } from "@/i18n/names";
import { relatedChain } from "@/lib/programs";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
const UNPLACED = ""; // cột "Chưa xếp kỳ"

/** Nhãn kỳ lấy nguyên văn từ dữ liệu, vd "HK01 năm học 2024-2025". Sắp theo năm rồi theo số HK. */
function termOrder(label: string): number {
  const m = label.match(/HK\s*0*(\d+).*?(\d{4})/i);
  return m ? Number(m[2]) * 10 + Number(m[1]) : 1e9;
}

/** Ghi chú ngắn về môn tiên quyết/học trước, lấy từ cạnh của đồ thị. */
function prereqMap(graph: ProgramGraph): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (e.type !== "prereq" && e.type !== "previous") continue;
    m.set(e.target, [...(m.get(e.target) ?? []), e.source]);
  }
  return m;
}

function ModuleCard({
  node,
  prereqs,
  selected,
  inChain,
  dimmed,
  onClick,
  id,
}: {
  node: ProgramGraphNode;
  prereqs: string[];
  selected: boolean;
  inChain: boolean;
  dimmed: boolean;
  onClick: () => void;
  id?: string;
}) {
  const { t, lang } = useT();
  return (
    <button
      type="button"
      id={id}
      onClick={onClick}
      aria-pressed={selected}
      className={`w-full rounded-md border p-2.5 text-left transition-all ${
        selected
          ? "brand-selected border-brand-focus bg-brand-50 ring-2 ring-brand-focus dark:bg-brand-900"
          : inChain
          ? "border-amber-500 bg-amber-50 dark:bg-amber-950/40"
          : "border-slate-200 bg-white hover:border-brand-400 dark:border-slate-700 dark:bg-slate-900"
      } ${dimmed ? "opacity-30" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-xs font-bold text-brand-700 dark:text-brand-300">{node.code}</span>
        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {t("common.credits", { n: node.credits })}
        </span>
      </div>
      <div className="mt-1 line-clamp-2 text-[13px] font-medium leading-snug text-slate-800 dark:text-slate-100">{moduleName(node, lang)}</div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            node.required
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300"
          }`}
        >
          {node.required ? t("pd.required") : t("pd.elective")}
        </span>
        {prereqs.length > 0 && (
          <span className="truncate text-[10px] text-slate-600 dark:text-slate-300" title={t("flow.previousCodes", { codes: prereqs.join(", ") })}>
            {t("flow.previousLabel")} <span className="font-mono">{prereqs.join(", ")}</span>
          </span>
        )}
      </div>
    </button>
  );
}

export function ProgramFlowchart({
  graph,
  selectedCode,
  onSelectModule,
}: {
  graph: ProgramGraph;
  selectedCode?: string;
  onSelectModule?: (code: string) => void;
}) {
  const { t, lang } = useT();
  const [searchQuery, setSearchQuery] = useState("");
  const [blockFilter, setBlockFilter] = useState("all");
  const [zoom, setZoom] = useState(1);
  const columnRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const sems = useApi(() => api.semesters(), []);

  const prereqs = useMemo(() => prereqMap(graph), [graph]);
  const chain = useMemo(() => (selectedCode ? relatedChain(graph, selectedCode) : undefined), [graph, selectedCode]);

  const blocks = useMemo(() => Array.from(new Set(graph.nodes.map((n) => n.block).filter(Boolean) as string[])).sort(), [graph.nodes]);

  const q = searchQuery.trim().toLowerCase();
  const matches = (n: ProgramGraphNode) =>
    (!q || n.code.toLowerCase().includes(q) || n.name.toLowerCase().includes(q)) &&
    (blockFilter === "all" || n.block === blockFilter);

  // Cột kỳ bắt buộc
  const terms = useMemo(() => {
    const set = new Set<string>();
    graph.nodes.forEach((n) => n.required && n.suggested_term && set.add(String(n.suggested_term)));
    return Array.from(set).sort((a, b) => termOrder(a) - termOrder(b) || a.localeCompare(b, "vi"));
  }, [graph.nodes]);

  const columns = useMemo(() => {
    const map = new Map<string, ProgramGraphNode[]>();
    for (const n of graph.nodes) {
      if (!n.required) continue;
      const key = n.suggested_term ? String(n.suggested_term) : UNPLACED;
      map.set(key, [...(map.get(key) ?? []), n]);
    }
    return map;
  }, [graph.nodes]);

  // Môn tự chọn nhóm theo khối kiến thức
  const electiveGroups = useMemo(() => {
    const map = new Map<string, ProgramGraphNode[]>();
    for (const n of graph.nodes) {
      if (n.required) continue;
      const key = n.block || t("common.other");
      map.set(key, [...(map.get(key) ?? []), n]);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "vi"));
  }, [graph.nodes, t]);

  // Kỳ hiện tại tự động: học kỳ đang diễn ra (api.semesters, is_current) ghép với nhãn kỳ của CTĐT.
  // Ví dụ: học kỳ 1 năm học 2026-2027 → nhãn "HK01 năm học 2026-2027".
  const currentTerm = useMemo(() => {
    const cur = sems.data?.find((s) => s.is_current);
    if (!cur) return null;
    const year = String(cur.year).replace("–", "-");
    return terms.find((l) => new RegExp(`HK\\s*0*${Number(cur.term)}\\b`, "i").test(l) && l.includes(year)) ?? null;
  }, [sems.data, terms]);

  // Khi người dùng lọc theo mã/tên: tự cuộn tới kỳ của môn khớp đầu tiên; mặc định cuộn tới kỳ hiện tại
  const firstMatchTerm = useMemo(() => {
    if (!q) return null;
    const hit = graph.nodes.find((n) => n.required && matches(n));
    return hit ? (hit.suggested_term ? String(hit.suggested_term) : UNPLACED) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.nodes, q, blockFilter]);

  useEffect(() => {
    const target = firstMatchTerm ?? currentTerm;
    if (target == null) return;
    columnRefs.current.get(target)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [firstMatchTerm, currentTerm]);

  const hasFilter = q !== "" || blockFilter !== "all";
  const resetFilter = () => {
    setSearchQuery("");
    setBlockFilter("all");
  };

  const clickNode = (code: string) => onSelectModule?.(code);

  return (
    <div className="space-y-3">
      {/* Thanh điều khiển */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            className="input w-48 text-xs sm:w-56"
            placeholder={t("flow.search")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label={t("flow.searchAria")}
          />
          <select className="input max-w-[220px] truncate text-xs" value={blockFilter} onChange={(e) => setBlockFilter(e.target.value)} aria-label={t("flow.filterBlock")}>
            <option value="all">{t("flow.allBlocks", { n: blocks.length })}</option>
            {blocks.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          {hasFilter && (
            <button onClick={resetFilter} className="btn-ghost text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
              {t("flow.reset")}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 text-xs">
          <button type="button" className="btn-outline px-2 py-1" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(1)))} aria-label={t("flow.zoomOut")}>−</button>
          <span className="w-12 text-center tabular-nums text-slate-600 dark:text-slate-300">{Math.round(zoom * 100)}%</span>
          <button type="button" className="btn-outline px-2 py-1" onClick={() => setZoom((z) => Math.min(1.4, +(z + 0.1).toFixed(1)))} aria-label={t("flow.zoomIn")}>+</button>
        </div>
      </div>

      {/* Chip chọn kỳ hiện tại: bấm để nhảy tới kỳ đó */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="mr-1 font-semibold text-slate-600 dark:text-slate-300">{t("flow.termsLabel")}</span>
        {terms.map((term) => (
          <button
            key={term}
            type="button"
            onClick={() => {
              columnRefs.current.get(term)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
            }}
            className={`rounded-full border px-3 py-1 font-semibold ${
              currentTerm === term
                ? "brand-fill border-brand-focus"
                : "border-slate-300 bg-white text-slate-600 hover:border-brand-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            }`}
          >
            {formatPlannerTerm(term, lang)}
          </button>
        ))}
        <span className="ml-auto flex gap-3 text-slate-500">
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-300" /> {t("pd.required")}</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-violet-300" /> {t("pd.elective")}</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm border border-amber-500 bg-amber-100" /> {t("flow.selectedChain")}</span>
        </span>
      </div>

      {/* Các kỳ bắt buộc: mỗi kỳ một cột */}
      <div className="overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-start gap-3" style={{ zoom }}>
          {[...terms, ...(columns.has(UNPLACED) ? [UNPLACED] : [])].map((term) => {
            const nodes = columns.get(term) ?? [];
            const shown = nodes.filter(matches);
            const credits = nodes.reduce((s, n) => s + (n.credits || 0), 0);
            const isCurrent = currentTerm === term;
            return (
              <div
                key={term}
                ref={(el) => {
                  if (el) columnRefs.current.set(term, el);
                }}
                className={`w-[230px] shrink-0 space-y-2 rounded-md p-2 ${
                  isCurrent ? "bg-brand-50/70 ring-1 ring-brand-300 dark:bg-brand-950/30" : ""
                }`}
              >
                <div className="flex items-baseline justify-between border-b border-slate-200 pb-1 dark:border-slate-700">
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {term === UNPLACED ? t("flow.unplaced") : formatPlannerTerm(term, lang)}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {formatPlannerTermStats(nodes.length, credits, lang)}
                  </span>
                </div>
                {shown.length === 0 && <p className="py-4 text-center text-xs text-slate-400">{t("flow.noMatches")}</p>}
                {shown.map((n) => (
                  <ModuleCard
                    key={n.code}
                    id={`mod-${n.code}`}
                    node={n}
                    prereqs={prereqs.get(n.code) ?? []}
                    selected={selectedCode === n.code}
                    inChain={!!chain?.has(n.code) && selectedCode !== n.code}
                    dimmed={!!chain && !chain.has(n.code)}
                    onClick={() => clickNode(n.code)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Môn tự chọn: nhóm theo khối kiến thức */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t("flow.electivesTitle")}</h3>
        {electiveGroups.map(([block, nodes]) => {
          const shown = nodes.filter(matches);
          if (shown.length === 0) return null;
          const credits = nodes.reduce((s, n) => s + (n.credits || 0), 0);
          return (
            <div key={block} className="card space-y-2 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{block}</span>
                <span className="text-[11px] text-slate-500">
                  {formatPlannerTermStats(nodes.length, credits, lang)}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3" style={{ zoom }}>
                {shown.map((n) => (
                  <ModuleCard
                    key={n.code}
                    node={n}
                    prereqs={prereqs.get(n.code) ?? []}
                    selected={selectedCode === n.code}
                    inChain={!!chain?.has(n.code) && selectedCode !== n.code}
                    dimmed={!!chain && !chain.has(n.code)}
                    onClick={() => clickNode(n.code)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
