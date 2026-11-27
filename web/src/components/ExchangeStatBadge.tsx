"use client";
import { createPortal } from "react-dom";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ThumbsUp } from "lucide-react";
import { useT } from "@/i18n";
import type { ExchangeStatItem } from "@/lib/exchangeStats";

/**
 * Biểu tượng "recommend" nhỏ: số SV trao đổi đã học học phần ở các học kỳ trước.
 * Máy tính: di chuột vào hiện hộp chi tiết. Điện thoại: chạm vào mở hộp bên cạnh nút, chạm lại hoặc chạm ngoài để đóng.
 * Không có dữ liệu hoặc bằng 0 thì không hiện.
 */
export function ExchangeStatBadge({ stat }: { stat?: ExchangeStatItem }) {
  const { t } = useT();
  const label = stat?.total === 1
    ? t("exchange.stat.one")
    : stat
      ? t("exchange.stat.many", { n: stat.total })
      : "";
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();
  const visible = open || hovered || focused;

  const clearHoverTimeout = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    if (!visible) return;
    const handleClickOutside = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node
        && !ref.current?.contains(target)
        && !tooltipRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setHovered(false);
        setFocused(false);
      }
    };
    document.addEventListener("pointerdown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [visible]);

  useLayoutEffect(() => {
    if (!visible) return;
    const button = buttonRef.current;
    const tooltip = tooltipRef.current;
    if (!button || !tooltip) return;

    const margin = 12;
    const gap = 8;
    const positionTooltip = () => {
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
      const rect = button.getBoundingClientRect();
      tooltip.style.visibility = "hidden";

      if (rect.bottom <= 0 || rect.top >= viewportHeight || rect.right <= 0 || rect.left >= viewportWidth) {
        return;
      }

      const tooltipRect = tooltip.getBoundingClientRect();
      const spaceAbove = rect.top - gap - margin;
      const spaceBelow = viewportHeight - rect.bottom - gap - margin;
      const showAbove = tooltipRect.height > spaceBelow && spaceAbove > spaceBelow;
      const desiredTop = showAbove
        ? rect.top - gap - tooltipRect.height
        : rect.bottom + gap;

      tooltip.style.left = `${Math.max(margin, Math.min(rect.left, viewportWidth - tooltipRect.width - margin))}px`;
      tooltip.style.top = `${Math.max(margin, Math.min(desiredTop, viewportHeight - tooltipRect.height - margin))}px`;
      tooltip.style.visibility = "visible";
    };

    positionTooltip();
    window.addEventListener("scroll", positionTooltip, true);
    window.addEventListener("resize", positionTooltip);
    window.visualViewport?.addEventListener("resize", positionTooltip);
    window.visualViewport?.addEventListener("scroll", positionTooltip);
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(positionTooltip);
    observer?.observe(button);
    observer?.observe(tooltip);

    return () => {
      window.removeEventListener("scroll", positionTooltip, true);
      window.removeEventListener("resize", positionTooltip);
      window.visualViewport?.removeEventListener("resize", positionTooltip);
      window.visualViewport?.removeEventListener("scroll", positionTooltip);
      observer?.disconnect();
    };
  }, [label, visible]);

  if (!stat || stat.total <= 0) return null;
  return (
    <>
      <div ref={ref} data-testid="exchange-stat" className="inline-flex shrink-0">
        <button
          ref={buttonRef}
          type="button"
          aria-describedby={visible ? tooltipId : undefined}
          aria-expanded={visible}
          aria-label={label}
          onClick={() => setOpen((current) => !current)}
          onPointerEnter={(event) => {
            if (event.pointerType !== "touch") {
              clearHoverTimeout();
              setHovered(true);
            }
          }}
          onPointerLeave={(event) => {
            if (event.pointerType !== "touch") {
              hoverTimeoutRef.current = setTimeout(() => setHovered(false), 200);
            }
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="inline-flex items-center justify-center rounded-full bg-sky-50 p-1 text-sky-700 hover:bg-sky-100 dark:bg-sky-950/60 dark:text-sky-300 dark:hover:bg-sky-900/60"
        >
          <ThumbsUp aria-hidden="true" className="size-3.5" />
        </button>
      </div>
      {visible && typeof document !== "undefined" && createPortal(
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          onPointerEnter={(event) => {
            if (event.pointerType !== "touch") {
              clearHoverTimeout();
              setHovered(true);
            }
          }}
          onPointerLeave={(event) => {
            if (event.pointerType !== "touch") setHovered(false);
          }}
          className="fixed invisible z-[1000] max-h-[calc(100dvh-24px)] w-max max-w-[calc(100vw-24px)] overflow-auto break-words [overflow-wrap:anywhere] rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-xs font-medium text-sky-800 shadow-lg dark:border-sky-900 dark:bg-slate-900 dark:text-sky-300"
        >
          {label}
        </div>,
        document.body,
      )}
    </>
  );
}
