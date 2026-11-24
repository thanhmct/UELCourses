"use client";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { UEL_COLORS } from "@/lib/brand";
import { useApi } from "@/lib/useApi";
import { useMounted } from "@/lib/useMounted";
import { COHORTS, useSettings } from "@/lib/store";
import { wikilinkHref } from "@/lib/vault";
import { useT } from "@/i18n";
import type { GraphEdgeType, RegulationStatus } from "@/lib/types";
import { Empty, Loading, PageHeader } from "@/components/ui";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false, loading: () => <Loading /> });

const STATUS_COLOR: Record<RegulationStatus, string> = {
  active: "#16a34a",
  expired: "#dc2626",
  superseded: "#64748b",
  upcoming: "#0284c7",
};
const EDGE_STYLE: Record<GraphEdgeType, { color: string; labelKey: string; dash?: number[] }> = {
  supersedes: { color: "#dc2626", labelKey: "graph.supersedes" },
  amends: { color: "#d97706", labelKey: "graph.amends", dash: [4, 2] },
  references: { color: "#7c3aed", labelKey: "graph.references", dash: [2, 2] },
  guides: { color: "#0891b2", labelKey: "graph.guides", dash: [6, 3] },
};

interface GNode {
  id: string;
  label: string;
  type: "doc" | "article";
  status?: RegulationStatus;
  x?: number;
  y?: number;
}

export default function RegulationGraphPage() {
  const { t } = useT();
  const mounted = useMounted();
  const router = useRouter();
  const savedCohort = useSettings((s) => s.cohort);
  const [cohort, setCohort] = useState("");
  useEffect(() => {
    if (mounted) setCohort(savedCohort);
  }, [mounted, savedCohort]);
  const graph = useApi(() => api.graph(cohort || undefined), [cohort]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 520 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: Math.max(380, Math.min(640, window.innerHeight - 260)) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [mounted]);

  const data = useMemo(() => {
    if (!graph.data) return { nodes: [], links: [] };
    const ids = new Set(graph.data.nodes.map((n) => n.id));
    return {
      nodes: graph.data.nodes.map((n) => ({ ...n })),
      links: graph.data.edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => ({ ...e })),
    };
  }, [graph.data]);

  const dark = mounted && document.documentElement.classList.contains("dark");

  return (
    <div>
      <PageHeader
        backHref="/regulations"
        backLabel={t("graph.backLabel")}
        title={t("graph.title")}
        subtitle={t("graph.sub")}
        actions={
          <select className="input w-auto" value={cohort} onChange={(e) => setCohort(e.target.value)} aria-label={t("reg.cohortFilter")}>
            <option value="">{t("reg.allCohorts")}</option>
            {COHORTS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        }
      />
      <div className="mb-3 flex flex-wrap gap-4 text-xs">
        {(Object.keys(STATUS_COLOR) as RegulationStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-1"><span className="h-3 w-3 rounded-full" style={{ background: STATUS_COLOR[s] }} />{t(`rbadge.${s}`)}</span>
        ))}
        {(Object.keys(EDGE_STYLE) as GraphEdgeType[]).map((k) => (
          <span key={k} className="flex items-center gap-1">
            <svg width="24" height="6"><line x1="0" y1="3" x2="24" y2="3" stroke={EDGE_STYLE[k].color} strokeWidth="2" strokeDasharray={EDGE_STYLE[k].dash?.join(" ")} /></svg>
            {t(EDGE_STYLE[k].labelKey)}
          </span>
        ))}
      </div>
      <div ref={wrapRef} className="card overflow-hidden p-0">
        {!mounted || graph.loading ? <Loading /> : !data.nodes.length ? <Empty>{t("graph.empty")}</Empty> : (
          <ForceGraph2D
            width={size.w}
            height={size.h}
            graphData={data}
            backgroundColor={dark ? "#0f172a" : "#ffffff"}
            nodeId="id"
            nodeLabel={(n) => {
              const node = n as GNode;
              return `${node.label}${node.status ? ` — ${t(`rbadge.${node.status}`)}` : ""}`;
            }}
            linkColor={(l) => EDGE_STYLE[(l as { type: GraphEdgeType }).type]?.color ?? "#94a3b8"}
            linkLineDash={(l) => EDGE_STYLE[(l as { type: GraphEdgeType }).type]?.dash ?? null}
            linkDirectionalArrowLength={5}
            linkDirectionalArrowRelPos={1}
            linkWidth={1.5}
            cooldownTicks={80}
            onNodeClick={(n) => {
              router.push(wikilinkHref(String((n as GNode).id)));
            }}
            nodeCanvasObject={(n, ctx, scale) => {
              const node = n as GNode;
              const r = node.type === "doc" ? 7 : 4;
              ctx.beginPath();
              ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, 2 * Math.PI);
              ctx.fillStyle = node.status ? STATUS_COLOR[node.status] : UEL_COLORS.blue;
              ctx.fill();
              const fontSize = Math.max(10 / scale, 3);
              ctx.font = `${fontSize}px sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              ctx.fillStyle = dark ? "#e2e8f0" : "#0f172a";
              ctx.fillText(node.label, node.x ?? 0, (node.y ?? 0) + r + 2);
            }}
            nodePointerAreaPaint={(n, color, ctx) => {
              const node = n as GNode;
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(node.x ?? 0, node.y ?? 0, 10, 0, 2 * Math.PI);
              ctx.fill();
            }}
          />
        )}
      </div>
    </div>
  );
}

