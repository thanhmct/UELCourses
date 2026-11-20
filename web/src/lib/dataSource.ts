"use client";
import { create } from "zustand";

/** Tracks whether the UI is currently showing mock data (API unreachable). */
interface DataSourceState {
  mock: boolean;
  setMock: (v: boolean) => void;
}

export const useDataSource = create<DataSourceState>((set) => ({
  mock: false,
  setMock: (v) => set((s) => (s.mock === v ? s : { mock: v })),
}));
