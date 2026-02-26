/**
 * Converts transaction data to TradingView Lightweight Charts v5 marker format.
 *
 * NOTE: This is an approved location for parseFloat() conversion on financial
 * values (same exception as chart-utils.ts and chart-candlestick-utils.ts).
 * TradingView Lightweight Charts requires native JS number values for rendering.
 * All other display code must use formatCurrency/formatPercent from @/lib/format.
 */
import type { SeriesMarker, Time } from "lightweight-charts";

export interface TransactionForMarker {
  type: "BUY" | "SELL";
  quantity: string;
  price: string;
  tradeAt: string;
}

/**
 * Convert transaction objects to TradingView SeriesMarker format.
 *
 * - BUY = green arrowUp below bar, label "B {qty}"
 * - SELL = red arrowDown above bar, label "S {qty}"
 * - Markers are sorted by time ascending (required by TradingView)
 */
export function transactionsToMarkers(
  transactions: TransactionForMarker[],
): SeriesMarker<Time>[] {
  if (!transactions || transactions.length === 0) return [];

  return transactions
    .map((tx) => ({
      time: tx.tradeAt.split("T")[0] as Time,
      position: (tx.type === "BUY" ? "belowBar" : "aboveBar") as
        | "belowBar"
        | "aboveBar",
      color: tx.type === "BUY" ? "#34D399" : "#F87171",
      shape: (tx.type === "BUY" ? "arrowUp" : "arrowDown") as
        | "arrowUp"
        | "arrowDown",
      text: `${tx.type === "BUY" ? "B" : "S"} ${formatQty(tx.quantity)}`,
    }))
    .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}

/**
 * Format a quantity string for marker labels.
 * Whole numbers display without decimals; fractional quantities show 2 decimal places.
 *
 * Uses parseFloat() — approved exception for TradingView chart rendering.
 */
function formatQty(qty: string): string {
  const n = parseFloat(qty);
  if (isNaN(n)) return qty;
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}
