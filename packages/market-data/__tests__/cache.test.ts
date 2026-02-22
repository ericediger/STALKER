import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toDecimal } from '@stalker/shared';
import { upsertQuote, getLatestQuote, isQuoteFresh } from '../src/cache.js';
import type { PrismaClientForCache, LatestQuoteRecord } from '../src/cache.js';

function createMockPrisma(): PrismaClientForCache {
  return {
    latestQuote: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
    },
  };
}

function makeRecord(overrides: Partial<LatestQuoteRecord> = {}): LatestQuoteRecord {
  return {
    id: 1,
    instrumentId: 'inst-001',
    provider: 'fmp',
    price: toDecimal('185.92'),
    asOf: new Date('2025-01-03T21:00:00Z'),
    fetchedAt: new Date(),
    rebuiltAt: new Date(),
    ...overrides,
  };
}

describe('upsertQuote', () => {
  it('calls prisma.latestQuote.upsert with correct params', async () => {
    const prisma = createMockPrisma();
    const mockRecord = makeRecord();
    (prisma.latestQuote.upsert as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockRecord);

    const result = await upsertQuote(
      prisma,
      'inst-001',
      'fmp',
      toDecimal('185.92'),
      new Date('2025-01-03T21:00:00Z')
    );

    expect(prisma.latestQuote.upsert).toHaveBeenCalledOnce();
    const call = (prisma.latestQuote.upsert as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(call.where.instrumentId_provider).toEqual({
      instrumentId: 'inst-001',
      provider: 'fmp',
    });
    expect(call.create.instrumentId).toBe('inst-001');
    expect(call.create.provider).toBe('fmp');
    expect(result).toBe(mockRecord);
  });
});

describe('getLatestQuote', () => {
  it('calls prisma.latestQuote.findFirst with correct params', async () => {
    const prisma = createMockPrisma();
    const mockRecord = makeRecord();
    (prisma.latestQuote.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockRecord);

    const result = await getLatestQuote(prisma, 'inst-001');

    expect(prisma.latestQuote.findFirst).toHaveBeenCalledWith({
      where: { instrumentId: 'inst-001' },
      orderBy: { fetchedAt: 'desc' },
    });
    expect(result).toBe(mockRecord);
  });

  it('returns null when no quote exists', async () => {
    const prisma = createMockPrisma();
    (prisma.latestQuote.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const result = await getLatestQuote(prisma, 'inst-999');

    expect(result).toBeNull();
  });
});

describe('isQuoteFresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true for quote < 1hr old during market hours', () => {
    vi.setSystemTime(new Date('2025-01-03T15:00:00Z'));
    const quote = makeRecord({
      fetchedAt: new Date('2025-01-03T14:30:00Z'), // 30 min ago
    });

    expect(isQuoteFresh(quote, true)).toBe(true);
  });

  it('returns false for quote > 1hr old during market hours', () => {
    vi.setSystemTime(new Date('2025-01-03T16:00:00Z'));
    const quote = makeRecord({
      fetchedAt: new Date('2025-01-03T14:30:00Z'), // 1.5 hrs ago
    });

    expect(isQuoteFresh(quote, true)).toBe(false);
  });

  it('returns true for quote < 24hr old outside market hours', () => {
    vi.setSystemTime(new Date('2025-01-04T10:00:00Z'));
    const quote = makeRecord({
      fetchedAt: new Date('2025-01-03T21:00:00Z'), // 13 hrs ago
    });

    expect(isQuoteFresh(quote, false)).toBe(true);
  });

  it('returns false for quote > 24hr old outside market hours', () => {
    vi.setSystemTime(new Date('2025-01-05T22:00:00Z'));
    const quote = makeRecord({
      fetchedAt: new Date('2025-01-03T21:00:00Z'), // ~49 hrs ago
    });

    expect(isQuoteFresh(quote, false)).toBe(false);
  });
});
