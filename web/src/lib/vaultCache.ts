"use client";
import { api } from "./api";
import type { RegulationMarkdown } from "./types";

const cache = new Map<string, Promise<RegulationMarkdown | null>>();

/** Memoised markdown fetch (shared by reader, hover previews and the command palette). */
export function getMarkdown(docId: string): Promise<RegulationMarkdown | null> {
  let p = cache.get(docId);
  if (!p) {
    p = api.markdown(docId).then((r) => r.data).catch(() => null);
    cache.set(docId, p);
  }
  return p;
}
