"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { DashboardEmpty } from "@/components/empty-states/DashboardEmpty";
import { HeroMetric } from "@/components/dashboard/HeroMetric";
import { SummaryCards } from "@/components/dashboard/SummaryCards";
import { PortfolioChart } from "@/components/dashboard/PortfolioChart";
import { WindowSelector } from "@/components/dashboard/WindowSelector";
import { PortfolioTable } from "@/components/dashboard/PortfolioTable";
import { AddInstrumentModal } from "@/components/instruments/AddInstrumentModal";
import { BulkPastePanel } from "@/components/transactions/BulkPastePanel";
import { Button } from "@/components/ui/Button";
import { usePortfolioSnapshot } from "@/lib/hooks/usePortfolioSnapshot";
import { usePortfolioTimeseries } from "@/lib/hooks/usePortfolioTimeseries";
import { useHoldings } from "@/lib/hooks/useHoldings";
import { useInstruments } from "@/lib/hooks/useInstruments";
import { DEFAULT_WINDOW, type WindowOption } from "@/lib/window-utils";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Holding } from "@/lib/holdings-utils";

export default function PortfolioPage() {
  const router = useRouter();
  const [selectedWindow, setSelectedWindow] = useState<WindowOption>(DEFAULT_WINDOW);
  const { data: snapshot, isLoading: snapshotLoading } = usePortfolioSnapshot(selectedWindow);
  const { data: timeseries, isLoading: timeseriesLoading } = usePortfolioTimeseries(selectedWindow);
  const { data: holdings, isLoading: holdingsLoading, refetch: refetchHoldings } = useHoldings();
  const { data: instruments, isLoading: instrumentsLoading } = useInstruments();
  const [showAddInstrument, setShowAddInstrument] = useState(false);

  const handleRowClick = useCallback((symbol: string) => {
    router.push(`/holdings/${encodeURIComponent(symbol)}`);
  }, [router]);

  const handleInstrumentAdded = useCallback(() => {
    window.location.reload();
  }, []);

  const handleDeleteSuccess = useCallback(() => {
    refetchHoldings();
  }, [refetchHoldings]);

  const handleBulkImportSuccess = useCallback(() => {
    refetchHoldings();
  }, [refetchHoldings]);

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
          firstBuyDate: null,
        }));

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
      ) : allHoldings.length > 0 ? (
        <PortfolioTable
          holdings={allHoldings}
          onRowClick={handleRowClick}
          onDeleteSuccess={handleDeleteSuccess}
        />
      ) : null}

      {/* Bulk Import — collapsible section below table */}
      {hasInstruments && (
        <BulkPastePanel onImportSuccess={handleBulkImportSuccess} />
      )}

      <AddInstrumentModal
        open={showAddInstrument}
        onClose={() => setShowAddInstrument(false)}
        onSuccess={handleInstrumentAdded}
      />
    </div>
  );
}
