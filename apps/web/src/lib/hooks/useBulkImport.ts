"use client";

import { useState, useCallback } from "react";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface BulkImportRow {
  symbol: string;
  type: "BUY" | "SELL";
  quantity: string;
  price: string;
  date: string;
  fees?: string;
  notes?: string;
}

export interface BulkImportError {
  lineNumber: number;
  symbol: string;
  error: string;
}

export interface BulkImportResult {
  inserted: number;
  skipped: number;
  errors: BulkImportError[];
  earliestDate: string | null;
}

interface UseBulkImportReturn {
  submit: (rows: BulkImportRow[], dryRun?: boolean) => Promise<BulkImportResult | null>;
  isLoading: boolean;
  error: string | null;
  result: BulkImportResult | null;
  reset: () => void;
}

/* -------------------------------------------------------------------------- */
/*  Hook                                                                       */
/* -------------------------------------------------------------------------- */

export function useBulkImport(): UseBulkImportReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);

  const reset = useCallback(() => {
    setError(null);
    setResult(null);
  }, []);

  const submit = useCallback(
    async (rows: BulkImportRow[], dryRun = false): Promise<BulkImportResult | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/transactions/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows, dryRun }),
        });

        const body: BulkImportResult = await response.json();

        if (response.status === 400) {
          setError("Invalid request. Check that all rows are properly formatted.");
          setIsLoading(false);
          return null;
        }

        // 422 = validation errors (unknown symbols, sell validation failure)
        // Still return the result so the UI can show per-row errors
        setResult(body);
        setIsLoading(false);

        if (!response.ok && response.status !== 422) {
          setError(body.errors?.[0]?.error ?? "Failed to import transactions");
          return null;
        }

        return body;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Network error";
        setError(msg);
        setIsLoading(false);
        return null;
      }
    },
    [],
  );

  return { submit, isLoading, error, result, reset };
}
