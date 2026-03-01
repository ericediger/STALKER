"use client";

import { useState, useEffect } from "react";

export interface HoldingLot {
  openedAt: string;
  originalQty: string;
  remainingQty: string;
  price: string;
  costBasisRemaining: string;
}

export interface RealizedTrade {
  sellDate: string;
  qty: string;
  proceeds: string;
  costBasis: string;
  realizedPnl: string;
  fees: string;
}

export interface HoldingTransaction {
  id: string;
  type: "BUY" | "SELL";
  quantity: string;
  price: string;
  fees: string;
  tradeAt: string;
  notes: string | null;
}

export interface LatestQuote {
  price: string;
  asOf: string;
  fetchedAt: string;
  provider: string;
}

export interface HoldingDetail {
  symbol: string;
  name: string;
  instrumentId: string;
  totalQty: string;
  markPrice: string;
  marketValue: string;
  totalCostBasis: string;
  unrealizedPnl: string;
  unrealizedPnlPct: string;
  realizedPnl: string;
  allocation: string;
  firstBuyDate: string | null;
  dayChange: string | null;
  dayChangePct: string | null;
  lots: HoldingLot[];
  realizedTrades: RealizedTrade[];
  transactions: HoldingTransaction[];
  latestQuote: LatestQuote | null;
}

export function useHoldingDetail(symbol: string) {
  const [data, setData] = useState<HoldingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const doFetch = async (retriesLeft: number): Promise<void> => {
      const res = await fetch(`/api/portfolio/holdings/${encodeURIComponent(symbol)}`);
      if (!res.ok) {
        // Retry once on 500 (transient SQLite contention)
        if (res.status === 500 && retriesLeft > 0) {
          await new Promise((r) => setTimeout(r, 500));
          if (!cancelled) return doFetch(retriesLeft - 1);
          return;
        }
        const body = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      return res.json();
    };

    doFetch(1)
      .then((result) => { if (!cancelled) setData(result as HoldingDetail); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err : new Error(String(err))); })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [symbol, fetchKey]);

  const refetch = () => setFetchKey((k) => k + 1);

  return { data, isLoading, error, refetch };
}
