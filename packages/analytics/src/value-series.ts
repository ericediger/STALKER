import { Decimal, ZERO, add, sub, mul, isZero, toDecimal } from '@stalker/shared';
import type { Transaction, Instrument, Lot, RealizedTrade, PortfolioValueSnapshot } from '@stalker/shared';
import type { PriceLookup, SnapshotStore, HoldingSnapshotEntry } from './interfaces.js';
import { processTransactions } from './lot-engine.js';
import { computeRealizedPnL } from './pnl.js';

/**
 * Calendar interface — only the two functions we need.
 * Avoids a hard dependency on @stalker/market-data for testing.
 */
export interface CalendarFns {
  getNextTradingDay: (date: Date, exchange: string) => Date;
  isTradingDay: (date: Date, exchange: string) => boolean;
}

/**
 * Format a Date as YYYY-MM-DD string (using UTC to avoid timezone shift).
 */
function toDateStr(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a YYYY-MM-DD string into a Date at UTC midnight.
 */
function parseDateStr(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Build portfolio value snapshots for a date range.
 *
 * Deletes existing snapshots from startDate forward, then computes and writes
 * one snapshot per trading day in [startDate, endDate].
 */
export async function buildPortfolioValueSeries(params: {
  transactions: Transaction[];
  instruments: Instrument[];
  priceLookup: PriceLookup;
  snapshotStore: SnapshotStore;
  calendar: CalendarFns;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}): Promise<void> {
  const {
    transactions,
    instruments,
    priceLookup,
    snapshotStore,
    calendar,
    startDate,
    endDate,
  } = params;

  // Step 1: Delete existing snapshots from startDate forward
  await snapshotStore.deleteFrom(startDate);

  // Step 2: Build instrument map
  const instrumentMap = new Map<string, Instrument>();
  for (const inst of instruments) {
    instrumentMap.set(inst.id, inst);
  }

  // Step 3: Sort all transactions by tradeAt ASC
  const sortedTxs = [...transactions].sort(
    (a, b) => a.tradeAt.getTime() - b.tradeAt.getTime(),
  );

  // Step 4: Group transactions by instrumentId
  const txsByInstrument = new Map<string, Transaction[]>();
  for (const tx of sortedTxs) {
    const list = txsByInstrument.get(tx.instrumentId);
    if (list) {
      list.push(tx);
    } else {
      txsByInstrument.set(tx.instrumentId, [tx]);
    }
  }

  // Track lot state and realized trades per instrument across dates
  // Key: instrumentId, Value: { lots, realizedTrades, lastTxIndex }
  const instrumentState = new Map<string, {
    lots: Lot[];
    realizedTrades: RealizedTrade[];
    lastTxIndex: number;
  }>();

  // Initialize state for each instrument
  for (const [instrumentId, txs] of txsByInstrument) {
    instrumentState.set(instrumentId, {
      lots: [],
      realizedTrades: [],
      lastTxIndex: 0,
    });
    // Suppress unused variable warning — txs is used by the map key
    void txs;
  }

  // Step 5-12: Iterate trading dates
  let currentDate = parseDateStr(startDate);
  const endDateObj = parseDateStr(endDate);
  const defaultExchange = instruments.length > 0 ? instruments[0]!.exchange : 'NYSE';

  // If startDate is not a trading day, still process it if requested — but typically
  // we iterate only trading days. The spec says use getNextTradingDay to iterate,
  // so if startDate is a trading day, we start there; otherwise skip to next.
  if (!calendar.isTradingDay(currentDate, defaultExchange)) {
    currentDate = calendar.getNextTradingDay(currentDate, defaultExchange);
  }

  while (currentDate <= endDateObj) {
    const dateStr = toDateStr(currentDate);
    const endOfDay = new Date(Date.UTC(
      currentDate.getUTCFullYear(),
      currentDate.getUTCMonth(),
      currentDate.getUTCDate(),
      23, 59, 59, 999,
    ));

    // For each instrument, determine if any new transactions fall on or before this date
    for (const [instrumentId, txs] of txsByInstrument) {
      const state = instrumentState.get(instrumentId)!;

      // Find how many transactions are active (tradeAt <= endOfDay)
      let newTxIndex = state.lastTxIndex;
      while (newTxIndex < txs.length && txs[newTxIndex]!.tradeAt <= endOfDay) {
        newTxIndex++;
      }

      // If new transactions arrived, re-run the lot engine with all transactions up to this point
      if (newTxIndex > state.lastTxIndex) {
        const activeTxs = txs.slice(0, newTxIndex);
        const result = processTransactions(activeTxs);
        state.lots = result.lots;
        state.realizedTrades = result.realizedTrades;
        state.lastTxIndex = newTxIndex;
      }
      // Otherwise, lots and realized trades carry forward as-is
    }

    // Build holdingsJson and totals
    const holdingsJson: Record<string, HoldingSnapshotEntry> = {};
    let totalValue = ZERO;
    let totalCostBasis = ZERO;

    for (const [instrumentId, state] of instrumentState) {
      const inst = instrumentMap.get(instrumentId);
      if (!inst) continue;

      // Only include instruments with open lots
      const lots = state.lots;
      if (lots.length === 0) continue;

      const qty = lots.reduce((sum, lot) => add(sum, lot.remainingQty), ZERO);
      const costBasis = lots.reduce((sum, lot) => add(sum, lot.costBasisRemaining), ZERO);

      if (isZero(qty)) continue;

      // Look up price
      const priceResult = await priceLookup.getClosePriceOrCarryForward(instrumentId, dateStr);

      if (priceResult !== null) {
        const value = mul(qty, priceResult.price);
        const entry: HoldingSnapshotEntry = {
          qty,
          value,
          costBasis,
        };
        if (priceResult.isCarryForward) {
          entry.isEstimated = true;
        }
        holdingsJson[inst.symbol] = entry;
        totalValue = add(totalValue, value);
        totalCostBasis = add(totalCostBasis, costBasis);
      } else {
        // No price data at all — check firstBarDate
        const firstBarDate = await priceLookup.getFirstBarDate(instrumentId);

        if (firstBarDate === null || firstBarDate > dateStr) {
          // No data at all, or trade before first bar — costBasisOnly
          const entry: HoldingSnapshotEntry = {
            qty,
            value: ZERO,
            costBasis,
            costBasisOnly: true,
          };
          holdingsJson[inst.symbol] = entry;
          // Do NOT add to totalValue — excluded from market value
          totalCostBasis = add(totalCostBasis, costBasis);
        }
      }
    }

    // Compute cumulative realized PnL across ALL instruments
    let cumulativeRealizedPnl = ZERO;
    for (const [, state] of instrumentState) {
      // Filter realized trades that occurred on or before this date
      const tradesUpToDate = state.realizedTrades.filter(
        (t) => t.sellDate <= endOfDay,
      );
      cumulativeRealizedPnl = add(cumulativeRealizedPnl, computeRealizedPnL(tradesUpToDate));
    }

    const unrealizedPnl = sub(totalValue, totalCostBasis);

    const snapshot: PortfolioValueSnapshot = {
      id: 0, // Auto-increment in real DB; 0 for mock
      date: dateStr,
      totalValue,
      totalCostBasis,
      realizedPnl: cumulativeRealizedPnl,
      unrealizedPnl,
      holdingsJson,
      rebuiltAt: new Date(),
    };

    await snapshotStore.writeBatch([snapshot]);

    // Advance to next trading day
    const nextDay = calendar.getNextTradingDay(currentDate, defaultExchange);
    if (nextDay <= currentDate) {
      // Safety: prevent infinite loop
      break;
    }
    currentDate = nextDay;
  }
}
