"use client";
import { useEffect, useState } from "react";
import type { ApiResult } from "./api";
import { isConnectionError } from "./dataSource";

export function useApi<T>(fn: () => Promise<ApiResult<T>>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null; mock: boolean; offline: boolean }>({
    data: null,
    loading: true,
    error: null,
    mock: false,
    offline: false,
  });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null, offline: false }));
    fn()
      .then((r) => alive && setState({ data: r.data, loading: false, error: null, mock: r.mock, offline: false }))
      .catch((e: unknown) => alive && setState({ data: null, loading: false, error: e instanceof Error ? e.message : String(e), mock: false, offline: isConnectionError(e) }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
