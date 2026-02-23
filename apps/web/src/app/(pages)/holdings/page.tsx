"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useHoldings } from "@/lib/hooks/useHoldings";
import { useMarketStatus } from "@/lib/hooks/useMarketStatus";
import { sortHoldings } from "@/lib/holdings-utils";
import { HoldingsTable } from "@/components/holdings/HoldingsTable";
import { TotalsRow } from "@/components/holdings/TotalsRow";
import { StalenessBanner } from "@/components/holdings/StalenessBanner";
import { HoldingsEmpty } from "@/components/empty-states/HoldingsEmpty";
import { Skeleton } from "@/components/ui/Skeleton";
import type { SortColumn, SortDirection } from "@/lib/holdings-utils";

export default function HoldingsPage() {
  const router = useRouter();
  const { data: holdings, isLoading, error } = useHoldings();
  const { data: marketStatus } = useMarketStatus();

  const [sortColumn, setSortColumn] = useState<SortColumn>("value");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const handleRowClick = useCallback((symbol: string) => {
    router.push(`/holdings/${encodeURIComponent(symbol)}`);
  }, [router]);

  const staleInstruments = marketStatus?.freshness.staleInstruments ?? [];

  const sortedHoldings = useMemo(() => {
    if (!holdings) return [];
    return sortHoldings(holdings, sortColumn, sortDirection);
  }, [holdings, sortColumn, sortDirection]);

  const handleSort = (col: SortColumn, dir: SortDirection) => {
    setSortColumn(col);
    setSortDirection(dir);
  };

  if (isLoading) {
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

  if (!holdings || holdings.length === 0) {
    return <HoldingsEmpty />;
  }

  return (
    <div className="flex flex-col gap-4 p-section">
      <h1 className="text-xl font-heading text-text-primary">Holdings</h1>
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
        <TotalsRow holdings={holdings} />
      </div>
    </div>
  );
}
