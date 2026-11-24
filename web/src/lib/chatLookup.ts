import { api } from "./api";
import { fold } from "./text";
import type { AskScope } from "./types";

export interface ChatTarget {
  scope: AskScope;
  id: string;
  title: string;
  number?: string;
  indexed?: boolean;
}

export type RegulationChatTarget = ChatTarget & { scope: "regulations" };

export function regulationQuery(input: string): string | null {
  const text = input.trimStart();
  return text.startsWith("/") ? text.slice(1).trim() : null;
}

export async function findRegulationChatTargets(query: string): Promise<RegulationChatTarget[]> {
  // Fetch the public catalog and match locally so typed drafts do not appear in request URLs.
  const { data, mock } = await api.regulations();
  const needle = fold(query);
  return data
    .filter((d) => mock || !d.is_sample)
    .map((d) => ({
      target: { scope: "regulations" as const, id: d.doc_id, title: d.title, number: d.decision_no, indexed: d.indexed },
      keys: [d.title, d.decision_no, d.doc_id, ...(d.topics ?? [])].filter(Boolean).map(fold),
    }))
    .filter(({ keys }) => keys.some((key) => key.includes(needle)))
    .sort((a, b) => Number(b.keys.includes(needle)) - Number(a.keys.includes(needle)))
    .slice(0, 6)
    .map(({ target }) => target);
}
