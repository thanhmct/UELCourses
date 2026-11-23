"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { ErrorBox, Loading } from "./ui";
import { RelationshipBranches } from "./RelationshipBranch";
import { useT } from "@/i18n";

const FULL_TREE_DEPTH = 30; // Maximum depth supported by the tree endpoint.

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
          <select className="input w-auto py-1 text-xs" aria-label={t("tree.view")} value={view}
            onChange={(event) => setView(event.target.value === "full" ? "full" : "direct")}>
            <option value="direct">{t("tree.direct")}</option>
            <option value="full">{t("tree.full")}</option>
          </select>
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
