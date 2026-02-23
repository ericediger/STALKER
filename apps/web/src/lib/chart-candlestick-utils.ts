/**
 * Transforms API PriceBar response to TradingView Lightweight Charts
 * candlestick format.
 *
 * NOTE: This is an approved location for Number() conversion on financial
 * values (AD-S6c exception). TradingView Lightweight Charts requires
 * numeric values for rendering. All other display code must use
 * formatCurrency/formatPercent from @/lib/format.
 */
import type { CandlestickData, Time } from "lightweight-charts";

export interface PriceBar {
  date: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: number;
  provider?: string;
}

/**
 * Convert API PriceBar objects to TradingView CandlestickData.
 * - `date` is passed through as YYYY-MM-DD string (TradingView accepts this).
 * - Price strings are converted to numbers via Number().
 * - Invalid or NaN values are filtered out.
 */
export function toCandlestickData(bars: PriceBar[]): CandlestickData<Time>[] {
  if (!bars || bars.length === 0) return [];

  return bars
    .map((bar) => {
      const open = Number(bar.open);
      const high = Number(bar.high);
      const low = Number(bar.low);
      const close = Number(bar.close);

      if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) {
        return null;
      }

      return {
        time: bar.date as Time,
        open,
        high,
        low,
        close,
      };
    })
    .filter((item): item is CandlestickData<Time> => item !== null);
}
