"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  Position,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import type { ProgramGraph, ProgramGraphNode, RelationType } from "@/lib/types";
import { relatedChain } from "@/lib/programs";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 86;

const RELATION_COLOR: Record<RelationType, string> = {
  prereq: "#0b4f9c",     // Blue solid for prerequisite (must pass)
  previous: "#d97706",   // Amber dashed for previous (must take)
  coreq: "#7c3aed",      // Purple dotted for corequisite
  equivalent: "#10b981", // Emerald for equivalent
};

interface FlowNodeData extends Record<string, unknown> {
  code: string;
  name: string;
  credits: number;
  required: boolean;
  suggested_term?: number | null;
  block?: string;
  isHighlighted: boolean;
  isSelected: boolean;
  isDimmed: boolean;
}

function ProgramNodeComponent({ data }: { data: FlowNodeData }) {
  const isSelected = data.isSelected;
  const isHighlighted = data.isHighlighted;
  const isDimmed = data.isDimmed;

  return (
    <div
      className={`w-[220px] rounded-xl border p-2.5 shadow-sm transition-all text-left ${
        isSelected
          ? "border-brand-600 bg-brand-50/90 ring-2 ring-brand-500 shadow-md dark:bg-brand-950/70"
          : isHighlighted
          ? "border-amber-500 bg-amber-50/80 ring-1 ring-amber-400 dark:bg-amber-950/50"
          : "border-slate-200 bg-white hover:border-brand-400 dark:border-slate-700 dark:bg-slate-900"
      } ${isDimmed ? "opacity-30" : "opacity-100"}`}
    >
      <div className="flex items-center justify-between gap-1 text-[11px]">
        <span className="font-mono font-bold text-brand-700 dark:text-brand-300">
          {data.code}
        </span>
        <div className="flex items-center gap-1">
          {data.suggested_term ? (
            <span className="rounded bg-slate-100 px-1 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              HK{data.suggested_term}
            </span>
          ) : null}
          <span className="font-semibold text-slate-500">
            {data.credits} TC
          </span>
        </div>
      </div>

      <div className="mt-1 line-clamp-2 text-xs font-semibold text-slate-800 dark:text-slate-100">
        {data.name}
      </div>

      <div className="mt-2 flex items-center justify-between gap-1 text-[10px]">
        <span
          className={`rounded px-1.5 py-0.5 font-medium ${
            data.required
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
          }`}
        >
          {data.required ? "Bắt buộc" : "Tự chọn"}
        </span>

        {data.block ? (
          <span className="truncate max-w-[110px] text-slate-400" title={data.block}>
            {data.block}
          </span>
        ) : null}
      </div>
    </div>
  );
}

const nodeTypes = {
  programModule: ProgramNodeComponent,
};

function getLayoutedElements(
  nodes: ProgramGraphNode[],
  edges: ProgramGraph["edges"],
  selectedCode?: string,
  highlightChain?: Set<string>,
) {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: "LR",
    align: "UL",
    nodesep: 35,
    ranksep: 90,
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.code, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const flowNodes: Node<FlowNodeData>[] = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.code);
    const isSelected = selectedCode === node.code;
    const isHighlighted = highlightChain ? highlightChain.has(node.code) && !isSelected : false;
    const isDimmed = highlightChain ? !highlightChain.has(node.code) : false;

    return {
      id: node.code,
      type: "programModule",
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
      data: {
        code: node.code,
        name: node.name,
        credits: node.credits,
        required: node.required,
        suggested_term: node.suggested_term,
        block: node.block,
        isSelected,
        isHighlighted,
        isDimmed,
      },
    };
  });

  const flowEdges: Edge[] = edges.map((edge) => {
    const isRelated = highlightChain ? highlightChain.has(edge.source) && highlightChain.has(edge.target) : true;
    const color = RELATION_COLOR[edge.type] ?? "#94a3b8";

    return {
      id: `${edge.source}->${edge.target}-${edge.type}`,
      source: edge.source,
      target: edge.target,
      type: "smoothstep",
      animated: isRelated && !!highlightChain,
      style: {
        stroke: color,
        strokeWidth: isRelated && highlightChain ? 2.5 : 1.5,
        strokeDasharray:
          edge.type === "previous"
            ? "5, 5"
            : edge.type === "coreq"
            ? "2, 3"
            : undefined,
        opacity: highlightChain && !isRelated ? 0.15 : 0.85,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color,
        width: 14,
        height: 14,
      },
    };
  });

  return { nodes: flowNodes, edges: flowEdges };
}

export function ProgramFlowchart({
  graph,
  selectedCode,
  onSelectModule,
}: {
  graph: ProgramGraph;
  selectedCode?: string;
  onSelectModule?: (code: string) => void;
}) {
  const [filterTerm, setFilterTerm] = useState<string>("all");
  const [filterBlock, setFilterBlock] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Extract unique terms and blocks
  const terms = useMemo(() => {
    const set = new Set<number>();
    graph.nodes.forEach((n) => {
      if (n.suggested_term) set.add(n.suggested_term);
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [graph.nodes]);

  const blocks = useMemo(() => {
    const set = new Set<string>();
    graph.nodes.forEach((n) => {
      if (n.block) set.add(n.block);
    });
    return Array.from(set).sort();
  }, [graph.nodes]);

  // Compute related chain if a module is selected
  const highlightChain = useMemo(() => {
    if (!selectedCode) return undefined;
    return relatedChain(graph, selectedCode);
  }, [graph, selectedCode]);

  // Filter nodes according to dropdowns/search
  const visibleNodes = useMemo(() => {
    return graph.nodes.filter((node) => {
      if (filterTerm !== "all" && node.suggested_term !== Number(filterTerm)) return false;
      if (filterBlock !== "all" && node.block !== filterBlock) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const match =
          node.code.toLowerCase().includes(q) ||
          node.name.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [graph.nodes, filterTerm, filterBlock, searchQuery]);

  const visibleNodeCodes = useMemo(() => new Set(visibleNodes.map((n) => n.code)), [visibleNodes]);

  const visibleEdges = useMemo(() => {
    return graph.edges.filter(
      (e) => visibleNodeCodes.has(e.source) && visibleNodeCodes.has(e.target),
    );
  }, [graph.edges, visibleNodeCodes]);

  const layouted = useMemo(() => {
    return getLayoutedElements(visibleNodes, visibleEdges, selectedCode, highlightChain);
  }, [visibleNodes, visibleEdges, selectedCode, highlightChain]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layouted.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layouted.edges);

  useEffect(() => {
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
  }, [layouted, setNodes, setEdges]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (onSelectModule) {
        onSelectModule(node.id);
      }
    },
    [onSelectModule],
  );

  return (
    <div className="space-y-3">
      {/* Filters Bar */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            className="input w-48 text-xs sm:w-56"
            placeholder="Tìm môn trong sơ đồ..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <select
            className="input w-auto text-xs"
            value={filterTerm}
            onChange={(e) => setFilterTerm(e.target.value)}
            aria-label="Lọc theo học kỳ"
          >
            <option value="all">Mọi học kỳ ({terms.length} kỳ)</option>
            {terms.map((t) => (
              <option key={t} value={t}>
                Học kỳ {t}
              </option>
            ))}
          </select>

          <select
            className="input max-w-[200px] truncate text-xs"
            value={filterBlock}
            onChange={(e) => setFilterBlock(e.target.value)}
            aria-label="Lọc theo khối kiến thức"
          >
            <option value="all">Mọi khối kiến thức ({blocks.length})</option>
            {blocks.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          {(filterTerm !== "all" || filterBlock !== "all" || searchQuery) && (
            <button
              onClick={() => {
                setFilterTerm("all");
                setFilterBlock("all");
                setSearchQuery("");
              }}
              className="btn-ghost text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
            >
              Đặt lại lọc
            </button>
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-[#0b4f9c]" />
            Tiên quyết (phải đạt)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 border-b border-dashed border-[#d97706]" />
            Học trước (đã học)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 border-b border-dotted border-[#7c3aed]" />
            Song hành
          </span>
        </div>
      </div>

      {/* React Flow Canvas */}
      <div className="relative h-[650px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.2}
          maxZoom={1.8}
        >
          <Background gap={18} size={1} color="#94a3b8" />
          <Controls className="!bg-white !shadow-md dark:!bg-slate-900 dark:!border-slate-700" />
          <MiniMap
            zoomable
            pannable
            nodeColor={(node) => {
              if (selectedCode === node.id) return "#0b4f9c";
              return "#cbd5e1";
            }}
            className="!rounded-lg !border !border-slate-200 !bg-white/80 dark:!border-slate-800 dark:!bg-slate-900/80"
          />
        </ReactFlow>

        {selectedCode && (
          <div className="absolute bottom-4 left-4 rounded-xl border border-brand-300 bg-white/95 p-3 text-xs shadow-lg backdrop-blur dark:border-brand-700 dark:bg-slate-900/95">
            <span className="font-semibold text-brand-700 dark:text-brand-300">
              Đang làm nổi chuỗi môn của: {selectedCode}
            </span>
            <span className="ml-2 text-slate-500">
              (Gồm các môn tiên quyết phía trước và môn mở khóa phía sau)
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
