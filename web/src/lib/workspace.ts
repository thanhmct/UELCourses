"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

// ----- Regulations workspace: open tabs, scroll target, AI question hand-off -----
interface WorkspaceState {
  tabs: string[];
  active: string | null;
  /** nonce changes on every navigation so the same anchor can be re-flashed */
  target: { doc: string; anchor?: string; nonce: number } | null;
  pendingQuestion: string | null;
  open: (doc: string, anchor?: string) => void;
  close: (doc: string) => void;
  setActive: (doc: string) => void;
  askLater: (q: string) => void;
  takeQuestion: () => string | null;
}

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      tabs: [],
      active: null,
      target: null,
      pendingQuestion: null,
      open: (doc, anchor) =>
        set((s) => ({
          tabs: s.tabs.includes(doc) ? s.tabs : [...s.tabs, doc].slice(-8),
          active: doc,
          target: { doc, anchor, nonce: Date.now() + Math.random() },
        })),
      close: (doc) =>
        set((s) => {
          const tabs = s.tabs.filter((t) => t !== doc);
          return { tabs, active: s.active === doc ? tabs[tabs.length - 1] ?? null : s.active };
        }),
      setActive: (doc) => set({ active: doc }),
      askLater: (q) => set({ pendingQuestion: q }),
      takeQuestion: () => {
        const q = get().pendingQuestion;
        if (q) set({ pendingQuestion: null });
        return q;
      },
    }),
    { name: "uelcourses-reg-workspace", partialize: (s) => ({ tabs: s.tabs, active: s.active }) },
  ),
);

// ----- Personal highlights & notes per clause (key = "doc#anchor") -----
export const HIGHLIGHT_COLORS = ["yellow", "green", "blue", "pink"] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

interface NoteEntry {
  color: HighlightColor | null;
  note: string;
  updated: string;
}

interface NotesState {
  notes: Record<string, NoteEntry>;
  setHighlight: (key: string, color: HighlightColor | null) => void;
  setNote: (key: string, note: string) => void;
}

function clean(e: NoteEntry): NoteEntry | null {
  return !e.color && !e.note.trim() ? null : e;
}

export const useRegNotes = create<NotesState>()(
  persist(
    (set) => ({
      notes: {},
      setHighlight: (key, color) =>
        set((s) => {
          const e = clean({ ...(s.notes[key] ?? { note: "" }), color, updated: new Date().toISOString() });
          const notes = { ...s.notes };
          if (e) notes[key] = e;
          else delete notes[key];
          return { notes };
        }),
      setNote: (key, note) =>
        set((s) => {
          const e = clean({ ...(s.notes[key] ?? { color: null }), note, updated: new Date().toISOString() });
          const notes = { ...s.notes };
          if (e) notes[key] = e;
          else delete notes[key];
          return { notes };
        }),
    }),
    { name: "uelcourses-reg-notes" },
  ),
);
