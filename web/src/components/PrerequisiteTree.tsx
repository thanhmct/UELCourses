"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import type { ModuleTreeNode } from "@/lib/types";
import { ErrorBox, Loading } from "./ui";
import { RelationshipBranch } from "./RelationshipBranch";
import { useT } from "@/i18n";

/** Maximum depth requested from the API; "Tối đa" uses it so the whole tree is shown by default. */
export const MAX_DEPTH = 8;

/** Two-sided relation tree: what this module requires (left) and what it unlocks (right). */
export function PrerequisiteTree({ code, currentName, programId }: { code: string; currentName?: string; programId?: string }) {
  const { t } = useT();
  const [depth, setDepth] = useState(MAX_DEPTH);
  const [vertical, setVertical] = useState(false);
  const before = useApi(() => api.moduleTree(code, { program_id: programId, direction: "prereq", depth }), [code, programId, depth]);
  const after = useApi(() => api.moduleTree(code, { program_id: programId, direction: "unlocks", depth }), [code, programId, depth]);
  const hasBefore = !!before.data?.children?.length;
  const hasAfter = !!after.data?.children?.length;

  const branches = (data: ModuleTreeNode | null, label: string) => (
    <ul className="relation-children relation-roots" aria-label={label}>
      {(data?.children ?? []).map((node, i) => (
        <RelationshipBranch key={`${code}-${node.code}-${i}`} node={node} seen={[code]} />
      ))}
    </ul>
  );

  return (
    <section className="space-y-3" aria-label={`${t("det.relations")} ${code}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
        <h3 className="font-semibold">{t("det.relations")}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-slate-500">
            {t("tree.depth")}
            <select className="input !w-auto py-1" value={depth} onChange={(e) => setDepth(Number(e.target.value))}>
              {Array.from({ length: MAX_DEPTH - 1 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{t("tree.depthN", { n })}</option>
              ))}
              <option value={MAX_DEPTH}>{t("tree.depthMax")}</option>
            </select>
          </label>
          <button type="button" className="btn-outline py-1 text-xs" aria-pressed={vertical} onClick={() => setVertical(!vertical)}>
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
        <ErrorBox>{t("tree.error")}</ErrorBox>
      ) : before.loading || after.loading ? (
        <Loading text={t("tree.loading")} />
      ) : (
        <div
          className={`relation-viewport overflow-x-auto rounded-md border border-slate-200 bg-white px-5 py-6 dark:border-slate-800 dark:bg-slate-950 ${vertical ? "relation-vertical" : ""}`}
          tabIndex={0}
          role="region"
          aria-label={t("tree.region")}
        >
          <div className="relation-layout">
            <div className="relation-side">
              <p className="relation-caption">{t("tree.before")}</p>
              {hasBefore ? <div className="relation-before">{branches(before.data, t("tree.before"))}</div> : <p className="text-xs text-slate-500">{t("tree.noBefore")}</p>}
            </div>
            <div className="relation-current">
              <strong className="font-mono text-base">{code}</strong>
              <span className="text-xs">{currentName || code}</span>
              <span className="mt-1 text-[10px] uppercase tracking-wide">{t("tree.current")}</span>
            </div>
            <div className="relation-side">
              <p className="relation-caption">{t("tree.after")}</p>
              {hasAfter ? branches(after.data, t("tree.after")) : <p className="text-xs text-slate-500">{t("tree.noAfter")}</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
