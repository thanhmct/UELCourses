"use client";
import { useEffect, useState } from "react";
import type { ApiResult } from "./api";

export function useApi<T>(fn: () => Promise<ApiResult<T>>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null; mock: boolean }>({
    data: null,
    loading: true,
    error: null,
    mock: false,
  });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn()
      .then((r) => alive && setState({ data: r.data, loading: false, error: null, mock: r.mock }))
      .catch((e: unknown) => alive && setState({ data: null, loading: false, error: e instanceof Error ? e.message : String(e), mock: false }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
