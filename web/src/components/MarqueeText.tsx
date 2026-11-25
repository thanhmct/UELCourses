"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Tốc độ cuộn (px/giây). */
const SPEED_PX_PER_S = 40;
const MIN_DURATION_S = 6;

/**
 * Dòng chữ một hàng. Khi nội dung dài hơn khung, chữ chạy ngang liên tục (lặp lại, không xuống dòng).
 * Khi vừa khung thì hiển thị tĩnh. Dừng cuộn khi rê chuột vào; tắt hẳn nếu người dùng bật giảm chuyển động.
 */
export function MarqueeText({ children, className = "" }: { children: ReactNode; className?: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLSpanElement>(null);
  const [copyWidth, setCopyWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const copy = copyRef.current;
    if (!frame || !copy) return;
    const measure = () => {
      const contentWidth = copy.offsetWidth;
      setCopyWidth(contentWidth > frame.clientWidth ? contentWidth : null);
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(copy);
    return () => observer.disconnect();
  }, [children]);

  const scrolling = copyWidth !== null;
  const duration = scrolling ? Math.max(MIN_DURATION_S, copyWidth / SPEED_PX_PER_S) : 0;

  return (
    <div ref={frameRef} className={`min-w-0 overflow-hidden whitespace-nowrap ${className}`.trim()}>
      <div
        className={scrolling ? "holiday-marquee-track holiday-marquee-animate" : "holiday-marquee-track"}
        style={scrolling ? { animationDuration: `${duration}s` } : undefined}
      >
        <span ref={copyRef} className="inline-block shrink-0 pr-8">{children}</span>
        {scrolling && (
          <span aria-hidden="true" className="inline-block shrink-0 pr-8">{children}</span>
        )}
      </div>
    </div>
  );
}
