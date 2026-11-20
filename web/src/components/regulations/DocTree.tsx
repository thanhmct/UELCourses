"use client";
import { useMemo, useState } from "react";
import type { RegulationDoc } from "@/lib/types";
import { effectiveBadge, type EffectiveBadge } from "@/lib/regulations";
import { matches } from "@/lib/text";
import { EffectiveBadgeChip } from "@/components/ui";
import { useT } from "@/i18n";

export interface TreeGroup {
  topic: string;
  levels: { level: string; docs: RegulationDoc[] }[];
}

/** Group docs by topic then issuer level (pure, exported for tests). */
export function groupDocs(docs: RegulationDoc[]): TreeGroup[] {
  const topics = new Map<string, Map<string, RegulationDoc[]>>();
  for (const d of docs) {
    const t = d.topic || "Khác";
    const l = d.issuer_level || "Chưa phân loại";
    if (!topics.has(t)) topics.set(t, new Map());
    const lv = topics.get(t)!;
    lv.set(l, [...(lv.get(l) ?? []), d]);
  }
  return [...topics.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "vi"))
    .map(([topic, lv]) => ({
      topic,
      levels: [...lv.entries()].map(([level, ds]) => ({
        level,
        docs: ds.sort((a, b) => (b.effective_from ?? "").localeCompare(a.effective_from ?? "")),
      })),
    }));
}

type Filter = "all" | "valid" | EffectiveBadge;

export function DocTree({ docs, active, onOpen }: { docs: RegulationDoc[]; active: string | null; onOpen: (id: string) => void }) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const groups = useMemo(() => {
    const list = docs.filter((d) => {
      const b = effectiveBadge(d);
      if (filter === "valid" && !(b === "active" || b === "expiring")) return false;
      if (filter !== "all" && filter !== "valid" && b !== filter) return false;
      return !q || matches(`${d.title} ${d.decision_no} ${d.doc_id}`, q);
    });
    return groupDocs(list);
  }, [docs, q, filter]);

  return (
    <div className="space-y-2 text-sm">
      <input className="input" placeholder={t("dt.search")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("dt.searchAria")} />
      <select className="input" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label={t("dt.status")}>
        <option value="all">{t("dt.all")}</option>
        <option value="valid">{t("dt.valid")}</option>
        <option value="expiring">{t("dt.expiring")}</option>
        <option value="expired">{t("dt.expired")}</option>
        <option value="superseded">{t("dt.superseded")}</option>
        <option value="upcoming">{t("dt.upcoming")}</option>
      </select>
      {groups.length === 0 && <p className="py-4 text-center text-xs text-slate-500">{t("dt.none")}</p>}
      <ul className="space-y-2" role="tree" aria-label={t("dt.aria")}>
        {groups.map((g) => (
          <li key={g.topic} role="treeitem" aria-expanded={!collapsed[g.topic]} aria-selected={false}>
            <button className="flex w-full items-center gap-1 text-left text-xs font-semibold uppercase tracking-wide text-slate-500" onClick={() => setCollapsed((c) => ({ ...c, [g.topic]: !c[g.topic] }))}>
              <span className="w-3">{collapsed[g.topic] ? "▸" : "▾"}</span>{g.topic}
            </button>
            {!collapsed[g.topic] && (
              <ul className="ml-2 mt-1 space-y-1 border-l border-slate-200 pl-2 dark:border-slate-700" role="group">
                {g.levels.map((lv) => (
                  <li key={lv.level}>
                    <p className="text-[11px] text-slate-400">{lv.level}</p>
                    <ul className="space-y-0.5">
                      {lv.docs.map((d) => {
                        const b = effectiveBadge(d);
                        return (
                          <li key={d.doc_id}>
                            <button
                              onClick={() => onOpen(d.doc_id)}
                              className={`w-full rounded-md px-2 py-1 text-left hover:bg-slate-100 dark:hover:bg-slate-800 ${active === d.doc_id ? "bg-brand-50 font-semibold text-brand-800 dark:bg-brand-900/40 dark:text-brand-100" : ""}`}
                            >
                              <span className="block truncate">{d.decision_no}</span>
                              <span className="block truncate text-[11px] font-normal text-slate-500">{d.title}</span>
                              {b !== "active" && <span className="mt-0.5 block"><EffectiveBadgeChip badge={b} /></span>}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
