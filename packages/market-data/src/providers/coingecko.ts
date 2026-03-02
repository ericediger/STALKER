import { toDecimal } from '@stalker/shared';
import type { MarketDataProvider, Quote, SymbolSearchResult, ProviderLimits, PriceBar, Resolution } from '../types.js';
import { ProviderError } from '../types.js';
import { fetchWithTimeout } from '../fetch-with-timeout.js';

const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';

/** CoinGecko /search response shape. */
interface CoinGeckoSearchCoin {
  id?: string;
  name?: string;
  symbol?: string;
  market_cap_rank?: number | null;
}

/** CoinGecko /simple/price response shape. */
interface CoinGeckoSimplePrice {
  usd?: number;
  usd_24h_change?: number;
  last_updated_at?: number;
}

function getRpmLimit(): number {
  const val = process.env['COINGECKO_RPM'];
  return val ? parseInt(val, 10) : 100;
}

/**
 * CoinGecko provider for cryptocurrency market data.
 * Uses the free public tier (no API key required).
 * Per AD-S22-1, AD-S22-10.
 */
export class CoinGeckoProvider implements MarketDataProvider {
  readonly name = 'coingecko';

  /**
   * Search for coins by name or symbol.
   * GET /api/v3/search?query={query}
   * Returns results with type: 'CRYPTO' and providerSymbol set to CoinGecko coin ID.
   */
  async searchSymbols(query: string): Promise<SymbolSearchResult[]> {
    const url = `${COINGECKO_BASE_URL}/search?query=${encodeURIComponent(query)}`;
    const data = await this.fetchJson(url);

    const response = data as { coins?: CoinGeckoSearchCoin[] };
    if (!response.coins || !Array.isArray(response.coins)) {
      return [];
    }

    return response.coins
      .filter((coin): coin is CoinGeckoSearchCoin & { id: string; symbol: string; name: string } =>
        Boolean(coin.id && coin.symbol && coin.name),
      )
      .slice(0, 20)
      .map((coin) => ({
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        type: 'CRYPTO',
        exchange: 'CRYPTO',
        providerSymbol: coin.id,
      }));
  }

  /**
   * Get a quote for a single coin by its CoinGecko ID.
   * GET /api/v3/simple/price?ids={coinId}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true
   *
   * Note: `symbol` parameter here is actually the CoinGecko coin ID (e.g., "bitcoin"),
   * stored in instrument.providerSymbolMap['coingecko'].
   */
  async getQuote(symbol: string): Promise<Quote> {
    const coinId = symbol.toLowerCase();
    const url = `${COINGECKO_BASE_URL}/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true`;

    const data = await this.fetchJson(url);
    const response = data as Record<string, CoinGeckoSimplePrice>;
    const coinData = response[coinId];

    if (!coinData || coinData.usd === undefined || coinData.usd === null) {
      throw new ProviderError(`No quote data for coin ID: ${coinId}`, 'NOT_FOUND', this.name);
    }

    const asOf = coinData.last_updated_at
      ? new Date(coinData.last_updated_at * 1000)
      : new Date();

    return {
      symbol: coinId,
      price: toDecimal(String(coinData.usd)),
      asOf,
      provider: this.name,
    };
  }

  /**
   * Get historical price data for a coin.
   * GET /api/v3/coins/{coinId}/market_chart/range?vs_currency=usd&from={unix}&to={unix}
   *
   * CoinGecko returns [timestamp_ms, price] pairs. We aggregate to daily bars.
   * Since only close price is available (no OHLC), open=high=low=close.
   * Per AD-S22-3.
   */
  async getHistory(
    symbol: string,
    start: Date,
    end: Date,
    _resolution: Resolution,
  ): Promise<PriceBar[]> {
    const coinId = symbol.toLowerCase();
    const fromUnix = Math.floor(start.getTime() / 1000);
    const toUnix = Math.floor(end.getTime() / 1000);

    const url = `${COINGECKO_BASE_URL}/coins/${encodeURIComponent(coinId)}/market_chart/range?vs_currency=usd&from=${fromUnix}&to=${toUnix}`;

    const data = await this.fetchJson(url);
    const response = data as { prices?: [number, number][] };

    if (!response.prices || !Array.isArray(response.prices)) {
      return [];
    }

    // Group prices by date (YYYY-MM-DD) and take the last entry per day
    const dailyMap = new Map<string, number>();

    for (const [timestampMs, price] of response.prices) {
      if (typeof timestampMs !== 'number' || typeof price !== 'number') continue;
      const date = new Date(timestampMs);
      const dateStr = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
      // Keep overwriting — last price of the day wins (closest to daily close)
      dailyMap.set(dateStr, price);
    }

    const bars: PriceBar[] = [];
    for (const [dateStr, price] of dailyMap) {
      const decPrice = toDecimal(String(price));
      bars.push({
        id: 0,
        instrumentId: '',
        provider: this.name,
        resolution: '1D' as Resolution,
        date: dateStr,
        time: null,
        open: decPrice,
        high: decPrice,
        low: decPrice,
        close: decPrice,
        volume: null,
      });
    }

    // Sort by date ascending
    bars.sort((a, b) => a.date.localeCompare(b.date));
    return bars;
  }

  /**
   * Fetch quotes for multiple coins in a single batch request.
   * Uses /simple/price with comma-separated IDs (supports ~200 per call).
   * Called directly by the scheduler's crypto polling path.
   */
  async getBatchQuotes(coinIds: string[]): Promise<Quote[]> {
    if (coinIds.length === 0) return [];

    const ids = coinIds.map((id) => id.toLowerCase()).join(',');
    const url = `${COINGECKO_BASE_URL}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true`;

    const data = await this.fetchJson(url);
    const response = data as Record<string, CoinGeckoSimplePrice>;

    const quotes: Quote[] = [];
    for (const [coinId, coinData] of Object.entries(response)) {
      if (!coinData || coinData.usd === undefined || coinData.usd === null) continue;

      const asOf = coinData.last_updated_at
        ? new Date(coinData.last_updated_at * 1000)
        : new Date();

      quotes.push({
        symbol: coinId,
        price: toDecimal(String(coinData.usd)),
        asOf,
        provider: this.name,
      });
    }

    return quotes;
  }

  getLimits(): ProviderLimits {
    return {
      requestsPerMinute: getRpmLimit(),
      requestsPerDay: 100_000, // No explicit daily cap on free tier
      supportsIntraday: false,
      quoteDelayMinutes: 1,
    };
  }

  /**
   * Fetch JSON from CoinGecko with error handling.
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
      throw new ProviderError('CoinGecko rate limit exceeded', 'RATE_LIMITED', this.name);
    }

    if (response.status === 404) {
      throw new ProviderError('CoinGecko coin not found', 'NOT_FOUND', this.name);
    }

    if (!response.ok) {
      throw new ProviderError(
        `CoinGecko HTTP ${response.status}: ${response.statusText}`,
        'UNKNOWN',
        this.name,
      );
    }

    const text = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new ProviderError(
        `CoinGecko parse error: ${text.substring(0, 200)}`,
        'PARSE_ERROR',
        this.name,
      );
    }

    return data;
  }
}
