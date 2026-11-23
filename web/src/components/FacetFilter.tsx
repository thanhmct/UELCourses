"use client";
import { useMemo, useState } from "react";
import type { FacetCount } from "@/lib/types";
import { useT } from "@/i18n";
import { matches } from "@/lib/text";

interface BaseProps {
  /** heading shown above the list (also the accessible name) */
  title: string;
  items: FacetCount[];
  /** show a search box above the list (use for long lists such as faculties) */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** controlled search query (optional) */
  searchQuery?: string;
  onSearchQueryChange?: (q: string) => void;
  /** turn a raw facet value into a label */
  labelOf?: (value: string) => string;
  /** sort by count (default) or keep API order */
  sort?: "count" | "none";
  /** total for the "all" row */
  total?: number;
  /** hide rows whose count is 0 */
  hideEmpty?: boolean;
  /** note displayed next to title e.g. global count indicator */
  countNote?: string;
}

export type SingleFacetProps = BaseProps & {
  multiple?: false;
  value: string;
  onChange: (v: string) => void;
  values?: never;
  onValuesChange?: never;
};

export type MultiFacetProps = BaseProps & {
  multiple: true;
  values: string[];
  onValuesChange: (v: string[]) => void;
  value?: never;
  onChange?: never;
};

export type FacetFilterProps = SingleFacetProps | MultiFacetProps;

/**
 * Facet list with fixed height, scroll, optional search and a count per row.
 * Supports single (radio) and multiple (checkbox) modes.
 * The heading sits above the scroll box, so long lists never overlap the next filter.
 */
export function FacetFilter(props: FacetFilterProps) {
  const {
    title,
    items,
    searchable,
    searchPlaceholder,
    searchQuery,
    onSearchQueryChange,
    labelOf,
    sort = "count",
    total,
    hideEmpty = true,
    countNote,
  } = props;
  const { t } = useT();

  const [internalQuery, setInternalQuery] = useState("");
  const query = searchQuery !== undefined ? searchQuery : internalQuery;
  const setQuery = onSearchQueryChange ?? setInternalQuery;

  const name = useMemo(() => `facet-${title.replace(/\s+/g, "-")}`, [title]);

  const rows = useMemo(() => {
    const isSelected = (val: string) =>
      props.multiple ? props.values.includes(val) : props.value === val && val !== "";

    let list = items.filter((i) => i.value !== "" && (!hideEmpty || i.count > 0 || isSelected(i.value)));

    // Giữ các giá trị đang chọn ngay cả khi đếm = 0 hoặc không có trong danh sách
    const present = new Set(list.map((i) => i.value));
    const selectedList = props.multiple
      ? props.values
      : props.value && props.value !== ""
        ? [props.value]
        : [];
    for (const val of selectedList) {
      if (val && !present.has(val)) {
        list.push({ value: val, count: 0 });
      }
    }

    if (sort === "count") {
      list = [...list].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    }
    const q = query.trim();
    if (!q) return list;

    if (props.multiple) {
      const selectedSet = new Set(props.values);
      // Selected options remain accessible even when query changes
      const selected = list.filter((i) => selectedSet.has(i.value));
      const unselectedMatches = list.filter(
        (i) =>
          !selectedSet.has(i.value) &&
          (matches(labelOf ? labelOf(i.value) : i.value, q) || matches(i.value, q)),
      );
      return [...selected, ...unselectedMatches];
    } else {
      const selected = list.filter((i) => props.value === i.value);
      const unselectedMatches = list.filter(
        (i) =>
          props.value !== i.value &&
          (matches(labelOf ? labelOf(i.value) : i.value, q) || matches(i.value, q)),
      );
      return [...selected, ...unselectedMatches];
    }
  }, [items, query, sort, labelOf, hideEmpty, props.multiple, props.multiple ? props.values : props.value]);

  return (
    <fieldset className="min-w-0">
      <legend className="label mb-1 flex items-baseline justify-between gap-1">
        <span>{title}</span>
        {countNote && (
          <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500" title={countNote}>
            {countNote}
          </span>
        )}
      </legend>
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
      <div
        className="max-h-56 overflow-y-auto rounded border border-slate-200 p-1 dark:border-slate-700"
        role={props.multiple ? "group" : "radiogroup"}
        aria-label={title}
      >
        {props.multiple ? (
          <>
            <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
              <input
                type="checkbox"
                name={`${name}-all`}
                className="h-4 w-4 rounded accent-brand-600"
                checked={props.values.length === 0}
                onChange={() => props.onValuesChange([])}
              />
              <span className="flex-1 font-medium">{t("common.all")}</span>
              {typeof total === "number" && (
                <span className="text-xs text-slate-500">{total.toLocaleString("vi-VN")}</span>
              )}
            </label>
            {rows.map((r) => {
              const isChecked = props.values.includes(r.value);
              const label = labelOf ? labelOf(r.value) : r.value;
              return (
                <label
                  key={r.value}
                  className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <input
                    type="checkbox"
                    name={name}
                    className="h-4 w-4 rounded accent-brand-600"
                    checked={isChecked}
                    onChange={() => {
                      if (isChecked) {
                        props.onValuesChange(props.values.filter((v) => v !== r.value));
                      } else {
                        props.onValuesChange([...props.values, r.value]);
                      }
                    }}
                  />
                  <span className="min-w-0 flex-1 break-words">{label}</span>
                  <span className="shrink-0 text-xs tabular-nums text-slate-500">
                    {r.count.toLocaleString("vi-VN")}
                  </span>
                </label>
              );
            })}
          </>
        ) : (
          <>
            <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
              <input
                type="radio"
                name={name}
                className="accent-brand-600"
                checked={props.value === ""}
                onChange={() => props.onChange("")}
              />
              <span className="flex-1">{t("common.all")}</span>
              {typeof total === "number" && (
                <span className="text-xs text-slate-500">{total.toLocaleString("vi-VN")}</span>
              )}
            </label>
            {rows.map((r) => (
              <label
                key={r.value}
                className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <input
                  type="radio"
                  name={name}
                  className="accent-brand-600"
                  checked={props.value === r.value}
                  onChange={() => props.onChange(r.value)}
                />
                <span className="min-w-0 flex-1 break-words">{labelOf ? labelOf(r.value) : r.value}</span>
                <span className="shrink-0 text-xs tabular-nums text-slate-500">
                  {r.count.toLocaleString("vi-VN")}
                </span>
              </label>
            ))}
          </>
        )}
        {rows.length === 0 && (
          <p className="px-1.5 py-2 text-xs text-slate-500">{t("mod.facetNone")}</p>
        )}
      </div>
    </fieldset>
  );
}

/** Checkbox row used for boolean facets (EN, CNTN, has syllabus). */
export function CheckFacet({
  label,
  count,
  checked,
  onChange,
}: {
  label: string;
  count?: number;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded accent-brand-600"
      />
      <span className="flex-1">{label}</span>
      {typeof count === "number" && (
        <span className="text-xs tabular-nums text-slate-500">{count.toLocaleString("vi-VN")}</span>
      )}
    </label>
  );
}
