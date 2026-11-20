"use client";
import { useEffect, useState } from "react";

/** True after the first client render — avoids SSR/localStorage hydration mismatches. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
