import React from "react";

export function AdminSkeletonCard() {
  return (
    <div className="card p-5 animate-pulse min-h-[120px] flex flex-col justify-between">
      <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2 mb-3" />
      <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-3/4 mb-2" />
      <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
    </div>
  );
}

export function AdminSkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card p-4 animate-pulse min-h-[300px]">
      <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-1/4 mb-4" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-10 bg-slate-100 dark:bg-slate-800 rounded w-full" />
        ))}
      </div>
    </div>
  );
}

export function AdminSkeletonPage() {
  return (
    <div className="space-y-6 animate-pulse min-h-[400px]">
      <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <AdminSkeletonCard />
        <AdminSkeletonCard />
        <AdminSkeletonCard />
      </div>
      <AdminSkeletonTable rows={4} />
    </div>
  );
}
