import { describe, it, expect } from 'vitest';
import { rebuildSnapshotsFrom } from '../src/snapshot-rebuild.js';
import { buildPortfolioValueSeries } from '../src/value-series.js';
import { MockPriceLookup, MockSnapshotStore } from '../src/mocks.js';
import { toDecimal, generateUlid } from '@stalker/shared';
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

describe('rebuildSnapshotsFrom', () => {
  const instId = 'inst-AAPL';
  const instruments = [makeInstrument({ id: instId, symbol: 'AAPL' })];

  const basePrices = {
    [instId]: [
      { date: '2025-01-02', close: toDecimal('100') },
      { date: '2025-01-03', close: toDecimal('105') },
      { date: '2025-01-06', close: toDecimal('110') },
      { date: '2025-01-07', close: toDecimal('108') },
      { date: '2025-01-08', close: toDecimal('112') },
    ],
  };

  it('rebuild from midpoint: snapshots before midpoint are preserved', async () => {
    const transactions = [
      makeTx({ instrumentId: instId, type: 'BUY', quantity: '100', price: '100', tradeAt: utcDate('2025-01-02') }),
    ];
    const priceLookup = new MockPriceLookup(basePrices);
    const store = new MockSnapshotStore();

    // Build full range first
    await buildPortfolioValueSeries({
      transactions, instruments, priceLookup, snapshotStore: store,
      calendar: testCalendar, startDate: '2025-01-02', endDate: '2025-01-08',
    });

    let all = store.getAll();
    expect(all).toHaveLength(5);
    const earlySnapValue = all[0]!.totalValue.toString(); // Jan 2

    // Rebuild from Jan 6 (midpoint)
    const result = await rebuildSnapshotsFrom({
      affectedDate: '2025-01-06',
      transactions,
      instruments,
      priceLookup,
      snapshotStore: store,
      calendar: testCalendar,
      endDate: '2025-01-08',
    });

    // 3 snapshots rebuilt (Jan 6, 7, 8)
    expect(result.snapshotsRebuilt).toBe(3);

    all = store.getAll();
    // 2 (preserved from Jan 2, 3) + 3 (rebuilt Jan 6, 7, 8) = 5
    expect(all).toHaveLength(5);

    // Early snapshots preserved
    expect(all[0]!.totalValue.toString()).toBe(earlySnapValue);
  });

  it('rebuild from start: all snapshots rebuilt', async () => {
    const transactions = [
      makeTx({ instrumentId: instId, type: 'BUY', quantity: '100', price: '100', tradeAt: utcDate('2025-01-02') }),
    ];
    const priceLookup = new MockPriceLookup(basePrices);
    const store = new MockSnapshotStore();

    // Build initial
    await buildPortfolioValueSeries({
      transactions, instruments, priceLookup, snapshotStore: store,
      calendar: testCalendar, startDate: '2025-01-02', endDate: '2025-01-08',
    });

    // Rebuild from the very start
    const result = await rebuildSnapshotsFrom({
      affectedDate: '2025-01-02',
      transactions,
      instruments,
      priceLookup,
      snapshotStore: store,
      calendar: testCalendar,
      endDate: '2025-01-08',
    });

    expect(result.snapshotsRebuilt).toBe(5);
    expect(store.getAll()).toHaveLength(5);
  });

  it('insert backdated transaction: rebuild only from that date forward', async () => {
    const transactions = [
      makeTx({ instrumentId: instId, type: 'BUY', quantity: '100', price: '100', tradeAt: utcDate('2025-01-02') }),
    ];
    const priceLookup = new MockPriceLookup(basePrices);
    const store = new MockSnapshotStore();

    // Initial build
    await buildPortfolioValueSeries({
      transactions, instruments, priceLookup, snapshotStore: store,
      calendar: testCalendar, startDate: '2025-01-02', endDate: '2025-01-08',
    });

    const snapBeforeRebuild = store.getAll();
    expect(snapBeforeRebuild).toHaveLength(5);

    // User inserts a backdated sell on Jan 6
    const updatedTxs = [
      ...transactions,
      makeTx({ instrumentId: instId, type: 'SELL', quantity: '50', price: '110', tradeAt: utcDate('2025-01-06') }),
    ];

    const result = await rebuildSnapshotsFrom({
      affectedDate: '2025-01-06',
      transactions: updatedTxs,
      instruments,
      priceLookup,
      snapshotStore: store,
      calendar: testCalendar,
      endDate: '2025-01-08',
    });

    expect(result.snapshotsRebuilt).toBe(3);

    const all = store.getAll();
    expect(all).toHaveLength(5);

    // Jan 6 snapshot should now reflect the sell
    const jan6 = all.find((s) => s.date === '2025-01-06')!;
    // 50 remaining shares @ 110 = 5500
    expect(jan6.totalValue.toString()).toBe('5500');
    // Realized PnL: sold 50 @ 110, cost 50*100=5000, proceeds=5500, pnl=500
    expect(jan6.realizedPnl.toString()).toBe('500');
  });

  it('returns correct count of snapshots rebuilt', async () => {
    const transactions = [
      makeTx({ instrumentId: instId, type: 'BUY', quantity: '100', price: '100', tradeAt: utcDate('2025-01-02') }),
    ];
    const priceLookup = new MockPriceLookup(basePrices);
    const store = new MockSnapshotStore();

    const result = await rebuildSnapshotsFrom({
      affectedDate: '2025-01-06',
      transactions,
      instruments,
      priceLookup,
      snapshotStore: store,
      calendar: testCalendar,
      endDate: '2025-01-08',
    });

    // Jan 6, 7, 8 → 3 trading days
    expect(result.snapshotsRebuilt).toBe(3);
  });

  it('rebuild with no changes produces same results', async () => {
    const transactions = [
      makeTx({ instrumentId: instId, type: 'BUY', quantity: '100', price: '100', tradeAt: utcDate('2025-01-02') }),
      makeTx({ instrumentId: instId, type: 'SELL', quantity: '30', price: '110', tradeAt: utcDate('2025-01-06') }),
    ];
    const priceLookup = new MockPriceLookup(basePrices);
    const store = new MockSnapshotStore();

    // Build initial
    await buildPortfolioValueSeries({
      transactions, instruments, priceLookup, snapshotStore: store,
      calendar: testCalendar, startDate: '2025-01-02', endDate: '2025-01-08',
    });

    const initialSnapshots = store.getAll().map((s) => ({
      date: s.date,
      totalValue: s.totalValue.toString(),
      realizedPnl: s.realizedPnl.toString(),
    }));

    // Rebuild from start with same data
    await rebuildSnapshotsFrom({
      affectedDate: '2025-01-02',
      transactions,
      instruments,
      priceLookup,
      snapshotStore: store,
      calendar: testCalendar,
      endDate: '2025-01-08',
    });

    const rebuiltSnapshots = store.getAll().map((s) => ({
      date: s.date,
      totalValue: s.totalValue.toString(),
      realizedPnl: s.realizedPnl.toString(),
    }));

    expect(rebuiltSnapshots).toEqual(initialSnapshots);
  });

  it('rebuild an empty portfolio produces zero-valued snapshots', async () => {
    const priceLookup = new MockPriceLookup(basePrices);
    const store = new MockSnapshotStore();

    const result = await rebuildSnapshotsFrom({
      affectedDate: '2025-01-02',
      transactions: [],
      instruments,
      priceLookup,
      snapshotStore: store,
      calendar: testCalendar,
      endDate: '2025-01-03',
    });

    expect(result.snapshotsRebuilt).toBe(2);
    const all = store.getAll();
    for (const snap of all) {
      expect(snap.totalValue.toString()).toBe('0');
    }
  });
});
