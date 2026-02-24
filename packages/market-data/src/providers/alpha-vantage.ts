import { toDecimal } from '@stalker/shared';
import type { MarketDataProvider, Quote, SymbolSearchResult, ProviderLimits, PriceBar, Resolution } from '../types.js';
import { ProviderError } from '../types.js';
import { fetchWithTimeout } from '../fetch-with-timeout.js';

const AV_BASE_URL = 'https://www.alphavantage.co';

interface AvGlobalQuote {
  'Global Quote'?: {
    '01. symbol'?: string;
    '02. open'?: string;
    '03. high'?: string;
    '04. low'?: string;
    '05. price'?: string;
    '06. volume'?: string;
    '07. latest trading day'?: string;
    '08. previous close'?: string;
    '09. change'?: string;
    '10. change percent'?: string;
  };
}

interface AvSearchMatch {
  '1. symbol'?: string;
  '2. name'?: string;
  '3. type'?: string;
  '4. region'?: string;
  '8. currency'?: string;
}

interface AvSearchResponse {
  bestMatches?: AvSearchMatch[];
}

interface AvDailyBar {
  '1. open'?: string;
  '2. high'?: string;
  '3. low'?: string;
  '4. close'?: string;
  '5. volume'?: string;
}

interface AvTimeSeriesResponse {
  'Time Series (Daily)'?: Record<string, AvDailyBar>;
}

function getApiKey(): string {
  const key = process.env['ALPHA_VANTAGE_API_KEY'];
  if (!key) {
    throw new ProviderError(
      'ALPHA_VANTAGE_API_KEY environment variable is not set',
      'UNKNOWN',
      'alpha-vantage'
    );
  }
  return key;
}

function getRpmLimit(): number {
  const val = process.env['AV_RPM'];
  return val ? parseInt(val, 10) : 5;
}

function getRpdLimit(): number {
  const val = process.env['AV_RPD'];
  return val ? parseInt(val, 10) : 25;
}

export class AlphaVantageProvider implements MarketDataProvider {
  readonly name = 'alpha-vantage';

  async searchSymbols(query: string): Promise<SymbolSearchResult[]> {
    const apiKey = getApiKey();
    const url = `${AV_BASE_URL}/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(query)}&apikey=${apiKey}`;

    const data = await this.fetchJson(url);
    const response = data as AvSearchResponse;

    if (!response.bestMatches || !Array.isArray(response.bestMatches)) {
      throw new ProviderError(
        'Unexpected response shape from Alpha Vantage search',
        'PARSE_ERROR',
        this.name
      );
    }

    return response.bestMatches.map((match) => ({
      symbol: match['1. symbol'] ?? '',
      name: match['2. name'] ?? '',
      type: match['3. type'] ?? 'STOCK',
      exchange: match['4. region'] ?? '',
      providerSymbol: match['1. symbol'] ?? '',
    }));
  }

  async getQuote(symbol: string): Promise<Quote> {
    const apiKey = getApiKey();
    const url = `${AV_BASE_URL}/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;

    const data = await this.fetchJson(url);
    const response = data as AvGlobalQuote;

    const globalQuote = response['Global Quote'];
    if (!globalQuote) {
      throw new ProviderError(
        `No quote data for symbol: ${symbol}`,
        'NOT_FOUND',
        this.name
      );
    }

    const price = globalQuote['05. price'];
    if (!price) {
      throw new ProviderError(
        `Missing price in Alpha Vantage response for: ${symbol}`,
        'PARSE_ERROR',
        this.name
      );
    }

    const latestDay = globalQuote['07. latest trading day'];

    return {
      symbol: globalQuote['01. symbol'] ?? symbol,
      price: toDecimal(price),
      asOf: latestDay ? new Date(latestDay) : new Date(),
      provider: this.name,
    };
  }

  async getHistory(
    symbol: string,
    start: Date,
    end: Date,
    _resolution: Resolution
  ): Promise<PriceBar[]> {
    const apiKey = getApiKey();
    const url = `${AV_BASE_URL}/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=full&apikey=${apiKey}`;

    const data = await this.fetchJson(url);
    const response = data as AvTimeSeriesResponse;

    const timeSeries = response['Time Series (Daily)'];
    if (!timeSeries) {
      throw new ProviderError(
        `No history data for symbol: ${symbol}`,
        'NOT_FOUND',
        this.name
      );
    }

    const startStr = formatDate(start);
    const endStr = formatDate(end);

    const bars: PriceBar[] = [];
    for (const [dateStr, bar] of Object.entries(timeSeries)) {
      // Filter to the requested date range (inclusive)
      if (dateStr < startStr || dateStr > endStr) {
        continue;
      }

      bars.push({
        id: 0, // Will be assigned by database on insert
        instrumentId: '', // Caller must set this
        provider: this.name,
        resolution: '1D' as Resolution,
        date: dateStr,
        time: null,
        open: toDecimal(bar['1. open'] ?? '0'),
        high: toDecimal(bar['2. high'] ?? '0'),
        low: toDecimal(bar['3. low'] ?? '0'),
        close: toDecimal(bar['4. close'] ?? '0'),
        volume: bar['5. volume'] ? parseInt(bar['5. volume'], 10) : null,
      });
    }

    // Sort by date ascending
    bars.sort((a, b) => a.date.localeCompare(b.date));

    return bars;
  }

  getLimits(): ProviderLimits {
    return {
      requestsPerMinute: getRpmLimit(),
      requestsPerDay: getRpdLimit(),
      supportsIntraday: false,
      quoteDelayMinutes: 15,
    };
  }

  /**
   * Fetch JSON from URL with Alpha Vantage-specific error handling.
   * CRITICAL: Alpha Vantage returns HTTP 200 with a "Thank you for using Alpha Vantage"
   * message body when rate-limited. Must detect this in the response.
   */
  private async fetchJson(url: string): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchWithTimeout(url);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown network error';
      throw new ProviderError(
        `Network error: ${message}`,
        'NETWORK_ERROR',
        this.name
      );
    }

    if (response.status === 429) {
      throw new ProviderError(
        'Alpha Vantage rate limit exceeded (HTTP 429)',
        'RATE_LIMITED',
        this.name
      );
    }

    if (!response.ok) {
      throw new ProviderError(
        `Alpha Vantage HTTP ${response.status}: ${response.statusText}`,
        'UNKNOWN',
        this.name
      );
    }

    const text = await response.text();

    // CRITICAL: Detect AV's soft rate limit (returns 200 with "Thank you" message)
    if (text.includes('Thank you for using Alpha Vantage')) {
      throw new ProviderError(
        'Alpha Vantage rate limit exceeded (soft limit)',
        'RATE_LIMITED',
        this.name
      );
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ProviderError(
        'Failed to parse Alpha Vantage response as JSON',
        'PARSE_ERROR',
        this.name
      );
    }
  }
}

function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
