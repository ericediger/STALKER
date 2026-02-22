import { describe, it, expect } from 'vitest';
import { buildPortfolioValueSeries } from '../src/value-series.js';
import { MockPriceLookup, MockSnapshotStore } from '../src/mocks.js';
import { toDecimal, generateUlid, ZERO } from '@stalker/shared';
import type { Transaction, TransactionType, Instrument, InstrumentType } from '@stalker/shared';
import type { HoldingSnapshotEntry } from '../src/interfaces.js';
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
  fees?: string;
}): Transaction {
  return {
    id: generateUlid(),
    instrumentId: overrides.instrumentId,
    type: overrides.type,
    quantity: toDecimal(overrides.quantity),
    price: toDecimal(overrides.price),
    fees: toDecimal(overrides.fees ?? '0'),
    tradeAt: overrides.tradeAt,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Simple calendar for tests: weekdays are trading days, weekends are not.
 * Operates on UTC dates.
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

function utcDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}

// --- Tests ---

describe('buildPortfolioValueSeries', () => {
  it('happy path: single instrument, 1 buy, 5 trading days', async () => {
    const instId = 'inst-AAPL';
    const instruments = [makeInstrument({ id: instId, symbol: 'AAPL' })];
    const transactions = [
      makeTx({ instrumentId: instId, type: 'BUY', quantity: '100', price: '150', tradeAt: utcDate('2025-01-02') }),
    ];
    const priceLookup = new MockPriceLookup({
      [instId]: [
        { date: '2025-01-02', close: toDecimal('150') },
        { date: '2025-01-03', close: toDecimal('152') },
        { date: '2025-01-06', close: toDecimal('155') },
        { date: '2025-01-07', close: toDecimal('153') },
        { date: '2025-01-08', close: toDecimal('158') },
      ],
    });
    const store = new MockSnapshotStore();

    await buildPortfolioValueSeries({
      transactions,
      instruments,
      priceLookup,
      snapshotStore: store,
      calendar: testCalendar,
      startDate: '2025-01-02',
      endDate: '2025-01-08',
    });

    const snapshots = await store.getRange('2025-01-02', '2025-01-08');
    // 5 trading days: Jan 2 (Thu), 3 (Fri), 6 (Mon), 7 (Tue), 8 (Wed)
    expect(snapshots).toHaveLength(5);

    // First day: 100 shares @ 150 = 15000
    expect(snapshots[0]!.date).toBe('2025-01-02');
    expect(snapshots[0]!.totalValue.toString()).toBe('15000');
    expect(snapshots[0]!.totalCostBasis.toString()).toBe('15000');
    expect(snapshots[0]!.unrealizedPnl.toString()).toBe('0');

    // Last day: 100 shares @ 158 = 15800
    expect(snapshots[4]!.date).toBe('2025-01-08');
    expect(snapshots[4]!.totalValue.toString()).toBe('15800');
    expect(snapshots[4]!.totalCostBasis.toString()).toBe('15000');
    expect(snapshots[4]!.unrealizedPnl.toString()).toBe('800');
  });

  it('multi-instrument: 3 instruments, 5 transactions, 5 trading dates', async () => {
    const instAAPL = 'inst-AAPL';
    const instGOOG = 'inst-GOOG';
    const instMSFT = 'inst-MSFT';
    const instruments = [
      makeInstrument({ id: instAAPL, symbol: 'AAPL' }),
      makeInstrument({ id: instGOOG, symbol: 'GOOG' }),
      makeInstrument({ id: instMSFT, symbol: 'MSFT' }),
    ];
    const transactions = [
      makeTx({ instrumentId: instAAPL, type: 'BUY', quantity: '50', price: '150', tradeAt: utcDate('2025-01-02') }),
      makeTx({ instrumentId: instGOOG, type: 'BUY', quantity: '20', price: '100', tradeAt: utcDate('2025-01-02') }),
      makeTx({ instrumentId: instMSFT, type: 'BUY', quantity: '30', price: '200', tradeAt: utcDate('2025-01-03') }),
      makeTx({ instrumentId: instAAPL, type: 'SELL', quantity: '25', price: '155', tradeAt: utcDate('2025-01-06') }),
      makeTx({ instrumentId: instGOOG, type: 'BUY', quantity: '10', price: '105', tradeAt: utcDate('2025-01-07') }),
    ];
    const priceLookup = new MockPriceLookup({
      [instAAPL]: [
        { date: '2025-01-02', close: toDecimal('150') },
        { date: '2025-01-03', close: toDecimal('152') },
        { date: '2025-01-06', close: toDecimal('155') },
        { date: '2025-01-07', close: toDecimal('156') },
        { date: '2025-01-08', close: toDecimal('158') },
      ],
      [instGOOG]: [
        { date: '2025-01-02', close: toDecimal('100') },
        { date: '2025-01-03', close: toDecimal('102') },
        { date: '2025-01-06', close: toDecimal('104') },
        { date: '2025-01-07', close: toDecimal('105') },
        { date: '2025-01-08', close: toDecimal('108') },
      ],
      [instMSFT]: [
        { date: '2025-01-02', close: toDecimal('198') },
        { date: '2025-01-03', close: toDecimal('200') },
        { date: '2025-01-06', close: toDecimal('205') },
        { date: '2025-01-07', close: toDecimal('203') },
        { date: '2025-01-08', close: toDecimal('210') },
      ],
    });
    const store = new MockSnapshotStore();

    await buildPortfolioValueSeries({
      transactions,
      instruments,
      priceLookup,
      snapshotStore: store,
      calendar: testCalendar,
      startDate: '2025-01-02',
      endDate: '2025-01-08',
    });

    const snapshots = await store.getRange('2025-01-02', '2025-01-08');
    expect(snapshots).toHaveLength(5);

    // Day 1 (Jan 2): AAPL 50*150=7500, GOOG 20*100=2000 → totalValue=9500
    expect(snapshots[0]!.date).toBe('2025-01-02');
    expect(snapshots[0]!.totalValue.toString()).toBe('9500');

    // Day 2 (Jan 3): AAPL 50*152=7600, GOOG 20*102=2040, MSFT 30*200=6000 → 15640
    expect(snapshots[1]!.date).toBe('2025-01-03');
    expect(snapshots[1]!.totalValue.toString()).toBe('15640');

    // Day 3 (Jan 6): AAPL sold 25, remaining 25*155=3875, GOOG 20*104=2080, MSFT 30*205=6150 → 12105
    expect(snapshots[2]!.date).toBe('2025-01-06');
    expect(snapshots[2]!.totalValue.toString()).toBe('12105');
    // Realized PnL: sold 25 AAPL @ 155, cost 25*150=3750, proceeds=3875, pnl=125
    expect(snapshots[2]!.realizedPnl.toString()).toBe('125');

    // Day 5 (Jan 8): AAPL 25*158=3950, GOOG 30*108=3240, MSFT 30*210=6300 → 13490
    expect(snapshots[4]!.date).toBe('2025-01-08');
    expect(snapshots[4]!.totalValue.toString()).toBe('13490');
  });

  it('carry-forward: instrument with price gap uses prior close with isEstimated', async () => {
    const instId = 'inst-AAPL';
    const instruments = [makeInstrument({ id: instId, symbol: 'AAPL' })];
    const transactions = [
      makeTx({ instrumentId: instId, type: 'BUY', quantity: '100', price: '150', tradeAt: utcDate('2025-01-02') }),
    ];
    // Only have price data for Jan 2 and Jan 7 — gap on Jan 3, 6
    const priceLookup = new MockPriceLookup({
      [instId]: [
        { date: '2025-01-02', close: toDecimal('150') },
        { date: '2025-01-07', close: toDecimal('160') },
      ],
    });
    const store = new MockSnapshotStore();

    await buildPortfolioValueSeries({
      transactions,
      instruments,
      priceLookup,
      snapshotStore: store,
      calendar: testCalendar,
      startDate: '2025-01-02',
      endDate: '2025-01-08',
    });

    const snapshots = await store.getRange('2025-01-02', '2025-01-08');
    expect(snapshots).toHaveLength(5);

    // Jan 2: exact price, no carry-forward
    const holdingsDay1 = snapshots[0]!.holdingsJson as Record<string, HoldingSnapshotEntry>;
    expect(holdingsDay1['AAPL']!.isEstimated).toBeUndefined();

    // Jan 3: carry-forward from Jan 2 → isEstimated: true
    const holdingsDay2 = snapshots[1]!.holdingsJson as Record<string, HoldingSnapshotEntry>;
    expect(holdingsDay2['AAPL']!.isEstimated).toBe(true);
    expect(holdingsDay2['AAPL']!.value.toString()).toBe('15000'); // 100 * 150

    // Jan 6 (Mon): still carry-forward from Jan 2
    const holdingsDay3 = snapshots[2]!.holdingsJson as Record<string, HoldingSnapshotEntry>;
    expect(holdingsDay3['AAPL']!.isEstimated).toBe(true);

    // Jan 7: exact price → no isEstimated
    const holdingsDay4 = snapshots[3]!.holdingsJson as Record<string, HoldingSnapshotEntry>;
    expect(holdingsDay4['AAPL']!.isEstimated).toBeUndefined();
    expect(holdingsDay4['AAPL']!.value.toString()).toBe('16000'); // 100 * 160
  });

  it('no price data: instrument with zero bars is excluded from value with costBasisOnly', async () => {
    const instId = 'inst-PRIV';
    const instruments = [makeInstrument({ id: instId, symbol: 'PRIV' })];
    const transactions = [
      makeTx({ instrumentId: instId, type: 'BUY', quantity: '50', price: '100', tradeAt: utcDate('2025-01-02') }),
    ];
    // No price bars at all
    const priceLookup = new MockPriceLookup({});
    const store = new MockSnapshotStore();

    await buildPortfolioValueSeries({
      transactions,
      instruments,
      priceLookup,
      snapshotStore: store,
      calendar: testCalendar,
      startDate: '2025-01-02',
      endDate: '2025-01-03',
    });

    const snapshots = await store.getRange('2025-01-02', '2025-01-03');
    expect(snapshots).toHaveLength(2);

    const holdings = snapshots[0]!.holdingsJson as Record<string, HoldingSnapshotEntry>;
    expect(holdings['PRIV']!.costBasisOnly).toBe(true);
    expect(holdings['PRIV']!.value.toString()).toBe('0');
    expect(holdings['PRIV']!.costBasis.toString()).toBe('5000');
    // totalValue should NOT include this instrument
    expect(snapshots[0]!.totalValue.toString()).toBe('0');
    // But totalCostBasis does include it
    expect(snapshots[0]!.totalCostBasis.toString()).toBe('5000');
  });

  it('trade before firstBarDate: snapshots exclude market value until bars exist', async () => {
    const instId = 'inst-NEW';
    const instruments = [makeInstrument({ id: instId, symbol: 'NEW' })];
    const transactions = [
      makeTx({ instrumentId: instId, type: 'BUY', quantity: '100', price: '50', tradeAt: utcDate('2025-01-02') }),
    ];
    // First bar starts on Jan 6 — trade on Jan 2 is before any price data
    const priceLookup = new MockPriceLookup({
      [instId]: [
        { date: '2025-01-06', close: toDecimal('55') },
        { date: '2025-01-07', close: toDecimal('57') },
      ],
    });
    const store = new MockSnapshotStore();

    await buildPortfolioValueSeries({
      transactions,
      instruments,
      priceLookup,
      snapshotStore: store,
      calendar: testCalendar,
      startDate: '2025-01-02',
      endDate: '2025-01-07',
    });

    const snapshots = await store.getRange('2025-01-02', '2025-01-07');
    // Trading days: Jan 2, 3, 6, 7
    expect(snapshots).toHaveLength(4);

    // Jan 2, 3: no price data yet → costBasisOnly
    const holdingsDay1 = snapshots[0]!.holdingsJson as Record<string, HoldingSnapshotEntry>;
    expect(holdingsDay1['NEW']!.costBasisOnly).toBe(true);
    expect(snapshots[0]!.totalValue.toString()).toBe('0');

    // Jan 6: price available → valued
    const holdingsDay3 = snapshots[2]!.holdingsJson as Record<string, HoldingSnapshotEntry>;
    expect(holdingsDay3['NEW']!.costBasisOnly).toBeUndefined();
    expect(holdingsDay3['NEW']!.value.toString()).toBe('5500'); // 100 * 55
    expect(snapshots[2]!.totalValue.toString()).toBe('5500');
  });

  it('empty portfolio: no transactions produces snapshots with zero values', async () => {
    const instruments = [makeInstrument({ id: 'inst-AAPL', symbol: 'AAPL' })];
    const priceLookup = new MockPriceLookup({});
    const store = new MockSnapshotStore();

    await buildPortfolioValueSeries({
      transactions: [],
      instruments,
      priceLookup,
      snapshotStore: store,
      calendar: testCalendar,
      startDate: '2025-01-02',
      endDate: '2025-01-03',
    });

    const snapshots = await store.getRange('2025-01-02', '2025-01-03');
    expect(snapshots).toHaveLength(2);

    for (const snap of snapshots) {
      expect(snap.totalValue.toString()).toBe('0');
      expect(snap.totalCostBasis.toString()).toBe('0');
      expect(snap.unrealizedPnl.toString()).toBe('0');
      expect(snap.realizedPnl.toString()).toBe('0');
    }
  });

  it('multi-date series: cumulative realized PnL grows with each sell', async () => {
    const instId = 'inst-AAPL';
    const instruments = [makeInstrument({ id: instId, symbol: 'AAPL' })];
    const transactions = [
      makeTx({ instrumentId: instId, type: 'BUY', quantity: '100', price: '100', tradeAt: utcDate('2025-01-02') }),
      makeTx({ instrumentId: instId, type: 'SELL', quantity: '30', price: '110', tradeAt: utcDate('2025-01-03') }),
      makeTx({ instrumentId: instId, type: 'SELL', quantity: '20', price: '115', tradeAt: utcDate('2025-01-06') }),
    ];
    const priceLookup = new MockPriceLookup({
      [instId]: [
        { date: '2025-01-02', close: toDecimal('100') },
        { date: '2025-01-03', close: toDecimal('110') },
        { date: '2025-01-06', close: toDecimal('115') },
        { date: '2025-01-07', close: toDecimal('112') },
      ],
    });
    const store = new MockSnapshotStore();

    await buildPortfolioValueSeries({
      transactions,
      instruments,
      priceLookup,
      snapshotStore: store,
      calendar: testCalendar,
      startDate: '2025-01-02',
      endDate: '2025-01-07',
    });

    const snapshots = await store.getRange('2025-01-02', '2025-01-07');
    expect(snapshots).toHaveLength(4);

    // Jan 2: no sells yet → realizedPnl = 0
    expect(snapshots[0]!.realizedPnl.toString()).toBe('0');

    // Jan 3: sold 30 @ 110, cost 30*100=3000, proceeds=3300, pnl=300
    expect(snapshots[1]!.realizedPnl.toString()).toBe('300');

    // Jan 6: also sold 20 @ 115, cost 20*100=2000, proceeds=2300, pnl=300
    // Cumulative: 300 + 300 = 600
    expect(snapshots[2]!.realizedPnl.toString()).toBe('600');

    // Jan 7: no new sell → still 600
    expect(snapshots[3]!.realizedPnl.toString()).toBe('600');
  });

  it('lot carry-forward optimization: values correct when no new transactions between dates', async () => {
    const instId = 'inst-AAPL';
    const instruments = [makeInstrument({ id: instId, symbol: 'AAPL' })];
    const transactions = [
      makeTx({ instrumentId: instId, type: 'BUY', quantity: '100', price: '100', tradeAt: utcDate('2025-01-02') }),
    ];
    const priceLookup = new MockPriceLookup({
      [instId]: [
        { date: '2025-01-02', close: toDecimal('100') },
        { date: '2025-01-03', close: toDecimal('105') },
        { date: '2025-01-06', close: toDecimal('110') },
      ],
    });
    const store = new MockSnapshotStore();

    await buildPortfolioValueSeries({
      transactions,
      instruments,
      priceLookup,
      snapshotStore: store,
      calendar: testCalendar,
      startDate: '2025-01-02',
      endDate: '2025-01-06',
    });

    const snapshots = await store.getRange('2025-01-02', '2025-01-06');
    expect(snapshots).toHaveLength(3);

    // All days should use the same lot state (100 shares @ 100)
    // but different prices
    expect(snapshots[0]!.totalValue.toString()).toBe('10000'); // 100*100
    expect(snapshots[1]!.totalValue.toString()).toBe('10500'); // 100*105
    expect(snapshots[2]!.totalValue.toString()).toBe('11000'); // 100*110

    // Cost basis stays the same
    for (const snap of snapshots) {
      expect(snap.totalCostBasis.toString()).toBe('10000');
    }
  });

  it('two sells on different dates: realized PnL accumulates correctly', async () => {
    const instId = 'inst-AAPL';
    const instruments = [makeInstrument({ id: instId, symbol: 'AAPL' })];
    const transactions = [
      makeTx({ instrumentId: instId, type: 'BUY', quantity: '100', price: '50', tradeAt: utcDate('2025-01-02') }),
      makeTx({ instrumentId: instId, type: 'SELL', quantity: '40', price: '60', tradeAt: utcDate('2025-01-03') }),
      makeTx({ instrumentId: instId, type: 'SELL', quantity: '60', price: '70', tradeAt: utcDate('2025-01-06') }),
    ];
    const priceLookup = new MockPriceLookup({
      [instId]: [
        { date: '2025-01-02', close: toDecimal('50') },
        { date: '2025-01-03', close: toDecimal('60') },
        { date: '2025-01-06', close: toDecimal('70') },
      ],
    });
    const store = new MockSnapshotStore();

    await buildPortfolioValueSeries({
      transactions,
      instruments,
      priceLookup,
      snapshotStore: store,
      calendar: testCalendar,
      startDate: '2025-01-02',
      endDate: '2025-01-06',
    });

    const snapshots = await store.getRange('2025-01-02', '2025-01-06');
    expect(snapshots).toHaveLength(3);

    // Jan 2: BUY 100@50 → no realized
    expect(snapshots[0]!.realizedPnl.toString()).toBe('0');
    expect(snapshots[0]!.totalValue.toString()).toBe('5000'); // 100*50

    // Jan 3: SELL 40@60 cost=40*50=2000 proceeds=2400 pnl=400
    // Remaining: 60 shares @ 60 = 3600
    expect(snapshots[1]!.realizedPnl.toString()).toBe('400');
    expect(snapshots[1]!.totalValue.toString()).toBe('3600');

    // Jan 6: SELL 60@70 cost=60*50=3000 proceeds=4200 pnl=1200
    // Cumulative realized: 400 + 1200 = 1600
    // No remaining lots
    expect(snapshots[2]!.realizedPnl.toString()).toBe('1600');
    expect(snapshots[2]!.totalValue.toString()).toBe('0');
  });

  it('deletes existing snapshots from startDate forward before rebuilding', async () => {
    const instId = 'inst-AAPL';
    const instruments = [makeInstrument({ id: instId, symbol: 'AAPL' })];
    const transactions = [
      makeTx({ instrumentId: instId, type: 'BUY', quantity: '100', price: '100', tradeAt: utcDate('2025-01-02') }),
    ];
    const priceLookup = new MockPriceLookup({
      [instId]: [
        { date: '2025-01-02', close: toDecimal('100') },
        { date: '2025-01-03', close: toDecimal('105') },
      ],
    });
    const store = new MockSnapshotStore();

    // First build
    await buildPortfolioValueSeries({
      transactions, instruments, priceLookup, snapshotStore: store,
      calendar: testCalendar, startDate: '2025-01-02', endDate: '2025-01-03',
    });

    let snapshots = await store.getRange('2025-01-02', '2025-01-03');
    expect(snapshots).toHaveLength(2);

    // Rebuild — should delete old and create new
    await buildPortfolioValueSeries({
      transactions, instruments, priceLookup, snapshotStore: store,
      calendar: testCalendar, startDate: '2025-01-02', endDate: '2025-01-03',
    });

    snapshots = await store.getRange('2025-01-02', '2025-01-03');
    // Should still be 2, not 4 (old ones were deleted)
    expect(snapshots).toHaveLength(2);
  });

  it('holdingsJson keys use ticker symbol, not instrumentId', async () => {
    const instId = 'inst-AAPL';
    const instruments = [makeInstrument({ id: instId, symbol: 'AAPL' })];
    const transactions = [
      makeTx({ instrumentId: instId, type: 'BUY', quantity: '10', price: '150', tradeAt: utcDate('2025-01-02') }),
    ];
    const priceLookup = new MockPriceLookup({
      [instId]: [{ date: '2025-01-02', close: toDecimal('150') }],
    });
    const store = new MockSnapshotStore();

    await buildPortfolioValueSeries({
      transactions, instruments, priceLookup, snapshotStore: store,
      calendar: testCalendar, startDate: '2025-01-02', endDate: '2025-01-02',
    });

    const snap = await store.getByDate('2025-01-02');
    expect(snap).not.toBeNull();
    // Keyed by symbol, not instrumentId
    expect(snap!.holdingsJson['AAPL']).toBeDefined();
    expect(snap!.holdingsJson[instId]).toBeUndefined();
  });

  it('skips weekends correctly', async () => {
    const instId = 'inst-AAPL';
    const instruments = [makeInstrument({ id: instId, symbol: 'AAPL' })];
    const transactions = [
      makeTx({ instrumentId: instId, type: 'BUY', quantity: '10', price: '100', tradeAt: utcDate('2025-01-02') }),
    ];
    const priceLookup = new MockPriceLookup({
      [instId]: [
        { date: '2025-01-02', close: toDecimal('100') },
        { date: '2025-01-03', close: toDecimal('102') },
        { date: '2025-01-06', close: toDecimal('105') },
      ],
    });
    const store = new MockSnapshotStore();

    // Range includes weekend (Jan 4-5)
    await buildPortfolioValueSeries({
      transactions, instruments, priceLookup, snapshotStore: store,
      calendar: testCalendar, startDate: '2025-01-02', endDate: '2025-01-06',
    });

    const snapshots = await store.getRange('2025-01-02', '2025-01-06');
    // Only 3 trading days: Thu, Fri, Mon
    expect(snapshots).toHaveLength(3);
    expect(snapshots.map((s) => s.date)).toEqual(['2025-01-02', '2025-01-03', '2025-01-06']);
  });

  it('mixed instruments: one with prices, one without', async () => {
    const instAAPL = 'inst-AAPL';
    const instPRIV = 'inst-PRIV';
    const instruments = [
      makeInstrument({ id: instAAPL, symbol: 'AAPL' }),
      makeInstrument({ id: instPRIV, symbol: 'PRIV' }),
    ];
    const transactions = [
      makeTx({ instrumentId: instAAPL, type: 'BUY', quantity: '50', price: '100', tradeAt: utcDate('2025-01-02') }),
      makeTx({ instrumentId: instPRIV, type: 'BUY', quantity: '20', price: '50', tradeAt: utcDate('2025-01-02') }),
    ];
    const priceLookup = new MockPriceLookup({
      [instAAPL]: [{ date: '2025-01-02', close: toDecimal('102') }],
      // No bars for PRIV
    });
    const store = new MockSnapshotStore();

    await buildPortfolioValueSeries({
      transactions, instruments, priceLookup, snapshotStore: store,
      calendar: testCalendar, startDate: '2025-01-02', endDate: '2025-01-02',
    });

    const snap = await store.getByDate('2025-01-02');
    expect(snap).not.toBeNull();

    const holdings = snap!.holdingsJson as Record<string, HoldingSnapshotEntry>;
    // AAPL valued
    expect(holdings['AAPL']!.value.toString()).toBe('5100');
    expect(holdings['AAPL']!.costBasisOnly).toBeUndefined();

    // PRIV not valued
    expect(holdings['PRIV']!.costBasisOnly).toBe(true);
    expect(holdings['PRIV']!.value.toString()).toBe('0');

    // totalValue only includes AAPL
    expect(snap!.totalValue.toString()).toBe('5100');
    // totalCostBasis includes both
    expect(snap!.totalCostBasis.toString()).toBe('6000'); // 50*100 + 20*50
  });
});
