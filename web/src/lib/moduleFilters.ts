import { api } from "./api";
import type { ModuleSummary } from "./types";

/** The API accepts one value per facet. Disjoint selections are OR within a facet. */
export async function loadModuleSelection(filters: { q: string; credits: string[]; types: string[]; faculties: string[]; is_english?: boolean }, page: number, size: number) {
  const values = (list: string[]) => list.length ? list : [""];
  const queries = values(filters.credits).flatMap((credits) => values(filters.types).flatMap((type) => values(filters.faculties).map((faculty) => ({ credits, type, faculty }))));
  const results = [];
  // Bound local API concurrency even when many checkbox combinations are selected.
  for (let i = 0; i < queries.length; i += 4) {
    results.push(...await Promise.all(queries.slice(i, i + 4).map((query) => api.modules({ ...query, q: filters.q, is_english: filters.is_english, page, size }))));
  }
  const items = new Map<string, ModuleSummary>();
  results.forEach((result) => result.data.items.forEach((item) => items.set(item.code, item)));
  return { items: [...items.values()].sort((a, b) => a.code.localeCompare(b.code)), total: results.reduce((sum, result) => sum + result.data.total, 0) };
}
