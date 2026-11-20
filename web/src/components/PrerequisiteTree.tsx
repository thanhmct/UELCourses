"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import type { ModuleTreeNode } from "@/lib/types";
import { Loading } from "./ui";

const TYPE_STYLE: Record<string, { label: string; badge: string }> = {
  prereq: { label: "Tiên quyết (phải đạt)", badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200 border-emerald-300" },
  previous: { label: "Học trước (đã học)", badge: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200 border-amber-300" },
  coreq: { label: "Song hành", badge: "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200 border-sky-300" },
  or: { label: "Một trong các môn (OR)", badge: "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-200 border-purple-300" },
  and: { label: "Tất cả các môn (AND)", badge: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-300" },
  root: { label: "Môn hiện tại", badge: "bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-200 border-brand-300" },
};

function TreeNodeItem({ node, isRoot = false }: { node: ModuleTreeNode; isRoot?: boolean }) {
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = node.children && node.children.length > 0;
  const style = TYPE_STYLE[node.type] ?? { label: node.type, badge: "bg-slate-100 text-slate-700 border-slate-200" };

  return (
    <div className="relative pl-4 sm:pl-6">
      {!isRoot && (
        <span
          className="absolute left-0 top-3 h-px w-4 bg-slate-300 sm:w-6 dark:bg-slate-700"
          aria-hidden="true"
        />
      )}
      <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {hasChildren && (
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label={collapsed ? "Mở rộng" : "Thu gọn"}
          >
            {collapsed ? "+" : "−"}
          </button>
        )}

        {node.code ? (
          <Link
            href={`/modules/${encodeURIComponent(node.code)}`}
            className="font-mono text-xs font-bold text-brand-700 hover:underline dark:text-brand-300"
          >
            {node.code}
          </Link>
        ) : null}

        <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
          {node.name || node.code}
        </span>

        <span
          className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${style.badge}`}
        >
          {style.label}
        </span>

        {hasChildren && (
          <span className="text-xs text-slate-400">
            ({node.children.length} {collapsed ? "nhánh bị ẩn" : "nhánh con"})
          </span>
        )}
      </div>

      {hasChildren && !collapsed && (
        <div className="border-l-2 border-slate-200 pl-2 sm:pl-4 dark:border-slate-800">
          {node.children.map((child, idx) => (
            <TreeNodeItem key={`${child.code}-${child.type}-${idx}`} node={child} />
          ))}
        </div>
      )}
    </div>
  );
}

export function PrerequisiteTree({
  code,
  currentName,
}: {
  code: string;
  currentName?: string;
}) {
  const [direction, setDirection] = useState<"prereq" | "unlocks">("prereq");
  const [depth, setDepth] = useState<number>(3);

  const tree = useApi(
    () => api.moduleTree(code, { direction, depth }),
    [code, direction, depth],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
            <button
              onClick={() => setDirection("prereq")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                direction === "prereq"
                  ? "bg-white text-brand-700 shadow-sm dark:bg-slate-900 dark:text-brand-300"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
              }`}
            >
              ⬅️ Cần học trước (Prerequisites)
            </button>
            <button
              onClick={() => setDirection("unlocks")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                direction === "unlocks"
                  ? "bg-white text-brand-700 shadow-sm dark:bg-slate-900 dark:text-brand-300"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
              }`}
            >
              ➡️ Mở khóa môn sau (Unlocks)
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">Độ sâu cây:</span>
          <select
            className="input py-1 text-xs"
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            aria-label="Chọn độ sâu"
          >
            <option value={1}>1 cấp</option>
            <option value={2}>2 cấp</option>
            <option value={3}>3 cấp</option>
            <option value={4}>4 cấp</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          Tiên quyết: Phải đạt điểm qua môn
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
          Học trước: Đã học (đạt điểm tích lũy tối thiểu)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
          Song hành: Có thể đăng ký cùng kỳ
        </span>
      </div>

      {tree.loading ? (
        <Loading text="Đang tải cấu trúc cây môn học…" />
      ) : !tree.data || !tree.data.children || tree.data.children.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-800">
          {direction === "prereq" ? (
            <p>
              Không ghi nhận học phần tiên quyết hay học trước nào cho{" "}
              <strong>{code}</strong>. Môn này có thể học ngay khi bắt đầu học kỳ gợi ý.
            </p>
          ) : (
            <p>
              Chưa có học phần nào yêu cầu <strong>{code}</strong> làm điều kiện mở khóa trong CTĐT.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
          <TreeNodeItem
            node={{
              code,
              name: currentName || tree.data.name || code,
              type: "root",
              children: tree.data.children,
            }}
            isRoot
          />
        </div>
      )}
    </div>
  );
}
