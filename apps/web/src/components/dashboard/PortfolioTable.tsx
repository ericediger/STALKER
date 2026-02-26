"use client";

import { useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/cn";
import { formatCurrency, formatPercent, formatQuantity, formatMonthYear } from "@/lib/format";
import { ValueChange } from "@/components/ui/ValueChange";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { sortHoldings, computeTotals, avgCostPerShare } from "@/lib/holdings-utils";
import type { Holding, SortColumn, SortDirection } from "@/lib/holdings-utils";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface PortfolioTableProps {
  holdings: Holding[];
  onRowClick?: (symbol: string) => void;
  onDeleteSuccess?: () => void;
}

interface ColumnDef {
  key: SortColumn | "actions";
  label: string;
  align: "left" | "right";
  sortable: boolean;
}

type InstrumentTypeFilter = "ALL" | "STOCK" | "ETF" | "FUND";

/* -------------------------------------------------------------------------- */
/*  Column definitions                                                         */
/* -------------------------------------------------------------------------- */

const COLUMNS: ColumnDef[] = [
  { key: "symbol", label: "Symbol", align: "left", sortable: true },
  { key: "name", label: "Name", align: "left", sortable: true },
  { key: "firstBuyDate", label: "First Buy", align: "left", sortable: true },
  { key: "qty", label: "Qty", align: "right", sortable: true },
  { key: "avgCost", label: "Avg Cost", align: "right", sortable: true },
  { key: "costBasis", label: "Cost Basis", align: "right", sortable: true },
  { key: "price", label: "Current Price", align: "right", sortable: true },
  { key: "value", label: "Value", align: "right", sortable: true },
  { key: "unrealizedPnl", label: "PnL $", align: "right", sortable: true },
  { key: "unrealizedPnlPct", label: "PnL %", align: "right", sortable: true },
  { key: "allocation", label: "Alloc %", align: "right", sortable: true },
  { key: "actions", label: "", align: "right", sortable: false },
];

const ROWS_PER_PAGE = 20;

/* -------------------------------------------------------------------------- */
/*  Sort indicator                                                             */
/* -------------------------------------------------------------------------- */

function SortIndicator({ column, sortColumn, sortDirection }: {
  column: SortColumn | "actions";
  sortColumn: SortColumn;
  sortDirection: SortDirection;
}) {
  if (column !== sortColumn) return null;
  return (
    <span className="text-accent-primary ml-1">
      {sortDirection === "asc" ? "\u25B2" : "\u25BC"}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Trash icon                                                                 */
/* -------------------------------------------------------------------------- */

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Delete confirmation modal                                                  */
/* -------------------------------------------------------------------------- */

function DeleteInstrumentModal({
  open,
  onClose,
  holding,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  holding: Holding | null;
  onSuccess: () => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const handleDelete = useCallback(async () => {
    if (!holding?.instrumentId) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/instruments/${holding.instrumentId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      toast({ message: `${holding.symbol} deleted.`, variant: "success" });
      onClose();
      onSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete";
      toast({ message, variant: "error" });
    } finally {
      setIsDeleting(false);
    }
  }, [holding, toast, onClose, onSuccess]);

  if (!holding) return null;

  return (
    <Modal open={open} onClose={onClose} title={`Delete ${holding.symbol}?`}>
      <div className="space-y-4">
        <p className="text-text-secondary text-sm">
          This will permanently delete <strong className="text-text-primary">{holding.name}</strong> and
          all transactions associated with it. Portfolio snapshots will be rebuilt.
        </p>
        <p className="text-accent-negative text-sm font-medium">
          This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={handleDelete} loading={isDeleting}>
            Delete Instrument
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                             */
/* -------------------------------------------------------------------------- */

export function PortfolioTable({
  holdings,
  onRowClick,
  onDeleteSuccess,
}: PortfolioTableProps) {
  // Sort state — default: allocation descending
  const [sortColumn, setSortColumn] = useState<SortColumn>("allocation");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Filter state
  const [searchText, setSearchText] = useState("");
  const [typeFilter, setTypeFilter] = useState<InstrumentTypeFilter>("ALL");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Holding | null>(null);

  // Filter holdings
  const filteredHoldings = useMemo(() => {
    let result = holdings;

    if (searchText.trim()) {
      const query = searchText.toLowerCase().trim();
      result = result.filter(
        (h) =>
          h.symbol.toLowerCase().includes(query) ||
          h.name.toLowerCase().includes(query),
      );
    }

    if (typeFilter !== "ALL") {
      // We don't have instrument type in the Holding interface directly,
      // so we match by common naming patterns. This is a lightweight filter.
      // In practice, instrument type should come from the API.
      // For now, filter is a no-op for type since we don't have that data in holdings.
      // We'll leave this as "ALL" only — the dropdown is available for future use.
    }

    return result;
  }, [holdings, searchText, typeFilter]);

  // Sort holdings
  const sortedHoldings = useMemo(
    () => sortHoldings(filteredHoldings, sortColumn, sortDirection),
    [filteredHoldings, sortColumn, sortDirection],
  );

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedHoldings.length / ROWS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedHoldings = useMemo(
    () => sortedHoldings.slice((safePage - 1) * ROWS_PER_PAGE, safePage * ROWS_PER_PAGE),
    [sortedHoldings, safePage],
  );

  // Totals (computed from ALL filtered holdings, not just current page)
  const totals = useMemo(() => computeTotals(filteredHoldings), [filteredHoldings]);

  // Reset page when filter changes
  const handleSearchChange = useCallback((value: string) => {
    setSearchText(value);
    setCurrentPage(1);
  }, []);

  const handleTypeFilterChange = useCallback((value: string) => {
    setTypeFilter(value as InstrumentTypeFilter);
    setCurrentPage(1);
  }, []);

  // Sort handler: click → desc → asc → default (allocation desc)
  const handleHeaderClick = useCallback((col: ColumnDef) => {
    if (!col.sortable || col.key === "actions") return;
    const colKey = col.key as SortColumn;
    if (sortColumn === colKey) {
      if (sortDirection === "desc") {
        setSortDirection("asc");
      } else {
        // Reset to default
        setSortColumn("allocation");
        setSortDirection("desc");
      }
    } else {
      setSortColumn(colKey);
      setSortDirection("desc");
    }
  }, [sortColumn, sortDirection]);

  const handleDeleteClick = useCallback((e: React.MouseEvent, holding: Holding) => {
    e.stopPropagation();
    setDeleteTarget(holding);
  }, []);

  const handleDeleteConfirmed = useCallback(() => {
    onDeleteSuccess?.();
  }, [onDeleteSuccess]);

  return (
    <div className="bg-bg-secondary rounded-lg border border-border-primary">
      {/* Filter bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border-primary">
        <input
          type="text"
          placeholder="Filter by symbol or name..."
          value={searchText}
          onChange={(e) => handleSearchChange(e.target.value)}
          className={cn(
            "bg-bg-tertiary border border-border-primary rounded-md px-3 py-1.5",
            "text-text-primary text-sm placeholder:text-text-tertiary",
            "focus:outline-none focus:ring-1 focus:ring-accent-primary",
            "w-64",
          )}
        />
        <select
          value={typeFilter}
          onChange={(e) => handleTypeFilterChange(e.target.value)}
          className="bg-bg-tertiary text-text-primary border border-border-primary rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent-primary"
        >
          <option value="ALL">All Types</option>
          <option value="STOCK">Stock</option>
          <option value="ETF">ETF</option>
          <option value="FUND">Fund</option>
        </select>
        <span className="ml-auto text-text-tertiary text-sm">
          {filteredHoldings.length} holding{filteredHoldings.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
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
                    col.sortable && "cursor-pointer select-none hover:text-text-secondary",
                    col.key === "actions" && "w-10",
                  )}
                  onClick={() => handleHeaderClick(col)}
                >
                  {col.key !== "actions" && (
                    <span className="inline-flex items-center">
                      {col.label}
                      {col.sortable && (
                        <SortIndicator
                          column={col.key}
                          sortColumn={sortColumn}
                          sortDirection={sortDirection}
                        />
                      )}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedHoldings.map((holding) => (
              <PortfolioTableRow
                key={holding.instrumentId ?? holding.symbol}
                holding={holding}
                onRowClick={onRowClick}
                onDeleteClick={handleDeleteClick}
              />
            ))}
          </tbody>
          {/* Totals row */}
          <tfoot>
            <tr className="border-t-2 border-border-primary">
              <td className="px-3 py-2 text-text-primary font-semibold text-sm">Total</td>
              <td className="px-3 py-2" />
              <td className="px-3 py-2" />
              <td className="px-3 py-2" />
              <td className="px-3 py-2" />
              <td className="px-3 py-2 text-right font-mono tabular-nums text-text-primary font-semibold text-sm">
                {formatCurrency(totals.totalCostBasis)}
              </td>
              <td className="px-3 py-2" />
              <td className="px-3 py-2 text-right font-mono tabular-nums text-text-primary font-semibold text-sm">
                {formatCurrency(totals.totalValue)}
              </td>
              <td className="px-3 py-2 text-right font-semibold text-sm">
                <ValueChange value={totals.totalUnrealizedPnl} format="currency" />
              </td>
              <td className="px-3 py-2" />
              <td className="px-3 py-2" />
              <td className="px-3 py-2" />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 px-4 py-3 border-t border-border-primary text-sm">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className={cn(
              "text-text-secondary hover:text-text-primary transition-colors",
              safePage <= 1 && "opacity-40 cursor-not-allowed",
            )}
          >
            &larr; Prev
          </button>
          <span className="text-text-tertiary">
            Page {safePage} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className={cn(
              "text-text-secondary hover:text-text-primary transition-colors",
              safePage >= totalPages && "opacity-40 cursor-not-allowed",
            )}
          >
            Next &rarr;
          </button>
        </div>
      )}

      {/* Delete confirmation modal */}
      <DeleteInstrumentModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        holding={deleteTarget}
        onSuccess={handleDeleteConfirmed}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Table row                                                                  */
/* -------------------------------------------------------------------------- */

function PortfolioTableRow({
  holding,
  onRowClick,
  onDeleteClick,
}: {
  holding: Holding;
  onRowClick?: (symbol: string) => void;
  onDeleteClick: (e: React.MouseEvent, holding: Holding) => void;
}) {
  return (
    <tr
      className={cn(
        "border-b border-border-primary last:border-b-0 hover:bg-bg-tertiary transition-colors group",
        onRowClick && "cursor-pointer",
      )}
      onClick={onRowClick ? () => onRowClick(holding.symbol) : undefined}
    >
      <td className="px-3 py-2 text-text-primary font-medium text-sm">
        {holding.symbol}
      </td>
      <td className="px-3 py-2 text-text-secondary text-sm truncate max-w-[180px]">
        {holding.name}
      </td>
      <td className="px-3 py-2 text-text-secondary text-sm">
        {holding.firstBuyDate ? formatMonthYear(holding.firstBuyDate) : "\u2014"}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-text-primary text-sm">
        {formatQuantity(holding.qty)}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-text-primary text-sm">
        {(() => {
          const avg = avgCostPerShare(holding.costBasis, holding.qty);
          return avg ? formatCurrency(avg) : "\u2014";
        })()}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-text-primary text-sm">
        {formatCurrency(holding.costBasis)}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-text-primary text-sm">
        {formatCurrency(holding.price)}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-text-primary text-sm">
        {formatCurrency(holding.value)}
      </td>
      <td className="px-3 py-2 text-right text-sm">
        <ValueChange value={holding.unrealizedPnl} format="currency" />
      </td>
      <td className="px-3 py-2 text-right text-sm">
        <ValueChange value={holding.unrealizedPnlPct} format="percent" />
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-text-primary text-sm">
        {formatPercent(holding.allocation)}
      </td>
      <td className="px-3 py-2 text-right w-10">
        <button
          type="button"
          onClick={(e) => onDeleteClick(e, holding)}
          className="text-text-tertiary hover:text-accent-negative transition-colors opacity-0 group-hover:opacity-100 p-1"
          aria-label={`Delete ${holding.symbol}`}
        >
          <TrashIcon />
        </button>
      </td>
    </tr>
  );
}
