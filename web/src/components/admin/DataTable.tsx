import React from "react";
import { useT } from "@/i18n";
import { EmptyState } from "./EmptyState";

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField?: keyof T | ((item: T) => string | number);
  loading?: boolean;
  page?: number;
  total?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  onSortChange?: (key: string) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  keyField = "id",
  loading,
  page = 1,
  total = 0,
  pageSize = 10,
  onPageChange,
  sortBy,
  sortOrder,
  onSortChange,
  emptyTitle,
  emptyDescription,
}: DataTableProps<T>) {
  const { t } = useT();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const getKey = (item: T, index: number): string | number => {
    if (typeof keyField === "function") return keyField(item);
    return item[keyField] ?? index;
  };

  return (
    <div className="card overflow-hidden min-h-[300px] flex flex-col justify-between">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 ${col.className || ""} ${
                    col.sortable ? "cursor-pointer select-none hover:text-slate-800 dark:hover:text-slate-200" : ""
                  }`}
                  onClick={() => col.sortable && onSortChange && onSortChange(col.key)}
                >
                  <div className="flex items-center gap-1">
                    <span>{col.header}</span>
                    {col.sortable && sortBy === col.key && (
                      <span className="text-brand-600 dark:text-brand-400">
                        {sortOrder === "asc" ? "▲" : "▼"}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              Array.from({ length: 5 }).map((_, idx) => (
                <tr key={idx} className="animate-pulse">
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-4/5" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-0">
                  <EmptyState title={emptyTitle} description={emptyDescription} />
                </td>
              </tr>
            ) : (
              data.map((item, index) => (
                <tr
                  key={getKey(item, index)}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  {columns.map((col) => (
                    <td key={col.key} className={`px-4 py-3 text-slate-700 dark:text-slate-300 ${col.className || ""}`}>
                      {col.render ? col.render(item) : item[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {onPageChange && total > pageSize && (
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <span>{t("admin.tablePage", { page, total: totalPages })}</span>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-outline px-2.5 py-1 text-xs"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              {t("admin.tablePrev")}
            </button>
            <button
              type="button"
              className="btn-outline px-2.5 py-1 text-xs"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              {t("admin.tableNext")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
