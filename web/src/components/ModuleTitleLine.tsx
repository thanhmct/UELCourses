"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { translate } from "@/i18n";
import { moduleName } from "@/i18n/names";

export interface RequiredBadgeProps {
  required?: boolean | null;
  lang?: "vi" | "en";
  className?: string;
}

/**
 * Chip nhỏ Bắt buộc / Tự chọn đặt ngay cạnh tên môn:
 * - Bắt buộc = xanh lá nhạt (`bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300`)
 * - Tự chọn = chàm/xanh dương nhạt (`bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300`)
 * - EN: "Required" / "Elective"
 * - Chỉ hiện khi `required !== undefined && required !== null` (môn thuộc CTĐT).
 */
export function RequiredBadge({ required, lang = "vi", className = "" }: RequiredBadgeProps) {
  if (required === undefined || required === null) {
    return null;
  }

  const label = translate(lang, required ? "pd.required" : "pd.elective");

  const colorClass = required
    ? "bg-emerald-100 font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
    : "bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300";

  return (
    <span
      data-variant={required ? "required" : "elective"}
      className={`chip inline-flex items-center text-xs ${colorClass} ${className}`.trim()}
    >
      {label}
    </span>
  );
}

export interface NoScheduleBadgeProps {
  lang?: "vi" | "en";
  className?: string;
}

/**
 * Nhãn Không có lịch đặt ở cụm bên phải cạnh số tín chỉ:
 * - Màu vàng/hổ phách (`bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200`)
 * - EN: "No schedule", VI: "Không có lịch"
 */
export function NoScheduleBadge({ lang = "vi", className = "" }: NoScheduleBadgeProps) {
  const label = translate(lang, "mod.noSchedule");
  return (
    <span
      data-variant="no-schedule"
      className={`rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200 ${className}`.trim()}
    >
      {label}
    </span>
  );
}

export interface ModuleTitleLineProps {
  code: string;
  name?: string;
  nameEn?: string | null;
  module?: { code?: string; name: string; name_en?: string | null };
  required?: boolean | null;
  lang?: "vi" | "en";
  href?: string;
  className?: string;
  linkClassName?: string;
  badgeClassName?: string;
  extra?: ReactNode;
}

/**
 * Component hiển thị dòng tiêu đề học phần: MÃ Tên môn [Bắt buộc/Tự chọn] cùng dòng.
 */
export function ModuleTitleLine({
  code,
  name,
  nameEn,
  module,
  required,
  lang = "vi",
  href,
  className = "flex flex-wrap items-center gap-2",
  linkClassName = "font-semibold text-brand-600 hover:underline dark:text-brand-300",
  badgeClassName = "",
  extra,
}: ModuleTitleLineProps) {
  const displayName = module
    ? moduleName(module, lang)
    : lang === "en" && nameEn
    ? nameEn
    : name || "";

  const content = (
    <>
      <span className="font-mono">{code}</span> {displayName}
    </>
  );

  return (
    <div className={className}>
      {href ? (
        <Link href={href} className={linkClassName}>
          {content}
        </Link>
      ) : (
        <span className={linkClassName}>{content}</span>
      )}
      <RequiredBadge required={required} lang={lang} className={badgeClassName} />
      {extra}
    </div>
  );
}
