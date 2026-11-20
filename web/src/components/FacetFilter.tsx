"use client";
import { useMemo, useState } from "react";
import type { FacetCount } from "@/lib/types";
import { useT } from "@/i18n";

interface Props {
  /** heading shown above the list (also the accessible name) */
  title: string;
  items: FacetCount[];
  /** selected value; "" = all */
  value: string;
  onChange: (v: string) => void;
  /** show a search box above the list (use for long lists such as faculties) */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** turn a raw facet value into a label */
  labelOf?: (value: string) => string;
  /** sort by count (default) or keep API order */
  sort?: "count" | "none";
  /** total for the "all" row */
  total?: number;
  /** hide rows whose count is 0 */
  hideEmpty?: boolean;
}

/**
 * Radio-style facet list with fixed height, scroll, optional search and a count per row.
 * The heading sits above the scroll box, so long lists never overlap the next filter.
 */
export function FacetFilter({ title, items, value, onChange, searchable, searchPlaceholder, labelOf, sort = "count", total, hideEmpty = true }: Props) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const name = useMemo(() => `facet-${title.replace(/\s+/g, "-")}`, [title]);
  const rows = useMemo(() => {
    let list = items.filter((i) => i.value !== "" && (!hideEmpty || i.count > 0));
    if (sort === "count") list = [...list].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((i) => (labelOf ? labelOf(i.value) : i.value).toLowerCase().includes(q));
    return list;
  }, [items, query, sort, labelOf, hideEmpty]);

  return (
    <fieldset className="min-w-0">
      <legend className="label mb-1">{title}</legend>
      {searchable && (
        <input
          type="search"
          className="input mb-1 py-1 text-xs"
          placeholder={searchPlaceholder ?? t("common.clear")}
          aria-label={searchPlaceholder ?? title}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      <div className="max-h-56 overflow-y-auto rounded border border-slate-200 p-1 dark:border-slate-700" role="radiogroup" aria-label={title}>
        <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
          <input type="radio" name={name} className="accent-brand-600" checked={value === ""} onChange={() => onChange("")} />
          <span className="flex-1">{t("common.all")}</span>
          {typeof total === "number" && <span className="text-xs text-slate-500">{total.toLocaleString("vi-VN")}</span>}
        </label>
        {rows.map((r) => (
          <label key={r.value} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
            <input type="radio" name={name} className="accent-brand-600" checked={value === r.value} onChange={() => onChange(r.value)} />
            <span className="min-w-0 flex-1 break-words">{labelOf ? labelOf(r.value) : r.value}</span>
            <span className="shrink-0 text-xs tabular-nums text-slate-500">{r.count.toLocaleString("vi-VN")}</span>
          </label>
        ))}
        {rows.length === 0 && <p className="px-1.5 py-2 text-xs text-slate-500">{t("mod.facetNone")}</p>}
      </div>
    </fieldset>
  );
}

/** Checkbox row used for boolean facets (EN, CNTN, has syllabus). */
export function CheckFacet({ label, count, checked, onChange }: { label: string; count?: number; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-brand-600" />
      <span className="flex-1">{label}</span>
      {typeof count === "number" && <span className="text-xs tabular-nums text-slate-500">{count.toLocaleString("vi-VN")}</span>}
    </label>
  );
}
