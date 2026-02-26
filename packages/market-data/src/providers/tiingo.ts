import { toDecimal } from '@stalker/shared';
import type { MarketDataProvider, Quote, SymbolSearchResult, ProviderLimits, PriceBar, Resolution } from '../types.js';
import { ProviderError } from '../types.js';
import { fetchWithTimeout } from '../fetch-with-timeout.js';

const TIINGO_BASE_URL = 'https://api.tiingo.com';

/**
 * Tiingo daily history bar response item.
 * We use adjusted prices (adjClose, adjOpen, adjHigh, adjLow) to account for
 * splits and dividends. Raw prices are also present but ignored.
 */
interface TiingoHistoryItem {
  date?: string;
  close?: number;
  high?: number;
  low?: number;
  open?: number;
  volume?: number;
  adjClose?: number;
  adjHigh?: number;
  adjLow?: number;
  adjOpen?: number;
  adjVolume?: number;
  divCash?: number;
  splitFactor?: number;
}

/**
 * Tiingo IEX quote response item.
 */
interface TiingoIexQuoteItem {
  ticker?: string;
  tngoLast?: number;
  last?: number;
  lastSaleTimestamp?: string;
  timestamp?: string;
  prevClose?: number;
}

function getApiKey(): string {
  const key = process.env['TIINGO_API_KEY'];
  if (!key) {
    throw new ProviderError('TIINGO_API_KEY environment variable is not set', 'UNKNOWN', 'tiingo');
  }
  return key;
}

function getRphLimit(): number {
  const val = process.env['TIINGO_RPH'];
  return val ? parseInt(val, 10) : 50;
}

function getRpdLimit(): number {
  const val = process.env['TIINGO_RPD'];
  return val ? parseInt(val, 10) : 1000;
}

export class TiingoProvider implements MarketDataProvider {
  readonly name = 'tiingo';

  /**
   * Tiingo does not provide a search endpoint. Returns empty array.
   */
  async searchSymbols(_query: string): Promise<SymbolSearchResult[]> {
    return [];
  }

  /**
   * Fetch quotes for multiple symbols in a single batch IEX request.
   * Tiingo IEX supports comma-separated tickers in one call.
   * Chunks into groups of 50 to avoid URL length limits.
   * Returns quotes only for symbols that Tiingo recognized — missing symbols are silently omitted.
   */
  async getBatchQuotes(symbols: string[]): Promise<Quote[]> {
    if (symbols.length === 0) return [];

    const token = getApiKey();
    const CHUNK_SIZE = 50;
    const allQuotes: Quote[] = [];

    for (let i = 0; i < symbols.length; i += CHUNK_SIZE) {
      const chunk = symbols.slice(i, i + CHUNK_SIZE);
      const tickers = chunk.map((s) => encodeURIComponent(s)).join(',');
      const url = `${TIINGO_BASE_URL}/iex/?tickers=${tickers}&token=${token}`;

      let data: unknown;
      try {
        data = await this.fetchJson(url);
      } catch {
        // If entire batch fails, continue to next chunk (or return what we have)
        continue;
      }

      if (!Array.isArray(data)) continue;

      for (const raw of data as TiingoIexQuoteItem[]) {
        const price = raw.tngoLast ?? raw.last;
        if (price === undefined || price === null) continue;
        if (!raw.ticker) continue;

        const asOfStr = raw.lastSaleTimestamp ?? raw.timestamp;
        allQuotes.push({
          symbol: raw.ticker,
          price: toDecimal(String(price)),
          asOf: asOfStr ? new Date(asOfStr) : new Date(),
          provider: this.name,
        });
      }
    }

    return allQuotes;
  }

  async getQuote(symbol: string): Promise<Quote> {
    const token = getApiKey();
    const url = `${TIINGO_BASE_URL}/iex/${encodeURIComponent(symbol)}?token=${token}`;

    const data = await this.fetchJson(url);

    if (!Array.isArray(data) || data.length === 0) {
      throw new ProviderError(`No quote data for symbol: ${symbol}`, 'NOT_FOUND', this.name);
    }

    const item = data[0] as TiingoIexQuoteItem;
    const price = item.tngoLast ?? item.last;

    if (price === undefined || price === null) {
      throw new ProviderError(`Missing price in Tiingo IEX response for: ${symbol}`, 'PARSE_ERROR', this.name);
    }

    const asOfStr = item.lastSaleTimestamp ?? item.timestamp;

    return {
      symbol: item.ticker ?? symbol,
      price: toDecimal(String(price)),
      asOf: asOfStr ? new Date(asOfStr) : new Date(),
      provider: this.name,
    };
  }

  async getHistory(
    symbol: string,
    start: Date,
    end: Date,
    _resolution: Resolution
  ): Promise<PriceBar[]> {
    const token = getApiKey();
    const startStr = formatDate(start);
    const endStr = formatDate(end);
    const url = `${TIINGO_BASE_URL}/tiingo/daily/${encodeURIComponent(symbol)}/prices?startDate=${startStr}&endDate=${endStr}&token=${token}`;

    const data = await this.fetchJson(url);

    if (!Array.isArray(data)) {
      throw new ProviderError('Unexpected response shape from Tiingo history', 'PARSE_ERROR', this.name);
    }

    // Map adjusted prices to PriceBar fields. Adjusted prices account for splits and dividends.
    return (data as TiingoHistoryItem[]).map((bar) => ({
      id: 0, // Will be assigned by database on insert
      instrumentId: '', // Caller must set this
      provider: this.name,
      resolution: '1D' as Resolution,
      date: extractDate(bar.date ?? ''),
      time: null,
      open: toDecimal(String(bar.adjOpen ?? bar.open ?? 0)),
      high: toDecimal(String(bar.adjHigh ?? bar.high ?? 0)),
      low: toDecimal(String(bar.adjLow ?? bar.low ?? 0)),
      close: toDecimal(String(bar.adjClose ?? bar.close ?? 0)),
      volume: bar.adjVolume ?? bar.volume ?? null,
    }));
  }

  getLimits(): ProviderLimits {
    return {
      requestsPerMinute: 10,
      requestsPerHour: getRphLimit(),
      requestsPerDay: getRpdLimit(),
      supportsIntraday: false,
      quoteDelayMinutes: 15,
    };
  }

  /**
   * Fetch JSON from Tiingo with error handling.
   * CRITICAL: Tiingo returns HTTP 200 with plain text body on errors/rate limits.
   * Must try/catch JSON.parse to detect these cases.
   */
  private async fetchJson(url: string): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchWithTimeout(url);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown network error';
      throw new ProviderError(`Network error: ${message}`, 'NETWORK_ERROR', this.name);
    }

    if (response.status === 429) {
      throw new ProviderError('Tiingo rate limit exceeded', 'RATE_LIMITED', this.name);
    }

    if (response.status === 404) {
      throw new ProviderError('Tiingo symbol not found', 'NOT_FOUND', this.name);
    }

    if (!response.ok) {
      throw new ProviderError(
        `Tiingo HTTP ${response.status}: ${response.statusText}`,
        'UNKNOWN',
        this.name
      );
    }

    const text = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      // Tiingo returns HTTP 200 with plain text on errors/rate limits
      throw new ProviderError(
        `Tiingo error: ${text.substring(0, 200)}`,
        'PROVIDER_ERROR' as 'UNKNOWN',
        this.name
      );
    }

    return data;
  }
}

/**
 * Extract YYYY-MM-DD from Tiingo ISO date string.
 * Input: "2025-01-02T00:00:00.000Z" → Output: "2025-01-02"
 */
function extractDate(isoString: string): string {
  const idx = isoString.indexOf('T');
  return idx >= 0 ? isoString.substring(0, idx) : isoString;
}

function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
