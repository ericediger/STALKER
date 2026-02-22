import { describe, it, expect, beforeAll } from 'vitest';
import { toDecimal, ZERO, add } from '@stalker/shared';
import type { Transaction, Instrument, TransactionType, InstrumentType } from '@stalker/shared';
import {
  processTransactions,
  computeRealizedPnL,
  buildPortfolioValueSeries,
  MockPriceLookup,
  MockSnapshotStore,
} from '../src/index.js';
import type { HoldingSnapshotEntry, CalendarFns } from '../src/index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Load fixture files
// ---------------------------------------------------------------------------

const fixtureDir = path.resolve(__dirname, '../../../data/test');
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
      holdings: Record<string, { qty: string; value: string; costBasis: string; isEstimated?: boolean }>;
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
// Build typed data from fixtures
// ---------------------------------------------------------------------------

const instruments: Instrument[] = refPortfolio.instruments.map(toInstrument);
const allTransactions: Transaction[] = refPortfolio.transactions.map(toTransaction);

// Map instrumentId -> symbol for lookups
const idToSymbol = new Map<string, string>();
const symbolToId = new Map<string, string>();
for (const inst of instruments) {
  idToSymbol.set(inst.id, inst.symbol);
  symbolToId.set(inst.symbol, inst.id);
}

// Build MockPriceLookup from fixture bars
function buildPriceLookup(): MockPriceLookup {
  const bars: Record<string, Array<{ date: string; close: ReturnType<typeof toDecimal> }>> = {};
  for (const [instrumentId, rawBars] of Object.entries(refPortfolio.priceBars)) {
    bars[instrumentId] = rawBars.map((b) => ({
      date: b.date,
      close: toDecimal(b.close),
    }));
  }
  return new MockPriceLookup(bars);
}

/**
 * Simple calendar for tests: weekdays are trading days, weekends are not.
 * Operates on UTC dates — matches the value-series builder's parseDateStr behavior.
 */
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

/**
 * Get all transactions for a given instrument, sorted by tradeAt ASC,
 * filtered to those on or before the given checkpoint date.
 */
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
// Tests
// ---------------------------------------------------------------------------

describe('Reference Portfolio Validation', () => {
  // =========================================================================
  // Checkpoint 1: 2026-01-09 — Initial buys in 5 instruments
  // =========================================================================
  describe('Checkpoint 1: 2026-01-09 — Initial buys', () => {
    const cp = expectedOutputs.checkpoints[0]!;

    it('lot state: all 5 instruments have single open lots', () => {
      for (const [symbol, expectedLots] of Object.entries(cp.expectedLotState)) {
        const txs = getTransactionsForInstrument(symbol, cp.date);
        const result = processTransactions(txs);

        expect(result.lots.length).toBe(expectedLots.length);
        for (let i = 0; i < expectedLots.length; i++) {
          const lot = result.lots[i]!;
          const expected = expectedLots[i]!;
          expect(lot.openedAt.toISOString()).toBe(expected.openedAt);
          expect(lot.originalQty.toString()).toBe(expected.originalQty);
          expect(lot.remainingQty.toString()).toBe(expected.remainingQty);
          expect(lot.price.toString()).toBe(expected.costBasisPerShare);
          expect(lot.costBasisRemaining.toString()).toBe(expected.costBasisRemaining);
        }
      }
    });

    it('realized PnL: zero (no sells yet)', () => {
      for (const symbol of Object.keys(cp.expectedLotState)) {
        const txs = getTransactionsForInstrument(symbol, cp.date);
        const result = processTransactions(txs);
        const realized = computeRealizedPnL(result.realizedTrades);
        expect(realized.toString()).toBe('0');
      }
    });

    it('portfolio value snapshot matches hand-computed totals', async () => {
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
      expect(snapshot).not.toBeNull();

      expect(snapshot!.totalValue.toString()).toBe(cp.expectedPortfolioValue.totalValue);
      expect(snapshot!.totalCostBasis.toString()).toBe(cp.expectedPortfolioValue.totalCostBasis);
      expect(snapshot!.unrealizedPnl.toString()).toBe(cp.expectedPortfolioValue.unrealizedPnl);
      expect(snapshot!.realizedPnl.toString()).toBe(cp.expectedPortfolioValue.realizedPnl);

      // Check individual holdings
      const holdings = snapshot!.holdingsJson as Record<string, HoldingSnapshotEntry>;
      for (const [symbol, expected] of Object.entries(cp.expectedPortfolioValue.holdings)) {
        expect(holdings[symbol]).toBeDefined();
        expect(holdings[symbol]!.qty.toString()).toBe(expected.qty);
        expect(holdings[symbol]!.value.toString()).toBe(expected.value);
        expect(holdings[symbol]!.costBasis.toString()).toBe(expected.costBasis);
      }

      // INTC should NOT be in holdings (no transactions yet)
      expect(holdings['INTC']).toBeUndefined();
    });
  });

  // =========================================================================
  // Checkpoint 2: 2026-01-27 — After QQQ partial sell
  // =========================================================================
  describe('Checkpoint 2: 2026-01-27 — After QQQ partial sell', () => {
    const cp = expectedOutputs.checkpoints[1]!;

    it('lot state: QQQ has 50 remaining after selling 30 of 80', () => {
      const txs = getTransactionsForInstrument('QQQ', cp.date);
      const result = processTransactions(txs);

      expect(result.lots.length).toBe(1);
      expect(result.lots[0]!.remainingQty.toString()).toBe('50');
      expect(result.lots[0]!.costBasisRemaining.toString()).toBe('24000');
    });

    it('realized PnL: QQQ sell produces $300', () => {
      const txs = getTransactionsForInstrument('QQQ', cp.date);
      const result = processTransactions(txs);
      const realized = computeRealizedPnL(result.realizedTrades);
      expect(realized.toString()).toBe('300');

      // Verify the realized trade details
      expect(result.realizedTrades.length).toBe(1);
      expect(result.realizedTrades[0]!.qty.toString()).toBe('30');
      expect(result.realizedTrades[0]!.proceeds.toString()).toBe('14700');
      expect(result.realizedTrades[0]!.costBasis.toString()).toBe('14400');
    });

    it('portfolio value snapshot at checkpoint 2', async () => {
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
      expect(snapshot).not.toBeNull();

      expect(snapshot!.totalValue.toString()).toBe(cp.expectedPortfolioValue.totalValue);
      expect(snapshot!.totalCostBasis.toString()).toBe(cp.expectedPortfolioValue.totalCostBasis);
      expect(snapshot!.unrealizedPnl.toString()).toBe(cp.expectedPortfolioValue.unrealizedPnl);
      expect(snapshot!.realizedPnl.toString()).toBe(cp.expectedPortfolioValue.realizedPnl);

      // All 6 instruments should be in holdings
      const holdings = snapshot!.holdingsJson as Record<string, HoldingSnapshotEntry>;
      expect(Object.keys(holdings).length).toBe(6);

      for (const [symbol, expected] of Object.entries(cp.expectedPortfolioValue.holdings)) {
        expect(holdings[symbol]!.qty.toString()).toBe(expected.qty);
        expect(holdings[symbol]!.value.toString()).toBe(expected.value);
        expect(holdings[symbol]!.costBasis.toString()).toBe(expected.costBasis);
      }
    });
  });

  // =========================================================================
  // Checkpoint 3: 2026-02-09 — After MSFT full close
  // =========================================================================
  describe('Checkpoint 3: 2026-02-09 — After MSFT full close', () => {
    const cp = expectedOutputs.checkpoints[2]!;

    it('lot state: MSFT has zero open lots after full close', () => {
      const txs = getTransactionsForInstrument('MSFT', cp.date);
      const result = processTransactions(txs);
      expect(result.lots.length).toBe(0);
    });

    it('realized PnL: MSFT close produces $4,000', () => {
      const txs = getTransactionsForInstrument('MSFT', cp.date);
      const result = processTransactions(txs);
      const realized = computeRealizedPnL(result.realizedTrades);
      expect(realized.toString()).toBe('4000');
    });

    it('lot state: SPY has 2 lots (including backdated Feb 3 buy)', () => {
      const txs = getTransactionsForInstrument('SPY', cp.date);
      const result = processTransactions(txs);

      expect(result.lots.length).toBe(2);
      // Lot 1: Jan 9 buy
      expect(result.lots[0]!.openedAt.toISOString()).toBe('2026-01-09T14:30:00.000Z');
      expect(result.lots[0]!.remainingQty.toString()).toBe('60');
      // Lot 2: Feb 3 backdated buy
      expect(result.lots[1]!.openedAt.toISOString()).toBe('2026-02-03T14:30:00.000Z');
      expect(result.lots[1]!.remainingQty.toString()).toBe('25');
    });

    it('portfolio value snapshot: MSFT absent from holdings', async () => {
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
      expect(snapshot).not.toBeNull();

      expect(snapshot!.totalValue.toString()).toBe(cp.expectedPortfolioValue.totalValue);
      expect(snapshot!.totalCostBasis.toString()).toBe(cp.expectedPortfolioValue.totalCostBasis);
      expect(snapshot!.unrealizedPnl.toString()).toBe(cp.expectedPortfolioValue.unrealizedPnl);
      expect(snapshot!.realizedPnl.toString()).toBe(cp.expectedPortfolioValue.realizedPnl);

      // MSFT should NOT be in holdings (fully closed)
      const holdings = snapshot!.holdingsJson as Record<string, HoldingSnapshotEntry>;
      expect(holdings['MSFT']).toBeUndefined();
      expect(Object.keys(holdings).length).toBe(5);

      for (const [symbol, expected] of Object.entries(cp.expectedPortfolioValue.holdings)) {
        expect(holdings[symbol]!.qty.toString()).toBe(expected.qty);
        expect(holdings[symbol]!.value.toString()).toBe(expected.value);
        expect(holdings[symbol]!.costBasis.toString()).toBe(expected.costBasis);
      }
    });
  });

  // =========================================================================
  // Checkpoint 4: 2026-02-25 — During INTC price gap (carry-forward)
  // =========================================================================
  describe('Checkpoint 4: 2026-02-25 — INTC price gap, carry-forward', () => {
    const cp = expectedOutputs.checkpoints[3]!;

    it('lot state: AAPL has 3 lots after partial sell of 90', () => {
      const txs = getTransactionsForInstrument('AAPL', cp.date);
      const result = processTransactions(txs);

      expect(result.lots.length).toBe(3);
      // Lot 1 remnant: 10 of original 100 @ $150
      expect(result.lots[0]!.remainingQty.toString()).toBe('10');
      expect(result.lots[0]!.price.toString()).toBe('150');
      expect(result.lots[0]!.costBasisRemaining.toString()).toBe('1500');
      // Lot 2: untouched 50 @ $160
      expect(result.lots[1]!.remainingQty.toString()).toBe('50');
      // Lot 3: untouched 30 @ $170
      expect(result.lots[2]!.remainingQty.toString()).toBe('30');
    });

    it('INTC carry-forward: isEstimated flag is set during price gap', async () => {
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
      expect(snapshot).not.toBeNull();

      const holdings = snapshot!.holdingsJson as Record<string, HoldingSnapshotEntry>;
      // INTC should have isEstimated = true (carry-forward from Feb 20)
      expect(holdings['INTC']).toBeDefined();
      expect(holdings['INTC']!.isEstimated).toBe(true);
      // Value = 150 * 24.50 = 3675 (using Feb 20 close price carried forward)
      expect(holdings['INTC']!.value.toString()).toBe('3675');
    });

    it('portfolio value snapshot at checkpoint 4', async () => {
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
      expect(snapshot).not.toBeNull();

      expect(snapshot!.totalValue.toString()).toBe(cp.expectedPortfolioValue.totalValue);
      expect(snapshot!.totalCostBasis.toString()).toBe(cp.expectedPortfolioValue.totalCostBasis);
      expect(snapshot!.unrealizedPnl.toString()).toBe(cp.expectedPortfolioValue.unrealizedPnl);
      expect(snapshot!.realizedPnl.toString()).toBe(cp.expectedPortfolioValue.realizedPnl);
    });
  });

  // =========================================================================
  // Checkpoint 5: 2026-03-03 — After backdated SPY tx, QQQ second sell, MSFT re-entry
  // =========================================================================
  describe('Checkpoint 5: 2026-03-03 — Rebuild correctness', () => {
    const cp = expectedOutputs.checkpoints[4]!;

    it('lot state: QQQ has 1 lot after second sell consumed Lot 1', () => {
      const txs = getTransactionsForInstrument('QQQ', cp.date);
      const result = processTransactions(txs);

      expect(result.lots.length).toBe(1);
      // Only Lot 2 (re-entry) remains: 40 @ $485
      expect(result.lots[0]!.openedAt.toISOString()).toBe('2026-02-18T14:30:00.000Z');
      expect(result.lots[0]!.remainingQty.toString()).toBe('40');
      expect(result.lots[0]!.costBasisRemaining.toString()).toBe('19400');
    });

    it('lot state: MSFT has 1 lot after re-entry', () => {
      const txs = getTransactionsForInstrument('MSFT', cp.date);
      const result = processTransactions(txs);

      expect(result.lots.length).toBe(1);
      expect(result.lots[0]!.openedAt.toISOString()).toBe('2026-03-02T15:00:00.000Z');
      expect(result.lots[0]!.remainingQty.toString()).toBe('100');
      expect(result.lots[0]!.costBasisRemaining.toString()).toBe('42500');
    });

    it('rebuild correctness: SPY backdated transaction results in correct 3-lot state', () => {
      // The SPY BUY on Feb 3 is listed AFTER the Feb 20 buy in the fixture,
      // but when sorted by tradeAt it comes before. The lot engine should
      // produce lots in chronological order.
      const txs = getTransactionsForInstrument('SPY', cp.date);
      const result = processTransactions(txs);

      expect(result.lots.length).toBe(3);
      // Lot 1: Jan 9 (earliest)
      expect(result.lots[0]!.openedAt.toISOString()).toBe('2026-01-09T14:30:00.000Z');
      expect(result.lots[0]!.remainingQty.toString()).toBe('60');
      // Lot 2: Feb 3 (backdated, but chronologically second)
      expect(result.lots[1]!.openedAt.toISOString()).toBe('2026-02-03T14:30:00.000Z');
      expect(result.lots[1]!.remainingQty.toString()).toBe('25');
      // Lot 3: Feb 20
      expect(result.lots[2]!.openedAt.toISOString()).toBe('2026-02-20T14:30:00.000Z');
      expect(result.lots[2]!.remainingQty.toString()).toBe('40');
    });

    it('portfolio value snapshot at checkpoint 5', async () => {
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
      expect(snapshot).not.toBeNull();

      expect(snapshot!.totalValue.toString()).toBe(cp.expectedPortfolioValue.totalValue);
      expect(snapshot!.totalCostBasis.toString()).toBe(cp.expectedPortfolioValue.totalCostBasis);
      expect(snapshot!.unrealizedPnl.toString()).toBe(cp.expectedPortfolioValue.unrealizedPnl);
      expect(snapshot!.realizedPnl.toString()).toBe(cp.expectedPortfolioValue.realizedPnl);

      // All 6 instruments should be in holdings (MSFT is back)
      const holdings = snapshot!.holdingsJson as Record<string, HoldingSnapshotEntry>;
      expect(Object.keys(holdings).length).toBe(6);

      for (const [symbol, expected] of Object.entries(cp.expectedPortfolioValue.holdings)) {
        expect(holdings[symbol]!.qty.toString()).toBe(expected.qty);
        expect(holdings[symbol]!.value.toString()).toBe(expected.value);
        expect(holdings[symbol]!.costBasis.toString()).toBe(expected.costBasis);
      }
    });
  });

  // =========================================================================
  // Checkpoint 6: 2026-03-17 — Final state, all positions, full PnL
  // =========================================================================
  describe('Checkpoint 6: 2026-03-17 — Final state', () => {
    const cp = expectedOutputs.checkpoints[5]!;

    it('lot state: AAPL has 3 lots after 2 sells and 1 rebuy', () => {
      const txs = getTransactionsForInstrument('AAPL', cp.date);
      const result = processTransactions(txs);

      expect(result.lots.length).toBe(3);
      // Lot 2 remnant: 20 of original 50 @ $160
      expect(result.lots[0]!.remainingQty.toString()).toBe('20');
      expect(result.lots[0]!.price.toString()).toBe('160');
      // Lot 3: 30 @ $170
      expect(result.lots[1]!.remainingQty.toString()).toBe('30');
      expect(result.lots[1]!.price.toString()).toBe('170');
      // Lot 4: 20 @ $178 (new buy Mar 16)
      expect(result.lots[2]!.remainingQty.toString()).toBe('20');
      expect(result.lots[2]!.price.toString()).toBe('178');
    });

    it('lot state: MSFT has 1 lot with 50 remaining after partial sell', () => {
      const txs = getTransactionsForInstrument('MSFT', cp.date);
      const result = processTransactions(txs);

      expect(result.lots.length).toBe(1);
      expect(result.lots[0]!.remainingQty.toString()).toBe('50');
      expect(result.lots[0]!.costBasisRemaining.toString()).toBe('21250');
    });

    it('lot state: SPY has 3 lots after partial sell of 30', () => {
      const txs = getTransactionsForInstrument('SPY', cp.date);
      const result = processTransactions(txs);

      expect(result.lots.length).toBe(3);
      // Lot 1: 30 remaining of 60 @ $590
      expect(result.lots[0]!.remainingQty.toString()).toBe('30');
      expect(result.lots[0]!.costBasisRemaining.toString()).toBe('17700');
      // Lot 2: 25 @ $595
      expect(result.lots[1]!.remainingQty.toString()).toBe('25');
      // Lot 3: 40 @ $600
      expect(result.lots[2]!.remainingQty.toString()).toBe('40');
    });

    it('cumulative realized PnL: $9,300 across all instruments', () => {
      const allSymbols = ['AAPL', 'MSFT', 'VTI', 'QQQ', 'SPY', 'INTC'];
      let totalRealized = ZERO;

      for (const symbol of allSymbols) {
        const txs = getTransactionsForInstrument(symbol, cp.date);
        const result = processTransactions(txs);
        const realized = computeRealizedPnL(result.realizedTrades);
        totalRealized = add(totalRealized, realized);
      }

      expect(totalRealized.toString()).toBe('9300');
    });

    it('AAPL multi-lot SELL 40 produces 2 realized trades', () => {
      const txs = getTransactionsForInstrument('AAPL', cp.date);
      const result = processTransactions(txs);

      // AAPL has 2 sells: SELL 90 (single lot) and SELL 40 (multi-lot)
      // SELL 90 from Lot 1 -> 1 trade
      // SELL 40: 10 from Lot 1 remainder + 30 from Lot 2 -> 2 trades
      // Total: 3 realized trades
      expect(result.realizedTrades.length).toBe(3);

      // The multi-lot sell (Mar 9) trades:
      // Trade 2 (index 1): 10 from Lot 1 @ $150
      expect(result.realizedTrades[1]!.qty.toString()).toBe('10');
      expect(result.realizedTrades[1]!.proceeds.toString()).toBe('1800');
      expect(result.realizedTrades[1]!.costBasis.toString()).toBe('1500');
      expect(result.realizedTrades[1]!.realizedPnl.toString()).toBe('300');

      // Trade 3 (index 2): 30 from Lot 2 @ $160
      expect(result.realizedTrades[2]!.qty.toString()).toBe('30');
      expect(result.realizedTrades[2]!.proceeds.toString()).toBe('5400');
      expect(result.realizedTrades[2]!.costBasis.toString()).toBe('4800');
      expect(result.realizedTrades[2]!.realizedPnl.toString()).toBe('600');
    });

    it('portfolio value snapshot: final totals', async () => {
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
      expect(snapshot).not.toBeNull();

      expect(snapshot!.totalValue.toString()).toBe(cp.expectedPortfolioValue.totalValue);
      expect(snapshot!.totalCostBasis.toString()).toBe(cp.expectedPortfolioValue.totalCostBasis);
      expect(snapshot!.unrealizedPnl.toString()).toBe(cp.expectedPortfolioValue.unrealizedPnl);
      expect(snapshot!.realizedPnl.toString()).toBe(cp.expectedPortfolioValue.realizedPnl);
    });

    it('final holdings breakdown: all 6 instruments with correct values', async () => {
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
      expect(snapshot).not.toBeNull();

      const holdings = snapshot!.holdingsJson as Record<string, HoldingSnapshotEntry>;
      expect(Object.keys(holdings).length).toBe(6);

      for (const [symbol, expected] of Object.entries(cp.expectedPortfolioValue.holdings)) {
        const holding = holdings[symbol]!;
        expect(holding.qty.toString()).toBe(expected.qty);
        expect(holding.value.toString()).toBe(expected.value);
        expect(holding.costBasis.toString()).toBe(expected.costBasis);
      }

      // No instrument should be marked as estimated at the final date
      // (INTC gap ended well before Mar 17)
      expect(holdings['INTC']!.isEstimated).toBeUndefined();
    });
  });
});
