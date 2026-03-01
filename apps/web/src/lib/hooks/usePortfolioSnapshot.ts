"use client";

import { useState, useEffect, useCallback } from 'react';
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
  isRebuilding: boolean;
  error: string | null;
  refetch: () => void;
}

export function usePortfolioSnapshot(window: WindowOption): UsePortfolioSnapshotResult {
  const [data, setData] = useState<PortfolioSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => {
    setFetchKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Only show loading skeleton on initial load (no data yet).
    // On refetch or window change with existing data, keep UI responsive.
    if (data === null) {
      setIsLoading(true);
    }
    setError(null);

    const fetchSnapshot = async (): Promise<void> => {
      const res = await fetch(`/api/portfolio/snapshot?window=${window}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as PortfolioSnapshot & { needsRebuild?: boolean };

      if (json.needsRebuild && !cancelled) {
        // Show whatever data we have (even partial) and rebuild in background
        if (json.totalValue && json.totalValue !== '0') {
          setData(json);
        }
        setIsLoading(false);
        setIsRebuilding(true);

        // AD-S10b: GET is read-only; trigger explicit rebuild then refetch
        try {
          const rebuildRes = await fetch('/api/portfolio/rebuild', { method: 'POST' });
          if (!rebuildRes.ok) throw new Error(`Rebuild failed: HTTP ${rebuildRes.status}`);

          // Refetch after rebuild
          const res2 = await fetch(`/api/portfolio/snapshot?window=${window}`);
          if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
          const json2 = await res2.json() as PortfolioSnapshot;
          if (!cancelled) {
            setData(json2);
          }
        } finally {
          if (!cancelled) {
            setIsRebuilding(false);
          }
        }
        return;
      }

      if (!cancelled) {
        setData(json);
        setIsLoading(false);
      }
    };

    fetchSnapshot().catch((err: Error) => {
      if (!cancelled) {
        setError(err.message);
        setIsLoading(false);
        setIsRebuilding(false);
      }
    });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [window, fetchKey]);

  return { data, isLoading, isRebuilding, error, refetch };
}
