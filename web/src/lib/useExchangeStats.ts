"use client";
import { useEffect, useState } from "react";
import { api } from "./api";
import { isExchangeViewActive, type ExchangeStatItem } from "./exchangeStats";
import { useSettings } from "./store";
import { useT } from "@/i18n";

/** Đang ở chế độ thống kê SV trao đổi (giao diện tiếng Anh + đã bật, không cần chọn CTĐT). */
export function useExchangeViewActive(): boolean {
  const { lang } = useT();
  const exchangeStudent = useSettings((s) => s.exchangeStudent);
  return isExchangeViewActive(lang, exchangeStudent);
}

/**
 * Tải số SV trao đổi cho danh sách mã học phần (một lần gọi API cho cả danh sách).
 * Khi `enabled` = false không gọi API. Lỗi mạng: trả về bảng rỗng, không làm vỡ trang.
 */
export function useExchangeStats(codes: string[], enabled: boolean): Record<string, ExchangeStatItem> {
  const key = enabled ? Array.from(new Set(codes)).sort().join(",") : "";
  const [stats, setStats] = useState<Record<string, ExchangeStatItem>>({});

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    api.exchangeStats(key.split(","))
      .then((res) => {
        if (!cancelled) setStats(Object.fromEntries(res.data.items.map((item) => [item.module_code, item])));
      })
      .catch(() => {
        if (!cancelled) setStats({});
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return enabled ? stats : {};
}
