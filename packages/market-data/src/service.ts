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
import type { TiingoProvider } from './providers/tiingo.js';

export interface PollResult {
  /** Number of instruments with successfully updated quotes */
  updated: number;
  /** Number of instruments where all providers failed */
  failed: number;
  /** Number of instruments skipped (e.g., rate limited) */
  skipped: number;
  /** Primary source for this poll cycle */
  source: string;
}

export interface MarketDataServiceConfig {
  /** Primary quote + search provider (typically FMP) */
  primaryProvider: MarketDataProvider;
  /** Secondary/backup quote + search provider (typically Alpha Vantage) */
  secondaryProvider: MarketDataProvider;
  /** History provider (Tiingo — sole provider, no fallback). Must support getBatchQuotes if used for batch polling. */
  historyProvider: MarketDataProvider;
  /** Crypto provider (CoinGecko — search, quotes, history for CRYPTO instruments). Optional. */
  cryptoProvider?: MarketDataProvider;
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
 * History path: historyProvider (Tiingo) — no fallback (FMP free tier has no history)
 * Search path: primary (FMP) -> secondary (Alpha Vantage)
 */
export class MarketDataService {
  private readonly primary: ProviderWithLimiter;
  private readonly secondary: ProviderWithLimiter;
  private readonly history: ProviderWithLimiter;
  private readonly crypto: ProviderWithLimiter | null;
  private readonly prisma?: PrismaClientForCache;

  constructor(config: MarketDataServiceConfig) {
    this.primary = {
      provider: config.primaryProvider,
      limiter: new RateLimiter({
        requestsPerMinute: config.primaryProvider.getLimits().requestsPerMinute,
        requestsPerHour: config.primaryProvider.getLimits().requestsPerHour,
        requestsPerDay: config.primaryProvider.getLimits().requestsPerDay,
      }),
    };

    this.secondary = {
      provider: config.secondaryProvider,
      limiter: new RateLimiter({
        requestsPerMinute: config.secondaryProvider.getLimits().requestsPerMinute,
        requestsPerHour: config.secondaryProvider.getLimits().requestsPerHour,
        requestsPerDay: config.secondaryProvider.getLimits().requestsPerDay,
      }),
    };

    this.history = {
      provider: config.historyProvider,
      limiter: new RateLimiter({
        requestsPerMinute: config.historyProvider.getLimits().requestsPerMinute,
        requestsPerHour: config.historyProvider.getLimits().requestsPerHour,
        requestsPerDay: config.historyProvider.getLimits().requestsPerDay,
      }),
    };

    this.crypto = config.cryptoProvider
      ? {
          provider: config.cryptoProvider,
          limiter: new RateLimiter({
            requestsPerMinute: config.cryptoProvider.getLimits().requestsPerMinute,
            requestsPerHour: config.cryptoProvider.getLimits().requestsPerHour,
            requestsPerDay: config.cryptoProvider.getLimits().requestsPerDay,
          }),
        }
      : null;

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
    // CRYPTO instruments use the crypto provider exclusively
    if (instrument.type === 'CRYPTO' && this.crypto) {
      const coinId = getProviderSymbol(instrument, this.crypto.provider.name);
      const cryptoQuote = await this.tryGetQuote(this.crypto, { ...instrument, symbol: coinId });
      if (cryptoQuote) {
        await this.cacheQuote(instrument.id, cryptoQuote);
        return cryptoQuote;
      }
      // Check cache fallback
      if (this.prisma) {
        const cached = await getLatestQuote(this.prisma, instrument.id);
        if (cached && isQuoteFresh(cached, true)) {
          return latestQuoteRecordToQuote(cached, instrument.symbol);
        }
      }
      return null;
    }

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
   * Get historical price bars for an instrument.
   * Uses Tiingo as the sole history provider (FMP free tier has no history support).
   */
  async getHistory(
    instrument: Instrument,
    start: Date,
    end: Date,
    resolution: Resolution = '1D'
  ): Promise<PriceBar[]> {
    // CRYPTO instruments use the crypto provider for history
    if (instrument.type === 'CRYPTO' && this.crypto) {
      const coinId = getProviderSymbol(instrument, this.crypto.provider.name);
      const cryptoBars = await this.tryGetHistory(this.crypto, coinId, start, end, resolution);
      if (cryptoBars && cryptoBars.length > 0) {
        return cryptoBars.map((bar) => ({ ...bar, instrumentId: instrument.id }));
      }
      return [];
    }

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

    return [];
  }

  /**
   * Search for symbols using the fallback chain:
   * 1. Try primary provider (FMP)
   * 2. If fail, try secondary provider (Alpha Vantage)
   */
  async searchSymbols(query: string): Promise<SymbolSearchResult[]> {
    const results: SymbolSearchResult[] = [];

    // Try primary (FMP) for equity results
    const primaryResults = await this.trySearchSymbols(this.primary, query);
    if (primaryResults && primaryResults.length > 0) {
      results.push(...primaryResults);
    } else {
      // Fallback to secondary for equities
      const secondaryResults = await this.trySearchSymbols(this.secondary, query);
      if (secondaryResults && secondaryResults.length > 0) {
        results.push(...secondaryResults);
      }
    }

    // Also search crypto provider for crypto results (merged, not fallback)
    if (this.crypto) {
      const cryptoResults = await this.trySearchSymbols(this.crypto, query);
      if (cryptoResults && cryptoResults.length > 0) {
        results.push(...cryptoResults);
      }
    }

    return results;
  }

  /**
   * Poll all instruments for quotes using Tiingo IEX batch as primary source.
   * Provider chain: Tiingo batch → FMP single → AV single → skip.
   * One Tiingo batch call covers all instruments. Fallback is per-instrument for gaps.
   */
  async pollAllQuotes(instruments: Instrument[]): Promise<PollResult> {
    if (instruments.length === 0) {
      return { updated: 0, failed: 0, skipped: 0, source: 'none' };
    }

    // Filter out CRYPTO instruments — they are polled separately by the scheduler
    const equityInstruments = instruments.filter((inst) => inst.type !== 'CRYPTO');
    if (equityInstruments.length === 0) {
      return { updated: 0, failed: 0, skipped: 0, source: 'none' };
    }

    const result: PollResult = { updated: 0, failed: 0, skipped: 0, source: 'tiingo-batch' };

    // Build a map of tiingo symbol → instrument for reverse lookup
    const tiingoSymbolToInstrument = new Map<string, Instrument>();
    const tiingoSymbols: string[] = [];

    for (const inst of equityInstruments) {
      const sym = getProviderSymbol(inst, 'tiingo');
      tiingoSymbols.push(sym);
      tiingoSymbolToInstrument.set(sym.toUpperCase(), inst);
    }

    // Step 1: Try Tiingo IEX batch
    const coveredInstrumentIds = new Set<string>();
    const historyProvider = this.history.provider as TiingoProvider;

    if (typeof historyProvider.getBatchQuotes === 'function' && this.history.limiter.canCall()) {
      try {
        this.history.limiter.recordCall();
        const batchQuotes = await historyProvider.getBatchQuotes(tiingoSymbols);

        for (const quote of batchQuotes) {
          const inst = tiingoSymbolToInstrument.get(quote.symbol.toUpperCase());
          if (!inst) continue;

          await this.cacheQuote(inst.id, quote);
          coveredInstrumentIds.add(inst.id);
          result.updated++;
        }
      } catch {
        // Tiingo batch failed entirely — will fall through to per-instrument fallback
      }
    }

    // Step 2: For any equity instruments Tiingo missed, try FMP single-symbol then AV
    const uncoveredInstruments = equityInstruments.filter((inst) => !coveredInstrumentIds.has(inst.id));

    for (const inst of uncoveredInstruments) {
      // Try primary (FMP)
      const primaryQuote = await this.tryGetQuote(this.primary, inst);
      if (primaryQuote) {
        await this.cacheQuote(inst.id, primaryQuote);
        coveredInstrumentIds.add(inst.id);
        result.updated++;
        continue;
      }

      // Try secondary (AV)
      const secondaryQuote = await this.tryGetQuote(this.secondary, inst);
      if (secondaryQuote) {
        await this.cacheQuote(inst.id, secondaryQuote);
        coveredInstrumentIds.add(inst.id);
        result.updated++;
        continue;
      }

      result.failed++;
    }

    return result;
  }

  /**
   * Poll crypto instruments for quotes using CoinGecko batch endpoint.
   * Called by the scheduler's crypto polling path (AD-S22-4).
   */
  async pollCryptoQuotes(instruments: Instrument[]): Promise<PollResult> {
    const cryptoInstruments = instruments.filter((inst) => inst.type === 'CRYPTO');
    if (cryptoInstruments.length === 0 || !this.crypto) {
      return { updated: 0, failed: 0, skipped: 0, source: 'none' };
    }

    const result: PollResult = { updated: 0, failed: 0, skipped: 0, source: 'coingecko-batch' };

    // Build coin ID map for reverse lookup
    const coinIdToInstrument = new Map<string, Instrument>();
    const coinIds: string[] = [];

    for (const inst of cryptoInstruments) {
      const coinId = getProviderSymbol(inst, this.crypto.provider.name);
      coinIds.push(coinId);
      coinIdToInstrument.set(coinId.toLowerCase(), inst);
    }

    // Use CoinGecko batch quote (getBatchQuotes method)
    const cryptoProvider = this.crypto.provider as MarketDataProvider & {
      getBatchQuotes?(ids: string[]): Promise<Quote[]>;
    };

    if (typeof cryptoProvider.getBatchQuotes === 'function' && this.crypto.limiter.canCall()) {
      try {
        this.crypto.limiter.recordCall();
        const batchQuotes = await cryptoProvider.getBatchQuotes(coinIds);

        for (const quote of batchQuotes) {
          const inst = coinIdToInstrument.get(quote.symbol.toLowerCase());
          if (!inst) continue;
          await this.cacheQuote(inst.id, quote);
          result.updated++;
        }
      } catch {
        // Batch failed — try per-instrument fallback
        for (const inst of cryptoInstruments) {
          const quote = await this.tryGetQuote(this.crypto!, { ...inst, symbol: getProviderSymbol(inst, this.crypto!.provider.name) });
          if (quote) {
            await this.cacheQuote(inst.id, quote);
            result.updated++;
          } else {
            result.failed++;
          }
        }
      }
    } else {
      // No batch — per-instrument
      for (const inst of cryptoInstruments) {
        const quote = await this.tryGetQuote(this.crypto, { ...inst, symbol: getProviderSymbol(inst, this.crypto.provider.name) });
        if (quote) {
          await this.cacheQuote(inst.id, quote);
          result.updated++;
        } else {
          result.failed++;
        }
      }
    }

    return result;
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
