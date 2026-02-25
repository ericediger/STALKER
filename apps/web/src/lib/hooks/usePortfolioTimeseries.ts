"use client";

import { useState, useEffect } from 'react';
import { getWindowDateRange, type WindowOption } from '@/lib/window-utils';
import type { TimeseriesPoint } from '@/lib/chart-utils';

interface UsePortfolioTimeseriesResult {
  data: TimeseriesPoint[];
  isLoading: boolean;
  error: string | null;
}

export function usePortfolioTimeseries(window: WindowOption): UsePortfolioTimeseriesResult {
  const [data, setData] = useState<TimeseriesPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const range = getWindowDateRange(window);
    const params = new URLSearchParams();
    // API requires both startDate and endDate; for ALL, use a very early date
    params.set('startDate', range.startDate ?? '1970-01-01');
    params.set('endDate', range.endDate);

    fetch(`/api/portfolio/timeseries?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: TimeseriesPoint[]) => {
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
