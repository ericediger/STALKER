"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DashboardEmpty } from "@/components/empty-states/DashboardEmpty";
import { HeroMetric } from "@/components/dashboard/HeroMetric";
import { SummaryCards } from "@/components/dashboard/SummaryCards";
import { PortfolioChart } from "@/components/dashboard/PortfolioChart";
import { WindowSelector } from "@/components/dashboard/WindowSelector";
import { HoldingsTable } from "@/components/holdings/HoldingsTable";
import { AddInstrumentModal } from "@/components/instruments/AddInstrumentModal";
import { Button } from "@/components/ui/Button";
import { usePortfolioSnapshot } from "@/lib/hooks/usePortfolioSnapshot";
import { usePortfolioTimeseries } from "@/lib/hooks/usePortfolioTimeseries";
import { useHoldings } from "@/lib/hooks/useHoldings";
import { useInstruments } from "@/lib/hooks/useInstruments";
import { DEFAULT_WINDOW, type WindowOption } from "@/lib/window-utils";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Holding } from "@/lib/holdings-utils";

const DASHBOARD_MAX_HOLDINGS = 20;

export default function DashboardPage() {
  const router = useRouter();
  const [selectedWindow, setSelectedWindow] = useState<WindowOption>(DEFAULT_WINDOW);
  const { data: snapshot, isLoading: snapshotLoading } = usePortfolioSnapshot(selectedWindow);
  const { data: timeseries, isLoading: timeseriesLoading } = usePortfolioTimeseries(selectedWindow);
  const { data: holdings, isLoading: holdingsLoading } = useHoldings();
  const { data: instruments, isLoading: instrumentsLoading } = useInstruments();
  const [showAddInstrument, setShowAddInstrument] = useState(false);

  const handleRowClick = useCallback((symbol: string) => {
    router.push(`/holdings/${encodeURIComponent(symbol)}`);
  }, [router]);

  const handleInstrumentAdded = useCallback(() => {
    window.location.reload();
  }, []);

  // Show empty state only when no instruments exist at all
  const hasInstruments = instruments !== null && instruments.length > 0;
  const isStillLoading = snapshotLoading || instrumentsLoading;
  const isEmpty = !isStillLoading && !hasInstruments;

  if (isEmpty) {
    return <DashboardEmpty />;
  }

  // Build display holdings: use real holdings if available, otherwise
  // create zero-value entries from instruments so the user can see
  // which instruments are tracked even before adding transactions.
  const allHoldings: Holding[] =
    holdings && holdings.length > 0
      ? holdings
      : (instruments ?? []).map((inst) => ({
          symbol: inst.symbol,
          name: inst.name,
          instrumentId: inst.id,
          qty: "0",
          price: "0",
          value: "0",
          costBasis: "0",
          unrealizedPnl: "0",
          unrealizedPnlPct: "0",
          allocation: "0",
        }));

  // Dashboard shows top N holdings by allocation (already sorted by API)
  const displayHoldings = useMemo(() =>
    allHoldings.slice(0, DASHBOARD_MAX_HOLDINGS),
    [allHoldings],
  );
  const totalHoldingsCount = allHoldings.length;
  const showViewAllLink = totalHoldingsCount > DASHBOARD_MAX_HOLDINGS;

  return (
    <div className="space-y-6 py-4">
      <div className="flex items-center justify-between">
        <HeroMetric snapshot={snapshot} isLoading={snapshotLoading} />
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowAddInstrument(true)}
          >
            + Add Instrument
          </Button>
          <WindowSelector value={selectedWindow} onChange={setSelectedWindow} />
        </div>
      </div>

      <PortfolioChart timeseries={timeseries} isLoading={timeseriesLoading} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCards snapshot={snapshot} isLoading={snapshotLoading} />
      </div>

      {holdingsLoading || instrumentsLoading ? (
        <Skeleton height="200px" className="w-full rounded-lg" />
      ) : displayHoldings.length > 0 ? (
        <div>
          <HoldingsTable holdings={displayHoldings} compact onRowClick={handleRowClick} />
          {showViewAllLink && (
            <div className="text-center text-text-tertiary text-sm py-3 border-t border-border-primary">
              Showing top {DASHBOARD_MAX_HOLDINGS} of {totalHoldingsCount} holdings{" "}
              <span className="select-none">&middot;</span>{" "}
              <Link href="/holdings" className="text-accent-primary hover:underline">
                View all holdings &rarr;
              </Link>
            </div>
          )}
        </div>
      ) : null}

      <AddInstrumentModal
        open={showAddInstrument}
        onClose={() => setShowAddInstrument(false)}
        onSuccess={handleInstrumentAdded}
      />
    </div>
  );
}
