"use client";

import { useLayoutEffect, type RefObject } from "react";

/** Điện thoại: dưới mốc md của Tailwind (768px). */
export const PHONE_QUERY = "(max-width: 767px)";

/** Số mục tối đa hiện cùng lúc trong dropdown trên điện thoại. */
export const PHONE_DROPDOWN_MAX_ITEMS = 3;

/**
 * Quy tắc dropdown trên điện thoại: hiện tối đa `count` mục, phần còn lại cuộn trong khung,
 * thanh cuộn luôn hiện (class `dropdown-scroll`) để người dùng biết còn lựa chọn phía dưới.
 * Tự đo chiều cao thật của các mục đầu (mục cao thấp khác nhau vẫn đúng).
 * Khi đóng, không phải điện thoại, hoặc ít mục: gỡ giới hạn để class Tailwind quyết định.
 *
 * `el` là phần tử chứa trực tiếp các mục (ul/listbox/fieldset/menu...).
 */
export function applyMaxVisibleItems(el: HTMLElement, open: boolean, count = PHONE_DROPDOWN_MAX_ITEMS) {
  const isPhone = typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia(PHONE_QUERY).matches;
  const items = open ? (Array.from(el.children) as HTMLElement[]).filter((c) => c.getClientRects().length > 0) : [];
  if (!open || !isPhone || items.length <= count) {
    el.style.maxHeight = "";
    el.classList.remove("dropdown-scroll");
    return;
  }
  const style = getComputedStyle(el);
  const padBottom = parseFloat(style.paddingBottom) || 0;
  const borderBottom = parseFloat(style.borderBottomWidth) || 0;
  const lastShown = items[count - 1].getBoundingClientRect();
  const height = lastShown.bottom - el.getBoundingClientRect().top + el.scrollTop + padBottom + borderBottom;
  el.style.maxHeight = `${Math.ceil(height)}px`;
  el.classList.add("dropdown-scroll");
}

/** Bản hook của `applyMaxVisibleItems`: áp dụng mỗi lần render và khi đổi kích thước cửa sổ. */
export function useMaxVisibleItems<T extends HTMLElement>(ref: RefObject<T | null>, open: boolean, count = PHONE_DROPDOWN_MAX_ITEMS) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => applyMaxVisibleItems(el, open, count);
    apply();
    if (!open) return;
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  });
}
