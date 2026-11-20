"use client";
import Link from "next/link";
import { useState } from "react";
import type { ModuleTreeNode } from "@/lib/types";
import { useT } from "@/i18n";
import { moduleName } from "@/i18n/names";

/** One node of the relation tree; "and"/"or" nodes are groups, other nodes are modules. */
export function RelationshipBranch({ node, seen = [] }: { node: ModuleTreeNode; seen?: string[] }) {
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
  const children = cycle ? [] : node.children ?? [];
  const group = node.type === "and" || node.type === "or";
  return (
    <li className={`relation-branch relation-${node.type}`}>
      <div className={`relation-node ${group ? "relation-group" : ""}`}>
        {group ? (
          <strong>{typeLabel[node.type]}</strong>
        ) : (
          <>
            <Link className="font-mono font-bold text-brand-700 hover:underline dark:text-brand-300" href={`/modules/${encodeURIComponent(node.code)}`}>{node.code}</Link>
            <span className="text-xs leading-relaxed">{(node.name && moduleName(node, lang)) || node.code}</span>
            {typeLabel[node.type] && <span className="text-[10px] text-slate-500">{typeLabel[node.type]}</span>}
          </>
        )}
        {cycle && <span className="text-xs text-amber-700">{t("tree.cycle")}</span>}
        {children.length > 0 && (
          <button
            type="button"
            className="mt-1 text-xs text-brand-700 hover:underline dark:text-brand-300"
            aria-expanded={!collapsed}
            aria-label={t(collapsed ? "tree.expandAria" : "tree.collapseAria", { n: node.code || typeLabel[node.type] })}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? t("tree.expand", { n: children.length }) : t("tree.collapse")}
          </button>
        )}
      </div>
      {!collapsed && children.length > 0 && (
        <ul className="relation-children">
          {children.map((child, i) => (
            <RelationshipBranch key={`${child.code}-${child.type}-${i}`} node={child} seen={node.code ? [...seen, node.code] : seen} />
          ))}
        </ul>
      )}
    </li>
  );
}
