import { toDecimal } from '@stalker/shared';
import type { MarketDataProvider, Quote, SymbolSearchResult, ProviderLimits, PriceBar, Resolution } from '../types.js';
import { ProviderError } from '../types.js';
import { fetchWithTimeout } from '../fetch-with-timeout.js';

const FMP_BASE_URL = 'https://financialmodelingprep.com';

/**
 * FMP /stable/ API search response item.
 * Migrated from dead /api/v3/ in Session 11.
 */
interface FmpSearchItem {
  symbol?: string;
  name?: string;
  currency?: string;
  exchangeFullName?: string;
  exchange?: string;
}

/**
 * FMP /stable/ API quote response item.
 * Key changes from v3: `changePercentage` (not `changesPercentage`),
 * all numeric fields are JSON numbers (not strings).
 */
interface FmpQuoteItem {
  symbol?: string;
  price?: number;
  timestamp?: number;
  name?: string;
  open?: number;
  previousClose?: number;
  change?: number;
  changePercentage?: number;
  dayLow?: number;
  dayHigh?: number;
  yearHigh?: number;
  yearLow?: number;
  volume?: number;
  exchange?: string;
}

function getApiKey(): string {
  const key = process.env['FMP_API_KEY'];
  if (!key) {
    throw new ProviderError('FMP_API_KEY environment variable is not set', 'UNKNOWN', 'fmp');
  }
  return key;
}

function getRpmLimit(): number {
  const val = process.env['FMP_RPM'];
  return val ? parseInt(val, 10) : 5;
}

function getRpdLimit(): number {
  const val = process.env['FMP_RPD'];
  return val ? parseInt(val, 10) : 250;
}

export class FmpProvider implements MarketDataProvider {
  readonly name = 'fmp';

  async searchSymbols(query: string): Promise<SymbolSearchResult[]> {
    const apiKey = getApiKey();
    const url = `${FMP_BASE_URL}/stable/search-symbol?query=${encodeURIComponent(query)}&apikey=${apiKey}`;

    const response = await this.fetchWithErrorHandling(url);
    const data: unknown = await response.json();

    if (!Array.isArray(data)) {
      throw new ProviderError('Unexpected response shape from FMP search', 'PARSE_ERROR', this.name);
    }

    return (data as FmpSearchItem[]).map((item) => ({
      symbol: item.symbol ?? '',
      name: item.name ?? '',
      type: 'STOCK',
      exchange: item.exchange ?? '',
      providerSymbol: item.symbol ?? '',
    }));
  }

  async getQuote(symbol: string): Promise<Quote> {
    const apiKey = getApiKey();
    const url = `${FMP_BASE_URL}/stable/quote?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;

    const response = await this.fetchWithErrorHandling(url);
    const data: unknown = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      throw new ProviderError(`No quote data for symbol: ${symbol}`, 'NOT_FOUND', this.name);
    }

    const item = data[0] as FmpQuoteItem;

    if (item.price === undefined || item.price === null) {
      throw new ProviderError(`Missing price in FMP quote response for: ${symbol}`, 'PARSE_ERROR', this.name);
    }

    // CRITICAL: price is a JSON number — convert via String to avoid float contamination
    return {
      symbol: item.symbol ?? symbol,
      price: toDecimal(String(item.price)),
      asOf: item.timestamp ? new Date(item.timestamp * 1000) : new Date(),
      provider: this.name,
    };
  }

  /**
   * FMP free tier does not support historical data (premium-only since Aug 2025).
   * Always throws — callers should use Tiingo for history instead.
   */
  async getHistory(
    _symbol: string,
    _start: Date,
    _end: Date,
    _resolution: Resolution
  ): Promise<PriceBar[]> {
    throw new ProviderError(
      'FMP free tier does not support historical data. Use Tiingo for history.',
      'UNKNOWN',
      this.name
    );
  }

  getLimits(): ProviderLimits {
    return {
      requestsPerMinute: getRpmLimit(),
      requestsPerDay: getRpdLimit(),
      supportsIntraday: false,
      quoteDelayMinutes: 15,
    };
  }

  private async fetchWithErrorHandling(url: string): Promise<Response> {
    let response: Response;
    try {
      response = await fetchWithTimeout(url);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown network error';
      throw new ProviderError(`Network error: ${message}`, 'NETWORK_ERROR', this.name);
    }

    if (response.status === 429) {
      throw new ProviderError('FMP rate limit exceeded', 'RATE_LIMITED', this.name);
    }

    if (!response.ok) {
      throw new ProviderError(
        `FMP HTTP ${response.status}: ${response.statusText}`,
        'UNKNOWN',
        this.name
      );
    }

    return response;
  }
}
