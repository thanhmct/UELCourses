"use client";
import { useRef, useState } from "react";
import { useMaxVisibleItems } from "@/lib/useMaxVisibleItems";
import { ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { ErrorBox, Loading } from "./ui";
import { RelationshipBranches } from "./RelationshipBranch";
import { useT } from "@/i18n";

const FULL_TREE_DEPTH = 30; // Maximum depth supported by the tree endpoint.

/** Rounded dropdown for the tree view mode (a native select cannot be rounded). */
function ViewDropdown<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  useMaxVisibleItems(listRef, open);
  const current = options.find((option) => option.value === value);

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 min-w-[15rem] items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm hover:border-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      >
        <span>{current?.label}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <ul
          ref={listRef}
          role="listbox"
          aria-label={label}
          className="absolute right-0 z-20 mt-1.5 min-w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <li key={option.value} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`block w-full whitespace-nowrap px-4 py-2 text-left text-sm font-medium ${
                    selected
                      ? "brand-fill text-white"
                      : "text-slate-800 hover:bg-brand-50 dark:text-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Two-sided relation tree: what this module requires (left) and what it unlocks (right). */
export function PrerequisiteTree({ code, programId }: { code: string; programId?: string }) {
  const { t } = useT();
  const [vertical, setVertical] = useState(false);
  const [view, setView] = useState<"direct" | "full">("direct");
  const depth = view === "full" ? FULL_TREE_DEPTH : 1;
  const before = useApi(() => api.moduleTree(code, { program_id: programId, direction: "prereq", depth }), [code, programId, depth]);
  const after = useApi(() => api.moduleTree(code, { program_id: programId, direction: "unlocks", depth }), [code, programId, depth]);
  const beforeNodes = before.data?.children ?? [];
  const afterNodes = after.data?.children ?? [];

  return (
    <section className="space-y-3" aria-label={`${t("det.relations")} ${code}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
        <h3 className="font-semibold">{t("det.relations")}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <ViewDropdown
            label={t("tree.view")}
            value={view}
            options={[
              { value: "direct", label: t("tree.direct") },
              { value: "full", label: t("tree.full") },
            ]}
            onChange={setView}
          />
          <button type="button" className="btn-outline h-9 px-3 py-0 text-sm font-semibold" aria-pressed={vertical} onClick={() => setVertical(!vertical)}>
            {vertical ? t("tree.horizontal") : t("tree.vertical")}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500" aria-label={t("tree.legend")}>
        <span className="flex items-center gap-2"><i className="w-7 border-t-2 border-emerald-600" />{t("tree.legendPrereq")}</span>
        <span className="flex items-center gap-2"><i className="w-7 border-t-2 border-dashed border-amber-600" />{t("tree.legendPrevious")}</span>
        <span className="flex items-center gap-2"><i className="w-7 border-t-2 border-dotted border-sky-600" />{t("tree.legendCoreq")}</span>
      </div>
      {before.error || after.error ? (
        <ErrorBox>{t(before.offline || after.offline ? "api.connectionError" : "tree.error")}</ErrorBox>
      ) : before.loading || after.loading ? (
        <Loading />
      ) : (
        <div
          className={`relation-viewport overflow-auto rounded-md border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-950 ${vertical ? "relation-vertical" : ""}`}
          tabIndex={0}
          role="region"
          aria-label={t("tree.region")}
        >
          <div className="relation-layout">
            <div className="relation-side relation-requires">
              <p className="relation-caption">{t("tree.before")}</p>
              {beforeNodes.length > 0 ? <div className="relation-before"><RelationshipBranches nodes={beforeNodes} label={t("tree.before")} remainingDepth={depth} seen={[code]} roots /></div> : <p className="relation-empty">{t("tree.noBefore")}</p>}
            </div>
            <div className="relation-current">
              <strong className="font-mono text-base">{code}</strong>
            </div>
            <div className="relation-side relation-next">
              <p className="relation-caption">{t("tree.after")}</p>
              {afterNodes.length > 0 ? <RelationshipBranches nodes={afterNodes} label={t("tree.after")} remainingDepth={depth} seen={[code]} roots /> : <p className="relation-empty">{t("tree.noAfter")}</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
