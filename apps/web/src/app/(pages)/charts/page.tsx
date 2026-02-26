"use client";

import { useState, useEffect, useMemo } from "react";
import { CandlestickChart } from "@/components/holding-detail/CandlestickChart";
import { Skeleton } from "@/components/ui/Skeleton";
import type { TransactionForMarker } from "@/lib/chart-marker-utils";

interface InstrumentOption {
  id: string;
  symbol: string;
  name: string;
}

interface TransactionResponse {
  id: string;
  type: "BUY" | "SELL";
  quantity: string;
  price: string;
  tradeAt: string;
}

export default function ChartsPage() {
  const [instruments, setInstruments] = useState<InstrumentOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSymbol, setSelectedSymbol] = useState<string>("");
  const [transactions, setTransactions] = useState<TransactionForMarker[]>([]);

  // Fetch instruments on mount
  useEffect(() => {
    fetch("/api/instruments")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: InstrumentOption[]) => {
        setInstruments(data);
        if (data.length > 0 && !selectedSymbol) {
          setSelectedSymbol(data[0]!.symbol);
        }
      })
      .catch(() => {
        // Silently handle — empty instruments list
      })
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Find the instrument ID for the selected symbol
  const selectedInstrumentId = useMemo(() => {
    const inst = instruments.find((i) => i.symbol === selectedSymbol);
    return inst?.id ?? null;
  }, [instruments, selectedSymbol]);

  // Fetch transactions for the selected instrument
  useEffect(() => {
    if (!selectedInstrumentId) {
      setTransactions([]);
      return;
    }

    let cancelled = false;

    fetch(`/api/transactions?instrumentId=${encodeURIComponent(selectedInstrumentId)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: TransactionResponse[]) => {
        if (!cancelled) {
          setTransactions(
            data.map((tx) => ({
              type: tx.type,
              quantity: tx.quantity,
              price: tx.price,
              tradeAt: tx.tradeAt,
            })),
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTransactions([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedInstrumentId]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-section">
        <Skeleton height="2rem" width="200px" />
        <Skeleton height="340px" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-section">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-heading text-text-primary">Charts</h1>
        <select
          value={selectedSymbol}
          onChange={(e) => setSelectedSymbol(e.target.value)}
          className="bg-bg-tertiary text-text-primary border border-border-primary rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent-primary"
        >
          {instruments.map((inst) => (
            <option key={inst.id} value={inst.symbol}>
              {inst.symbol} — {inst.name}
            </option>
          ))}
        </select>
      </div>

      {selectedSymbol ? (
        <CandlestickChart
          symbol={selectedSymbol}
          transactions={transactions}
        />
      ) : (
        <div className="flex items-center justify-center bg-bg-secondary border border-border-primary rounded-lg h-[340px]">
          <p className="text-text-tertiary text-sm">
            No instruments available. Add an instrument to view charts.
          </p>
        </div>
      )}
    </div>
  );
}
