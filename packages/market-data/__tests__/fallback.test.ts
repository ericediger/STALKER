import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toDecimal } from '@stalker/shared';
import { MarketDataService } from '../src/service.js';
import type { MarketDataServiceConfig } from '../src/service.js';
import { ProviderError } from '../src/types.js';
import type { MarketDataProvider, Quote, SymbolSearchResult, ProviderLimits, PriceBar, Instrument, Resolution } from '../src/types.js';
import type { PrismaClientForCache, LatestQuoteRecord } from '../src/cache.js';

// --- Mock Helpers ---

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

function makeQuote(symbol: string, provider: string, price: string): Quote {
  return {
    symbol,
    price: toDecimal(price),
    asOf: new Date('2025-01-03T21:00:00Z'),
    provider,
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

function makeSearchResult(symbol: string): SymbolSearchResult {
  return {
    symbol,
    name: `${symbol} Inc.`,
    type: 'STOCK',
    exchange: 'NYSE',
    providerSymbol: symbol,
  };
}

function makePriceBar(date: string): PriceBar {
  return {
    id: 0,
    instrumentId: '',
    provider: 'test',
    resolution: '1D' as Resolution,
    date,
    time: null,
    open: toDecimal('100'),
    high: toDecimal('105'),
    low: toDecimal('99'),
    close: toDecimal('103'),
    volume: 1000000,
  };
}

describe('MarketDataService', () => {
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
    historyProvider = createMockProvider('stooq');
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

  describe('getQuote', () => {
    it('returns quote from primary provider on success', async () => {
      const quote = makeQuote('AAPL', 'fmp', '185.92');
      (primaryProvider.getQuote as ReturnType<typeof vi.fn>).mockResolvedValueOnce(quote);

      const service = createService();
      const result = await service.getQuote(makeInstrument('AAPL'));

      expect(result).not.toBeNull();
      expect(result!.price.toString()).toBe('185.92');
      expect(result!.provider).toBe('fmp');
    });

    it('falls back to cache when primary fails', async () => {
      (primaryProvider.getQuote as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new ProviderError('Rate limited', 'RATE_LIMITED', 'fmp')
      );

      const cachedRecord: LatestQuoteRecord = {
        id: 1,
        instrumentId: 'inst-AAPL',
        provider: 'fmp',
        price: toDecimal('184.00'),
        asOf: new Date('2025-01-03T21:00:00Z'),
        fetchedAt: new Date('2025-01-04T10:00:00Z'), // 2 hours ago on Saturday
        rebuiltAt: new Date('2025-01-04T10:00:00Z'),
      };
      (mockPrisma.latestQuote.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(cachedRecord);

      const service = createService(mockPrisma);
      const result = await service.getQuote(makeInstrument('AAPL'));

      expect(result).not.toBeNull();
      expect(result!.price.toString()).toBe('184');
    });

    it('falls back to secondary when primary fails and cache misses', async () => {
      (primaryProvider.getQuote as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new ProviderError('Rate limited', 'RATE_LIMITED', 'fmp')
      );

      const quote = makeQuote('AAPL', 'alpha-vantage', '185.5');
      (secondaryProvider.getQuote as ReturnType<typeof vi.fn>).mockResolvedValueOnce(quote);

      const service = createService();
      const result = await service.getQuote(makeInstrument('AAPL'));

      expect(result).not.toBeNull();
      expect(result!.price.toString()).toBe('185.5');
      expect(result!.provider).toBe('alpha-vantage');
    });

    it('returns null when all providers fail and no cache', async () => {
      (primaryProvider.getQuote as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new ProviderError('Network error', 'NETWORK_ERROR', 'fmp')
      );
      (secondaryProvider.getQuote as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new ProviderError('Network error', 'NETWORK_ERROR', 'alpha-vantage')
      );

      const service = createService();
      const result = await service.getQuote(makeInstrument('AAPL'));

      expect(result).toBeNull();
    });

    it('auto-upserts LatestQuote on successful fetch', async () => {
      const quote = makeQuote('AAPL', 'fmp', '185.92');
      (primaryProvider.getQuote as ReturnType<typeof vi.fn>).mockResolvedValueOnce(quote);

      const service = createService(mockPrisma);
      await service.getQuote(makeInstrument('AAPL'));

      expect(mockPrisma.latestQuote.upsert).toHaveBeenCalledOnce();
    });
  });

  describe('getHistory', () => {
    it('returns history from history provider on success', async () => {
      const bars = [makePriceBar('2025-01-02'), makePriceBar('2025-01-03')];
      (historyProvider.getHistory as ReturnType<typeof vi.fn>).mockResolvedValueOnce(bars);

      const service = createService();
      const result = await service.getHistory(
        makeInstrument('AAPL'),
        new Date('2025-01-01'),
        new Date('2025-01-31')
      );

      expect(result).toHaveLength(2);
      expect(result[0]?.instrumentId).toBe('inst-AAPL');
    });

    it('falls back to primary when history provider fails', async () => {
      (historyProvider.getHistory as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new ProviderError('Network error', 'NETWORK_ERROR', 'stooq')
      );

      const bars = [makePriceBar('2025-01-02')];
      (primaryProvider.getHistory as ReturnType<typeof vi.fn>).mockResolvedValueOnce(bars);

      const service = createService();
      const result = await service.getHistory(
        makeInstrument('AAPL'),
        new Date('2025-01-01'),
        new Date('2025-01-31')
      );

      expect(result).toHaveLength(1);
    });

    it('returns empty array when all providers fail', async () => {
      (historyProvider.getHistory as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new ProviderError('Network error', 'NETWORK_ERROR', 'stooq')
      );
      (primaryProvider.getHistory as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new ProviderError('Rate limited', 'RATE_LIMITED', 'fmp')
      );

      const service = createService();
      const result = await service.getHistory(
        makeInstrument('AAPL'),
        new Date('2025-01-01'),
        new Date('2025-01-31')
      );

      expect(result).toHaveLength(0);
    });
  });

  describe('searchSymbols', () => {
    it('returns results from primary provider on success', async () => {
      const results = [makeSearchResult('AAPL'), makeSearchResult('AAPD')];
      (primaryProvider.searchSymbols as ReturnType<typeof vi.fn>).mockResolvedValueOnce(results);

      const service = createService();
      const searchResults = await service.searchSymbols('AAPL');

      expect(searchResults).toHaveLength(2);
      expect(searchResults[0]?.symbol).toBe('AAPL');
    });

    it('falls back to secondary when primary fails', async () => {
      (primaryProvider.searchSymbols as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new ProviderError('Rate limited', 'RATE_LIMITED', 'fmp')
      );

      const results = [makeSearchResult('AAPL')];
      (secondaryProvider.searchSymbols as ReturnType<typeof vi.fn>).mockResolvedValueOnce(results);

      const service = createService();
      const searchResults = await service.searchSymbols('AAPL');

      expect(searchResults).toHaveLength(1);
      expect(searchResults[0]?.symbol).toBe('AAPL');
    });

    it('returns empty array when all providers fail', async () => {
      (primaryProvider.searchSymbols as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new ProviderError('Error', 'UNKNOWN', 'fmp')
      );
      (secondaryProvider.searchSymbols as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new ProviderError('Error', 'UNKNOWN', 'alpha-vantage')
      );

      const service = createService();
      const searchResults = await service.searchSymbols('AAPL');

      expect(searchResults).toHaveLength(0);
    });
  });
});
