"use client";

import { useState, useEffect, useCallback } from "react";
import type { Holding } from "@/lib/holdings-utils";

export function useHoldings() {
  const [data, setData] = useState<Holding[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => {
    setFetchKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Only show loading skeleton on initial load (data === null).
    // On refetch, keep existing data visible to preserve table state (pagination, scroll).
    if (data === null) {
      setIsLoading(true);
    }
    fetch("/api/portfolio/holdings")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((result: Holding[]) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey]);

  return { data, isLoading, error, refetch };
}
