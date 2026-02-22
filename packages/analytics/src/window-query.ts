import { Decimal, ZERO, add, sub, div, isZero, toDecimal } from '@stalker/shared';
import type { Transaction, Instrument, PortfolioValueSnapshot } from '@stalker/shared';
import type { PriceLookup, SnapshotStore, HoldingSnapshotEntry } from './interfaces.js';
import { buildPortfolioValueSeries } from './value-series.js';
import type { CalendarFns } from './value-series.js';
import { processTransactions } from './lot-engine.js';
import { computeRealizedPnL } from './pnl.js';

/**
 * A single holding's breakdown at the end of a portfolio window.
 */
export interface HoldingBreakdown {
  symbol: string;
  instrumentId: string;
  qty: Decimal;
  value: Decimal;
  costBasis: Decimal;
  unrealizedPnl: Decimal;
  isEstimated?: boolean;
}

/**
 * Result of querying a portfolio value window.
 */
export interface PortfolioWindowResult {
  series: PortfolioValueSnapshot[];
  startValue: Decimal;
  endValue: Decimal;
  absoluteChange: Decimal;
  percentageChange: Decimal; // 4 decimal places
  realizedPnlInWindow: Decimal;
  unrealizedPnlAtEnd: Decimal;
  holdings: HoldingBreakdown[];
}

/**
 * Query portfolio value for a date window, optionally filtering transactions
 * to a point-in-time via the `asOf` parameter.
 */
export async function queryPortfolioWindow(params: {
  startDate: string;
  endDate: string;
  asOf?: string; // ISO datetime string — ignore transactions after this
  transactions: Transaction[];
  instruments: Instrument[];
  priceLookup: PriceLookup;
  snapshotStore: SnapshotStore;
  calendar: CalendarFns;
}): Promise<PortfolioWindowResult> {
  const {
    startDate,
    endDate,
    asOf,
    instruments,
    priceLookup,
    snapshotStore,
    calendar,
  } = params;

  // Step 1: Filter transactions by asOf if provided
  let transactions = params.transactions;
  if (asOf) {
    const asOfDate = new Date(asOf);
    transactions = transactions.filter((tx) => tx.tradeAt <= asOfDate);
  }

  // Step 2: Build snapshots for the window
  await buildPortfolioValueSeries({
    transactions,
    instruments,
    priceLookup,
    snapshotStore,
    calendar,
    startDate,
    endDate,
  });

  // Step 3: Read the series
  const series = await snapshotStore.getRange(startDate, endDate);

  // Step 4: Compute start/end values
  const startValue = series.length > 0 ? series[0]!.totalValue : ZERO;
  const endValue = series.length > 0 ? series[series.length - 1]!.totalValue : ZERO;

  // Step 5: absoluteChange
  const absoluteChange = sub(endValue, startValue);

  // Step 6: percentageChange (4 decimal places)
  const percentageChange = isZero(startValue)
    ? ZERO
    : toDecimal(div(absoluteChange, startValue).toFixed(4));

  // Step 7: Compute realizedPnlInWindow
  // Filter sells within window, compute realized PnL for those specific sells
  const windowStartDate = parseDateStr(startDate);
  const windowEndDate = parseDateStr(endDate);
  // Set end of window to end of day
  windowEndDate.setUTCHours(23, 59, 59, 999);

  // Group transactions by instrument and compute realized trades
  const sortedTxs = [...transactions].sort(
    (a, b) => a.tradeAt.getTime() - b.tradeAt.getTime(),
  );
  const txsByInstrument = new Map<string, Transaction[]>();
  for (const tx of sortedTxs) {
    const list = txsByInstrument.get(tx.instrumentId);
    if (list) {
      list.push(tx);
    } else {
      txsByInstrument.set(tx.instrumentId, [tx]);
    }
  }

  let realizedPnlInWindow = ZERO;
  for (const [, txs] of txsByInstrument) {
    const result = processTransactions(txs);
    // Filter realized trades to those within the window
    const windowTrades = result.realizedTrades.filter(
      (t) => t.sellDate >= windowStartDate && t.sellDate <= windowEndDate,
    );
    realizedPnlInWindow = add(realizedPnlInWindow, computeRealizedPnL(windowTrades));
  }

  // Step 8: unrealizedPnlAtEnd
  const unrealizedPnlAtEnd = series.length > 0
    ? series[series.length - 1]!.unrealizedPnl
    : ZERO;

  // Step 9: Build holdings breakdown from last snapshot
  const holdings: HoldingBreakdown[] = [];
  if (series.length > 0) {
    const lastSnapshot = series[series.length - 1]!;
    const holdingsJson = lastSnapshot.holdingsJson as Record<string, HoldingSnapshotEntry>;
    const instrumentMap = new Map<string, Instrument>();
    for (const inst of instruments) {
      instrumentMap.set(inst.symbol, inst);
    }

    for (const [symbol, entry] of Object.entries(holdingsJson)) {
      const inst = instrumentMap.get(symbol);
      const instrumentId = inst ? inst.id : symbol;
      const unrealizedPnl = sub(entry.value, entry.costBasis);

      const breakdown: HoldingBreakdown = {
        symbol,
        instrumentId,
        qty: entry.qty,
        value: entry.value,
        costBasis: entry.costBasis,
        unrealizedPnl,
      };

      if (entry.isEstimated) {
        breakdown.isEstimated = true;
      }

      holdings.push(breakdown);
    }
  }

  return {
    series,
    startValue,
    endValue,
    absoluteChange,
    percentageChange,
    realizedPnlInWindow,
    unrealizedPnlAtEnd,
    holdings,
  };
}

function parseDateStr(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}
