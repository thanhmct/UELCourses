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
 * Nhãn Bắt buộc / Tự chọn đã được ẨN trên toàn bộ giao diện theo yêu cầu.
 * Trường `required` vẫn lưu trong DB và trả về API; chỉ không hiển thị.
 * Giữ export để các nơi gọi không phải sửa; nếu cần bật lại, khôi phục nhánh render cũ từ git.
 */
export function RequiredBadge(_props: RequiredBadgeProps) {
  return null;
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
 * Component hiển thị dòng tiêu đề học phần: MÃ Tên môn (không còn nhãn Bắt buộc/Tự chọn).
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
