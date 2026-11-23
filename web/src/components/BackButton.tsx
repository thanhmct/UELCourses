"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { useT } from "@/i18n";

export interface BackButtonProps {
  /** Đường dẫn quay lại mặc định khi không có lịch sử cùng origin */
  href?: string;
  /** Nhãn cho aria-label và title tooltip */
  label?: string;
  /** Tiêu đề tooltip (mặc định lấy theo label) */
  title?: string;
  /** Class tùy biến bổ sung */
  className?: string;
  /** Sự kiện click tùy biến */
  onClick?: (e: MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => void;
  /** Icon tùy biến (mặc định dùng icon mũi tên trái SVG) */
  children?: ReactNode;
}

/**
 * Nút vuông bo góc nhẹ quay lại trang trước / danh sách (≈40×40px, rounded-lg, viền mảnh, nền trắng / dark mode).
 * Tự động ưu tiên router.back() nếu trình duyệt có lịch sử cùng origin, ngược lại điều hướng theo href.
 */
export function BackButton({
  href,
  label,
  title,
  className = "",
  onClick,
  children,
}: BackButtonProps) {
  const { t } = useT();
  const router = useRouter();

  const finalLabel = label || title || t("common.back");
  const finalTitle = title || label || t("common.back");

  const handleClick = (e: MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;

    if (typeof window !== "undefined" && window.history.length > 1 && document.referrer) {
      try {
        const refUrl = new URL(document.referrer);
        if (refUrl.origin === window.location.origin) {
          e.preventDefault();
          router.back();
          return;
        }
      } catch {
        // Fallback to standard href navigation
      }
    }

    if (!href) {
      router.back();
      return;
    }
  };

  const baseClasses =
    "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-brand-500 hover:bg-slate-50 hover:text-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-focus focus:ring-offset-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-brand-400 dark:hover:bg-slate-800 dark:hover:text-brand-400 dark:focus:ring-offset-slate-900";

  const defaultIcon = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  );

  const content = (
    <>
      {children ?? defaultIcon}
      <span className="sr-only">{finalLabel}</span>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        onClick={handleClick}
        aria-label={finalLabel}
        title={finalTitle}
        className={`${baseClasses} ${className}`.trim()}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={finalLabel}
      title={finalTitle}
      className={`${baseClasses} ${className}`.trim()}
    >
      {content}
    </button>
  );
}

export default BackButton;
