"use client";

import { useRef, useEffect } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type AreaData,
  type Time,
  CrosshairMode,
} from "lightweight-charts";
import { Skeleton } from "@/components/ui/Skeleton";
import { toAreaChartData, type TimeseriesPoint } from "@/lib/chart-utils";

interface PortfolioChartProps {
  timeseries: TimeseriesPoint[];
  isLoading: boolean;
}

const CHART_HEIGHT = 300;

export function PortfolioChart({ timeseries, isLoading }: PortfolioChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  // Create chart on mount, dispose on unmount
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: CHART_HEIGHT,
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
    });

    const series = chart.addAreaSeries({
      lineColor: "#c9a84c",
      topColor: "rgba(201, 168, 76, 0.4)",
      bottomColor: "rgba(201, 168, 76, 0.0)",
      lineWidth: 2,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // Responsive resize
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width > 0) {
          chart.applyOptions({ width });
        }
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Update data when timeseries changes
  useEffect(() => {
    if (!seriesRef.current) return;
    const chartData = toAreaChartData(timeseries);
    seriesRef.current.setData(chartData);

    if (chartRef.current && chartData.length > 0) {
      chartRef.current.timeScale().fitContent();
    }
  }, [timeseries]);

  if (isLoading) {
    return <Skeleton height={`${CHART_HEIGHT}px`} className="w-full rounded-lg" />;
  }

  const hasData = timeseries.length > 0;

  return (
    <div className="relative">
      <div
        ref={containerRef}
        style={{ height: CHART_HEIGHT }}
        className={hasData ? "" : "invisible"}
      />
      {!hasData && (
        <div
          className="flex items-center justify-center bg-bg-secondary border border-border-primary rounded-lg"
          style={{ height: CHART_HEIGHT }}
        >
          <p className="text-text-tertiary text-sm">
            No data for selected window
          </p>
        </div>
      )}
    </div>
  );
}
