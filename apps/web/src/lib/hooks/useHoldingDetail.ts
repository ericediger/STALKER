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
    setIsLoading(true);
    setError(null);

    fetch(`/api/portfolio/holdings/${encodeURIComponent(symbol)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setData)
      .catch(setError)
      .finally(() => setIsLoading(false));
  }, [symbol, fetchKey]);

  const refetch = () => setFetchKey((k) => k + 1);

  return { data, isLoading, error, refetch };
}
