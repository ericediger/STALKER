import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CoinGeckoProvider } from '../src/providers/coingecko.js';
import { ProviderError } from '../src/types.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: unknown, status = 200): Response {
  const text = JSON.stringify(data);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(data),
  } as Response;
}

describe('CoinGeckoProvider', () => {
  let provider: CoinGeckoProvider;

  beforeEach(() => {
    vi.stubEnv('COINGECKO_RPM', '100');
    provider = new CoinGeckoProvider();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('searchSymbols', () => {
    it('returns mapped results from search endpoint', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        coins: [
          { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', market_cap_rank: 1 },
          { id: 'bitcoin-cash', name: 'Bitcoin Cash', symbol: 'BCH', market_cap_rank: 14 },
        ],
      }));

      const results = await provider.searchSymbols('bitcoin');

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        symbol: 'BTC',
        name: 'Bitcoin',
        type: 'CRYPTO',
        exchange: 'CRYPTO',
        providerSymbol: 'bitcoin',
      });
      expect(results[1]).toEqual({
        symbol: 'BCH',
        name: 'Bitcoin Cash',
        type: 'CRYPTO',
        exchange: 'CRYPTO',
        providerSymbol: 'bitcoin-cash',
      });
    });

    it('returns empty array when no coins found', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ coins: [] }));

      const results = await provider.searchSymbols('zzzzz');
      expect(results).toEqual([]);
    });

    it('filters out coins with missing id or symbol', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        coins: [
          { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC' },
          { id: null, name: 'Bad', symbol: 'BAD' },
          { id: 'no-symbol', name: 'NoSym' },
        ],
      }));

      const results = await provider.searchSymbols('test');
      expect(results).toHaveLength(1);
      expect(results[0]!.symbol).toBe('BTC');
    });

    it('throws ProviderError on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(provider.searchSymbols('bitcoin')).rejects.toThrow(ProviderError);
    });

    it('limits results to 20', async () => {
      const coins = Array.from({ length: 30 }, (_, i) => ({
        id: `coin-${i}`,
        name: `Coin ${i}`,
        symbol: `C${i}`,
      }));
      mockFetch.mockResolvedValueOnce(jsonResponse({ coins }));

      const results = await provider.searchSymbols('coin');
      expect(results).toHaveLength(20);
    });
  });

  describe('getQuote', () => {
    it('returns quote with correct Decimal conversion', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        bitcoin: {
          usd: 66544.123,
          usd_24h_change: -0.438,
          last_updated_at: 1772413041,
        },
      }));

      const quote = await provider.getQuote('bitcoin');

      expect(quote.symbol).toBe('bitcoin');
      expect(quote.price.toString()).toBe('66544.123');
      expect(quote.provider).toBe('coingecko');
      expect(quote.asOf.getTime()).toBe(1772413041 * 1000);
    });

    it('throws NOT_FOUND when coin ID not in response', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));

      try {
        await provider.getQuote('nonexistent');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ProviderError);
        expect((err as ProviderError).type).toBe('NOT_FOUND');
      }
    });

    it('throws RATE_LIMITED on HTTP 429', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 429));

      try {
        await provider.getQuote('bitcoin');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ProviderError);
        expect((err as ProviderError).type).toBe('RATE_LIMITED');
      }
    });

    it('handles case-insensitive coin ID', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        ethereum: {
          usd: 1960.96,
          usd_24h_change: -0.062,
          last_updated_at: 1772413041,
        },
      }));

      const quote = await provider.getQuote('Ethereum');
      expect(quote.symbol).toBe('ethereum');
      expect(quote.price.toString()).toBe('1960.96');
    });
  });

  describe('getHistory', () => {
    it('returns daily bars aggregated from hourly data', async () => {
      // Simulate CoinGecko returning multiple prices per day
      const prices: [number, number][] = [
        [Date.UTC(2025, 0, 1, 0, 0), 65000],
        [Date.UTC(2025, 0, 1, 12, 0), 65500],
        [Date.UTC(2025, 0, 1, 23, 0), 66000],
        [Date.UTC(2025, 0, 2, 0, 0), 66100],
        [Date.UTC(2025, 0, 2, 12, 0), 66200],
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse({ prices }));

      const bars = await provider.getHistory(
        'bitcoin',
        new Date('2025-01-01'),
        new Date('2025-01-02'),
        '1D',
      );

      expect(bars).toHaveLength(2);
      // Day 1: last price of the day (66000) should win
      expect(bars[0]!.date).toBe('2025-01-01');
      expect(bars[0]!.close.toString()).toBe('66000');
      // open=high=low=close (no OHLC from CoinGecko)
      expect(bars[0]!.open.toString()).toBe('66000');
      // Day 2
      expect(bars[1]!.date).toBe('2025-01-02');
      expect(bars[1]!.close.toString()).toBe('66200');
      // Provider and resolution
      expect(bars[0]!.provider).toBe('coingecko');
      expect(bars[0]!.resolution).toBe('1D');
      expect(bars[0]!.volume).toBeNull();
    });

    it('returns empty array when no price data', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ prices: [] }));

      const bars = await provider.getHistory(
        'bitcoin',
        new Date('2025-01-01'),
        new Date('2025-01-02'),
        '1D',
      );

      expect(bars).toEqual([]);
    });

    it('returns sorted bars by date', async () => {
      // Prices in reverse order
      const prices: [number, number][] = [
        [Date.UTC(2025, 0, 3), 67000],
        [Date.UTC(2025, 0, 1), 65000],
        [Date.UTC(2025, 0, 2), 66000],
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse({ prices }));

      const bars = await provider.getHistory('bitcoin', new Date('2025-01-01'), new Date('2025-01-03'), '1D');
      expect(bars[0]!.date).toBe('2025-01-01');
      expect(bars[1]!.date).toBe('2025-01-02');
      expect(bars[2]!.date).toBe('2025-01-03');
    });

    it('handles network error gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Timeout'));

      await expect(
        provider.getHistory('bitcoin', new Date('2025-01-01'), new Date('2025-01-02'), '1D'),
      ).rejects.toThrow(ProviderError);
    });
  });

  describe('getBatchQuotes', () => {
    it('returns quotes for multiple coins in single request', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        bitcoin: { usd: 66544, usd_24h_change: -0.44, last_updated_at: 1772413041 },
        ethereum: { usd: 1960.96, usd_24h_change: -0.06, last_updated_at: 1772413041 },
        ripple: { usd: 2.05, usd_24h_change: 1.2, last_updated_at: 1772413041 },
      }));

      const quotes = await provider.getBatchQuotes(['bitcoin', 'ethereum', 'ripple']);

      expect(quotes).toHaveLength(3);
      const btc = quotes.find((q) => q.symbol === 'bitcoin');
      expect(btc).toBeDefined();
      expect(btc!.price.toString()).toBe('66544');
      expect(btc!.provider).toBe('coingecko');
    });

    it('returns empty array for empty input', async () => {
      const quotes = await provider.getBatchQuotes([]);
      expect(quotes).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('skips coins with missing price data', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        bitcoin: { usd: 66544, last_updated_at: 1772413041 },
        badcoin: { usd: null },
      }));

      const quotes = await provider.getBatchQuotes(['bitcoin', 'badcoin']);
      expect(quotes).toHaveLength(1);
      expect(quotes[0]!.symbol).toBe('bitcoin');
    });
  });

  describe('getLimits', () => {
    it('returns configured rate limits', () => {
      const limits = provider.getLimits();
      expect(limits.requestsPerMinute).toBe(100);
      expect(limits.requestsPerDay).toBe(100_000);
      expect(limits.supportsIntraday).toBe(false);
      expect(limits.quoteDelayMinutes).toBe(1);
    });
  });

  describe('error handling', () => {
    it('throws PARSE_ERROR on invalid JSON response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve('not json'),
      } as Response);

      try {
        await provider.getQuote('bitcoin');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ProviderError);
        expect((err as ProviderError).type).toBe('PARSE_ERROR');
      }
    });

    it('throws NOT_FOUND on HTTP 404', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));

      try {
        await provider.getQuote('nonexistent');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ProviderError);
        expect((err as ProviderError).type).toBe('NOT_FOUND');
      }
    });

    it('throws UNKNOWN on HTTP 500', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));

      try {
        await provider.getQuote('bitcoin');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ProviderError);
        expect((err as ProviderError).type).toBe('UNKNOWN');
      }
    });
  });
});
