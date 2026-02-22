"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/cn";

interface TableColumn {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  sortable?: boolean;
  numeric?: boolean;
}

interface TableProps {
  columns: TableColumn[];
  data: Record<string, unknown>[];
  onSort?: (key: string, direction: "asc" | "desc") => void;
  emptyMessage?: string;
  className?: string;
}

const alignClasses: Record<NonNullable<TableColumn["align"]>, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export function Table({
  columns,
  data,
  onSort,
  emptyMessage = "No data",
  className,
}: TableProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const handleSort = useCallback(
    (key: string) => {
      let nextDirection: "asc" | "desc" = "asc";
      if (sortKey === key && sortDirection === "asc") {
        nextDirection = "desc";
      }
      setSortKey(key);
      setSortDirection(nextDirection);
      onSort?.(key, nextDirection);
    },
    [sortKey, sortDirection, onSort],
  );

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border-primary">
            {columns.map((col) => {
              const align = col.numeric ? "right" : (col.align ?? "left");
              const isSorted = sortKey === col.key;

              return (
                <th
                  key={col.key}
                  className={cn(
                    "text-text-tertiary text-sm font-medium uppercase tracking-wide px-3 py-2",
                    alignClasses[align],
                    col.sortable && "cursor-pointer select-none hover:text-text-secondary",
                  )}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable && isSorted && (
                      <span className="text-accent-primary">
                        {sortDirection === "asc" ? "\u25B2" : "\u25BC"}
                      </span>
                    )}
                    {col.sortable && !isSorted && (
                      <span className="text-text-tertiary opacity-0 group-hover:opacity-50">
                        {"\u25B2"}
                      </span>
                    )}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="text-center text-text-secondary py-8"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="border-b border-border-primary last:border-b-0 hover:bg-bg-tertiary transition-colors"
              >
                {columns.map((col) => {
                  const align = col.numeric ? "right" : (col.align ?? "left");
                  const cellValue = row[col.key];

                  return (
                    <td
                      key={col.key}
                      className={cn(
                        "px-3 py-2 text-text-primary",
                        alignClasses[align],
                        col.numeric && "font-mono tabular-nums",
                      )}
                    >
                      {cellValue != null ? String(cellValue) : ""}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
