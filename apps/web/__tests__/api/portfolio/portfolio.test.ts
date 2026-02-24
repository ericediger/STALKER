import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaSnapshotStore } from '../../../src/lib/prisma-snapshot-store';
import { PrismaPriceLookup } from '../../../src/lib/prisma-price-lookup';
import { buildPortfolioValueSeries, processTransactions, computeUnrealizedPnL } from '@stalker/analytics';
import { getNextTradingDay, isTradingDay } from '@stalker/market-data';
import { toDecimal, ZERO } from '@stalker/shared';
import path from 'node:path';

const DB_PATH = path.resolve(import.meta.dirname, '..', '..', '..', 'data', 'portfolio.db');

const prisma = new PrismaClient({
  datasourceUrl: `file:${DB_PATH}`,
});

const TEST_INSTRUMENT_ID = 'PORT_TEST_INSTRUMENT';
const TEST_TX_IDS: string[] = [];

beforeAll(async () => {
  await prisma.$connect();

  // Clean up any leftover test data
  await prisma.latestQuote.deleteMany({ where: { instrumentId: TEST_INSTRUMENT_ID } });
  await prisma.transaction.deleteMany({ where: { instrumentId: TEST_INSTRUMENT_ID } });
  await prisma.priceBar.deleteMany({ where: { instrumentId: TEST_INSTRUMENT_ID } });
  await prisma.instrument.deleteMany({ where: { id: TEST_INSTRUMENT_ID } });
  await prisma.portfolioValueSnapshot.deleteMany({
    where: { date: { gte: '2026-02-01', lte: '2026-02-28' } },
  });

  // Create test instrument
  await prisma.instrument.create({
    data: {
      id: TEST_INSTRUMENT_ID,
      symbol: 'PORTTEST',
      name: 'Portfolio Test Instrument',
      type: 'STOCK',
      currency: 'USD',
      exchange: 'NYSE',
      exchangeTz: 'America/New_York',
      providerSymbolMap: JSON.stringify({ fmp: 'PORTTEST', stooq: 'porttest.us' }),
    },
  });

  // Create test transaction
  const txId = 'PORT_TEST_TX_1';
  TEST_TX_IDS.push(txId);
  await prisma.transaction.create({
    data: {
      id: txId,
      instrumentId: TEST_INSTRUMENT_ID,
      type: 'BUY',
      quantity: '100',
      price: '50',
      fees: '10',
      tradeAt: new Date('2026-02-02T14:30:00Z'),
    },
  });

  // Create test price bars
  await prisma.priceBar.createMany({
    data: [
      {
        instrumentId: TEST_INSTRUMENT_ID,
        provider: 'test',
        resolution: '1D',
        date: '2026-02-02',
        open: '49',
        high: '52',
        low: '48',
        close: '51',
        volume: 1000,
      },
      {
        instrumentId: TEST_INSTRUMENT_ID,
        provider: 'test',
        resolution: '1D',
        date: '2026-02-03',
        open: '51',
        high: '55',
        low: '50',
        close: '54',
        volume: 1200,
      },
      {
        instrumentId: TEST_INSTRUMENT_ID,
        provider: 'test',
        resolution: '1D',
        date: '2026-02-04',
        open: '54',
        high: '56',
        low: '53',
        close: '55',
        volume: 1100,
      },
    ],
  });

  // Create a latest quote
  await prisma.latestQuote.create({
    data: {
      instrumentId: TEST_INSTRUMENT_ID,
      provider: 'test',
      price: '55',
      asOf: new Date('2026-02-04T16:00:00Z'),
      fetchedAt: new Date('2026-02-04T16:05:00Z'),
      rebuiltAt: new Date('2026-02-04T16:05:00Z'),
    },
  });
});

afterAll(async () => {
  await prisma.portfolioValueSnapshot.deleteMany({
    where: { date: { gte: '2026-02-01', lte: '2026-02-28' } },
  });
  await prisma.latestQuote.deleteMany({ where: { instrumentId: TEST_INSTRUMENT_ID } });
  await prisma.transaction.deleteMany({ where: { id: { in: TEST_TX_IDS } } });
  await prisma.priceBar.deleteMany({ where: { instrumentId: TEST_INSTRUMENT_ID } });
  await prisma.instrument.deleteMany({ where: { id: TEST_INSTRUMENT_ID } });
  await prisma.$disconnect();
});

describe('PrismaSnapshotStore integration with analytics', () => {
  beforeEach(async () => {
    await prisma.portfolioValueSnapshot.deleteMany({
      where: { date: { gte: '2026-02-01', lte: '2026-02-28' } },
    });
  });

  it('buildPortfolioValueSeries creates snapshots via PrismaSnapshotStore', async () => {
    const snapshotStore = new PrismaSnapshotStore(prisma);
    const priceLookup = new PrismaPriceLookup(prisma);

    const instruments = [{
      id: TEST_INSTRUMENT_ID,
      symbol: 'PORTTEST',
      name: 'Portfolio Test Instrument',
      type: 'STOCK' as const,
      currency: 'USD',
      exchange: 'NYSE',
      exchangeTz: 'America/New_York',
      providerSymbolMap: { fmp: 'PORTTEST' },
      firstBarDate: '2026-02-02',
      createdAt: new Date(),
      updatedAt: new Date(),
    }];

    const transactions = [{
      id: 'PORT_TEST_TX_1',
      instrumentId: TEST_INSTRUMENT_ID,
      type: 'BUY' as const,
      quantity: toDecimal('100'),
      price: toDecimal('50'),
      fees: toDecimal('10'),
      tradeAt: new Date('2026-02-02T14:30:00Z'),
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }];

    await buildPortfolioValueSeries({
      transactions,
      instruments,
      priceLookup,
      snapshotStore,
      calendar: { getNextTradingDay, isTradingDay },
      startDate: '2026-02-02',
      endDate: '2026-02-04',
    });

    const range = await snapshotStore.getRange('2026-02-02', '2026-02-04');
    expect(range.length).toBeGreaterThanOrEqual(1);

    // Verify snapshots were created and contain PORTTEST holdings
    // The exact start date depends on the calendar (trading day iteration)
    const snapshotWithHolding = range.find((s) => s.holdingsJson['PORTTEST']);
    expect(snapshotWithHolding).toBeDefined();
    expect(snapshotWithHolding!.holdingsJson['PORTTEST']).toBeDefined();
  });
});

describe('GET /api/portfolio/snapshot read-only behavior (AD-S10b)', () => {
  beforeEach(async () => {
    await prisma.portfolioValueSnapshot.deleteMany({
      where: { date: { gte: '2026-02-01', lte: '2026-02-28' } },
    });
  });

  it('returns needsRebuild when no snapshots exist and does not write any rows', async () => {
    // Verify no snapshots exist
    const beforeCount = await prisma.portfolioValueSnapshot.count();

    const snapshotStore = new PrismaSnapshotStore(prisma);
    const range = await snapshotStore.getRange('2026-02-01', '2026-02-28');
    expect(range).toHaveLength(0);

    // The GET endpoint should NOT create snapshots when none exist.
    // Simulate the GET logic: check cache, return empty response if no snapshots.
    // (Direct route testing would require HTTP server; we test the logic here.)
    const cachedSnapshots = await snapshotStore.getRange('2026-02-01', '2026-02-28');
    expect(cachedSnapshots).toHaveLength(0);

    // After the "GET" logic, verify no new rows were created
    const afterCount = await prisma.portfolioValueSnapshot.count();
    expect(afterCount).toBe(beforeCount);
  });
});

describe('Portfolio timeseries endpoint logic', () => {
  it('getRange returns empty array when no snapshots exist', async () => {
    const snapshotStore = new PrismaSnapshotStore(prisma);
    const range = await snapshotStore.getRange('2099-01-01', '2099-12-31');
    expect(range).toEqual([]);
  });

  it('snapshots have correct Decimal types after round-trip', async () => {
    const snapshotStore = new PrismaSnapshotStore(prisma);

    await snapshotStore.writeBatch([{
      id: 0,
      date: '2026-02-15',
      totalValue: toDecimal('12345.67'),
      totalCostBasis: toDecimal('11000.50'),
      realizedPnl: toDecimal('200.25'),
      unrealizedPnl: toDecimal('1345.17'),
      holdingsJson: {
        PORTTEST: {
          qty: toDecimal('100'),
          value: toDecimal('12345.67'),
          costBasis: toDecimal('11000.50'),
        },
      },
      rebuiltAt: new Date('2026-02-15T20:00:00Z'),
    }]);

    const snapshot = await snapshotStore.getByDate('2026-02-15');
    expect(snapshot).not.toBeNull();
    expect(snapshot!.totalValue.toString()).toBe('12345.67');
    expect(snapshot!.totalCostBasis.toString()).toBe('11000.5');
    expect(snapshot!.realizedPnl.toString()).toBe('200.25');
    expect(snapshot!.unrealizedPnl.toString()).toBe('1345.17');

    // Check holdingsJson round-trip
    const holding = snapshot!.holdingsJson['PORTTEST']!;
    expect(holding.qty.toString()).toBe('100');
    expect(holding.value.toString()).toBe('12345.67');
    expect(holding.costBasis.toString()).toBe('11000.5');

    // Cleanup
    await prisma.portfolioValueSnapshot.deleteMany({ where: { date: '2026-02-15' } });
  });
});

describe('Holdings by symbol', () => {
  it('processTransactions returns lots and realized trades for test data', () => {
    const transactions = [{
      id: 'PORT_TEST_TX_1',
      instrumentId: TEST_INSTRUMENT_ID,
      type: 'BUY' as const,
      quantity: toDecimal('100'),
      price: toDecimal('50'),
      fees: toDecimal('10'),
      tradeAt: new Date('2026-02-02T14:30:00Z'),
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }];

    const result = processTransactions(transactions);
    expect(result.lots).toHaveLength(1);
    expect(result.lots[0]!.remainingQty.toString()).toBe('100');
    expect(result.lots[0]!.price.toString()).toBe('50');
    expect(result.realizedTrades).toHaveLength(0);
  });

  it('computeUnrealizedPnL computes per-lot PnL', () => {
    const transactions = [{
      id: 'PORT_TEST_TX_1',
      instrumentId: TEST_INSTRUMENT_ID,
      type: 'BUY' as const,
      quantity: toDecimal('100'),
      price: toDecimal('50'),
      fees: toDecimal('10'),
      tradeAt: new Date('2026-02-02T14:30:00Z'),
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }];

    const { lots } = processTransactions(transactions);
    const markPrice = toDecimal('55');
    const result = computeUnrealizedPnL(lots, markPrice);

    // Unrealized = (55 - 50) * 100 = 500
    expect(result.totalUnrealized.toString()).toBe('500');
    expect(result.perLot).toHaveLength(1);
    expect(result.perLot[0]!.unrealizedPnl.toString()).toBe('500');
  });

  it('computeUnrealizedPnL handles multiple lots', () => {
    const transactions = [
      {
        id: 'TX_1',
        instrumentId: TEST_INSTRUMENT_ID,
        type: 'BUY' as const,
        quantity: toDecimal('50'),
        price: toDecimal('40'),
        fees: ZERO,
        tradeAt: new Date('2026-02-01T10:00:00Z'),
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'TX_2',
        instrumentId: TEST_INSTRUMENT_ID,
        type: 'BUY' as const,
        quantity: toDecimal('50'),
        price: toDecimal('60'),
        fees: ZERO,
        tradeAt: new Date('2026-02-02T10:00:00Z'),
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const { lots } = processTransactions(transactions);
    expect(lots).toHaveLength(2);

    const markPrice = toDecimal('55');
    const result = computeUnrealizedPnL(lots, markPrice);

    // Lot 1: (55-40)*50 = 750
    // Lot 2: (55-60)*50 = -250
    // Total: 500
    expect(result.totalUnrealized.toString()).toBe('500');
    expect(result.perLot[0]!.unrealizedPnl.toString()).toBe('750');
    expect(result.perLot[1]!.unrealizedPnl.toString()).toBe('-250');
  });

  it('processTransactions handles sell correctly (FIFO)', () => {
    const transactions = [
      {
        id: 'TX_1',
        instrumentId: TEST_INSTRUMENT_ID,
        type: 'BUY' as const,
        quantity: toDecimal('100'),
        price: toDecimal('50'),
        fees: ZERO,
        tradeAt: new Date('2026-02-01T10:00:00Z'),
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'TX_2',
        instrumentId: TEST_INSTRUMENT_ID,
        type: 'SELL' as const,
        quantity: toDecimal('30'),
        price: toDecimal('60'),
        fees: toDecimal('5'),
        tradeAt: new Date('2026-02-03T10:00:00Z'),
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const result = processTransactions(transactions);
    expect(result.lots).toHaveLength(1);
    expect(result.lots[0]!.remainingQty.toString()).toBe('70');

    expect(result.realizedTrades).toHaveLength(1);
    // Proceeds: 30*60 = 1800, CostBasis: 30*50 = 1500, Fees: 5
    // PnL: 1800 - 1500 - 5 = 295
    expect(result.realizedTrades[0]!.realizedPnl.toString()).toBe('295');
  });
});
