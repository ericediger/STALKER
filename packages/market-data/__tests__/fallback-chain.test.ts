import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toDecimal } from '@stalker/shared';
import { MarketDataService } from '../src/service.js';
import { ProviderError } from '../src/types.js';
import type { MarketDataProvider, Quote, ProviderLimits, Instrument, Resolution, PriceBar } from '../src/types.js';
import type { PrismaClientForCache, LatestQuoteRecord } from '../src/cache.js';

/**
 * Fallback chain error simulation tests.
 *
 * These tests verify the MarketDataService gracefully handles various
 * provider failure patterns. Complements packages/market-data/__tests__/fallback.test.ts
 * with more specific error simulation scenarios.
 */

function createMockProvider(name: string, overrides: Partial<MarketDataProvider> = {}): MarketDataProvider {
  return {
    name,
    searchSymbols: vi.fn().mockResolvedValue([]),
    getQuote: vi.fn().mockRejectedValue(new ProviderError('Not implemented', 'UNKNOWN', name)),
    getHistory: vi.fn().mockResolvedValue([]),
    getLimits: vi.fn().mockReturnValue({
      requestsPerMinute: 100,
      requestsPerDay: 10000,
      supportsIntraday: false,
      quoteDelayMinutes: 15,
    } satisfies ProviderLimits),
    ...overrides,
  };
}

function createMockPrisma(): PrismaClientForCache {
  return {
    latestQuote: {
      upsert: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };
}

function makeInstrument(symbol: string): Instrument {
  return {
    id: `inst-${symbol}`,
    symbol,
    name: `${symbol} Inc.`,
    type: 'STOCK',
    currency: 'USD',
    exchange: 'NYSE',
    exchangeTz: 'America/New_York',
    providerSymbolMap: {},
    firstBarDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeQuote(symbol: string, provider: string, price: string): Quote {
  return {
    symbol,
    price: toDecimal(price),
    asOf: new Date('2025-01-03T21:00:00Z'),
    provider,
  };
}

describe('Fallback Chain Error Simulation', () => {
  let primaryProvider: MarketDataProvider;
  let secondaryProvider: MarketDataProvider;
  let historyProvider: MarketDataProvider;
  let mockPrisma: PrismaClientForCache;

  beforeEach(() => {
    vi.useFakeTimers();
    // Set to a Saturday so isMarketOpen returns false (avoids cache freshness issues)
    vi.setSystemTime(new Date('2025-01-04T12:00:00Z'));

    primaryProvider = createMockProvider('fmp');
    secondaryProvider = createMockProvider('alpha-vantage');
    historyProvider = createMockProvider('tiingo');
    mockPrisma = createMockPrisma();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createService(prisma?: PrismaClientForCache): MarketDataService {
    return new MarketDataService({
      primaryProvider,
      secondaryProvider,
      historyProvider,
      prisma,
    });
  }

  it('FMP 500 error → falls back to Alpha Vantage for quote', async () => {
    // FMP returns internal server error
    (primaryProvider.getQuote as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new ProviderError('Internal Server Error', 'UNKNOWN', 'fmp'),
    );

    // Alpha Vantage returns a valid quote
    const avQuote = makeQuote('AAPL', 'alpha-vantage', '186.50');
    (secondaryProvider.getQuote as ReturnType<typeof vi.fn>).mockResolvedValueOnce(avQuote);

    const service = createService();
    const result = await service.getQuote(makeInstrument('AAPL'));

    expect(result).not.toBeNull();
    expect(result!.provider).toBe('alpha-vantage');
    expect(result!.price.toString()).toBe('186.5');
  });

  it('FMP network error + AV network error → returns null gracefully', async () => {
    // Both providers have network errors
    (primaryProvider.getQuote as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new ProviderError('Connection reset', 'NETWORK_ERROR', 'fmp'),
    );
    (secondaryProvider.getQuote as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new ProviderError('Connection refused', 'NETWORK_ERROR', 'alpha-vantage'),
    );

    const service = createService();
    const result = await service.getQuote(makeInstrument('AAPL'));

    // Should return null, NOT throw an exception
    expect(result).toBeNull();
  });

  it('FMP rate limited + cache has fresh data → returns cached quote', async () => {
    // FMP is rate limited
    (primaryProvider.getQuote as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new ProviderError('Rate limited', 'RATE_LIMITED', 'fmp'),
    );

    // Cache has a recent quote (2 hours old on a Saturday — still fresh outside market hours)
    const cachedRecord: LatestQuoteRecord = {
      id: 1,
      instrumentId: 'inst-AAPL',
      provider: 'fmp',
      price: toDecimal('184.00'),
      asOf: new Date('2025-01-03T21:00:00Z'),
      fetchedAt: new Date('2025-01-04T10:00:00Z'),
      rebuiltAt: new Date('2025-01-04T10:00:00Z'),
    };
    (mockPrisma.latestQuote.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      cachedRecord,
    );

    const service = createService(mockPrisma);
    const result = await service.getQuote(makeInstrument('AAPL'));

    expect(result).not.toBeNull();
    expect(result!.price.toString()).toBe('184');
    // Should NOT call Alpha Vantage since cache was fresh
    expect(secondaryProvider.getQuote).not.toHaveBeenCalled();
  });

  it('Tiingo history failure → returns empty array (no FMP fallback for history)', async () => {
    // Tiingo fails with a provider error
    (historyProvider.getHistory as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new ProviderError('Tiingo error: You have exceeded your hourly rate limit', 'UNKNOWN', 'tiingo'),
    );

    const service = createService();
    const result = await service.getHistory(
      makeInstrument('AAPL'),
      new Date('2025-01-01'),
      new Date('2025-01-31'),
    );

    // Should return empty array, not throw
    expect(result).toEqual([]);
    expect(result).toHaveLength(0);
    // FMP and AV should NOT be called for history
    expect(primaryProvider.getHistory).not.toHaveBeenCalled();
    expect(secondaryProvider.getHistory).not.toHaveBeenCalled();
  });

  it('FMP parse error + AV parse error + no cache → returns null', async () => {
    // Both providers return garbled responses
    (primaryProvider.getQuote as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new ProviderError('Unexpected token in JSON', 'PARSE_ERROR', 'fmp'),
    );
    (secondaryProvider.getQuote as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new ProviderError('Invalid response format', 'PARSE_ERROR', 'alpha-vantage'),
    );

    const service = createService(mockPrisma);
    const result = await service.getQuote(makeInstrument('AAPL'));

    expect(result).toBeNull();
  });
});
