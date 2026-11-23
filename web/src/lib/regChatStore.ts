"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "./api";
import { isConnectionError } from "./dataSource";
import type { AskResponse } from "./types";
import { useSettings } from "./store";
import { useWorkspace } from "./workspace";
import { translate, useLang } from "@/i18n";

export interface ChatMsg {
  role: "user" | "ai";
  text: string;
  res?: AskResponse;
  error?: boolean;
}

export type ChatPopupStatus = "closed" | "popup" | "maximized";

interface RegChatState {
  status: ChatPopupStatus;
  cohort: string;
  mode: "extractive" | "llm";
  messages: ChatMsg[];
  busy: boolean;

  // Actions
  setStatus: (status: ChatPopupStatus) => void;
  openPopup: () => void;
  closeChat: () => void;
  minimizeChat: () => void;
  maximizeChat: () => void;
  restoreChat: () => void;
  togglePopup: () => void;
  toggleMaximize: () => void;
  setCohort: (cohort: string) => void;
  setMode: (mode: "extractive" | "llm") => void;
  ask: (question: string, overrideCohort?: string) => Promise<void>;
  clearMessages: () => void;
}

export const useRegChat = create<RegChatState>()(
  persist(
    (set, get) => ({
      status: "closed",
      cohort: "",
      mode: "extractive",
      messages: [],
      busy: false,

      setStatus: (status) => set({ status }),
      openPopup: () => set({ status: "popup" }),
      closeChat: () => set({ status: "closed" }),
      minimizeChat: () => set({ status: "closed" }),
      maximizeChat: () => set({ status: "maximized" }),
      restoreChat: () => set({ status: "popup" }),
      togglePopup: () =>
        set((s) => ({
          status: s.status === "closed" ? "popup" : "closed",
        })),
      toggleMaximize: () =>
        set((s) => ({
          status: s.status === "maximized" ? "popup" : "maximized",
        })),

      setCohort: (cohort) => set({ cohort }),
      setMode: (mode) => set({ mode }),

      ask: async (question: string, overrideCohort?: string) => {
        const text = question.trim();
        if (!text || get().busy) return;

        const currentSettingsCohort = useSettings.getState().cohort;
        const targetCohort =
          overrideCohort !== undefined
            ? overrideCohort
            : get().cohort || currentSettingsCohort;
        const currentMode = get().mode;

        set((s) => ({
          messages: [...s.messages, { role: "user", text }],
          busy: true,
        }));

        try {
          const res = (await api.ask(text, targetCohort || undefined, currentMode)).data;
          set((s) => ({
            messages: [...s.messages, { role: "ai", text: res.answer, res }],
          }));
        } catch (e) {
          const lang = useLang.getState().lang;
          const message = isConnectionError(e)
            ? translate(lang, "api.connectionError")
            : translate(lang, "common.errorPrefix", { message: e instanceof Error ? e.message : String(e) });
          set((s) => ({
            messages: [
              ...s.messages,
              { role: "ai", text: message, error: true },
            ],
          }));
        } finally {
          set({ busy: false });
        }
      },

      clearMessages: () => set({ messages: [] }),
    }),
    {
      name: "uelcourses-reg-chat",
      partialize: (s) => ({
        status: s.status,
        cohort: s.cohort,
        mode: s.mode,
        messages: s.messages,
      }),
    },
  ),
);
