import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock prisma
const mockInstrumentCount = vi.fn();
const mockInstrumentFindMany = vi.fn();
const mockLatestQuoteFindFirst = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    instrument: {
      count: () => mockInstrumentCount(),
      findMany: (args: unknown) => mockInstrumentFindMany(args),
    },
    latestQuote: {
      findFirst: (args: unknown) => mockLatestQuoteFindFirst(args),
    },
  },
}));

vi.mock('@stalker/market-data', () => ({
  isMarketOpen: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/errors', () => ({
  apiError: (status: number, code: string, message: string) =>
    Response.json({ error: code, message }, { status }),
}));

describe('GET /api/market/status', () => {
  beforeEach(() => {
    vi.stubEnv('FMP_RPD', '250');
    vi.stubEnv('TIINGO_RPH', '50');
    vi.stubEnv('TIINGO_RPD', '1000');
    mockInstrumentCount.mockReset();
    mockInstrumentFindMany.mockReset();
    mockLatestQuoteFindFirst.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns multi-provider budget with Tiingo primary and FMP secondary', async () => {
    mockInstrumentCount.mockResolvedValue(83);
    mockInstrumentFindMany.mockResolvedValue([]);

    const { GET } = await import('../../../src/app/api/market/status/route');
    const response = await GET();
    const data = await response.json();

    expect(data.instrumentCount).toBe(83);
    expect(data.pollingInterval).toBe(1800);

    // Verify multi-provider budget structure
    expect(data.budget.primary).toEqual({
      provider: 'tiingo',
      usedThisHour: 0,
      hourlyLimit: 50,
      usedToday: 0,
      dailyLimit: 1000,
    });

    expect(data.budget.secondary).toEqual({
      provider: 'fmp',
      usedToday: 0,
      dailyLimit: 250,
    });
  });

  it('reads provider limits from environment variables', async () => {
    vi.stubEnv('FMP_RPD', '500');
    vi.stubEnv('TIINGO_RPH', '100');
    vi.stubEnv('TIINGO_RPD', '2000');

    mockInstrumentCount.mockResolvedValue(10);
    mockInstrumentFindMany.mockResolvedValue([]);

    // Re-import to pick up fresh env vars
    vi.resetModules();

    // Re-mock the dependencies for the fresh import
    vi.doMock('@/lib/prisma', () => ({
      prisma: {
        instrument: {
          count: () => Promise.resolve(10),
          findMany: () => Promise.resolve([]),
        },
        latestQuote: {
          findFirst: () => Promise.resolve(null),
        },
      },
    }));

    vi.doMock('@stalker/market-data', () => ({
      isMarketOpen: vi.fn().mockReturnValue(false),
    }));

    vi.doMock('@/lib/errors', () => ({
      apiError: (status: number, code: string, message: string) =>
        Response.json({ error: code, message }, { status }),
    }));

    const { GET } = await import('../../../src/app/api/market/status/route');
    const response = await GET();
    const data = await response.json();

    expect(data.budget.primary.hourlyLimit).toBe(100);
    expect(data.budget.primary.dailyLimit).toBe(2000);
    expect(data.budget.secondary.dailyLimit).toBe(500);
  });
});
