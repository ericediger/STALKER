"use client";

import { useState, useEffect, useCallback } from "react";

export interface InstrumentOption {
  id: string;
  symbol: string;
  name: string;
  type: string;
  exchange: string;
}

interface UseInstrumentsResult {
  data: InstrumentOption[] | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useInstruments(): UseInstrumentsResult {
  const [data, setData] = useState<InstrumentOption[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  const refetch = useCallback(() => {
    setFetchCount((c) => c + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetch("/api/instruments")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: InstrumentOption[]) => {
        if (!cancelled) {
          setData(json);
          setIsLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchCount]);

  return { data, isLoading, error, refetch };
}
