"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "./api";
import { isConnectionError } from "./dataSource";
import type { AskResponse, ModuleAskResponse } from "./types";
import { useSettings } from "./store";
import { translate, useLang } from "@/i18n";
import { findRegulationChatTargets, regulationQuery, type ChatTarget, type RegulationChatTarget } from "./chatLookup";
import { fold } from "./text";
import { track } from "./analytics";
import { chatContext, cohortReply } from "./chatContext";

export interface ChatMsg {
  role: "user" | "ai";
  text: string;
  clarifiedQuestion?: string;
  res?: AskResponse;
  // Retain references in conversations saved when the popup offered syllabus lookup.
  moduleRes?: ModuleAskResponse;
  targets?: ChatTarget[];
  error?: boolean;
}

export type ChatPopupStatus = "closed" | "popup" | "maximized";

export interface ChatConversation {
  id: string;
  cohort: string;
  messages: ChatMsg[];
  /** Documents tagged with "/": later questions are answered only from them (max MAX_TAGGED). */
  scope?: RegulationChatTarget[];
}

export const MAX_TAGGED = 3;

interface SavedChat {
  status: ChatPopupStatus;
  activeId: string | null;
  conversations: ChatConversation[];
}

interface RegChatState extends SavedChat {
  pendingIds: string[];

  // Actions
  setStatus: (status: ChatPopupStatus) => void;
  openPopup: () => void;
  closeChat: () => void;
  minimizeChat: () => void;
  maximizeChat: () => void;
  restoreChat: () => void;
  togglePopup: () => void;
  toggleMaximize: () => void;
  openConversation: (id: string | null) => void;
  deleteConversation: (id: string) => void;
  ask: (question: string, overrideCohort?: string, target?: RegulationChatTarget) => Promise<void>;
  /** Tag a document: the conversation continues inside it. Returns false when MAX_TAGGED is already reached. */
  tagDocument: (target: RegulationChatTarget) => "ok" | "full" | "unindexed";
  untagDocument: (id: string) => void;
}

export function activeConversation(state: SavedChat) {
  return state.conversations.find((item) => item.id === state.activeId);
}

/** Cohort used for a question: the program profile first, then the one given in this chat. */
export function chatCohort(sessionCohort: string): string {
  return useSettings.getState().cohort || sessionCohort;
}

export const useRegChat = create<RegChatState>()(
  persist(
    (set, get) => ({
      status: "closed",
      activeId: null,
      conversations: [],
      pendingIds: [],

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

      openConversation: (activeId) => {
        if (activeId === null || get().conversations.some((item) => item.id === activeId)) set({ activeId });
      },
      deleteConversation: (id) => set((s) => ({
        activeId: s.activeId === id ? null : s.activeId,
        conversations: s.conversations.filter((item) => item.id !== id),
      })),

      tagDocument: (target) => {
        if (target.indexed === false) return "unindexed";
        const current = activeConversation(get());
        const scope = current?.scope ?? [];
        if (scope.some((item) => item.id === target.id)) return "ok";
        if (scope.length >= MAX_TAGGED) return "full";
        const id = current?.id ?? (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const name = target.number || target.title;
        const notice: ChatMsg = { role: "ai", text: translate(useLang.getState().lang, "chat.scopeTagged", { name }) };
        set((s) => ({
          activeId: id,
          conversations: [
            { id, cohort: current?.cohort ?? "", messages: [...(current?.messages ?? []), notice], scope: [...scope, target] },
            ...s.conversations.filter((item) => item.id !== id),
          ],
        }));
        track("chat_tag_document", { query: target.id });
        return "ok";
      },
      untagDocument: (docId) => set((s) => ({
        conversations: s.conversations.map((item) => item.id === s.activeId && item.scope
          ? { ...item, scope: item.scope.filter((target) => target.id !== docId) } : item),
      })),

      ask: async (question: string, overrideCohort?: string, target?: RegulationChatTarget) => {
        const text = question.trim();
        const conversation = activeConversation(get());
        const last = conversation?.messages.at(-1);
        const clarification = last?.res?.clarify && cohortReply(text);
        const previousQuestion = clarification ? conversation?.messages.findLast((item) => item.role === "user") : undefined;
        const effectiveQuestion = previousQuestion?.clarifiedQuestion ?? previousQuestion?.text ?? text;
        const lookupQuery = regulationQuery(effectiveQuestion);
        if (!text || lookupQuery === "" || (conversation && get().pendingIds.includes(conversation.id))) return;
        const pickedCohort = overrideCohort ?? clarification;
        const cohort = pickedCohort ?? conversation?.cohort ?? "";
        const targetCohort = pickedCohort ?? chatCohort(cohort);
        const { lang } = useLang.getState();
        const id = conversation?.id ?? (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const messages: ChatMsg[] = [...(conversation?.messages ?? []), {
          role: "user", text, ...(previousQuestion ? { clarifiedQuestion: effectiveQuestion } : {}),
        }];

        set((s) => ({
          activeId: id,
          conversations: [{ id, cohort, messages, ...(conversation?.scope?.length ? { scope: conversation.scope } : {}) },
            ...s.conversations.filter((item) => item.id !== id)],
          pendingIds: [...s.pendingIds, id],
        }));

        let reply: ChatMsg;
        try {
          const matches = target ? [target] : lookupQuery !== null && pickedCohort === undefined
            ? await findRegulationChatTargets(lookupQuery) : [];
          const needle = fold(lookupQuery ?? "");
          const exact = matches.filter((item) => [item.id, item.title, item.number]
            .some((label) => label && fold(label) === needle));
          const targets = exact.length ? exact : matches;
          const selected = targets.length === 1 ? targets[0] : undefined;

          if (lookupQuery !== null && targets.length) {
            const message = selected?.indexed === false ? "chat.metadataOnly" : "chat.foundDocs";
            reply = { role: "ai", text: translate(lang, message), targets };
            track("chat_regulation", { query: selected?.id });
          } else {
            const query = (lookupQuery !== null ? `Quy định về ${lookupQuery}` : effectiveQuestion).slice(0, 500);
            const context = chatContext(query, targetCohort);
            const docIds = (conversation?.scope ?? []).map((item) => item.id);
            // The server also recognises English by the question itself; the UI language only breaks ties.
            // Earlier questions let the server resolve follow-ups such as "Còn học kỳ hè thì sao?".
            const previous = (conversation?.messages ?? [])
              .filter((item) => item.role === "user" && !item.error)
              .slice(-2)
              .map((item) => (item.clarifiedQuestion ?? item.text).slice(0, 500));
            const options = docIds.length || lang === "en" || previous.length
              ? { ...(docIds.length ? { docIds } : {}), ...(previous.length ? { previous } : {}), lang }
              : undefined;
            const res = (await (options
              ? api.ask(query, targetCohort || undefined, context ?? undefined, options)
              : context
                ? api.ask(query, targetCohort || undefined, context)
                : api.ask(query, targetCohort || undefined))).data;
            reply = { role: "ai", text: res.answer, res };
            if (!res.clarify && res.mode !== "context" && res.mode !== "intro") {
              track("chat_regulation", { query: res.citations[0]?.doc_id });
            }
          }
        } catch (e) {
          const message = isConnectionError(e)
            ? translate(lang, "api.connectionError")
            : translate(lang, "common.errorPrefix", { message: e instanceof Error ? e.message : String(e) });
          reply = { role: "ai", text: message, error: true };
        }

        set((s) => ({
          conversations: s.conversations.map((item) => item.id === id
            ? { ...item, messages: [...item.messages, reply] } : item),
          pendingIds: s.pendingIds.filter((pending) => pending !== id),
        }));
      },

    }),
    {
      name: "uelcourses-reg-chat",
      version: 1,
      partialize: (s) => ({
        status: s.status,
        activeId: s.activeId,
        conversations: s.conversations,
      }),
      migrate: (stored): SavedChat => {
        const previous = stored as { status?: ChatPopupStatus; cohort?: string; messages?: ChatMsg[] } | null;
        const status = previous?.status ?? "closed";
        if (!previous?.messages?.length) return { status, activeId: null, conversations: [] };
        const legacy = { id: "previous-chat", cohort: previous.cohort ?? "", messages: previous.messages };
        return { status, activeId: legacy.id, conversations: [legacy] };
      },
    },
  ),
);
