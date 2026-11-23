"use client";
import { create } from "zustand";
import { translate, useLang } from "@/i18n";

export function isConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("status" in error)) return false;
  return error.status === 0 || (typeof error.status === "number" && error.status >= 500);
}

export function connectionErrorMessage(): string {
  return translate(useLang.getState().lang, "api.connectionError");
}

/**
 * mock: the UI is showing mock data (only possible when NEXT_PUBLIC_USE_MOCKS=true, i.e. dev/demo).
 * offline: the API rejected a request with a network error, timeout or 5xx.
 */
interface DataSourceState {
  mock: boolean;
  offline: boolean;
  setMock: (v: boolean) => void;
  setOffline: (v: boolean) => void;
}

export const useDataSource = create<DataSourceState>((set) => ({
  mock: false,
  offline: false,
  setMock: (v) => set((s) => (s.mock === v ? s : { mock: v })),
  setOffline: (v) => set((s) => (s.offline === v ? s : { offline: v })),
}));
