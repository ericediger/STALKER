/**
 * Cross-Validation Vitest Wrapper
 *
 * Wraps the three independent validation paths from cross-validate.ts as Vitest tests.
 * This file does NOT modify cross-validate.ts. Instead, it re-imports the same
 * fixture files and analytics engine functions, running the same three paths
 * (A, B, C) with Vitest assertions.
 *
 * Path A: Analytics engine (processTransactions, buildPortfolioValueSeries) vs expected outputs
 * Path B: Independent FIFO + valuation from scratch vs expected outputs
 * Path C: Engine vs independent cross-consistency
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  Decimal,
  toDecimal,
  add,
  sub,
  mul,
  ZERO,
} from '@stalker/shared';
import type {
  Transaction,
  Instrument,
  TransactionType,
  InstrumentType,
} from '@stalker/shared';
import {
  processTransactions,
  computeRealizedPnL,
  buildPortfolioValueSeries,
  MockPriceLookup,
  MockSnapshotStore,
} from '@stalker/analytics';
import type { HoldingSnapshotEntry, CalendarFns } from '@stalker/analytics';

// ---------------------------------------------------------------------------
// Load fixture files
// ---------------------------------------------------------------------------

const fixtureDir = path.resolve(__dirname);
const refPortfolio = JSON.parse(
  fs.readFileSync(path.join(fixtureDir, 'reference-portfolio.json'), 'utf-8'),
) as {
  instruments: Array<Record<string, unknown>>;
  transactions: Array<Record<string, unknown>>;
  priceBars: Record<string, Array<{ date: string; close: string }>>;
};

const expectedOutputs = JSON.parse(
  fs.readFileSync(path.join(fixtureDir, 'expected-outputs.json'), 'utf-8'),
) as {
  checkpoints: Array<{
    date: string;
    dayIndex: number;
    description: string;
    expectedLotState: Record<
      string,
      Array<{
        openedAt: string;
        originalQty: string;
        remainingQty: string;
        costBasisPerShare: string;
        costBasisRemaining: string;
      }>
    >;
    expectedRealizedPnl: {
      cumulative: string;
      trades: Array<{
        instrument: string;
        sellDate: string;
        qty: string;
        proceeds: string;
        costBasis: string;
        realizedPnl: string;
      }>;
    };
    expectedPortfolioValue: {
      totalValue: string;
      totalCostBasis: string;
      unrealizedPnl: string;
      realizedPnl: string;
      holdings: Record<
        string,
        { qty: string; value: string; costBasis: string; isEstimated?: boolean }
      >;
    };
  }>;
};

// ---------------------------------------------------------------------------
// Converters: fixture JSON -> typed objects
// ---------------------------------------------------------------------------

function toInstrument(raw: Record<string, unknown>): Instrument {
  return {
    id: raw['id'] as string,
    symbol: raw['symbol'] as string,
    name: raw['name'] as string,
    type: raw['type'] as InstrumentType,
    currency: raw['currency'] as string,
    exchange: raw['exchange'] as string,
    exchangeTz: raw['exchangeTz'] as string,
    providerSymbolMap: (raw['providerSymbolMap'] ?? {}) as Record<string, string>,
    firstBarDate: (raw['firstBarDate'] ?? null) as string | null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function toTransaction(raw: Record<string, unknown>): Transaction {
  return {
    id: raw['id'] as string,
    instrumentId: raw['instrumentId'] as string,
    type: raw['type'] as TransactionType,
    quantity: toDecimal(raw['quantity'] as string),
    price: toDecimal(raw['price'] as string),
    fees: toDecimal(raw['fees'] as string),
    tradeAt: new Date(raw['tradeAt'] as string),
    notes: (raw['notes'] ?? null) as string | null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Build typed data
// ---------------------------------------------------------------------------

const instruments: Instrument[] = refPortfolio.instruments.map(toInstrument);
const allTransactions: Transaction[] = refPortfolio.transactions.map(toTransaction);

const idToSymbol = new Map<string, string>();
const symbolToId = new Map<string, string>();
for (const inst of instruments) {
  idToSymbol.set(inst.id, inst.symbol);
  symbolToId.set(inst.symbol, inst.id);
}

function buildPriceLookup(): MockPriceLookup {
  const bars: Record<string, Array<{ date: string; close: Decimal }>> = {};
  for (const [instrumentId, rawBars] of Object.entries(refPortfolio.priceBars)) {
    bars[instrumentId] = rawBars.map((b) => ({
      date: b.date,
      close: toDecimal(b.close),
    }));
  }
  return new MockPriceLookup(bars);
}

const testCalendar: CalendarFns = {
  isTradingDay(date: Date, _exchange: string): boolean {
    const day = date.getUTCDay();
    return day >= 1 && day <= 5;
  },
  getNextTradingDay(date: Date, _exchange: string): Date {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + 1);
    while (next.getUTCDay() === 0 || next.getUTCDay() === 6) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next;
  },
};

function getTransactionsForInstrument(
  symbol: string,
  upToDate: string,
): Transaction[] {
  const instrumentId = symbolToId.get(symbol);
  if (!instrumentId) return [];
  const endOfDay = new Date(upToDate + 'T23:59:59.999Z');
  return allTransactions
    .filter((tx) => tx.instrumentId === instrumentId && tx.tradeAt <= endOfDay)
    .sort((a, b) => a.tradeAt.getTime() - b.tradeAt.getTime());
}

// ---------------------------------------------------------------------------
// Independent FIFO calculation (no analytics engine)
// ---------------------------------------------------------------------------

interface IndependentLot {
  openedAt: string;
  originalQty: Decimal;
  remainingQty: Decimal;
  costBasisPerShare: Decimal;
  costBasisRemaining: Decimal;
}

interface IndependentResult {
  lots: IndependentLot[];
  realizedPnl: Decimal;
}

function independentFIFO(transactions: Transaction[]): IndependentResult {
  const lots: IndependentLot[] = [];
  let totalRealizedPnl = ZERO;

  const sorted = [...transactions].sort(
    (a, b) => a.tradeAt.getTime() - b.tradeAt.getTime(),
  );

  for (const tx of sorted) {
    if (tx.type === 'BUY') {
      lots.push({
        openedAt: tx.tradeAt.toISOString(),
        originalQty: tx.quantity,
        remainingQty: tx.quantity,
        costBasisPerShare: tx.price,
        costBasisRemaining: mul(tx.quantity, tx.price),
      });
    } else {
      let remainingToSell = tx.quantity;
      let lotIdx = 0;
      while (remainingToSell.greaterThan(ZERO) && lotIdx < lots.length) {
        const lot = lots[lotIdx]!;
        const consumed = Decimal.min(remainingToSell, lot.remainingQty);
        const proceeds = mul(consumed, tx.price);
        const costBasis = mul(consumed, lot.costBasisPerShare);
        totalRealizedPnl = add(totalRealizedPnl, sub(proceeds, costBasis));

        lot.remainingQty = sub(lot.remainingQty, consumed);
        lot.costBasisRemaining = sub(
          lot.costBasisRemaining,
          mul(consumed, lot.costBasisPerShare),
        );
        remainingToSell = sub(remainingToSell, consumed);

        if (lot.remainingQty.isZero()) {
          lots.splice(lotIdx, 1);
        } else {
          lotIdx++;
        }
      }
    }
  }

  return { lots, realizedPnl: totalRealizedPnl };
}

function getPrice(
  instrumentId: string,
  date: string,
): { price: Decimal; isEstimated: boolean } | null {
  const bars = refPortfolio.priceBars[instrumentId];
  if (!bars || bars.length === 0) return null;

  const exact = bars.find((b) => b.date === date);
  if (exact) return { price: toDecimal(exact.close), isEstimated: false };

  let best: { date: string; close: string } | undefined;
  for (const bar of bars) {
    if (bar.date <= date) {
      best = bar;
    } else {
      break;
    }
  }
  if (!best) return null;
  return { price: toDecimal(best.close), isEstimated: true };
}

// ---------------------------------------------------------------------------
// Check accumulator for structured result reporting
// ---------------------------------------------------------------------------

interface CheckResult {
  checksRun: number;
  passed: number;
  failures: string[];
}

function createChecker(): {
  check: (label: string, actual: string, expected: string) => void;
  fail: (label: string) => void;
  result: () => CheckResult;
} {
  let checksRun = 0;
  let passed = 0;
  const failures: string[] = [];

  return {
    check(label: string, actual: string, expected: string): void {
      checksRun++;
      if (actual === expected) {
        passed++;
      } else {
        failures.push(`${label} -- expected "${expected}", got "${actual}"`);
      }
    },
    fail(label: string): void {
      checksRun++;
      failures.push(label);
    },
    result(): CheckResult {
      return { checksRun, passed, failures: [...failures] };
    },
  };
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

const ALL_SYMBOLS = ['AAPL', 'MSFT', 'VTI', 'QQQ', 'SPY', 'INTC'];

describe('PnL Cross-Validation', () => {
  it('Path A: Analytics engine matches expected outputs', async () => {
    const { check, fail, result } = createChecker();

    for (let cpIdx = 0; cpIdx < expectedOutputs.checkpoints.length; cpIdx++) {
      const cp = expectedOutputs.checkpoints[cpIdx]!;
      const cpLabel = `CP${cpIdx + 1} (${cp.date})`;

      // A1: Lot state per instrument
      for (const [symbol, expectedLots] of Object.entries(cp.expectedLotState)) {
        const txs = getTransactionsForInstrument(symbol, cp.date);
        const engineResult = processTransactions(txs);

        check(
          `${cpLabel} ${symbol} lot count`,
          engineResult.lots.length.toString(),
          expectedLots.length.toString(),
        );

        for (let i = 0; i < expectedLots.length; i++) {
          const lot = engineResult.lots[i];
          const expected = expectedLots[i]!;
          if (lot) {
            check(
              `${cpLabel} ${symbol} lot[${i}] openedAt`,
              lot.openedAt.toISOString(),
              expected.openedAt,
            );
            check(
              `${cpLabel} ${symbol} lot[${i}] remainingQty`,
              lot.remainingQty.toString(),
              expected.remainingQty,
            );
            check(
              `${cpLabel} ${symbol} lot[${i}] costBasisPerShare`,
              lot.price.toString(),
              expected.costBasisPerShare,
            );
            check(
              `${cpLabel} ${symbol} lot[${i}] costBasisRemaining`,
              lot.costBasisRemaining.toString(),
              expected.costBasisRemaining,
            );
          }
        }
      }

      // A2: Realized PnL per trade
      for (const expectedTrade of cp.expectedRealizedPnl.trades) {
        const txs = getTransactionsForInstrument(expectedTrade.instrument, cp.date);
        const engineResult = processTransactions(txs);

        const matchingTrades = engineResult.realizedTrades.filter(
          (rt) =>
            rt.sellDate.toISOString() === expectedTrade.sellDate &&
            rt.qty.toString() === expectedTrade.qty,
        );

        if (matchingTrades.length > 0) {
          const trade = matchingTrades[0]!;
          check(
            `${cpLabel} ${expectedTrade.instrument} trade proceeds`,
            trade.proceeds.toString(),
            expectedTrade.proceeds,
          );
          check(
            `${cpLabel} ${expectedTrade.instrument} trade costBasis`,
            trade.costBasis.toString(),
            expectedTrade.costBasis,
          );
          check(
            `${cpLabel} ${expectedTrade.instrument} trade realizedPnl`,
            trade.realizedPnl.toString(),
            expectedTrade.realizedPnl,
          );
        } else {
          fail(`${cpLabel} missing trade for ${expectedTrade.instrument} sell ${expectedTrade.qty} at ${expectedTrade.sellDate}`);
        }
      }

      // A3: Cumulative realized PnL across all instruments
      let cumulativeRealized = ZERO;
      for (const symbol of ALL_SYMBOLS) {
        const txs = getTransactionsForInstrument(symbol, cp.date);
        const engineResult = processTransactions(txs);
        cumulativeRealized = add(cumulativeRealized, computeRealizedPnL(engineResult.realizedTrades));
      }
      check(
        `${cpLabel} cumulative realized PnL`,
        cumulativeRealized.toString(),
        cp.expectedRealizedPnl.cumulative,
      );

      // A4: Portfolio value snapshot via buildPortfolioValueSeries
      const priceLookup = buildPriceLookup();
      const store = new MockSnapshotStore();

      await buildPortfolioValueSeries({
        transactions: allTransactions,
        instruments,
        priceLookup,
        snapshotStore: store,
        calendar: testCalendar,
        startDate: '2026-01-02',
        endDate: cp.date,
      });

      const snapshot = await store.getByDate(cp.date);
      if (!snapshot) {
        fail(`${cpLabel} -- no snapshot found for date ${cp.date}`);
      } else {
        check(`${cpLabel} snapshot totalValue`, snapshot.totalValue.toString(), cp.expectedPortfolioValue.totalValue);
        check(`${cpLabel} snapshot totalCostBasis`, snapshot.totalCostBasis.toString(), cp.expectedPortfolioValue.totalCostBasis);
        check(`${cpLabel} snapshot unrealizedPnl`, snapshot.unrealizedPnl.toString(), cp.expectedPortfolioValue.unrealizedPnl);
        check(`${cpLabel} snapshot realizedPnl`, snapshot.realizedPnl.toString(), cp.expectedPortfolioValue.realizedPnl);

        const holdings = snapshot.holdingsJson as Record<string, HoldingSnapshotEntry>;
        for (const [symbol, expected] of Object.entries(cp.expectedPortfolioValue.holdings)) {
          if (!holdings[symbol]) {
            fail(`${cpLabel} -- holding ${symbol} not found in snapshot`);
            continue;
          }
          check(`${cpLabel} ${symbol} snapshot qty`, holdings[symbol]!.qty.toString(), expected.qty);
          check(`${cpLabel} ${symbol} snapshot value`, holdings[symbol]!.value.toString(), expected.value);
          check(`${cpLabel} ${symbol} snapshot costBasis`, holdings[symbol]!.costBasis.toString(), expected.costBasis);
          if (expected.isEstimated) {
            check(`${cpLabel} ${symbol} snapshot isEstimated`, String(holdings[symbol]!.isEstimated ?? false), 'true');
          }
        }
      }
    }

    const r = result();
    expect(r.failures).toEqual([]);
    expect(r.checksRun).toBeGreaterThanOrEqual(200);
  });

  it('Path B: Independent FIFO engine matches expected outputs', () => {
    const { check, result } = createChecker();

    for (let cpIdx = 0; cpIdx < expectedOutputs.checkpoints.length; cpIdx++) {
      const cp = expectedOutputs.checkpoints[cpIdx]!;
      const cpLabel = `Independent CP${cpIdx + 1} (${cp.date})`;

      let indepTotalValue = ZERO;
      let indepTotalCostBasis = ZERO;
      let indepTotalRealized = ZERO;

      for (const symbol of ALL_SYMBOLS) {
        const instrumentId = symbolToId.get(symbol)!;
        const txs = getTransactionsForInstrument(symbol, cp.date);
        const indepResult = independentFIFO(txs);

        indepTotalRealized = add(indepTotalRealized, indepResult.realizedPnl);

        const totalQty = indepResult.lots.reduce(
          (sum, lot) => add(sum, lot.remainingQty),
          ZERO,
        );
        const totalCostBasis = indepResult.lots.reduce(
          (sum, lot) => add(sum, lot.costBasisRemaining),
          ZERO,
        );

        if (totalQty.isZero()) continue;

        const priceResult = getPrice(instrumentId, cp.date);
        if (!priceResult) continue;

        const holdingValue = mul(totalQty, priceResult.price);
        indepTotalValue = add(indepTotalValue, holdingValue);
        indepTotalCostBasis = add(indepTotalCostBasis, totalCostBasis);

        const expectedHolding = cp.expectedPortfolioValue.holdings[symbol];
        if (expectedHolding) {
          check(`${cpLabel} ${symbol} qty`, totalQty.toString(), expectedHolding.qty);
          check(`${cpLabel} ${symbol} value`, holdingValue.toString(), expectedHolding.value);
          check(`${cpLabel} ${symbol} costBasis`, totalCostBasis.toString(), expectedHolding.costBasis);
        }
      }

      check(`${cpLabel} totalValue`, indepTotalValue.toString(), cp.expectedPortfolioValue.totalValue);
      check(`${cpLabel} totalCostBasis`, indepTotalCostBasis.toString(), cp.expectedPortfolioValue.totalCostBasis);
      check(`${cpLabel} unrealizedPnl`, sub(indepTotalValue, indepTotalCostBasis).toString(), cp.expectedPortfolioValue.unrealizedPnl);
      check(`${cpLabel} cumulative realized PnL`, indepTotalRealized.toString(), cp.expectedRealizedPnl.cumulative);
    }

    const r = result();
    expect(r.failures).toEqual([]);
    // Path B runs fewer checks than Path A because it only validates per-holding
    // values (qty, value, costBasis) + portfolio totals, skipping zero-position
    // instruments. Total varies by fixture data; require a meaningful count.
    expect(r.checksRun).toBeGreaterThanOrEqual(100);
  });

  it('Path C: Engine vs independent consistency', () => {
    const { check, result } = createChecker();

    for (let cpIdx = 0; cpIdx < expectedOutputs.checkpoints.length; cpIdx++) {
      const cp = expectedOutputs.checkpoints[cpIdx]!;
      const cpLabel = `Consistency CP${cpIdx + 1} (${cp.date})`;

      // Engine results
      let engineRealized = ZERO;
      for (const symbol of ALL_SYMBOLS) {
        const txs = getTransactionsForInstrument(symbol, cp.date);
        const engineResult = processTransactions(txs);
        engineRealized = add(engineRealized, computeRealizedPnL(engineResult.realizedTrades));
      }

      // Independent results
      let indepRealized = ZERO;
      for (const symbol of ALL_SYMBOLS) {
        const txs = getTransactionsForInstrument(symbol, cp.date);
        const indepResult = independentFIFO(txs);
        indepRealized = add(indepRealized, indepResult.realizedPnl);
      }

      check(
        `${cpLabel} engine vs independent realized PnL`,
        engineRealized.toString(),
        indepRealized.toString(),
      );

      // Compare lot states
      for (const symbol of ALL_SYMBOLS) {
        const txs = getTransactionsForInstrument(symbol, cp.date);
        const engineResult = processTransactions(txs);
        const indepResult = independentFIFO(txs);

        check(
          `${cpLabel} ${symbol} lot count engine vs independent`,
          engineResult.lots.length.toString(),
          indepResult.lots.length.toString(),
        );

        const minLots = Math.min(engineResult.lots.length, indepResult.lots.length);
        for (let i = 0; i < minLots; i++) {
          const eLot = engineResult.lots[i]!;
          const iLot = indepResult.lots[i]!;
          check(
            `${cpLabel} ${symbol} lot[${i}] remainingQty engine vs independent`,
            eLot.remainingQty.toString(),
            iLot.remainingQty.toString(),
          );
          check(
            `${cpLabel} ${symbol} lot[${i}] costBasisRemaining engine vs independent`,
            eLot.costBasisRemaining.toString(),
            iLot.costBasisRemaining.toString(),
          );
        }
      }
    }

    const r = result();
    expect(r.failures).toEqual([]);
    // Path C checks engine-vs-independent consistency: realized PnL match, lot
    // count match, and per-lot remainingQty + costBasisRemaining match. Count
    // depends on lot depth across checkpoints.
    expect(r.checksRun).toBeGreaterThanOrEqual(100);
  });
});
