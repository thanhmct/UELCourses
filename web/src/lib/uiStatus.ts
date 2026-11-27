import { create } from "zustand";

export type ErrorSeverity = "info" | "error" | "critical";

interface UiStatusState {
  errors: Record<string, ErrorSeverity>;
  registerError: (id: string, severity: ErrorSeverity) => void;
  unregisterError: (id: string) => void;
}

export const useUiStatus = create<UiStatusState>((set) => ({
  errors: {},
  registerError: (id, severity) =>
    set((state) => ({ errors: { ...state.errors, [id]: severity } })),
  unregisterError: (id) =>
    set((state) => {
      if (!(id in state.errors)) return state;
      const errors = { ...state.errors };
      delete errors[id];
      return { errors };
    }),
}));

export function highestPriorityErrorId(errors: Record<string, ErrorSeverity>): string | null {
  const priority: Record<ErrorSeverity, number> = { info: 1, error: 2, critical: 3 };
  return Object.entries(errors)
    .sort(([idA, severityA], [idB, severityB]) =>
      priority[severityB] - priority[severityA] || idA.localeCompare(idB),
    )[0]?.[0] ?? null;
}
