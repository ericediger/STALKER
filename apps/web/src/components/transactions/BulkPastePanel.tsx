"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { BulkPreviewTable, type BulkPreviewError } from "./BulkPreviewTable";
import { parseBulkInput, type ParsedRow } from "@/lib/bulk-parser";
import { useBulkImport, type BulkImportRow } from "@/lib/hooks/useBulkImport";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface BulkPastePanelProps {
  onImportSuccess: () => void;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

const PLACEHOLDER = `VTI\tBUY\t50\t220.00\t2025-06-15
QQQ\tBUY\t30\t465.00\t2025-07-01
VTI\tSELL\t20\t235.50\t2025-11-20\t4.95\tRebalance`;

export function BulkPastePanel({ onImportSuccess }: BulkPastePanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [rawText, setRawText] = useState("");
  const [parsedRows, setParsedRows] = useState<ParsedRow[] | null>(null);
  const [serverErrors, setServerErrors] = useState<BulkPreviewError[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { submit, isLoading, error: importError, reset: resetImport } = useBulkImport();
  const { toast } = useToast();

  // Count valid rows from parsed results
  const validRows = parsedRows?.filter((r) => r.errors.length === 0) ?? [];
  const validCount = validRows.length;

  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleParse = useCallback(() => {
    setServerErrors([]);
    resetImport();
    const rows = parseBulkInput(rawText);
    setParsedRows(rows);
  }, [rawText, resetImport]);

  const handleCancel = useCallback(() => {
    setParsedRows(null);
    setServerErrors([]);
    resetImport();
  }, [resetImport]);

  const handleImport = useCallback(async () => {
    if (validCount === 0 || !parsedRows) return;

    // Build rows from valid parsed data only
    const apiRows: BulkImportRow[] = validRows.map((r) => ({
      symbol: r.parsed!.symbol,
      type: r.parsed!.type,
      quantity: r.parsed!.quantity,
      price: r.parsed!.price,
      date: r.parsed!.date,
      fees: r.parsed!.fees,
      notes: r.parsed!.notes || undefined,
    }));

    const result = await submit(apiRows);

    if (result && result.inserted > 0) {
      const autoCreated = (result as { autoCreatedInstruments?: string[] }).autoCreatedInstruments ?? [];
      const autoMsg = autoCreated.length > 0
        ? ` Auto-added: ${autoCreated.join(", ")}.`
        : "";
      toast({
        message: `Imported ${result.inserted} transaction${result.inserted > 1 ? "s" : ""}.${autoMsg} Backfilling price history...`,
        variant: "success",
      });
      // Reset state
      setRawText("");
      setParsedRows(null);
      setServerErrors([]);
      setIsExpanded(false);
      onImportSuccess();
    } else if (result && result.errors.length > 0) {
      // Server returned validation errors — merge into preview
      setServerErrors(result.errors);
      toast({
        message: "Import failed. Check the errors below.",
        variant: "error",
      });
    }
  }, [validCount, parsedRows, validRows, submit, toast, onImportSuccess]);

  return (
    <div className="bg-bg-secondary rounded-lg border border-border-primary">
      {/* Disclosure header */}
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          "w-full flex items-center gap-2 px-4 py-3 text-left",
          "text-text-secondary hover:text-text-primary transition-colors",
          "focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary rounded-lg",
        )}
        aria-expanded={isExpanded}
      >
        <span
          className={cn(
            "text-xs transition-transform duration-200",
            isExpanded && "rotate-90",
          )}
        >
          {"\u25B6"}
        </span>
        <span className="font-body text-sm font-medium">Bulk Import</span>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Textarea */}
          <div className="space-y-2">
            <label htmlFor="bulk-paste-input" className="text-text-tertiary text-xs block">
              Paste tab-separated rows: Symbol, Type, Quantity, Price, Date [, Fees, Notes]
            </label>
            <textarea
              ref={textareaRef}
              id="bulk-paste-input"
              value={rawText}
              onChange={(e) => {
                setRawText(e.target.value);
                // Clear parsed results when text changes
                if (parsedRows) {
                  setParsedRows(null);
                  setServerErrors([]);
                  resetImport();
                }
              }}
              placeholder={PLACEHOLDER}
              rows={6}
              className={cn(
                "w-full bg-bg-tertiary border border-border-primary rounded-md px-3 py-2",
                "text-text-primary font-mono text-sm",
                "placeholder:text-text-tertiary/50",
                "focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-bg-primary",
                "resize-y min-h-[8rem]",
              )}
            />
          </div>

          {/* Parse button */}
          {!parsedRows && (
            <div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleParse}
                disabled={!rawText.trim()}
              >
                Parse
              </Button>
            </div>
          )}

          {/* Preview table */}
          {parsedRows && (
            <div className="space-y-4">
              <BulkPreviewTable rows={parsedRows} serverErrors={serverErrors} />

              {/* Error message from API */}
              {importError && (
                <p className="text-accent-negative text-sm">{importError}</p>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-3">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleImport}
                  loading={isLoading}
                  disabled={validCount === 0}
                  className={cn(
                    validCount > 0 && "bg-accent-positive text-white hover:brightness-110",
                  )}
                >
                  Import {validCount} Transaction{validCount !== 1 ? "s" : ""}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancel}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
