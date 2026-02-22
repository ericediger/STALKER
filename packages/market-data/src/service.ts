import type {
  MarketDataProvider,
  Quote,
  SymbolSearchResult,
  PriceBar,
  Instrument,
  Resolution,
} from './types.js';
import { ProviderError } from './types.js';
import { RateLimiter } from './rate-limiter.js';
import { getProviderSymbol } from './symbol-map.js';
import { isMarketOpen } from './calendar/index.js';
import {
  upsertQuote,
  getLatestQuote,
  isQuoteFresh,
} from './cache.js';
import type { PrismaClientForCache, LatestQuoteRecord } from './cache.js';
import { toDecimal } from '@stalker/shared';

export interface MarketDataServiceConfig {
  /** Primary quote + search provider (typically FMP) */
  primaryProvider: MarketDataProvider;
  /** Secondary/backup quote + search provider (typically Alpha Vantage) */
  secondaryProvider: MarketDataProvider;
  /** History provider (typically Stooq) */
  historyProvider: MarketDataProvider;
  /** Prisma client for LatestQuote cache operations (optional -- if not provided, caching is disabled) */
  prisma?: PrismaClientForCache;
}

interface ProviderWithLimiter {
  provider: MarketDataProvider;
  limiter: RateLimiter;
}

/**
 * MarketDataService wraps multiple providers with rate limiting and a fallback chain.
 *
 * Quote path: primary (FMP) -> cache check -> secondary (Alpha Vantage) -> null
 * History path: historyProvider (Stooq) -> primary (FMP)
 * Search path: primary (FMP) -> secondary (Alpha Vantage)
 */
export class MarketDataService {
  private readonly primary: ProviderWithLimiter;
  private readonly secondary: ProviderWithLimiter;
  private readonly history: ProviderWithLimiter;
  private readonly prisma?: PrismaClientForCache;

  constructor(config: MarketDataServiceConfig) {
    this.primary = {
      provider: config.primaryProvider,
      limiter: new RateLimiter({
        requestsPerMinute: config.primaryProvider.getLimits().requestsPerMinute,
        requestsPerDay: config.primaryProvider.getLimits().requestsPerDay,
      }),
    };

    this.secondary = {
      provider: config.secondaryProvider,
      limiter: new RateLimiter({
        requestsPerMinute: config.secondaryProvider.getLimits().requestsPerMinute,
        requestsPerDay: config.secondaryProvider.getLimits().requestsPerDay,
      }),
    };

    this.history = {
      provider: config.historyProvider,
      limiter: new RateLimiter({
        requestsPerMinute: config.historyProvider.getLimits().requestsPerMinute,
        requestsPerDay: config.historyProvider.getLimits().requestsPerDay,
      }),
    };

    this.prisma = config.prisma;
  }

  /**
   * Get a quote for an instrument using the fallback chain:
   * 1. Try primary provider (FMP)
   * 2. If fail, check LatestQuote cache for a fresh cached value
   * 3. If cache miss/stale, try secondary provider (Alpha Vantage)
   * 4. If all fail, return null
   *
   * On success, auto-upserts to LatestQuote cache.
   */
  async getQuote(instrument: Instrument): Promise<Quote | null> {
    // Try primary
    const primaryQuote = await this.tryGetQuote(this.primary, instrument);
    if (primaryQuote) {
      await this.cacheQuote(instrument.id, primaryQuote);
      return primaryQuote;
    }

    // Check cache
    if (this.prisma) {
      const cached = await getLatestQuote(this.prisma, instrument.id);
      if (cached && isQuoteFresh(cached, isMarketOpen(new Date(), instrument.exchange))) {
        return latestQuoteRecordToQuote(cached, instrument.symbol);
      }
    }

    // Try secondary
    const secondaryQuote = await this.tryGetQuote(this.secondary, instrument);
    if (secondaryQuote) {
      await this.cacheQuote(instrument.id, secondaryQuote);
      return secondaryQuote;
    }

    // All providers failed — return null (stale indicator)
    return null;
  }

  /**
   * Get historical price bars for an instrument using the fallback chain:
   * 1. Try history provider (Stooq)
   * 2. If fail, try primary provider (FMP)
   */
  async getHistory(
    instrument: Instrument,
    start: Date,
    end: Date,
    resolution: Resolution = '1D'
  ): Promise<PriceBar[]> {
    // Try history provider (Stooq)
    const historySymbol = getProviderSymbol(instrument, this.history.provider.name);
    const historyBars = await this.tryGetHistory(
      this.history,
      historySymbol,
      start,
      end,
      resolution
    );
    if (historyBars && historyBars.length > 0) {
      return historyBars.map((bar) => ({ ...bar, instrumentId: instrument.id }));
    }

    // Fallback to primary (FMP)
    const primarySymbol = getProviderSymbol(instrument, this.primary.provider.name);
    const primaryBars = await this.tryGetHistory(
      this.primary,
      primarySymbol,
      start,
      end,
      resolution
    );
    if (primaryBars && primaryBars.length > 0) {
      return primaryBars.map((bar) => ({ ...bar, instrumentId: instrument.id }));
    }

    return [];
  }

  /**
   * Search for symbols using the fallback chain:
   * 1. Try primary provider (FMP)
   * 2. If fail, try secondary provider (Alpha Vantage)
   */
  async searchSymbols(query: string): Promise<SymbolSearchResult[]> {
    // Try primary
    const primaryResults = await this.trySearchSymbols(this.primary, query);
    if (primaryResults && primaryResults.length > 0) {
      return primaryResults;
    }

    // Fallback to secondary
    const secondaryResults = await this.trySearchSymbols(this.secondary, query);
    if (secondaryResults && secondaryResults.length > 0) {
      return secondaryResults;
    }

    return [];
  }

  // --- Private helpers ---

  private async tryGetQuote(
    pw: ProviderWithLimiter,
    instrument: Instrument
  ): Promise<Quote | null> {
    if (!pw.limiter.canCall()) {
      return null;
    }

    const symbol = getProviderSymbol(instrument, pw.provider.name);

    try {
      pw.limiter.recordCall();
      const quote = await pw.provider.getQuote(symbol);
      return quote;
    } catch (error: unknown) {
      if (error instanceof ProviderError && error.type === 'NOT_FOUND') {
        // Don't fallback for NOT_FOUND — the symbol genuinely doesn't exist
        return null;
      }
      // RATE_LIMITED, NETWORK_ERROR, PARSE_ERROR, UNKNOWN — try next provider
      return null;
    }
  }

  private async tryGetHistory(
    pw: ProviderWithLimiter,
    symbol: string,
    start: Date,
    end: Date,
    resolution: Resolution
  ): Promise<PriceBar[] | null> {
    if (!pw.limiter.canCall()) {
      return null;
    }

    try {
      pw.limiter.recordCall();
      return await pw.provider.getHistory(symbol, start, end, resolution);
    } catch {
      return null;
    }
  }

  private async trySearchSymbols(
    pw: ProviderWithLimiter,
    query: string
  ): Promise<SymbolSearchResult[] | null> {
    if (!pw.limiter.canCall()) {
      return null;
    }

    try {
      pw.limiter.recordCall();
      return await pw.provider.searchSymbols(query);
    } catch {
      return null;
    }
  }

  private async cacheQuote(instrumentId: string, quote: Quote): Promise<void> {
    if (!this.prisma) {
      return;
    }

    try {
      await upsertQuote(
        this.prisma,
        instrumentId,
        quote.provider,
        quote.price,
        quote.asOf
      );
    } catch {
      // Cache failures should not prevent returning the quote to the caller
    }
  }
}

function latestQuoteRecordToQuote(
  record: LatestQuoteRecord,
  symbol: string
): Quote {
  return {
    symbol,
    price: toDecimal(record.price.toString()),
    asOf: record.asOf,
    provider: record.provider,
  };
}
