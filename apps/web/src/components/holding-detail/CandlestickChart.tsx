"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import { CandlestickSeries, type ISeriesApi, type SeriesType } from "lightweight-charts";
import { useChart } from "@/lib/hooks/useChart";
import { useMarketHistory } from "@/lib/hooks/useMarketHistory";
import { toCandlestickData } from "@/lib/chart-candlestick-utils";
import { PillToggle } from "@/components/ui/PillToggle";
import { Skeleton } from "@/components/ui/Skeleton";

type ChartRange = "1M" | "3M" | "6M" | "1Y" | "ALL";

const RANGE_OPTIONS: { label: string; value: ChartRange }[] = [
  { label: "1M", value: "1M" },
  { label: "3M", value: "3M" },
  { label: "6M", value: "6M" },
  { label: "1Y", value: "1Y" },
  { label: "ALL", value: "ALL" },
];

const CHART_HEIGHT = 340;

function getStartDate(range: ChartRange): string | undefined {
  if (range === "ALL") return undefined;
  const now = new Date();
  switch (range) {
    case "1M":
      now.setMonth(now.getMonth() - 1);
      break;
    case "3M":
      now.setMonth(now.getMonth() - 3);
      break;
    case "6M":
      now.setMonth(now.getMonth() - 6);
      break;
    case "1Y":
      now.setFullYear(now.getFullYear() - 1);
      break;
  }
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

interface CandlestickChartProps {
  symbol: string;
}

export function CandlestickChart({ symbol }: CandlestickChartProps) {
  const [range, setRange] = useState<ChartRange>("3M");
  const containerRef = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);

  const startDate = useMemo(() => getStartDate(range), [range]);
  const { data: bars, isLoading } = useMarketHistory(symbol, startDate);

  const { chart } = useChart({
    container: containerRef,
    options: { height: CHART_HEIGHT },
  });

  // Attach candlestick series once chart is ready
  useEffect(() => {
    if (!chart) return;
    if (seriesRef.current) return;

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      borderVisible: false,
    });
    seriesRef.current = series;

    return () => {
      seriesRef.current = null;
    };
  }, [chart]);

  // Update data when bars change
  useEffect(() => {
    if (!seriesRef.current) return;
    const chartData = toCandlestickData(bars);
    seriesRef.current.setData(chartData);

    if (chart && chartData.length > 0) {
      chart.timeScale().fitContent();
    }
  }, [bars, chart]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-heading text-text-primary">Price Chart</h2>
        <PillToggle
          options={RANGE_OPTIONS}
          value={range}
          onChange={(v) => setRange(v as ChartRange)}
        />
      </div>
      {isLoading && !bars.length ? (
        <Skeleton height={`${CHART_HEIGHT}px`} className="w-full rounded-lg" />
      ) : (
        <div className="relative">
          <div
            ref={containerRef}
            style={{ height: CHART_HEIGHT }}
            className={bars.length > 0 ? "" : "invisible"}
          />
          {bars.length === 0 && (
            <div
              className="flex items-center justify-center bg-bg-secondary border border-border-primary rounded-lg"
              style={{ height: CHART_HEIGHT }}
            >
              <p className="text-text-tertiary text-sm">
                No data for selected range
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
