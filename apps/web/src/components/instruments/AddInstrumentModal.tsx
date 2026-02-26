"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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
  if (upper.includes("NASDAQ") || upper === "NMS" || upper === "NGS" || upper === "NAS") return "NASDAQ";
  if (upper.includes("NYSE") || upper === "NYQ" || upper === "PCX" || upper === "AMEX" || upper === "ARCA" || upper === "BATS") return "NYSE";
  if (upper.includes("CBOE") || upper === "BZX") return "CBOE";
  return "NYSE";
}

function mapType(type: string | undefined): string {
  if (!type) return "STOCK";
  const upper = type.toUpperCase();
  if (upper === "ETF" || upper.includes("ETF")) return "ETF";
  if (upper === "FUND" || upper.includes("FUND")) return "FUND";
  return "STOCK";
}

function todayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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
  const [addedSymbol, setAddedSymbol] = useState<string | null>(null);

  // Initial purchase fields (optional)
  const [buyQty, setBuyQty] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [buyDate, setBuyDate] = useState(todayDateString());
  const [buyFees, setBuyFees] = useState("");
  const [priceAutoFilled, setPriceAutoFilled] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const userEditedBuyPrice = useRef(false);

  const hasBuyData = buyQty.trim() !== "" || buyPrice.trim() !== "";

  const resetForm = useCallback(() => {
    setSearchQuery("");
    setSymbol("");
    setName("");
    setType("STOCK");
    setExchange("NYSE");
    setErrors({});
    setSelectedFromSearch(false);
    setBuyQty("");
    setBuyPrice("");
    setBuyDate(todayDateString());
    setBuyFees("");
    setPriceAutoFilled(false);
    setFetchingPrice(false);
    setAddedSymbol(null);
    userEditedBuyPrice.current = false;
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
    // Reset buy price auto-fill for new instrument
    userEditedBuyPrice.current = false;
    setBuyPrice("");
    setPriceAutoFilled(false);
  }, []);

  // Auto-fill buy price from historical close when symbol and date are set
  useEffect(() => {
    if (userEditedBuyPrice.current) return;
    if (!symbol || !buyDate) return;

    let cancelled = false;
    setFetchingPrice(true);

    fetch(
      `/api/market/history?symbol=${encodeURIComponent(symbol)}&startDate=${buyDate}&endDate=${buyDate}`,
    )
      .then((res) => {
        if (!res.ok) return null;
        return res.json() as Promise<Array<{ close: string }>>;
      })
      .then((bars) => {
        if (cancelled) return;
        setFetchingPrice(false);
        if (bars && bars.length > 0 && bars[0]?.close) {
          setBuyPrice(bars[0]!.close);
          setPriceAutoFilled(true);
        }
      })
      .catch(() => {
        if (!cancelled) setFetchingPrice(false);
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, buyDate]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const newErrors: Record<string, string> = {};
      if (!symbol.trim()) newErrors.symbol = "Symbol is required";
      if (!name.trim()) newErrors.name = "Name is required";

      // Validate buy fields only if user entered partial data
      if (hasBuyData) {
        if (!buyQty.trim() || isNaN(Number(buyQty)) || Number(buyQty) <= 0) {
          newErrors.buyQty = "Enter a valid quantity";
        }
        if (!buyPrice.trim() || isNaN(Number(buyPrice)) || Number(buyPrice) <= 0) {
          newErrors.buyPrice = "Enter a valid price";
        }
        if (!buyDate) newErrors.buyDate = "Date is required";
      }

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return;
      }

      setSubmitting(true);
      setErrors({});

      try {
        // Step 1: Create the instrument
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

        const instrument = (await res.json()) as { id: string };

        // Step 2: If buy fields are filled, create the initial transaction
        if (hasBuyData && buyQty.trim() && buyPrice.trim()) {
          const txRes = await fetch("/api/transactions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              instrumentId: instrument.id,
              type: "BUY",
              quantity: buyQty.trim(),
              price: buyPrice.trim(),
              fees: buyFees.trim() || "0",
              tradeAt: `${buyDate}T12:00:00.000Z`,
              notes: "",
            }),
          });

          if (txRes.ok) {
            toast({
              message: `${symbol.toUpperCase()} added with initial BUY. Backfilling price history...`,
              variant: "success",
            });
          } else {
            toast({
              message: `${symbol.toUpperCase()} added. Transaction could not be created — add it manually.`,
              variant: "warning",
            });
          }
        } else {
          toast({
            message: `${symbol.toUpperCase()} added. Backfilling price history...`,
            variant: "success",
          });
        }

        setAddedSymbol(symbol.toUpperCase());
        onSuccess();
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to add instrument";
        toast({ message, variant: "error" });
      } finally {
        setSubmitting(false);
      }
    },
    [symbol, name, type, exchange, hasBuyData, buyQty, buyPrice, buyDate, buyFees, toast, handleClose, onSuccess],
  );

  const handleAddAnother = useCallback(() => {
    resetForm();
  }, [resetForm]);

  const handleDone = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  return (
    <Modal open={open} onClose={handleClose} title="Add Instrument">
      {addedSymbol ? (
        <div className="space-y-4 py-2">
          <div className="text-center">
            <p className="text-text-primary text-lg font-medium">
              {addedSymbol} added successfully
            </p>
            <p className="text-text-secondary text-sm mt-1">
              Price history is being backfilled in the background.
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={handleAddAnother}
            >
              Add Another
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={handleDone}
            >
              Done
            </Button>
          </div>
        </div>
      ) : (
      <form onSubmit={handleSubmit} className="space-y-4">
        <SymbolSearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          onSelect={handleSearchSelect}
        />

        {/* Instrument details */}
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

        {/* Initial Purchase (optional) */}
        <div className="border-t border-border-primary pt-4">
          <p className="text-sm text-text-secondary mb-3">
            Initial purchase (optional):
          </p>
          <div className="space-y-3">
            <Input
              label="Trade Date"
              type="date"
              value={buyDate}
              onChange={(e) => {
                setBuyDate(e.target.value);
                userEditedBuyPrice.current = false;
                setPriceAutoFilled(false);
              }}
              error={errors.buyDate}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Shares"
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={buyQty}
                onChange={(e) => {
                  setBuyQty(e.target.value);
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.buyQty;
                    return next;
                  });
                }}
                error={errors.buyQty}
              />
              <div>
                <Input
                  label="Price per share"
                  type="text"
                  inputMode="decimal"
                  placeholder={fetchingPrice ? "Loading..." : "0.00"}
                  value={buyPrice}
                  onChange={(e) => {
                    setBuyPrice(e.target.value);
                    userEditedBuyPrice.current = true;
                    setPriceAutoFilled(false);
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.buyPrice;
                      return next;
                    });
                  }}
                  error={errors.buyPrice}
                />
                {priceAutoFilled && (
                  <p className="text-xs text-text-tertiary mt-1">
                    Auto-filled from closing price
                  </p>
                )}
              </div>
            </div>
            <Input
              label="Fees"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={buyFees}
              onChange={(e) => setBuyFees(e.target.value)}
            />
          </div>
        </div>

        <Button
          type="submit"
          variant="primary"
          className="w-full"
          loading={submitting}
          disabled={submitting}
        >
          {hasBuyData ? "Add Instrument + Buy" : "Add Instrument"}
        </Button>
      </form>
      )}
    </Modal>
  );
}
