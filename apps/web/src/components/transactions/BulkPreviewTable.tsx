"use client";

import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import type { ParsedRow } from "@/lib/bulk-parser";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface BulkPreviewError {
  lineNumber: number;
  symbol: string;
  error: string;
}

interface BulkPreviewTableProps {
  rows: ParsedRow[];
  serverErrors?: BulkPreviewError[];
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function BulkPreviewTable({ rows, serverErrors = [] }: BulkPreviewTableProps) {
  // Build a map of server errors by line number for quick lookup
  const serverErrorMap = new Map<number, string>();
  for (const err of serverErrors) {
    serverErrorMap.set(err.lineNumber, err.error);
  }

  const validCount = rows.filter((r) => r.errors.length === 0 && !serverErrorMap.has(r.lineNumber)).length;
  const totalCount = rows.length;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border-primary">
              <th className="text-text-tertiary text-xs font-medium uppercase tracking-wide px-2 py-1.5 text-center w-8">
                {/* Status icon */}
              </th>
              <th className="text-text-tertiary text-xs font-medium uppercase tracking-wide px-2 py-1.5 text-center w-10">
                #
              </th>
              <th className="text-text-tertiary text-xs font-medium uppercase tracking-wide px-2 py-1.5 text-left">
                Symbol
              </th>
              <th className="text-text-tertiary text-xs font-medium uppercase tracking-wide px-2 py-1.5 text-left">
                Type
              </th>
              <th className="text-text-tertiary text-xs font-medium uppercase tracking-wide px-2 py-1.5 text-right font-mono">
                Qty
              </th>
              <th className="text-text-tertiary text-xs font-medium uppercase tracking-wide px-2 py-1.5 text-right font-mono">
                Price
              </th>
              <th className="text-text-tertiary text-xs font-medium uppercase tracking-wide px-2 py-1.5 text-left">
                Date
              </th>
              <th className="text-text-tertiary text-xs font-medium uppercase tracking-wide px-2 py-1.5 text-right font-mono">
                Fees
              </th>
              <th className="text-text-tertiary text-xs font-medium uppercase tracking-wide px-2 py-1.5 text-left">
                Notes
              </th>
              <th className="text-text-tertiary text-xs font-medium uppercase tracking-wide px-2 py-1.5 text-left">
                Error
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const serverError = serverErrorMap.get(row.lineNumber);
              const hasError = row.errors.length > 0 || !!serverError;
              const errorMessage = row.errors.length > 0
                ? row.errors.join('; ')
                : serverError ?? '';

              return (
                <tr
                  key={row.lineNumber}
                  className={cn(
                    "border-b border-border-primary last:border-b-0 transition-colors",
                    hasError
                      ? "bg-accent-negative/5"
                      : "hover:bg-bg-tertiary",
                  )}
                >
                  {/* Status icon */}
                  <td className="px-2 py-1.5 text-center">
                    {hasError ? (
                      <span className="text-accent-negative text-base" aria-label="Error">
                        {"\u2717"}
                      </span>
                    ) : (
                      <span className="text-accent-positive text-base" aria-label="Valid">
                        {"\u2713"}
                      </span>
                    )}
                  </td>

                  {/* Line number */}
                  <td className="px-2 py-1.5 text-center text-text-tertiary font-mono text-xs">
                    {row.lineNumber}
                  </td>

                  {/* Symbol */}
                  <td className="px-2 py-1.5 text-text-primary font-medium">
                    {row.parsed?.symbol ?? row.raw.split(/[\t\s]+/)[0] ?? ""}
                  </td>

                  {/* Type */}
                  <td className="px-2 py-1.5">
                    {row.parsed ? (
                      <Badge variant={row.parsed.type === "BUY" ? "positive" : "negative"} size="sm">
                        {row.parsed.type}
                      </Badge>
                    ) : (
                      <span className="text-text-tertiary">{"\u2014"}</span>
                    )}
                  </td>

                  {/* Quantity */}
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums text-text-primary">
                    {row.parsed?.quantity ?? "\u2014"}
                  </td>

                  {/* Price */}
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums text-text-primary">
                    {row.parsed?.price ?? "\u2014"}
                  </td>

                  {/* Date */}
                  <td className="px-2 py-1.5 text-text-primary">
                    {row.parsed?.date ?? "\u2014"}
                  </td>

                  {/* Fees */}
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums text-text-secondary">
                    {row.parsed?.fees ?? "\u2014"}
                  </td>

                  {/* Notes */}
                  <td className="px-2 py-1.5 text-text-secondary text-xs max-w-[120px] truncate">
                    {row.parsed?.notes || "\u2014"}
                  </td>

                  {/* Error message */}
                  <td className="px-2 py-1.5 text-accent-negative text-xs max-w-[200px]">
                    {errorMessage || ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <p className="text-text-secondary text-sm">
        <span className="font-medium text-text-primary">{validCount}</span> of{" "}
        <span className="font-medium text-text-primary">{totalCount}</span> rows valid.
      </p>
    </div>
  );
}
