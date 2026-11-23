"use client";
import Link from "next/link";
import { useState } from "react";
import type { ModuleTreeNode } from "@/lib/types";
import { useT } from "@/i18n";
import { moduleName } from "@/i18n/names";
import { ChevronDown, ChevronUp } from "lucide-react";

const BRANCHES_PER_PAGE = 4;

export function RelationshipBranches({ nodes, label, remainingDepth, seen, roots = false }: {
  nodes: ModuleTreeNode[];
  label: string;
  remainingDepth: number;
  seen: string[];
  roots?: boolean;
}) {
  const { t } = useT();
  const [page, setPage] = useState(0);
  const lastPage = Math.max(0, Math.ceil(nodes.length / BRANCHES_PER_PAGE) - 1);
  const currentPage = Math.min(page, lastPage);
  const start = currentPage * BRANCHES_PER_PAGE;
  const end = Math.min(start + BRANCHES_PER_PAGE, nodes.length);

  return (
    <div className="relation-branch-group">
      <ul className={`relation-children${roots ? " relation-roots" : ""}`} aria-label={label}>
        {nodes.slice(start, end).map((node, i) => (
          <RelationshipBranch key={`${node.code}-${node.type}-${start + i}`} node={node} remainingDepth={remainingDepth} seen={seen} />
        ))}
      </ul>
      {lastPage > 0 && (
        <div className="relation-pager" role="group" aria-label={label} dir="ltr">
          <button type="button" aria-label={t("tree.prevPage")} aria-disabled={currentPage === 0} onClick={() => setPage(Math.max(0, currentPage - 1))}>‹</button>
          <span aria-live="polite">{start + 1}–{end} / {nodes.length}</span>
          <button type="button" aria-label={t("tree.nextPage")} aria-disabled={currentPage === lastPage} onClick={() => setPage(Math.min(lastPage, currentPage + 1))}>›</button>
        </div>
      )}
    </div>
  );
}

/** One node of the relation tree; "and"/"or" nodes are groups, other nodes are modules. */
export function RelationshipBranch({ node, remainingDepth = Infinity, seen = [] }: { node: ModuleTreeNode; remainingDepth?: number; seen?: string[] }) {
  const { t, lang } = useT();
  const [collapsed, setCollapsed] = useState(false);
  const typeLabel: Record<string, string> = {
    prereq: t("tree.prereq"),
    previous: t("tree.previous"),
    coreq: t("tree.coreq"),
    and: t("tree.and"),
    or: t("tree.or"),
    equivalent: t("tree.equivalent"),
  };
  const cycle = !!node.code && seen.includes(node.code);
  const children = cycle || remainingDepth <= 1 ? [] : node.children ?? [];
  const group = node.type === "and" || node.type === "or";
  const label = node.code || typeLabel[node.type];
  return (
    <li className={`relation-branch relation-${node.type}`}>
      <div className={`relation-node ${group ? "relation-group" : ""}`}>
        {group ? (
          <strong>{typeLabel[node.type]}</strong>
        ) : (
          <>
            <Link className="font-mono font-bold text-orange-950 hover:underline dark:text-orange-100"
              title={[node.name && moduleName(node, lang), typeLabel[node.type]].filter(Boolean).join(" · ")}
              href={`/modules/${encodeURIComponent(node.code)}`}>{node.code}</Link>
          </>
        )}
        {cycle && <span className="sr-only">{t("tree.cycle")}</span>}
        {children.length > 0 && (
          <button
            type="button"
            className="rounded p-1 text-orange-950 hover:bg-white/60 dark:text-orange-100 dark:hover:bg-slate-900/60"
            aria-expanded={!collapsed}
            aria-label={t(collapsed ? "tree.expandAria" : "tree.collapseAria", { n: label })}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronUp className="size-3.5" aria-hidden />}
          </button>
        )}
      </div>
      {!collapsed && children.length > 0 && (
        <RelationshipBranches nodes={children} label={label} remainingDepth={remainingDepth - 1} seen={node.code ? [...seen, node.code] : seen} />
      )}
    </li>
  );
}
