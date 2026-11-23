import React from "react";

interface KpiCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  href?: string;
  icon?: React.ReactNode;
  loading?: boolean;
}

export function KpiCard({ title, value, subtitle, href, icon, loading }: KpiCardProps) {
  if (loading) {
    return (
      <div className="card p-5 animate-pulse min-h-[120px] flex flex-col justify-between">
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2 mb-3" />
        <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-3/4 mb-2" />
        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
      </div>
    );
  }

  const content = (
    <div className="card p-5 hover:border-brand-300 dark:hover:border-brand-700 transition-colors flex flex-col justify-between min-h-[120px]">
      <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">
        <span>{title}</span>
        {icon && <span className="text-slate-400 dark:text-slate-500">{icon}</span>}
      </div>
      <div className="text-2xl lg:text-3xl font-bold text-slate-900 dark:text-slate-50 my-1 font-mono">
        {typeof value === "number" ? value.toLocaleString("vi-VN") : value}
      </div>
      {subtitle && (
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
          <span>{subtitle}</span>
          {href && <span className="text-brand-600 dark:text-brand-400 font-medium">→</span>}
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <a href={href} className="block group focus:outline-none focus:ring-2 focus:ring-brand-focus rounded-xl">
        {content}
      </a>
    );
  }

  return content;
}
