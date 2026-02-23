"use client";

import { useState, useEffect, useCallback } from "react";
import type { TransactionRow } from "@/lib/transaction-utils";

interface UseTransactionsOptions {
  instrumentId?: string;
}

interface UseTransactionsResult {
  data: TransactionRow[] | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useTransactions(
  options?: UseTransactionsOptions,
): UseTransactionsResult {
  const [data, setData] = useState<TransactionRow[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  const instrumentId = options?.instrumentId;

  const refetch = useCallback(() => {
    setFetchCount((c) => c + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (instrumentId) {
      params.set("instrumentId", instrumentId);
    }
    const qs = params.toString();
    const url = qs ? `/api/transactions?${qs}` : "/api/transactions";

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: TransactionRow[]) => {
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
  }, [instrumentId, fetchCount]);

  return { data, isLoading, error, refetch };
}
