"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { useMounted } from "./useMounted";
import { useSettings } from "./store";
import { parseProgramCode, validateProgramGroup } from "./programCode";
import type { ValidProgramGroup } from "./types";

interface ProfileDialogState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useProfileDialog = create<ProfileDialogState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));

export function openProfileDialog() {
  useProfileDialog.getState().open();
}

export function closeProfileDialog() {
  useProfileDialog.getState().close();
}

let globalHostMounted = false;
let activeLocalHostId: string | null = null;

export function registerGlobalProfileDialogHost(): () => void {
  globalHostMounted = true;
  return () => {
    globalHostMounted = false;
  };
}

export function hasGlobalProfileDialogHost(): boolean {
  return globalHostMounted;
}

export function canRenderLocalProfileDialog(id: string): boolean {
  if (globalHostMounted) return false;
  if (!activeLocalHostId || activeLocalHostId === id) {
    activeLocalHostId = id;
    return true;
  }
  return false;
}

export function releaseLocalProfileDialog(id: string): void {
  if (activeLocalHostId === id) {
    activeLocalHostId = null;
  }
}

const SESSION_DISMISSED_KEY = "uelcourses_profile_prompt_dismissed";

export function isProfilePromptDismissedThisSession(): boolean {
  if (typeof window === "undefined" || !window.sessionStorage) return false;
  try {
    return window.sessionStorage.getItem(SESSION_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissProfilePromptThisSession(): void {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(SESSION_DISMISSED_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Hook tự động mở hộp thoại khi chưa có CTĐT hoặc mã đã lưu không hợp lệ */
export function useProfilePromptAutoOpen(
  validGroups?: ValidProgramGroup[] | null,
  enabled: boolean = true,
) {
  const mounted = useMounted();
  const programCode = useSettings((s) => s.programCode);
  const open = useProfileDialog((s) => s.open);
  const isOpen = useProfileDialog((s) => s.isOpen);

  useEffect(() => {
    if (!enabled || !mounted || isOpen) return;
    if (isProfilePromptDismissedThisSession()) return;

    const trimmed = (programCode || "").trim();

    // 1. Chưa có mã ngành chính -> tự mở ngay
    if (!trimmed) {
      open();
      return;
    }

    // 2. Đã có mã nhưng không còn hợp lệ (sau khi danh sách validGroups đã nạp)
    if (validGroups && validGroups.length > 0) {
      const parsed = parseProgramCode(trimmed);
      const validation = validateProgramGroup(parsed, validGroups);
      if (!validation.valid) {
        open();
      }
    }
  }, [enabled, mounted, isOpen, programCode, validGroups, open]);
}
