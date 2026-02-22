"use client";

import { useState, useEffect } from 'react';
import type { WindowOption } from '@/lib/window-utils';

export interface SnapshotWindow {
  startDate: string;
  endDate: string;
  startValue: string;
  endValue: string;
  changeAmount: string;
  changePct: string;
}

export interface PortfolioSnapshot {
  totalValue: string;
  totalCostBasis: string;
  unrealizedPnl: string;
  realizedPnl: string;
  holdings: unknown[];
  window: SnapshotWindow;
}

interface UsePortfolioSnapshotResult {
  data: PortfolioSnapshot | null;
  isLoading: boolean;
  error: string | null;
}

export function usePortfolioSnapshot(window: WindowOption): UsePortfolioSnapshotResult {
  const [data, setData] = useState<PortfolioSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetch(`/api/portfolio/snapshot?window=${window}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: PortfolioSnapshot) => {
        if (!cancelled) {
          setData(json);
          setIsLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [window]);

  return { data, isLoading, error };
}
