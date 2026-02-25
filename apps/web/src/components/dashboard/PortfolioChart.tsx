"use client";

import { useRef, useEffect } from "react";
import {
  AreaSeries,
  type ISeriesApi,
  type SeriesType,
} from "lightweight-charts";
import { Skeleton } from "@/components/ui/Skeleton";
import { useChart } from "@/lib/hooks/useChart";
import { toAreaChartData, type TimeseriesPoint } from "@/lib/chart-utils";

interface PortfolioChartProps {
  timeseries: TimeseriesPoint[];
  isLoading: boolean;
}

const CHART_HEIGHT = 300;

export function PortfolioChart({ timeseries, isLoading }: PortfolioChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);

  const { chart } = useChart({
    container: containerRef,
    options: { height: CHART_HEIGHT },
  });

  // Add area series once chart is ready
  useEffect(() => {
    if (!chart) return;

    // Only add the series if we haven't already
    if (!seriesRef.current) {
      const series = chart.addSeries(AreaSeries, {
        lineColor: "#c9a84c",
        topColor: "rgba(201, 168, 76, 0.4)",
        bottomColor: "rgba(201, 168, 76, 0.0)",
        lineWidth: 2,
      });
      seriesRef.current = series;
    }

    return () => {
      seriesRef.current = null;
    };
  }, [chart]);

  // Update data when timeseries changes
  useEffect(() => {
    if (!seriesRef.current) return;
    const chartData = toAreaChartData(timeseries);
    seriesRef.current.setData(chartData);

    if (chart && chartData.length > 0) {
      chart.timeScale().fitContent();
    }
  }, [timeseries, chart]);

  const hasData = timeseries.length > 0;

  return (
    <div className="relative">
      {/* Always render the container so useChart can initialize on mount */}
      <div
        ref={containerRef}
        style={{ height: CHART_HEIGHT }}
        className={isLoading || !hasData ? "invisible absolute inset-0" : ""}
      />
      {isLoading ? (
        <Skeleton height={`${CHART_HEIGHT}px`} className="w-full rounded-lg" />
      ) : !hasData ? (
        <div
          className="flex items-center justify-center bg-bg-secondary border border-border-primary rounded-lg"
          style={{ height: CHART_HEIGHT }}
        >
          <p className="text-text-tertiary text-sm">
            No data for selected window
          </p>
        </div>
      ) : null}
    </div>
  );
}
