import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPriceLookup } from '../../../src/lib/prisma-price-lookup';
import { PrismaSnapshotStore } from '../../../src/lib/prisma-snapshot-store';
import { toDecimal, ZERO } from '@stalker/shared';
import path from 'node:path';

const DB_PATH = path.resolve(import.meta.dirname, '..', '..', '..', 'data', 'portfolio.db');

const prisma = new PrismaClient({
  datasourceUrl: `file:${DB_PATH}`,
});

const TEST_INSTRUMENT_ID = 'IMPL_TEST_INSTRUMENT';

beforeAll(async () => {
  await prisma.$connect();
  // Create test instrument
  await prisma.instrument.upsert({
    where: { id: TEST_INSTRUMENT_ID },
    create: {
      id: TEST_INSTRUMENT_ID,
      symbol: 'IMPLTEST',
      name: 'Implementation Test',
      type: 'STOCK',
      currency: 'USD',
      exchange: 'NYSE',
      exchangeTz: 'America/New_York',
    },
    update: {},
  });

  // Create test price bars
  await prisma.priceBar.deleteMany({ where: { instrumentId: TEST_INSTRUMENT_ID } });
  await prisma.priceBar.createMany({
    data: [
      {
        instrumentId: TEST_INSTRUMENT_ID,
        provider: 'test',
        resolution: '1D',
        date: '2026-01-06',
        open: '100',
        high: '105',
        low: '99',
        close: '103',
        volume: 1000,
      },
      {
        instrumentId: TEST_INSTRUMENT_ID,
        provider: 'test',
        resolution: '1D',
        date: '2026-01-07',
        open: '103',
        high: '108',
        low: '102',
        close: '107',
        volume: 1500,
      },
      {
        instrumentId: TEST_INSTRUMENT_ID,
        provider: 'test',
        resolution: '1D',
        date: '2026-01-10',
        open: '107',
        high: '110',
        low: '106',
        close: '109',
        volume: 1200,
      },
    ],
  });
});

afterAll(async () => {
  await prisma.portfolioValueSnapshot.deleteMany({
    where: { date: { gte: '2026-01-01', lte: '2026-01-31' } },
  });
  await prisma.priceBar.deleteMany({ where: { instrumentId: TEST_INSTRUMENT_ID } });
  await prisma.instrument.deleteMany({ where: { id: TEST_INSTRUMENT_ID } });
  await prisma.$disconnect();
});

describe('PrismaPriceLookup', () => {
  const lookup = new PrismaPriceLookup(prisma);

  it('returns exact close price when bar exists', async () => {
    const price = await lookup.getClosePrice(TEST_INSTRUMENT_ID, '2026-01-06');
    expect(price).not.toBeNull();
    expect(price!.toString()).toBe('103');
  });

  it('returns null when no bar exists for exact date', async () => {
    const price = await lookup.getClosePrice(TEST_INSTRUMENT_ID, '2026-01-08');
    expect(price).toBeNull();
  });

  it('returns carry-forward price for missing date', async () => {
    const result = await lookup.getClosePriceOrCarryForward(TEST_INSTRUMENT_ID, '2026-01-08');
    expect(result).not.toBeNull();
    expect(result!.price.toString()).toBe('107');
    expect(result!.actualDate).toBe('2026-01-07');
    expect(result!.isCarryForward).toBe(true);
  });

  it('returns non-carry-forward for exact date match', async () => {
    const result = await lookup.getClosePriceOrCarryForward(TEST_INSTRUMENT_ID, '2026-01-07');
    expect(result).not.toBeNull();
    expect(result!.price.toString()).toBe('107');
    expect(result!.actualDate).toBe('2026-01-07');
    expect(result!.isCarryForward).toBe(false);
  });

  it('returns null when no price history exists before date', async () => {
    const result = await lookup.getClosePriceOrCarryForward(TEST_INSTRUMENT_ID, '2025-12-31');
    expect(result).toBeNull();
  });

  it('returns first bar date', async () => {
    const date = await lookup.getFirstBarDate(TEST_INSTRUMENT_ID);
    expect(date).toBe('2026-01-06');
  });

  it('returns null for instrument with no bars', async () => {
    const date = await lookup.getFirstBarDate('NONEXISTENT_INSTRUMENT');
    expect(date).toBeNull();
  });
});

describe('PrismaSnapshotStore', () => {
  const store = new PrismaSnapshotStore(prisma);

  beforeEach(async () => {
    await prisma.portfolioValueSnapshot.deleteMany();
  });

  it('writeBatch creates snapshots', async () => {
    await store.writeBatch([
      {
        id: 0,
        date: '2026-01-06',
        totalValue: toDecimal('10000'),
        totalCostBasis: toDecimal('9500'),
        realizedPnl: toDecimal('200'),
        unrealizedPnl: toDecimal('500'),
        holdingsJson: {
          IMPLTEST: { qty: toDecimal('100'), value: toDecimal('10000'), costBasis: toDecimal('9500') },
        },
        rebuiltAt: new Date('2026-01-06T20:00:00Z'),
      },
    ]);

    const snapshot = await store.getByDate('2026-01-06');
    expect(snapshot).not.toBeNull();
    expect(snapshot!.totalValue.toString()).toBe('10000');
    expect(snapshot!.totalCostBasis.toString()).toBe('9500');
    expect(snapshot!.realizedPnl.toString()).toBe('200');
    expect(snapshot!.unrealizedPnl.toString()).toBe('500');
    expect(snapshot!.holdingsJson['IMPLTEST']).toBeDefined();
    expect(snapshot!.holdingsJson['IMPLTEST']!.qty.toString()).toBe('100');
  });

  it('writeBatch upserts on conflict', async () => {
    await store.writeBatch([
      {
        id: 0,
        date: '2026-01-07',
        totalValue: toDecimal('10000'),
        totalCostBasis: toDecimal('9500'),
        realizedPnl: ZERO,
        unrealizedPnl: toDecimal('500'),
        holdingsJson: {},
        rebuiltAt: new Date('2026-01-07T20:00:00Z'),
      },
    ]);

    await store.writeBatch([
      {
        id: 0,
        date: '2026-01-07',
        totalValue: toDecimal('11000'),
        totalCostBasis: toDecimal('9500'),
        realizedPnl: ZERO,
        unrealizedPnl: toDecimal('1500'),
        holdingsJson: {},
        rebuiltAt: new Date('2026-01-07T21:00:00Z'),
      },
    ]);

    const snapshot = await store.getByDate('2026-01-07');
    expect(snapshot).not.toBeNull();
    expect(snapshot!.totalValue.toString()).toBe('11000');
    expect(snapshot!.unrealizedPnl.toString()).toBe('1500');
  });

  it('deleteFrom removes snapshots from date forward', async () => {
    await store.writeBatch([
      {
        id: 0,
        date: '2026-01-06',
        totalValue: toDecimal('10000'),
        totalCostBasis: toDecimal('9500'),
        realizedPnl: ZERO,
        unrealizedPnl: toDecimal('500'),
        holdingsJson: {},
        rebuiltAt: new Date(),
      },
      {
        id: 0,
        date: '2026-01-07',
        totalValue: toDecimal('10500'),
        totalCostBasis: toDecimal('9500'),
        realizedPnl: ZERO,
        unrealizedPnl: toDecimal('1000'),
        holdingsJson: {},
        rebuiltAt: new Date(),
      },
      {
        id: 0,
        date: '2026-01-10',
        totalValue: toDecimal('11000'),
        totalCostBasis: toDecimal('9500'),
        realizedPnl: ZERO,
        unrealizedPnl: toDecimal('1500'),
        holdingsJson: {},
        rebuiltAt: new Date(),
      },
    ]);

    const count = await store.deleteFrom('2026-01-07');
    expect(count).toBe(2);

    const remaining = await store.getRange('2026-01-01', '2026-01-31');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.date).toBe('2026-01-06');
  });

  it('getRange returns ordered snapshots', async () => {
    await store.writeBatch([
      {
        id: 0,
        date: '2026-01-10',
        totalValue: toDecimal('11000'),
        totalCostBasis: toDecimal('9500'),
        realizedPnl: ZERO,
        unrealizedPnl: toDecimal('1500'),
        holdingsJson: {},
        rebuiltAt: new Date(),
      },
      {
        id: 0,
        date: '2026-01-06',
        totalValue: toDecimal('10000'),
        totalCostBasis: toDecimal('9500'),
        realizedPnl: ZERO,
        unrealizedPnl: toDecimal('500'),
        holdingsJson: {},
        rebuiltAt: new Date(),
      },
    ]);

    const range = await store.getRange('2026-01-06', '2026-01-10');
    expect(range).toHaveLength(2);
    expect(range[0]!.date).toBe('2026-01-06');
    expect(range[1]!.date).toBe('2026-01-10');
  });

  it('getByDate returns null for missing snapshot', async () => {
    const snapshot = await store.getByDate('2099-12-31');
    expect(snapshot).toBeNull();
  });
});

describe('Snapshot rebuild transactional atomicity (AD-S10a)', () => {
  beforeEach(async () => {
    await prisma.portfolioValueSnapshot.deleteMany();
  });

  it('transaction rollback preserves existing snapshots when rebuild fails mid-flight', async () => {
    // Step 1: Pre-populate snapshots
    const store = new PrismaSnapshotStore(prisma);
    await store.writeBatch([
      {
        id: 0,
        date: '2026-01-06',
        totalValue: toDecimal('10000'),
        totalCostBasis: toDecimal('9500'),
        realizedPnl: ZERO,
        unrealizedPnl: toDecimal('500'),
        holdingsJson: { IMPLTEST: { qty: toDecimal('100'), value: toDecimal('10000'), costBasis: toDecimal('9500') } },
        rebuiltAt: new Date(),
      },
      {
        id: 0,
        date: '2026-01-07',
        totalValue: toDecimal('10700'),
        totalCostBasis: toDecimal('9500'),
        realizedPnl: ZERO,
        unrealizedPnl: toDecimal('1200'),
        holdingsJson: { IMPLTEST: { qty: toDecimal('100'), value: toDecimal('10700'), costBasis: toDecimal('9500') } },
        rebuiltAt: new Date(),
      },
    ]);

    // Verify pre-condition: 2 snapshots exist
    const before = await store.getRange('2026-01-01', '2026-01-31');
    expect(before).toHaveLength(2);

    // Step 2: Attempt a transaction that deletes snapshots then throws
    try {
      await prisma.$transaction(async (tx) => {
        const txStore = new PrismaSnapshotStore(tx);
        // Delete all snapshots from Jan 6 forward
        await txStore.deleteFrom('2026-01-06');

        // Verify inside the transaction: snapshots are deleted
        const insideTx = await txStore.getRange('2026-01-01', '2026-01-31');
        expect(insideTx).toHaveLength(0);

        // Simulate a mid-flight failure (e.g., analytics engine throws)
        throw new Error('Simulated rebuild failure');
      });
    } catch (err: unknown) {
      expect((err as Error).message).toBe('Simulated rebuild failure');
    }

    // Step 3: Verify snapshots survived the rollback
    const after = await store.getRange('2026-01-01', '2026-01-31');
    expect(after).toHaveLength(2);
    expect(after[0]!.date).toBe('2026-01-06');
    expect(after[0]!.totalValue.toString()).toBe('10000');
    expect(after[1]!.date).toBe('2026-01-07');
    expect(after[1]!.totalValue.toString()).toBe('10700');
  });

  it('PrismaSnapshotStore works with transaction client', async () => {
    // Verify that PrismaSnapshotStore and PrismaPriceLookup accept transaction clients
    await prisma.$transaction(async (tx) => {
      const txStore = new PrismaSnapshotStore(tx);
      const txLookup = new PrismaPriceLookup(tx);

      // Write a snapshot via transaction client
      await txStore.writeBatch([
        {
          id: 0,
          date: '2026-01-10',
          totalValue: toDecimal('11000'),
          totalCostBasis: toDecimal('9500'),
          realizedPnl: ZERO,
          unrealizedPnl: toDecimal('1500'),
          holdingsJson: {},
          rebuiltAt: new Date(),
        },
      ]);

      // Read it back
      const snap = await txStore.getByDate('2026-01-10');
      expect(snap).not.toBeNull();
      expect(snap!.totalValue.toString()).toBe('11000');

      // Price lookup works too
      const price = await txLookup.getClosePrice(TEST_INSTRUMENT_ID, '2026-01-06');
      expect(price).not.toBeNull();
      expect(price!.toString()).toBe('103');
    });

    // Verify the write persisted after commit
    const store = new PrismaSnapshotStore(prisma);
    const snap = await store.getByDate('2026-01-10');
    expect(snap).not.toBeNull();
    expect(snap!.totalValue.toString()).toBe('11000');
  });
});
