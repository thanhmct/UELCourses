"use client";
import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { FacetCount } from "@/lib/types";
import { useT } from "@/i18n";
import { matches } from "@/lib/text";
import { useBackToClose } from "@/lib/useBackToClose";

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
  sort?: "count" | "none" | "alpha";
  /** on phones the list starts collapsed behind a chevron (desktop always shows it) */
  collapsibleOnMobile?: boolean;
  /** custom label for the mobile expand button when collapsed (defaults to common.expand) */
  expandLabel?: string;
  /** custom label for the mobile collapse button when expanded (defaults to common.collapse) */
  collapseLabel?: string;
  /** total for the "all" row */
  total?: number;
  /** hide rows whose count is 0 */
  hideEmpty?: boolean;
  /** note displayed next to title e.g. global count indicator */
  countNote?: string;
  /**
   * Dropdown on every screen size. Closed: heading + button with expandLabel.
   * Open: heading hidden (kept for screen readers), button shows the title + chevron,
   * no search box.
   */
  headerInToggle?: boolean;
  /** Short lists: show every row, no inner scrollbar. */
  noScroll?: boolean;
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
    collapsibleOnMobile,
    expandLabel,
    collapseLabel,
    headerInToggle,
    noScroll,
  } = props;
  const { t } = useT();
  const [open, setOpen] = useState(false);
  // headerInToggle: the list is behind the toggle box on every screen size.
  const collapsed = headerInToggle ? !open : collapsibleOnMobile && !open;

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
    if (sort === "alpha") {
      const label = (v: string) => (labelOf ? labelOf(v) : v);
      list = [...list].sort((a, b) => label(a.value).localeCompare(label(b.value), "vi", { sensitivity: "base" }));
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

  // Trên điện thoại, khi mở ra thì danh sách chiếm toàn màn hình (desk: vẫn là khối bình thường).
  const fullscreen = !!collapsibleOnMobile && open;
  const selectedCount = props.multiple ? props.values.length : props.value ? 1 : 0;

  // Bấm nút quay lại của điện thoại thì đóng bộ lọc này, không rời khỏi trang.
  useBackToClose(fullscreen, () => setOpen(false));

  return (
    <fieldset
      className={`min-w-0 ${
        fullscreen
          ? "fixed inset-0 z-[60] flex flex-col bg-white p-3 dark:bg-slate-900 desk:static desk:z-auto desk:block desk:bg-transparent desk:p-0 dark:desk:bg-transparent"
          : ""
      }`}
    >
      <legend
        className={`label mb-1 flex w-full items-baseline justify-between gap-1 ${fullscreen ? "desk:flex" : ""} ${
          headerInToggle && open ? "sr-only" : ""
        }`}
      >
        <span>{title}</span>
        {countNote && (
          <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500" title={countNote}>
            {countNote}
          </span>
        )}
      </legend>
      {(collapsibleOnMobile || headerInToggle) && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={`${headerInToggle ? "" : "desk:hidden"} mb-2 flex w-full items-center justify-between gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300`}
        >
          <span className="truncate">
            {open
              ? headerInToggle
                ? title
                : (collapseLabel ?? t("common.collapse"))
              : (expandLabel ?? t("common.expand"))}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {!open && selectedCount > 0 && (
              <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-semibold text-white">{selectedCount}</span>
            )}
            <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
          </span>
        </button>
      )}
      <div className={`${collapsed ? (headerInToggle ? "hidden" : "hidden desk:block") : ""} ${fullscreen ? "flex min-h-0 flex-1 flex-col" : ""}`}>
      {searchable && !headerInToggle && (
        <input
          type="search"
          className="input mb-2 !px-3 py-1.5 text-sm"
          placeholder={searchPlaceholder ?? t("common.clear")}
          aria-label={searchPlaceholder ?? title}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      <div
        className={`overflow-y-auto border-slate-200 dark:border-slate-700 ${
          fullscreen
            ? // pb-24: chừa chỗ cho nút tròn đóng bộ lọc (fixed, góc dưới phải) để không che ô chọn cuối danh sách
              `min-h-0 flex-1 pb-24 ${noScroll ? "" : "desk:max-h-56"} desk:rounded desk:border desk:p-1`
            : `${noScroll ? "" : "max-h-56"} rounded border p-1`
        }`}
        role={props.multiple ? "group" : "radiogroup"}
        aria-label={title}
      >
        {props.multiple ? (
          <>
            <label className={`flex cursor-pointer items-center gap-2 rounded text-sm hover:bg-slate-50 dark:hover:bg-slate-800 ${
              fullscreen ? "border-b border-slate-100 px-3 py-3 text-[15px] dark:border-slate-800 desk:border-0 desk:px-1.5 desk:py-1 desk:text-sm" : "px-1.5 py-1"
            }`}>
              <input
                type="checkbox"
                name={`${name}-all`}
                className={`h-4 w-4 rounded accent-brand-600 ${fullscreen ? "order-last desk:order-none" : ""}`}
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
                  className={`flex cursor-pointer items-center gap-2 rounded text-sm hover:bg-slate-50 dark:hover:bg-slate-800 ${
                    fullscreen ? "border-b border-slate-100 px-3 py-3 text-[15px] dark:border-slate-800 desk:border-0 desk:px-1.5 desk:py-1 desk:text-sm" : "px-1.5 py-1"
                  }`}
                >
                  <input
                    type="checkbox"
                    name={name}
                    className={`h-4 w-4 rounded accent-brand-600 ${fullscreen ? "order-last desk:order-none" : ""}`}
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
