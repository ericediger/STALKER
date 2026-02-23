"use client";

import { useState, useEffect } from "react";
import type { PriceBar } from "@/lib/chart-candlestick-utils";

export function useMarketHistory(
  symbol: string,
  startDate?: string,
  endDate?: string,
) {
  const [data, setData] = useState<PriceBar[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!symbol) return;
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams({ symbol });
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);

    fetch(`/api/market/history?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setData)
      .catch(setError)
      .finally(() => setIsLoading(false));
  }, [symbol, startDate, endDate]);

  return { data, isLoading, error };
}
