"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";

function useViewState() {
  const [trackMode, setTrackMode] = useState<"primary" | "secondary" | "both">("primary");
  const [showVietnameseModules, setShowVietnameseModules] = useState(false);
  const [showNames, setShowNames] = useState(true);
  const [selectedWeek, setSelectedWeek] = useState<number | "all">("all");
  const userSelectedRef = useRef(false);

  return {
    trackMode, setTrackMode, showVietnameseModules, setShowVietnameseModules,
    showNames, setShowNames, selectedWeek, setSelectedWeek, userSelectedRef,
  };
}

const TimetableViewContext = createContext<ReturnType<typeof useViewState> | null>(null);

export function TimetableViewProvider({ children }: { children: ReactNode }) {
  const state = useViewState();
  return <TimetableViewContext.Provider value={state}>{children}</TimetableViewContext.Provider>;
}

export function useTimetableView() {
  const state = useContext(TimetableViewContext);
  if (!state) throw new Error("Timetable routes require TimetableViewProvider.");
  return state;
}
