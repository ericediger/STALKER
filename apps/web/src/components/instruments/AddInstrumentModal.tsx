"use client";

import { useState, useCallback } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { SymbolSearchInput, type SearchResult } from "./SymbolSearchInput";

interface AddInstrumentModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const EXCHANGE_OPTIONS = [
  { label: "NYSE", value: "NYSE" },
  { label: "NASDAQ", value: "NASDAQ" },
  { label: "CBOE", value: "CBOE" },
];

const TYPE_OPTIONS = [
  { label: "Stock", value: "STOCK" },
  { label: "ETF", value: "ETF" },
  { label: "Fund", value: "FUND" },
];

function mapExchange(exchange: string): string {
  const upper = exchange.toUpperCase();
  // Normalize common exchange names to our options
  if (upper.includes("NASDAQ") || upper === "NMS" || upper === "NGS" || upper === "NAS") return "NASDAQ";
  if (upper.includes("NYSE") || upper === "NYQ" || upper === "PCX" || upper === "AMEX" || upper === "ARCA" || upper === "BATS") return "NYSE";
  if (upper.includes("CBOE") || upper === "BZX") return "CBOE";
  // Default to NYSE for unknown exchanges
  return "NYSE";
}

function mapType(type: string | undefined): string {
  if (!type) return "STOCK";
  const upper = type.toUpperCase();
  if (upper === "ETF" || upper.includes("ETF")) return "ETF";
  if (upper === "FUND" || upper.includes("FUND")) return "FUND";
  return "STOCK";
}

export function AddInstrumentModal({
  open,
  onClose,
  onSuccess,
}: AddInstrumentModalProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("STOCK");
  const [exchange, setExchange] = useState("NYSE");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedFromSearch, setSelectedFromSearch] = useState(false);

  const resetForm = useCallback(() => {
    setSearchQuery("");
    setSymbol("");
    setName("");
    setType("STOCK");
    setExchange("NYSE");
    setErrors({});
    setSelectedFromSearch(false);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  const handleSearchSelect = useCallback((result: SearchResult) => {
    setSymbol(result.symbol);
    setName(result.name);
    setExchange(mapExchange(result.exchange));
    setType(mapType(result.type));
    setSelectedFromSearch(true);
    setErrors({});
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const newErrors: Record<string, string> = {};
      if (!symbol.trim()) newErrors.symbol = "Symbol is required";
      if (!name.trim()) newErrors.name = "Name is required";

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return;
      }

      setSubmitting(true);
      setErrors({});

      try {
        const res = await fetch("/api/instruments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol: symbol.trim().toUpperCase(),
            name: name.trim(),
            type,
            exchange,
          }),
        });

        if (res.status === 409) {
          setErrors({
            symbol: `Instrument with symbol '${symbol.toUpperCase()}' already exists`,
          });
          return;
        }

        if (!res.ok) {
          const data = (await res.json()) as { message?: string };
          throw new Error(data.message ?? `HTTP ${res.status}`);
        }

        toast({
          message: `${symbol.toUpperCase()} added. Backfilling price history...`,
          variant: "success",
        });
        handleClose();
        onSuccess();
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to add instrument";
        toast({ message, variant: "error" });
      } finally {
        setSubmitting(false);
      }
    },
    [symbol, name, type, exchange, toast, handleClose, onSuccess],
  );

  return (
    <Modal open={open} onClose={handleClose} title="Add Instrument">
      <form onSubmit={handleSubmit} className="space-y-4">
        <SymbolSearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          onSelect={handleSearchSelect}
        />

        <div className="border-t border-border-primary pt-4">
          <p className="text-sm text-text-secondary mb-3">
            {selectedFromSearch
              ? "Confirm instrument details:"
              : "Or enter instrument details manually:"}
          </p>

          <div className="space-y-3">
            <Input
              label="Symbol"
              type="text"
              placeholder="e.g. AAPL"
              value={symbol}
              onChange={(e) => {
                setSymbol(e.target.value);
                setSelectedFromSearch(false);
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.symbol;
                  return next;
                });
              }}
              error={errors.symbol}
            />

            <Input
              label="Name"
              type="text"
              placeholder="e.g. Apple Inc."
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.name;
                  return next;
                });
              }}
              error={errors.name}
            />

            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Type"
                options={TYPE_OPTIONS}
                value={type}
                onChange={setType}
              />
              <Select
                label="Exchange"
                options={EXCHANGE_OPTIONS}
                value={exchange}
                onChange={setExchange}
              />
            </div>
          </div>
        </div>

        <Button
          type="submit"
          variant="primary"
          className="w-full"
          loading={submitting}
          disabled={submitting}
        >
          Add Instrument
        </Button>
      </form>
    </Modal>
  );
}
