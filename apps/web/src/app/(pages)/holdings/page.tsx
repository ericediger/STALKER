"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useHoldings } from "@/lib/hooks/useHoldings";
import { useInstruments } from "@/lib/hooks/useInstruments";
import { useMarketStatus } from "@/lib/hooks/useMarketStatus";
import { sortHoldings } from "@/lib/holdings-utils";
import { HoldingsTable } from "@/components/holdings/HoldingsTable";
import { TotalsRow } from "@/components/holdings/TotalsRow";
import { StalenessBanner } from "@/components/holdings/StalenessBanner";
import { HoldingsEmpty } from "@/components/empty-states/HoldingsEmpty";
import { AddInstrumentModal } from "@/components/instruments/AddInstrumentModal";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Holding, SortColumn, SortDirection } from "@/lib/holdings-utils";

export default function HoldingsPage() {
  const router = useRouter();
  const { data: holdings, isLoading, error } = useHoldings();
  const { data: instruments, isLoading: instrumentsLoading } = useInstruments();
  const { data: marketStatus } = useMarketStatus();

  const [sortColumn, setSortColumn] = useState<SortColumn>("value");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [showAddInstrument, setShowAddInstrument] = useState(false);

  const handleInstrumentAdded = useCallback(() => {
    window.location.reload();
  }, []);

  const handleRowClick = useCallback((symbol: string) => {
    router.push(`/holdings/${encodeURIComponent(symbol)}`);
  }, [router]);

  const staleInstruments = marketStatus?.freshness.staleInstruments ?? [];

  // Use real holdings if available, otherwise show instruments as zero-value rows
  const displayHoldings: Holding[] = useMemo(() => {
    if (holdings && holdings.length > 0) return holdings;
    if (instruments && instruments.length > 0) {
      return instruments.map((inst) => ({
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
    }
    return [];
  }, [holdings, instruments]);

  const sortedHoldings = useMemo(() => {
    return sortHoldings(displayHoldings, sortColumn, sortDirection);
  }, [displayHoldings, sortColumn, sortDirection]);

  const handleSort = (col: SortColumn, dir: SortDirection) => {
    setSortColumn(col);
    setSortDirection(dir);
  };

  if (isLoading || instrumentsLoading) {
    return (
      <div className="flex flex-col gap-3 p-section">
        <Skeleton height="2rem" width="200px" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} height="3rem" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-section text-accent-negative">
        Failed to load holdings: {error.message}
      </div>
    );
  }

  // Show empty state only when no instruments exist
  if (displayHoldings.length === 0) {
    return <HoldingsEmpty />;
  }

  return (
    <div className="flex flex-col gap-4 p-section">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-heading text-text-primary">Holdings</h1>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowAddInstrument(true)}
        >
          + Add Instrument
        </Button>
      </div>
      <StalenessBanner staleInstruments={staleInstruments} />
      <div className="bg-bg-secondary rounded-lg border border-border-primary">
        <HoldingsTable
          holdings={sortedHoldings}
          onSort={handleSort}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          staleInstruments={staleInstruments}
          onRowClick={handleRowClick}
        />
        {holdings && holdings.length > 0 && <TotalsRow holdings={holdings} />}
      </div>
      <AddInstrumentModal
        open={showAddInstrument}
        onClose={() => setShowAddInstrument(false)}
        onSuccess={handleInstrumentAdded}
      />
    </div>
  );
}
