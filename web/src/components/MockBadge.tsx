"use client";
import { useDataSource } from "@/lib/dataSource";

export function MockBadge({ className = "" }: { className?: string }) {
  const mock = useDataSource((s) => s.mock);
  if (!mock) return null;
  return (
    <span
      title="Không kết nối được API — đang hiển thị dữ liệu mẫu để demo"
      className={`chip bg-amber-100 text-amber-800 ring-1 ring-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:ring-amber-700 ${className}`}
    >
      Dữ liệu mẫu
    </span>
  );
}
