import { toDecimal } from '@stalker/shared';
import type { MarketDataProvider, Quote, SymbolSearchResult, ProviderLimits, PriceBar, Resolution } from '../types.js';
import { ProviderError, NotSupportedError } from '../types.js';
import { fetchWithTimeout } from '../fetch-with-timeout.js';

const STOOQ_BASE_URL = 'https://stooq.com';

export class StooqProvider implements MarketDataProvider {
  readonly name = 'stooq';

  async searchSymbols(_query: string): Promise<SymbolSearchResult[]> {
    throw new NotSupportedError(this.name, 'searchSymbols');
  }

  async getQuote(_symbol: string): Promise<Quote> {
    throw new NotSupportedError(this.name, 'getQuote');
  }

  async getHistory(
    symbol: string,
    start: Date,
    end: Date,
    _resolution: Resolution
  ): Promise<PriceBar[]> {
    const d1 = formatStooqDate(start);
    const d2 = formatStooqDate(end);
    const url = `${STOOQ_BASE_URL}/q/d/l/?s=${encodeURIComponent(symbol)}&d1=${d1}&d2=${d2}&i=d`;

    let response: Response;
    try {
      response = await fetchWithTimeout(url);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown network error';
      throw new ProviderError(`Network error: ${message}`, 'NETWORK_ERROR', this.name);
    }

    if (response.status === 429) {
      throw new ProviderError('Stooq rate limit exceeded', 'RATE_LIMITED', this.name);
    }

    if (!response.ok) {
      throw new ProviderError(
        `Stooq HTTP ${response.status}: ${response.statusText}`,
        'UNKNOWN',
        this.name
      );
    }

    const text = await response.text();
    return parseStooqCsv(text, this.name);
  }

  getLimits(): ProviderLimits {
    return {
      requestsPerMinute: 10,
      requestsPerDay: 1000,
      supportsIntraday: false,
      quoteDelayMinutes: 0,
    };
  }
}

/**
 * Format date as YYYYMMDD for Stooq URL parameters.
 */
function formatStooqDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Parse Stooq CSV response into PriceBar array.
 * Expected format:
 *   Date,Open,High,Low,Close,Volume
 *   2025-01-02,185.52,186.74,183.09,185.15,46234500
 */
export function parseStooqCsv(csv: string, provider: string): PriceBar[] {
  const lines = csv.trim().split('\n');

  // Need at least a header row
  if (lines.length < 2) {
    return [];
  }

  // Validate header
  const header = lines[0];
  if (header === undefined || !header.toLowerCase().startsWith('date')) {
    throw new ProviderError('Unexpected Stooq CSV format: invalid header', 'PARSE_ERROR', provider);
  }

  const bars: PriceBar[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || line.trim() === '') {
      continue;
    }

    const parts = line.split(',');
    if (parts.length < 5) {
      throw new ProviderError(
        `Unexpected Stooq CSV format: line ${i + 1} has ${parts.length} fields`,
        'PARSE_ERROR',
        provider
      );
    }

    const date = parts[0];
    const open = parts[1];
    const high = parts[2];
    const low = parts[3];
    const close = parts[4];
    const volumeStr = parts[5];

    if (date === undefined || open === undefined || high === undefined || low === undefined || close === undefined) {
      throw new ProviderError(
        `Unexpected Stooq CSV format: missing values on line ${i + 1}`,
        'PARSE_ERROR',
        provider
      );
    }

    bars.push({
      id: 0, // Will be assigned by database on insert
      instrumentId: '', // Caller must set this
      provider,
      resolution: '1D' as Resolution,
      date: date.trim(),
      time: null,
      open: toDecimal(open.trim()),
      high: toDecimal(high.trim()),
      low: toDecimal(low.trim()),
      close: toDecimal(close.trim()),
      volume: volumeStr !== undefined && volumeStr.trim() !== '' ? parseInt(volumeStr.trim(), 10) : null,
    });
  }

  return bars;
}
