import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { isMarketOpen, isQuoteFresh } from '@stalker/market-data';
import path from 'node:path';

const DB_PATH = path.resolve(import.meta.dirname, '..', '..', '..', 'data', 'portfolio.db');

const prisma = new PrismaClient({
  datasourceUrl: `file:${DB_PATH}`,
});

const TEST_INSTRUMENT_ID = 'MKT_TEST_INSTRUMENT';

beforeAll(async () => {
  await prisma.$connect();

  // Clean up any leftover test data
  await prisma.latestQuote.deleteMany({ where: { instrumentId: TEST_INSTRUMENT_ID } });
  await prisma.priceBar.deleteMany({ where: { instrumentId: TEST_INSTRUMENT_ID } });
  await prisma.transaction.deleteMany({ where: { instrumentId: TEST_INSTRUMENT_ID } });
  await prisma.instrument.deleteMany({ where: { id: TEST_INSTRUMENT_ID } });

  // Create test instrument
  await prisma.instrument.create({
    data: {
      id: TEST_INSTRUMENT_ID,
      symbol: 'MKTTEST',
      name: 'Market Test Instrument',
      type: 'STOCK',
      currency: 'USD',
      exchange: 'NYSE',
      exchangeTz: 'America/New_York',
      providerSymbolMap: JSON.stringify({ fmp: 'MKTTEST' }),
    },
  });

  // Create test price bars
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
        date: '2026-01-08',
        open: '107',
        high: '110',
        low: '106',
        close: '109',
        volume: 1200,
      },
    ],
  });

  // Create a latest quote
  await prisma.latestQuote.create({
    data: {
      instrumentId: TEST_INSTRUMENT_ID,
      provider: 'test',
      price: '109.50',
      asOf: new Date('2026-01-08T16:00:00Z'),
      fetchedAt: new Date('2026-01-08T16:05:00Z'),
      rebuiltAt: new Date('2026-01-08T16:05:00Z'),
    },
  });
});

afterAll(async () => {
  await prisma.latestQuote.deleteMany({ where: { instrumentId: TEST_INSTRUMENT_ID } });
  await prisma.priceBar.deleteMany({ where: { instrumentId: TEST_INSTRUMENT_ID } });
  await prisma.instrument.deleteMany({ where: { id: TEST_INSTRUMENT_ID } });
  await prisma.$disconnect();
});

describe('Market data - LatestQuote queries', () => {
  it('finds latest quote by instrument ID', async () => {
    const quote = await prisma.latestQuote.findFirst({
      where: { instrumentId: TEST_INSTRUMENT_ID },
      orderBy: { fetchedAt: 'desc' },
    });

    expect(quote).not.toBeNull();
    expect(quote!.price.toString()).toBe('109.5');
    expect(quote!.provider).toBe('test');
  });

  it('returns null for nonexistent instrument quote', async () => {
    const quote = await prisma.latestQuote.findFirst({
      where: { instrumentId: 'NONEXISTENT' },
      orderBy: { fetchedAt: 'desc' },
    });

    expect(quote).toBeNull();
  });
});

describe('Market data - PriceBar queries', () => {
  it('queries price bars by date range', async () => {
    const bars = await prisma.priceBar.findMany({
      where: {
        instrumentId: TEST_INSTRUMENT_ID,
        resolution: '1D',
        date: { gte: '2026-01-06', lte: '2026-01-07' },
      },
      orderBy: { date: 'asc' },
    });

    expect(bars).toHaveLength(2);
    expect(bars[0]!.date).toBe('2026-01-06');
    expect(bars[0]!.close.toString()).toBe('103');
    expect(bars[1]!.date).toBe('2026-01-07');
    expect(bars[1]!.close.toString()).toBe('107');
  });

  it('queries all bars for instrument when no date filter', async () => {
    const bars = await prisma.priceBar.findMany({
      where: {
        instrumentId: TEST_INSTRUMENT_ID,
        resolution: '1D',
      },
      orderBy: { date: 'asc' },
    });

    expect(bars).toHaveLength(3);
  });

  it('returns empty when date range has no data', async () => {
    const bars = await prisma.priceBar.findMany({
      where: {
        instrumentId: TEST_INSTRUMENT_ID,
        resolution: '1D',
        date: { gte: '2099-01-01', lte: '2099-12-31' },
      },
    });

    expect(bars).toHaveLength(0);
  });
});

describe('Market data - Instrument lookup by symbol', () => {
  it('finds instrument by symbol', async () => {
    const instrument = await prisma.instrument.findUnique({
      where: { symbol: 'MKTTEST' },
    });

    expect(instrument).not.toBeNull();
    expect(instrument!.id).toBe(TEST_INSTRUMENT_ID);
    expect(instrument!.name).toBe('Market Test Instrument');
  });

  it('returns null for nonexistent symbol', async () => {
    const instrument = await prisma.instrument.findUnique({
      where: { symbol: 'DOESNOTEXIST' },
    });

    expect(instrument).toBeNull();
  });
});

describe('Market status response shape', () => {
  it('instrument count reflects actual DB state', async () => {
    const count = await prisma.instrument.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('isMarketOpen returns boolean', () => {
    const result = isMarketOpen(new Date(), 'NYSE');
    expect(typeof result).toBe('boolean');
  });
});

describe('Market data - Quote freshness', () => {
  it('isQuoteFresh returns true for recent quote during market hours', () => {
    const recentQuote = {
      id: 1,
      instrumentId: TEST_INSTRUMENT_ID,
      provider: 'test',
      price: 109.5 as unknown as import('decimal.js').default,
      asOf: new Date(),
      fetchedAt: new Date(),
      rebuiltAt: new Date(),
    };

    expect(isQuoteFresh(recentQuote, true)).toBe(true);
  });

  it('isQuoteFresh returns false for old quote during market hours', () => {
    const oldDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
    const oldQuote = {
      id: 1,
      instrumentId: TEST_INSTRUMENT_ID,
      provider: 'test',
      price: 109.5 as unknown as import('decimal.js').default,
      asOf: oldDate,
      fetchedAt: oldDate,
      rebuiltAt: oldDate,
    };

    expect(isQuoteFresh(oldQuote, true)).toBe(false);
  });
});
