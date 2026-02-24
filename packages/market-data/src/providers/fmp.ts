import { toDecimal } from '@stalker/shared';
import type { MarketDataProvider, Quote, SymbolSearchResult, ProviderLimits, PriceBar, Resolution } from '../types.js';
import { ProviderError } from '../types.js';
import { fetchWithTimeout } from '../fetch-with-timeout.js';

const FMP_BASE_URL = 'https://financialmodelingprep.com';

interface FmpSearchItem {
  symbol?: string;
  name?: string;
  currency?: string;
  stockExchange?: string;
  exchangeShortName?: string;
}

interface FmpQuoteItem {
  symbol?: string;
  price?: number;
  timestamp?: number;
  name?: string;
  open?: number;
  previousClose?: number;
  change?: number;
  changesPercentage?: number;
  dayLow?: number;
  dayHigh?: number;
  yearHigh?: number;
  yearLow?: number;
  volume?: number;
  avgVolume?: number;
  exchange?: string;
}

interface FmpHistoryItem {
  date?: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  adjClose?: number;
  volume?: number;
}

interface FmpHistoryResponse {
  symbol?: string;
  historical?: FmpHistoryItem[];
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
    const url = `${FMP_BASE_URL}/api/v3/search?query=${encodeURIComponent(query)}&apikey=${apiKey}`;

    const response = await this.fetchWithErrorHandling(url);
    const data: unknown = await response.json();

    if (!Array.isArray(data)) {
      throw new ProviderError('Unexpected response shape from FMP search', 'PARSE_ERROR', this.name);
    }

    return (data as FmpSearchItem[]).map((item) => ({
      symbol: item.symbol ?? '',
      name: item.name ?? '',
      type: 'STOCK',
      exchange: item.exchangeShortName ?? item.stockExchange ?? '',
      providerSymbol: item.symbol ?? '',
    }));
  }

  async getQuote(symbol: string): Promise<Quote> {
    const apiKey = getApiKey();
    const url = `${FMP_BASE_URL}/api/v3/quote/${encodeURIComponent(symbol)}?apikey=${apiKey}`;

    const response = await this.fetchWithErrorHandling(url);
    const data: unknown = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      throw new ProviderError(`No quote data for symbol: ${symbol}`, 'NOT_FOUND', this.name);
    }

    const item = data[0] as FmpQuoteItem;

    if (item.price === undefined || item.price === null) {
      throw new ProviderError(`Missing price in FMP quote response for: ${symbol}`, 'PARSE_ERROR', this.name);
    }

    return {
      symbol: item.symbol ?? symbol,
      price: toDecimal(String(item.price)),
      asOf: item.timestamp ? new Date(item.timestamp * 1000) : new Date(),
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
    const startStr = formatDate(start);
    const endStr = formatDate(end);
    const url = `${FMP_BASE_URL}/api/v3/historical-price-full/${encodeURIComponent(symbol)}?from=${startStr}&to=${endStr}&apikey=${apiKey}`;

    const response = await this.fetchWithErrorHandling(url);
    const data: unknown = await response.json();

    const historyResponse = data as FmpHistoryResponse;
    if (!historyResponse.historical || !Array.isArray(historyResponse.historical)) {
      throw new ProviderError(`No history data for symbol: ${symbol}`, 'NOT_FOUND', this.name);
    }

    return historyResponse.historical.map((item) => ({
      id: 0, // Will be assigned by database on insert
      instrumentId: '', // Caller must set this
      provider: this.name,
      resolution: '1D' as Resolution,
      date: item.date ?? '',
      time: null,
      open: toDecimal(String(item.open ?? 0)),
      high: toDecimal(String(item.high ?? 0)),
      low: toDecimal(String(item.low ?? 0)),
      close: toDecimal(String(item.close ?? 0)),
      volume: item.volume ?? null,
    }));
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

function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
