"use client";
import { create } from "zustand";

/**
 * mock: the UI is showing mock data (only possible when NEXT_PUBLIC_USE_MOCKS=true, i.e. dev/demo).
 * offline: the last API call could not reach the server (network error / timeout / 5xx) — shown as a warning badge.
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
