import { describe, it, expect } from 'vitest';
import { queryPortfolioWindow } from '../src/window-query.js';
import { MockPriceLookup, MockSnapshotStore } from '../src/mocks.js';
import { toDecimal, generateUlid, ZERO } from '@stalker/shared';
import type { Transaction, TransactionType, Instrument, InstrumentType } from '@stalker/shared';
import type { CalendarFns } from '../src/value-series.js';

// --- Helpers ---

function makeInstrument(overrides: Partial<Instrument> & { id: string; symbol: string }): Instrument {
  return {
    name: overrides.symbol,
    type: 'STOCK' as InstrumentType,
    currency: 'USD',
    exchange: 'NYSE',
    exchangeTz: 'America/New_York',
    providerSymbolMap: {},
    firstBarDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeTx(overrides: {
  instrumentId: string;
  type: TransactionType;
  quantity: string;
  price: string;
  tradeAt: Date;
}): Transaction {
  return {
    id: generateUlid(),
    instrumentId: overrides.instrumentId,
    type: overrides.type,
    quantity: toDecimal(overrides.quantity),
    price: toDecimal(overrides.price),
    fees: toDecimal('0'),
    tradeAt: overrides.tradeAt,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
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

function utcDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}

// --- Tests ---

describe('queryPortfolioWindow', () => {
  const instId = 'inst-AAPL';
  const instruments = [makeInstrument({ id: instId, symbol: 'AAPL' })];

  const basePrices = {
    [instId]: [
      { date: '2025-01-02', close: toDecimal('100') },
      { date: '2025-01-03', close: toDecimal('110') },
      { date: '2025-01-06', close: toDecimal('120') },
      { date: '2025-01-07', close: toDecimal('115') },
      { date: '2025-01-08', close: toDecimal('125') },
    ],
  };

  it('basic window: returns correct start/end values and change', async () => {
    const transactions = [
      makeTx({ instrumentId: instId, type: 'BUY', quantity: '100', price: '100', tradeAt: utcDate('2025-01-02') }),
    ];
    const priceLookup = new MockPriceLookup(basePrices);
    const store = new MockSnapshotStore();

    const result = await queryPortfolioWindow({
      startDate: '2025-01-02',
      endDate: '2025-01-08',
      transactions,
      instruments,
      priceLookup,
      snapshotStore: store,
      calendar: testCalendar,
    });

    expect(result.series).toHaveLength(5);
    // Start: 100 * 100 = 10000
    expect(result.startValue.toString()).toBe('10000');
    // End: 100 * 125 = 12500
    expect(result.endValue.toString()).toBe('12500');
    expect(result.absoluteChange.toString()).toBe('2500');
  });

  it('percentage calculation: verified against manual computation', async () => {
    const transactions = [
      makeTx({ instrumentId: instId, type: 'BUY', quantity: '100', price: '100', tradeAt: utcDate('2025-01-02') }),
    ];
    const priceLookup = new MockPriceLookup(basePrices);
    const store = new MockSnapshotStore();

    const result = await queryPortfolioWindow({
      startDate: '2025-01-02',
      endDate: '2025-01-08',
      transactions,
      instruments,
      priceLookup,
      snapshotStore: store,
      calendar: testCalendar,
    });

    // 2500 / 10000 = 0.25 → 4 decimal places = 0.2500
    expect(result.percentageChange.toString()).toBe('0.25');
  });

  it('asOf parameter correctly filters transactions after the cutoff', async () => {
    const transactions = [
      makeTx({ instrumentId: instId, type: 'BUY', quantity: '100', price: '100', tradeAt: utcDate('2025-01-02') }),
      // This sell should be invisible when asOf is Jan 5
      makeTx({ instrumentId: instId, type: 'SELL', quantity: '50', price: '120', tradeAt: utcDate('2025-01-06') }),
    ];
    const priceLookup = new MockPriceLookup(basePrices);
    const store = new MockSnapshotStore();

    // With asOf = Jan 5: only the BUY is visible (SELL on Jan 6 is excluded)
    const result = await queryPortfolioWindow({
      startDate: '2025-01-02',
      endDate: '2025-01-08',
      asOf: '2025-01-05T23:59:59.000Z',
      transactions,
      instruments,
      priceLookup,
      snapshotStore: store,
      calendar: testCalendar,
    });

    // All 100 shares should still be open through the entire window
    expect(result.endValue.toString()).toBe('12500'); // 100 * 125
    expect(result.realizedPnlInWindow.toString()).toBe('0');

    // Without asOf: the sell should be visible
    const store2 = new MockSnapshotStore();
    const resultFull = await queryPortfolioWindow({
      startDate: '2025-01-02',
      endDate: '2025-01-08',
      transactions,
      instruments,
      priceLookup,
      snapshotStore: store2,
      calendar: testCalendar,
    });

    // After sell: 50 remaining @ 125 = 6250
    expect(resultFull.endValue.toString()).toBe('6250');
    // Realized: sold 50 @ 120, cost 50*100=5000, proceeds=6000, pnl=1000
    expect(resultFull.realizedPnlInWindow.toString()).toBe('1000');
  });

  it('window with no snapshots returns zero values', async () => {
    const priceLookup = new MockPriceLookup(basePrices);
    const store = new MockSnapshotStore();

    const result = await queryPortfolioWindow({
      startDate: '2025-01-02',
      endDate: '2025-01-03',
      transactions: [],
      instruments,
      priceLookup,
      snapshotStore: store,
      calendar: testCalendar,
    });

    // Empty portfolio → snapshots exist but with zero values
    expect(result.startValue.toString()).toBe('0');
    expect(result.endValue.toString()).toBe('0');
    expect(result.absoluteChange.toString()).toBe('0');
    expect(result.percentageChange.toString()).toBe('0');
    expect(result.realizedPnlInWindow.toString()).toBe('0');
    expect(result.unrealizedPnlAtEnd.toString()).toBe('0');
    expect(result.holdings).toHaveLength(0);
  });

  it('holdings breakdown at end of window is correct', async () => {
    const instGOOG = 'inst-GOOG';
    const multiInstruments = [
      ...instruments,
      makeInstrument({ id: instGOOG, symbol: 'GOOG' }),
    ];
    const transactions = [
      makeTx({ instrumentId: instId, type: 'BUY', quantity: '50', price: '100', tradeAt: utcDate('2025-01-02') }),
      makeTx({ instrumentId: instGOOG, type: 'BUY', quantity: '20', price: '200', tradeAt: utcDate('2025-01-02') }),
    ];
    const priceLookup = new MockPriceLookup({
      ...basePrices,
      [instGOOG]: [
        { date: '2025-01-02', close: toDecimal('200') },
        { date: '2025-01-03', close: toDecimal('210') },
      ],
    });
    const store = new MockSnapshotStore();

    const result = await queryPortfolioWindow({
      startDate: '2025-01-02',
      endDate: '2025-01-03',
      transactions,
      instruments: multiInstruments,
      priceLookup,
      snapshotStore: store,
      calendar: testCalendar,
    });

    expect(result.holdings).toHaveLength(2);

    const aaplHolding = result.holdings.find((h) => h.symbol === 'AAPL');
    expect(aaplHolding).toBeDefined();
    expect(aaplHolding!.qty.toString()).toBe('50');
    expect(aaplHolding!.value.toString()).toBe('5500'); // 50 * 110
    expect(aaplHolding!.costBasis.toString()).toBe('5000'); // 50 * 100
    expect(aaplHolding!.unrealizedPnl.toString()).toBe('500');
    expect(aaplHolding!.instrumentId).toBe(instId);

    const googHolding = result.holdings.find((h) => h.symbol === 'GOOG');
    expect(googHolding).toBeDefined();
    expect(googHolding!.qty.toString()).toBe('20');
    expect(googHolding!.value.toString()).toBe('4200'); // 20 * 210
    expect(googHolding!.costBasis.toString()).toBe('4000'); // 20 * 200
    expect(googHolding!.unrealizedPnl.toString()).toBe('200');
  });

  it('realized PnL in window computed correctly for sells within range', async () => {
    const transactions = [
      makeTx({ instrumentId: instId, type: 'BUY', quantity: '100', price: '100', tradeAt: utcDate('2025-01-02') }),
      makeTx({ instrumentId: instId, type: 'SELL', quantity: '40', price: '110', tradeAt: utcDate('2025-01-03') }),
      makeTx({ instrumentId: instId, type: 'SELL', quantity: '30', price: '120', tradeAt: utcDate('2025-01-06') }),
    ];
    const priceLookup = new MockPriceLookup(basePrices);
    const store = new MockSnapshotStore();

    const result = await queryPortfolioWindow({
      startDate: '2025-01-02',
      endDate: '2025-01-08',
      transactions,
      instruments,
      priceLookup,
      snapshotStore: store,
      calendar: testCalendar,
    });

    // Sell 1: 40 @ 110, cost 40*100=4000, proceeds=4400, pnl=400
    // Sell 2: 30 @ 120, cost 30*100=3000, proceeds=3600, pnl=600
    // Total realized in window: 1000
    expect(result.realizedPnlInWindow.toString()).toBe('1000');

    // End: 30 remaining @ 125 = 3750
    expect(result.endValue.toString()).toBe('3750');
    // Unrealized at end: 3750 - 30*100=3000 → 750
    expect(result.unrealizedPnlAtEnd.toString()).toBe('750');
  });

  it('percentage change is zero when startValue is zero', async () => {
    // Transaction on the second day, so first day has nothing
    const transactions = [
      makeTx({ instrumentId: instId, type: 'BUY', quantity: '100', price: '110', tradeAt: utcDate('2025-01-03') }),
    ];
    const priceLookup = new MockPriceLookup(basePrices);
    const store = new MockSnapshotStore();

    const result = await queryPortfolioWindow({
      startDate: '2025-01-02',
      endDate: '2025-01-03',
      transactions,
      instruments,
      priceLookup,
      snapshotStore: store,
      calendar: testCalendar,
    });

    expect(result.startValue.toString()).toBe('0');
    expect(result.endValue.toString()).toBe('11000'); // 100 * 110
    expect(result.percentageChange.toString()).toBe('0'); // Can't compute % from zero
  });
});
