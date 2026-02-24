/**
 * MarketDataService Integration Tests
 *
 * Tests the MarketDataService with fully mocked providers to validate:
 * - Search returns results from primary provider
 * - Quote fallback chain: primary fails -> cache check -> secondary
 * - History uses historyProvider only (no FMP fallback)
 * - Rate-limited provider is skipped gracefully
 * - Provider error classification flows correctly through the service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toDecimal } from '@stalker/shared';
import { MarketDataService, ProviderError } from '@stalker/market-data';
import type {
  MarketDataProvider,
  Quote,
  SymbolSearchResult,
  ProviderLimits,
  PriceBar,
  Instrument,
  Resolution,
} from '@stalker/market-data';
import type { PrismaClientForCache, LatestQuoteRecord } from '@stalker/market-data';

// ---------------------------------------------------------------------------
// Mock Helpers
// ---------------------------------------------------------------------------

function createMockProvider(
  name: string,
  overrides: Partial<MarketDataProvider> = {},
): MarketDataProvider {
  return {
    name,
    searchSymbols: vi.fn().mockResolvedValue([]),
    getQuote: vi.fn().mockRejectedValue(
      new ProviderError('Not implemented', 'UNKNOWN', name),
    ),
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

function makeQuote(symbol: string, provider: string, price: string): Quote {
  return {
    symbol,
    price: toDecimal(price),
    asOf: new Date('2025-06-15T16:00:00Z'),
    provider,
  };
}

function makeInstrument(
  symbol: string,
  providerSymbolMap: Record<string, string> = {},
): Instrument {
  return {
    id: `inst-${symbol}`,
    symbol,
    name: `${symbol} Inc.`,
    type: 'STOCK',
    currency: 'USD',
    exchange: 'NYSE',
    exchangeTz: 'America/New_York',
    providerSymbolMap,
    firstBarDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeSearchResult(symbol: string, provider: string): SymbolSearchResult {
  return {
    symbol,
    name: `${symbol} Inc.`,
    type: 'STOCK',
    exchange: 'NYSE',
    providerSymbol: symbol,
  };
}

function makePriceBar(date: string, instrumentId: string = ''): PriceBar {
  return {
    id: 0,
    instrumentId,
    provider: 'tiingo',
    resolution: '1D' as Resolution,
    date,
    time: null,
    open: toDecimal('150.00'),
    high: toDecimal('155.00'),
    low: toDecimal('148.00'),
    close: toDecimal('153.00'),
    volume: 45000000,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MarketDataService Integration', () => {
  let primary: MarketDataProvider;
  let secondary: MarketDataProvider;
  let history: MarketDataProvider;
  let mockPrisma: PrismaClientForCache;

  beforeEach(() => {
    vi.useFakeTimers();
    // Set to a Saturday to avoid isMarketOpen cache freshness checks
    vi.setSystemTime(new Date('2025-06-14T12:00:00Z'));

    primary = createMockProvider('fmp');
    secondary = createMockProvider('alpha-vantage');
    history = createMockProvider('tiingo');
    mockPrisma = createMockPrisma();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createService(prisma?: PrismaClientForCache): MarketDataService {
    return new MarketDataService({
      primaryProvider: primary,
      secondaryProvider: secondary,
      historyProvider: history,
      prisma,
    });
  }

  // ---- Search Tests ----

  describe('searchSymbols', () => {
    it('returns results from primary provider', async () => {
      const results = [makeSearchResult('AAPL', 'fmp'), makeSearchResult('AAPD', 'fmp')];
      (primary.searchSymbols as ReturnType<typeof vi.fn>).mockResolvedValueOnce(results);

      const service = createService();
      const searchResults = await service.searchSymbols('AAP');

      expect(searchResults).toHaveLength(2);
      expect(searchResults[0]!.symbol).toBe('AAPL');
      expect(searchResults[1]!.symbol).toBe('AAPD');
    });

    it('falls back to secondary when primary returns empty results', async () => {
      (primary.searchSymbols as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      const results = [makeSearchResult('AAPL', 'alpha-vantage')];
      (secondary.searchSymbols as ReturnType<typeof vi.fn>).mockResolvedValueOnce(results);

      const service = createService();
      const searchResults = await service.searchSymbols('AAPL');

      expect(searchResults).toHaveLength(1);
    });

    it('falls back to secondary when primary throws', async () => {
      (primary.searchSymbols as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new ProviderError('FMP error', 'NETWORK_ERROR', 'fmp'),
      );
      const results = [makeSearchResult('MSFT', 'alpha-vantage')];
      (secondary.searchSymbols as ReturnType<typeof vi.fn>).mockResolvedValueOnce(results);

      const service = createService();
      const searchResults = await service.searchSymbols('MSFT');

      expect(searchResults).toHaveLength(1);
      expect(searchResults[0]!.symbol).toBe('MSFT');
    });

    it('returns empty array when both providers fail', async () => {
      (primary.searchSymbols as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new ProviderError('Error', 'UNKNOWN', 'fmp'),
      );
      (secondary.searchSymbols as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new ProviderError('Error', 'UNKNOWN', 'alpha-vantage'),
      );

      const service = createService();
      const searchResults = await service.searchSymbols('XYZ');

      expect(searchResults).toHaveLength(0);
    });
  });

  // ---- Quote Fallback Chain Tests ----

  describe('getQuote — fallback chain', () => {
    it('returns primary quote on success', async () => {
      const quote = makeQuote('AAPL', 'fmp', '185.92');
      (primary.getQuote as ReturnType<typeof vi.fn>).mockResolvedValueOnce(quote);

      const service = createService(mockPrisma);
      const result = await service.getQuote(makeInstrument('AAPL'));

      expect(result).not.toBeNull();
      expect(result!.price.toString()).toBe('185.92');
      expect(result!.provider).toBe('fmp');
    });

    it('falls back to cache when primary fails', async () => {
      (primary.getQuote as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new ProviderError('Rate limited', 'RATE_LIMITED', 'fmp'),
      );

      const cachedRecord: LatestQuoteRecord = {
        id: 1,
        instrumentId: 'inst-AAPL',
        provider: 'fmp',
        price: toDecimal('184.00'),
        asOf: new Date('2025-06-13T20:00:00Z'),
        fetchedAt: new Date('2025-06-14T10:00:00Z'),
        rebuiltAt: new Date('2025-06-14T10:00:00Z'),
      };
      (mockPrisma.latestQuote.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        cachedRecord,
      );

      const service = createService(mockPrisma);
      const result = await service.getQuote(makeInstrument('AAPL'));

      expect(result).not.toBeNull();
      expect(result!.price.toString()).toBe('184');
    });

    it('falls back to secondary when primary fails and cache misses', async () => {
      (primary.getQuote as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new ProviderError('500 Internal', 'UNKNOWN', 'fmp'),
      );
      // No cache entry
      const avQuote = makeQuote('AAPL', 'alpha-vantage', '185.50');
      (secondary.getQuote as ReturnType<typeof vi.fn>).mockResolvedValueOnce(avQuote);

      const service = createService(mockPrisma);
      const result = await service.getQuote(makeInstrument('AAPL'));

      expect(result).not.toBeNull();
      expect(result!.price.toString()).toBe('185.5');
      expect(result!.provider).toBe('alpha-vantage');
    });

    it('returns null when all providers fail and no cache', async () => {
      (primary.getQuote as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new ProviderError('Error', 'NETWORK_ERROR', 'fmp'),
      );
      (secondary.getQuote as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new ProviderError('Error', 'NETWORK_ERROR', 'alpha-vantage'),
      );

      const service = createService();
      const result = await service.getQuote(makeInstrument('AAPL'));

      expect(result).toBeNull();
    });

    it('caches quote on successful primary fetch', async () => {
      const quote = makeQuote('MSFT', 'fmp', '425.00');
      (primary.getQuote as ReturnType<typeof vi.fn>).mockResolvedValueOnce(quote);

      const service = createService(mockPrisma);
      await service.getQuote(makeInstrument('MSFT'));

      expect(mockPrisma.latestQuote.upsert).toHaveBeenCalledOnce();
    });

    it('caches quote on successful secondary fetch', async () => {
      (primary.getQuote as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new ProviderError('Error', 'UNKNOWN', 'fmp'),
      );
      const avQuote = makeQuote('MSFT', 'alpha-vantage', '424.50');
      (secondary.getQuote as ReturnType<typeof vi.fn>).mockResolvedValueOnce(avQuote);

      const service = createService(mockPrisma);
      await service.getQuote(makeInstrument('MSFT'));

      expect(mockPrisma.latestQuote.upsert).toHaveBeenCalledOnce();
    });
  });

  // ---- History Tests ----

  describe('getHistory', () => {
    it('uses historyProvider only — not primary or secondary', async () => {
      const bars = [makePriceBar('2025-06-10'), makePriceBar('2025-06-11')];
      (history.getHistory as ReturnType<typeof vi.fn>).mockResolvedValueOnce(bars);

      const service = createService();
      const result = await service.getHistory(
        makeInstrument('AAPL'),
        new Date('2025-06-01'),
        new Date('2025-06-15'),
      );

      expect(result).toHaveLength(2);
      expect(history.getHistory).toHaveBeenCalledOnce();
      expect(primary.getHistory).not.toHaveBeenCalled();
      expect(secondary.getHistory).not.toHaveBeenCalled();
    });

    it('sets instrumentId on returned bars from the instrument', async () => {
      const bars = [makePriceBar('2025-06-10'), makePriceBar('2025-06-11')];
      (history.getHistory as ReturnType<typeof vi.fn>).mockResolvedValueOnce(bars);

      const inst = makeInstrument('AAPL');
      const service = createService();
      const result = await service.getHistory(
        inst,
        new Date('2025-06-01'),
        new Date('2025-06-15'),
      );

      for (const bar of result) {
        expect(bar.instrumentId).toBe('inst-AAPL');
      }
    });

    it('returns empty array when history provider fails (no fallback)', async () => {
      (history.getHistory as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new ProviderError('Network error', 'NETWORK_ERROR', 'tiingo'),
      );

      const service = createService();
      const result = await service.getHistory(
        makeInstrument('AAPL'),
        new Date('2025-06-01'),
        new Date('2025-06-15'),
      );

      expect(result).toHaveLength(0);
      // Verify it did NOT try primary or secondary
      expect(primary.getHistory).not.toHaveBeenCalled();
      expect(secondary.getHistory).not.toHaveBeenCalled();
    });

    it('resolves provider-specific symbol via providerSymbolMap', async () => {
      const bars = [makePriceBar('2025-06-10')];
      (history.getHistory as ReturnType<typeof vi.fn>).mockResolvedValueOnce(bars);

      const inst = makeInstrument('BRK.B', {
        fmp: 'BRK.B',
        tiingo: 'BRK-B',
      });

      const service = createService();
      await service.getHistory(inst, new Date('2025-06-01'), new Date('2025-06-15'));

      // The history provider (tiingo) should receive the mapped symbol BRK-B
      expect(history.getHistory).toHaveBeenCalledWith(
        'BRK-B',
        expect.any(Date),
        expect.any(Date),
        '1D',
      );
    });
  });

  // ---- Rate Limiting Tests ----

  describe('Rate-limited provider is skipped gracefully', () => {
    it('skips primary when rate-limited and falls through to secondary', async () => {
      // Create a primary with very low rate limit
      const rateLimitedPrimary = createMockProvider('fmp', {
        getLimits: vi.fn().mockReturnValue({
          requestsPerMinute: 1,
          requestsPerDay: 10000,
          supportsIntraday: false,
          quoteDelayMinutes: 15,
        } satisfies ProviderLimits),
      });

      const service = new MarketDataService({
        primaryProvider: rateLimitedPrimary,
        secondaryProvider: secondary,
        historyProvider: history,
      });

      // First call should work normally
      const quote1 = makeQuote('AAPL', 'fmp', '185.00');
      (rateLimitedPrimary.getQuote as ReturnType<typeof vi.fn>).mockResolvedValueOnce(quote1);
      await service.getQuote(makeInstrument('AAPL'));

      // Second call within same minute — rate limiter should block primary
      const avQuote = makeQuote('MSFT', 'alpha-vantage', '425.00');
      (secondary.getQuote as ReturnType<typeof vi.fn>).mockResolvedValueOnce(avQuote);

      const result = await service.getQuote(makeInstrument('MSFT'));

      // Should have fallen through to secondary
      expect(result).not.toBeNull();
      expect(result!.provider).toBe('alpha-vantage');
    });

    it('skips history provider when rate-limited and returns empty array', async () => {
      // Create history provider with very low rate limit
      const rateLimitedHistory = createMockProvider('tiingo', {
        getLimits: vi.fn().mockReturnValue({
          requestsPerMinute: 1,
          requestsPerDay: 10000,
          supportsIntraday: false,
          quoteDelayMinutes: 15,
        } satisfies ProviderLimits),
      });

      const service = new MarketDataService({
        primaryProvider: primary,
        secondaryProvider: secondary,
        historyProvider: rateLimitedHistory,
      });

      // Exhaust the rate limiter
      const bars = [makePriceBar('2025-06-10')];
      (rateLimitedHistory.getHistory as ReturnType<typeof vi.fn>).mockResolvedValueOnce(bars);
      await service.getHistory(
        makeInstrument('AAPL'),
        new Date('2025-06-01'),
        new Date('2025-06-15'),
      );

      // Second call within same minute — should be rate-limited
      const result = await service.getHistory(
        makeInstrument('MSFT'),
        new Date('2025-06-01'),
        new Date('2025-06-15'),
      );

      expect(result).toHaveLength(0);
    });
  });

  // ---- Provider Symbol Resolution Tests ----

  describe('Provider symbol resolution', () => {
    it('uses providerSymbolMap for primary quote provider', async () => {
      const quote = makeQuote('BRK.B', 'fmp', '450.00');
      (primary.getQuote as ReturnType<typeof vi.fn>).mockResolvedValueOnce(quote);

      const inst = makeInstrument('BRK.B', {
        fmp: 'BRK.B',
        tiingo: 'BRK-B',
      });

      const service = createService();
      await service.getQuote(inst);

      // FMP should receive BRK.B (with dot)
      expect(primary.getQuote).toHaveBeenCalledWith('BRK.B');
    });

    it('uses providerSymbolMap for secondary quote provider', async () => {
      (primary.getQuote as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new ProviderError('Error', 'UNKNOWN', 'fmp'),
      );
      const avQuote = makeQuote('BRK.B', 'alpha-vantage', '449.50');
      (secondary.getQuote as ReturnType<typeof vi.fn>).mockResolvedValueOnce(avQuote);

      const inst = makeInstrument('BRK.B', {
        fmp: 'BRK.B',
        tiingo: 'BRK-B',
        'alpha-vantage': 'BRK-B',
      });

      const service = createService();
      await service.getQuote(inst);

      // Alpha Vantage should receive BRK-B from the map
      expect(secondary.getQuote).toHaveBeenCalledWith('BRK-B');
    });
  });
});
