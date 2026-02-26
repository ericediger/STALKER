"use client";

import { cn } from "@/lib/cn";
import { formatCurrency, formatPercent, formatQuantity } from "@/lib/format";
import { ValueChange } from "@/components/ui/ValueChange";
import { StalenessIndicator } from "./StalenessIndicator";
import type { Holding, SortColumn, SortDirection } from "@/lib/holdings-utils";
import type { StaleInstrument } from "@/lib/hooks/useMarketStatus";
import { isSymbolStale } from "@/lib/holdings-utils";

interface HoldingsTableProps {
  holdings: Holding[];
  compact?: boolean;
  onSort?: (col: SortColumn, dir: SortDirection) => void;
  sortColumn?: SortColumn;
  sortDirection?: SortDirection;
  staleInstruments?: StaleInstrument[];
  onRowClick?: (symbol: string) => void;
}

interface ColumnDef {
  key: SortColumn;
  label: string;
  align: "left" | "right";
  sortable: boolean;
}

const COLUMNS: ColumnDef[] = [
  { key: "symbol", label: "Symbol", align: "left", sortable: true },
  { key: "name", label: "Name", align: "left", sortable: true },
  { key: "qty", label: "Qty", align: "right", sortable: true },
  { key: "price", label: "Current Price", align: "right", sortable: true },
  { key: "value", label: "Value", align: "right", sortable: true },
  { key: "unrealizedPnl", label: "PnL $", align: "right", sortable: true },
  { key: "unrealizedPnlPct", label: "PnL %", align: "right", sortable: true },
  { key: "allocation", label: "Alloc %", align: "right", sortable: true },
];

function SortIndicator({ column, sortColumn, sortDirection }: {
  column: SortColumn;
  sortColumn?: SortColumn;
  sortDirection?: SortDirection;
}) {
  if (column !== sortColumn) return null;
  return (
    <span className="text-accent-primary ml-1">
      {sortDirection === "asc" ? "\u25B2" : "\u25BC"}
    </span>
  );
}

export function HoldingsTable({
  holdings,
  compact = false,
  onSort,
  sortColumn,
  sortDirection,
  staleInstruments = [],
  onRowClick,
}: HoldingsTableProps) {
  const handleHeaderClick = (col: ColumnDef) => {
    if (!col.sortable || compact || !onSort) return;
    const nextDir: SortDirection =
      sortColumn === col.key && sortDirection === "asc" ? "desc" : "asc";
    onSort(col.key, nextDir);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border-primary">
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "text-text-tertiary text-xs font-medium uppercase tracking-wide px-3 py-2",
                  col.align === "right" ? "text-right" : "text-left",
                  !compact && col.sortable && "cursor-pointer select-none hover:text-text-secondary",
                )}
                onClick={() => handleHeaderClick(col)}
              >
                <span className="inline-flex items-center">
                  {col.label}
                  {!compact && col.sortable && (
                    <SortIndicator
                      column={col.key}
                      sortColumn={sortColumn}
                      sortDirection={sortDirection}
                    />
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {holdings.map((holding) => (
            <HoldingsTableRow
              key={holding.instrumentId}
              holding={holding}
              staleInstruments={staleInstruments}
              compact={compact}
              onRowClick={onRowClick}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HoldingsTableRow({ holding, staleInstruments, compact, onRowClick }: {
  holding: Holding;
  staleInstruments: StaleInstrument[];
  compact: boolean;
  onRowClick?: (symbol: string) => void;
}) {
  const stale = !compact && isSymbolStale(holding.symbol, staleInstruments);
  const staleEntry = stale
    ? staleInstruments.find((s) => s.symbol === holding.symbol)
    : undefined;

  return (
    <tr
      className={cn(
        "border-b border-border-primary last:border-b-0 hover:bg-bg-tertiary transition-colors",
        onRowClick && "cursor-pointer",
      )}
      onClick={onRowClick ? () => onRowClick(holding.symbol) : undefined}
    >
      <td className="px-3 py-2 text-text-primary font-medium">
        {holding.symbol}
      </td>
      <td className="px-3 py-2 text-text-secondary text-sm truncate max-w-[200px]">
        {holding.name}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-text-primary">
        {formatQuantity(holding.qty)}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-text-primary">
        <span className="inline-flex items-center gap-1.5 justify-end">
          {formatCurrency(holding.price)}
          {staleEntry && (
            <StalenessIndicator lastUpdated={staleEntry.lastUpdated} />
          )}
        </span>
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-text-primary">
        {formatCurrency(holding.value)}
      </td>
      <td className="px-3 py-2 text-right">
        <ValueChange value={holding.unrealizedPnl} format="currency" />
      </td>
      <td className="px-3 py-2 text-right">
        <ValueChange value={holding.unrealizedPnlPct} format="percent" />
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-text-primary">
        {formatPercent(holding.allocation)}
      </td>
    </tr>
  );
}
