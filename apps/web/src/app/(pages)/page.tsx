"use client";

import { useState } from "react";
import { DashboardEmpty } from "@/components/empty-states/DashboardEmpty";
import { HeroMetric } from "@/components/dashboard/HeroMetric";
import { SummaryCards } from "@/components/dashboard/SummaryCards";
import { PortfolioChart } from "@/components/dashboard/PortfolioChart";
import { WindowSelector } from "@/components/dashboard/WindowSelector";
import { usePortfolioSnapshot } from "@/lib/hooks/usePortfolioSnapshot";
import { usePortfolioTimeseries } from "@/lib/hooks/usePortfolioTimeseries";
import { DEFAULT_WINDOW, type WindowOption } from "@/lib/window-utils";

export default function DashboardPage() {
  const [selectedWindow, setSelectedWindow] = useState<WindowOption>(DEFAULT_WINDOW);
  const { data: snapshot, isLoading: snapshotLoading } = usePortfolioSnapshot(selectedWindow);
  const { data: timeseries, isLoading: timeseriesLoading } = usePortfolioTimeseries(selectedWindow);

  // Show empty state when not loading and no holdings
  const isEmpty =
    !snapshotLoading &&
    snapshot !== null &&
    snapshot.holdings.length === 0;

  if (isEmpty) {
    return <DashboardEmpty />;
  }

  return (
    <div className="space-y-6 py-4">
      <div className="flex items-center justify-between">
        <HeroMetric snapshot={snapshot} isLoading={snapshotLoading} />
        <WindowSelector value={selectedWindow} onChange={setSelectedWindow} />
      </div>

      <PortfolioChart timeseries={timeseries} isLoading={timeseriesLoading} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCards snapshot={snapshot} isLoading={snapshotLoading} />
      </div>

      {/* TODO: HoldingsTable compact view — integrate when holdings-engineer delivers */}
    </div>
  );
}
