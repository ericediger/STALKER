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

    const fetchSnapshot = async (): Promise<void> => {
      const res = await fetch(`/api/portfolio/snapshot?window=${window}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as PortfolioSnapshot & { needsRebuild?: boolean };

      if (json.needsRebuild && !cancelled) {
        // AD-S10b: GET is read-only; trigger explicit rebuild then refetch
        const rebuildRes = await fetch('/api/portfolio/rebuild', { method: 'POST' });
        if (!rebuildRes.ok) throw new Error(`Rebuild failed: HTTP ${rebuildRes.status}`);

        // Refetch after rebuild
        const res2 = await fetch(`/api/portfolio/snapshot?window=${window}`);
        if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
        const json2 = await res2.json() as PortfolioSnapshot;
        if (!cancelled) {
          setData(json2);
          setIsLoading(false);
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
      }
    });

    return () => {
      cancelled = true;
    };
  }, [window]);

  return { data, isLoading, error };
}
