/**
 * Transforms API timeseries response to TradingView Lightweight Charts format.
 *
 * NOTE: This is the ONE place where Decimal string → number conversion is
 * acceptable, because the TradingView chart library requires numeric values
 * for rendering. All other display code must use formatCurrency/formatPercent.
 */
import type { AreaData, Time } from 'lightweight-charts';

export interface TimeseriesPoint {
  date: string;
  totalValue: string;
  totalCostBasis: string;
  unrealizedPnl: string;
  realizedPnl: string;
}

/**
 * Convert API timeseries points to TradingView AreaData.
 * TradingView expects { time: 'YYYY-MM-DD', value: number }.
 * Invalid or unparseable values are filtered out.
 */
export function toAreaChartData(timeseries: TimeseriesPoint[]): AreaData<Time>[] {
  if (!timeseries || timeseries.length === 0) return [];

  return timeseries
    .map((point) => {
      const value = Number(point.totalValue);
      if (isNaN(value)) return null;
      return {
        time: point.date as Time,
        value,
      };
    })
    .filter((item): item is AreaData<Time> => item !== null);
}
