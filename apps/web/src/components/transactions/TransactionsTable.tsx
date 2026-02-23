"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/Badge";
import {
  formatDate,
  formatCurrency,
  formatQuantity,
} from "@/lib/format";
import { toDecimal, mul } from "@stalker/shared";
import {
  sortTransactions,
  type TransactionRow,
  type SortColumn,
  type SortDirection,
} from "@/lib/transaction-utils";
import { cn } from "@/lib/cn";

interface TransactionsTableProps {
  transactions: TransactionRow[];
  onEdit: (tx: TransactionRow) => void;
  onDelete: (tx: TransactionRow) => void;
}

const COLUMNS: { key: SortColumn; label: string; align: "left" | "right" }[] =
  [
    { key: "tradeAt", label: "Date", align: "left" },
    { key: "symbol", label: "Symbol", align: "left" },
    { key: "type", label: "Type", align: "left" },
    { key: "quantity", label: "Qty", align: "right" },
    { key: "price", label: "Price", align: "right" },
    { key: "fees", label: "Fees", align: "right" },
    { key: "total", label: "Total", align: "right" },
  ];

function SortIcon({
  active,
  direction,
}: {
  active: boolean;
  direction: SortDirection;
}) {
  if (!active) {
    return (
      <span className="text-text-tertiary ml-1 text-xs opacity-0 group-hover:opacity-100">
        {"\u2195"}
      </span>
    );
  }
  return (
    <span className="text-accent-primary ml-1 text-xs">
      {direction === "asc" ? "\u25B2" : "\u25BC"}
    </span>
  );
}

export function TransactionsTable({
  transactions,
  onEdit,
  onDelete,
}: TransactionsTableProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>("tradeAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const sorted = useMemo(
    () => sortTransactions(transactions, sortColumn, sortDirection),
    [transactions, sortColumn, sortDirection],
  );

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDirection(col === "tradeAt" ? "desc" : "asc");
    }
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
                  "px-3 py-2 text-xs font-medium text-text-tertiary uppercase tracking-wider cursor-pointer select-none group",
                  col.align === "right" ? "text-right" : "text-left",
                )}
                onClick={() => handleSort(col.key)}
              >
                <span className="inline-flex items-center">
                  {col.label}
                  <SortIcon
                    active={sortColumn === col.key}
                    direction={sortDirection}
                  />
                </span>
              </th>
            ))}
            <th className="px-3 py-2 text-xs font-medium text-text-tertiary uppercase tracking-wider text-right">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((tx) => {
            const total = mul(
              toDecimal(tx.quantity),
              toDecimal(tx.price),
            ).toString();

            return (
              <tr
                key={tx.id}
                className="border-b border-border-primary/50 hover:bg-bg-tertiary/50 transition-colors"
              >
                <td className="px-3 py-2.5 text-sm text-text-primary">
                  {formatDate(tx.tradeAt)}
                </td>
                <td className="px-3 py-2.5 text-sm text-text-primary font-medium">
                  {tx.symbol}
                </td>
                <td className="px-3 py-2.5">
                  <Badge
                    variant={tx.type === "BUY" ? "positive" : "negative"}
                    size="sm"
                  >
                    {tx.type}
                  </Badge>
                </td>
                <td className="px-3 py-2.5 text-sm text-text-primary font-mono text-right tabular-nums">
                  {formatQuantity(tx.quantity)}
                </td>
                <td className="px-3 py-2.5 text-sm text-text-primary font-mono text-right tabular-nums">
                  {formatCurrency(tx.price)}
                </td>
                <td className="px-3 py-2.5 text-sm text-text-secondary font-mono text-right tabular-nums">
                  {formatCurrency(tx.fees)}
                </td>
                <td className="px-3 py-2.5 text-sm text-text-primary font-mono text-right tabular-nums font-medium">
                  {formatCurrency(total)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onEdit(tx)}
                      className="p-1.5 text-text-tertiary hover:text-text-primary transition-colors rounded hover:bg-bg-tertiary"
                      aria-label={`Edit ${tx.symbol} transaction`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="w-4 h-4"
                      >
                        <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(tx)}
                      className="p-1.5 text-text-tertiary hover:text-accent-negative transition-colors rounded hover:bg-bg-tertiary"
                      aria-label={`Delete ${tx.symbol} transaction`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="w-4 h-4"
                      >
                        <path
                          fillRule="evenodd"
                          d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
