"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";

/**
 * Tự đo chiều rộng thật của một hàng nút (container `flex-nowrap`).
 * Trả về `true` khi tổng chiều rộng các nút ở chế độ đầy đủ chữ lớn hơn một dòng của khung cha,
 * khi đó giao diện chỉ hiện icon. Chiều rộng đầy đủ được ghi nhận lần đo gần nhất
 * ở chế độ có chữ, nên khi khung rộng ra đủ chỗ thì tự quay lại hiện chữ.
 * Khung ẩn (clientWidth = 0) thì giữ nguyên trạng thái, không đo.
 */
export function useIconOnlyWhenCramped<T extends HTMLElement>(ref: RefObject<T | null>): { iconOnly: boolean; measured: boolean } {
  const [iconOnly, setIconOnly] = useState(false);
  // false khi đang render từ server / chưa đo lần đầu: giao diện dùng CSS (max-sm) để ẩn chữ, tránh chớp chữ đầy đủ khi tải lại trên điện thoại.
  const [measured, setMeasured] = useState(false);
  const iconOnlyRef = useRef(false);
  const fullWidthRef = useRef(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      // Chiều rộng khả dụng = cả một dòng của khung cha (khung cha flex-wrap nên hàng nút
      // có thể xuống dòng riêng). KHÔNG dùng chính hàng nút: nó co theo nội dung, tự đo ra chính nó.
      const parent = el.parentElement;
      if (!parent || parent.clientWidth === 0) return;
      setMeasured(true);
      const available = parent.clientWidth;

      const kids = Array.from(el.children) as HTMLElement[];
      const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
      // Dùng scrollWidth (chiều rộng nội dung thật) chứ không dùng offsetWidth: cột `1fr` bị ép co theo khung
      // nên offsetWidth luôn "vừa" dù chữ đã tràn ra ngoài nút. Các cột bằng nhau nên cần n × nút rộng nhất.
      const widest = kids.reduce((max, kid) => Math.max(max, kid.offsetWidth, kid.scrollWidth, ...Array.from(kid.children).map((c) => (c as HTMLElement).scrollWidth || 0)), 0);
      const equalColumns = getComputedStyle(el).gridAutoColumns !== "auto" && getComputedStyle(el).display === "grid";
      const natural = kids.reduce((sum, kid) => sum + Math.max(kid.offsetWidth, kid.scrollWidth), 0);
      const total = (equalColumns ? widest * kids.length : natural) + gap * Math.max(0, kids.length - 1);
      if (!iconOnlyRef.current) fullWidthRef.current = total;
      const next = fullWidthRef.current > available;
      if (next !== iconOnlyRef.current) {
        iconOnlyRef.current = next;
        setIconOnly(next);
      }
    };

    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  });

  return { iconOnly, measured };
}
