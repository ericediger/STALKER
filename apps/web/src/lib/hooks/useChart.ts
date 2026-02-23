"use client";

import { useRef, useEffect, useState } from "react";
import {
  createChart,
  type IChartApi,
  type DeepPartial,
  type ChartOptions,
  CrosshairMode,
} from "lightweight-charts";

const DEFAULT_OPTIONS: DeepPartial<ChartOptions> = {
  layout: {
    background: { color: "#0a0b0d" },
    textColor: "#8b8d93",
    fontFamily: "'JetBrains Mono', monospace",
  },
  grid: {
    vertLines: { color: "#1e2028" },
    horzLines: { color: "#1e2028" },
  },
  crosshair: { mode: CrosshairMode.Normal },
  timeScale: { borderColor: "#1e2028" },
  rightPriceScale: { borderColor: "#1e2028" },
};

interface UseChartOptions {
  container: React.RefObject<HTMLDivElement | null>;
  options?: DeepPartial<ChartOptions>;
}

interface UseChartReturn {
  chart: IChartApi | null;
}

/**
 * Shared hook for TradingView Lightweight Charts v5.
 * Handles: createChart on mount → ResizeObserver → dispose on unmount.
 * Returns the chart API for callers to add their own series.
 */
export function useChart({ container, options }: UseChartOptions): UseChartReturn {
  const [chart, setChart] = useState<IChartApi | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!container.current) return;

    const mergedOptions: DeepPartial<ChartOptions> = {
      ...DEFAULT_OPTIONS,
      ...options,
      width: container.current.clientWidth,
      layout: {
        ...DEFAULT_OPTIONS.layout,
        ...options?.layout,
      },
      grid: {
        ...DEFAULT_OPTIONS.grid,
        ...options?.grid,
      },
    };

    const instance = createChart(container.current, mergedOptions);
    chartRef.current = instance;
    setChart(instance);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width > 0) {
          instance.applyOptions({ width });
        }
      }
    });
    observer.observe(container.current);

    return () => {
      observer.disconnect();
      instance.remove();
      chartRef.current = null;
      setChart(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { chart };
}
