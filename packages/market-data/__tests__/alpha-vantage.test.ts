import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AlphaVantageProvider } from '../src/providers/alpha-vantage.js';
import { ProviderError } from '../src/types.js';
import avQuoteFixture from './fixtures/av-quote.json';
import avSearchFixture from './fixtures/av-search.json';
import avRateLimitedFixture from './fixtures/av-rate-limited.json';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function textResponse(data: unknown, status = 200): Response {
  const text = JSON.stringify(data);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(data),
  } as Response;
}

describe('AlphaVantageProvider', () => {
  let provider: AlphaVantageProvider;

  beforeEach(() => {
    vi.stubEnv('ALPHA_VANTAGE_API_KEY', 'test-av-key');
    provider = new AlphaVantageProvider();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('getQuote', () => {
    it('returns a quote with Decimal price', async () => {
      mockFetch.mockResolvedValueOnce(textResponse(avQuoteFixture));

      const quote = await provider.getQuote('AAPL');

      expect(quote.symbol).toBe('AAPL');
      // Decimal.js preserves the exact string: "185.9200" -> "185.92" (trailing zeros dropped)
      expect(quote.price.toString()).toBe('185.92');
      expect(quote.provider).toBe('alpha-vantage');
    });

    it('throws NOT_FOUND when Global Quote is missing', async () => {
      mockFetch.mockResolvedValueOnce(textResponse({}));

      try {
        await provider.getQuote('NONEXIST');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).type).toBe('NOT_FOUND');
      }
    });

    it('throws PARSE_ERROR when price is missing', async () => {
      mockFetch.mockResolvedValueOnce(textResponse({
        'Global Quote': { '01. symbol': 'AAPL' },
      }));

      try {
        await provider.getQuote('AAPL');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).type).toBe('PARSE_ERROR');
      }
    });

    it('detects soft rate limit (200 with "Thank you" message)', async () => {
      mockFetch.mockResolvedValueOnce(textResponse(avRateLimitedFixture));

      try {
        await provider.getQuote('AAPL');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).type).toBe('RATE_LIMITED');
        expect((error as ProviderError).message).toContain('soft limit');
      }
    });

    it('throws NETWORK_ERROR on fetch failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Timeout'));

      try {
        await provider.getQuote('AAPL');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).type).toBe('NETWORK_ERROR');
      }
    });
  });

  describe('searchSymbols', () => {
    it('returns mapped search results', async () => {
      mockFetch.mockResolvedValueOnce(textResponse(avSearchFixture));

      const results = await provider.searchSymbols('AAPL');

      expect(results).toHaveLength(2);
      expect(results[0]?.symbol).toBe('AAPL');
      expect(results[0]?.name).toBe('Apple Inc.');
      expect(results[0]?.exchange).toBe('United States');
      expect(results[1]?.symbol).toBe('AAPL.TRT');
    });

    it('throws PARSE_ERROR for unexpected response shape', async () => {
      mockFetch.mockResolvedValueOnce(textResponse({ unexpected: true }));

      try {
        await provider.searchSymbols('AAPL');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).type).toBe('PARSE_ERROR');
      }
    });

    it('detects soft rate limit in search', async () => {
      mockFetch.mockResolvedValueOnce(textResponse(avRateLimitedFixture));

      try {
        await provider.searchSymbols('AAPL');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).type).toBe('RATE_LIMITED');
      }
    });
  });

  describe('getHistory', () => {
    it('returns filtered and sorted price bars', async () => {
      const historyData = {
        'Time Series (Daily)': {
          '2025-01-03': {
            '1. open': '184.15',
            '2. high': '186.74',
            '3. low': '183.09',
            '4. close': '185.92',
            '5. volume': '46234500',
          },
          '2025-01-02': {
            '1. open': '182.09',
            '2. high': '184.50',
            '3. low': '181.44',
            '4. close': '183.66',
            '5. volume': '52134200',
          },
          '2024-12-31': {
            '1. open': '180.00',
            '2. high': '182.00',
            '3. low': '179.00',
            '4. close': '181.00',
            '5. volume': '30000000',
          },
        },
      };

      mockFetch.mockResolvedValueOnce(textResponse(historyData));

      const bars = await provider.getHistory(
        'AAPL',
        new Date('2025-01-01'),
        new Date('2025-01-31'),
        '1D'
      );

      // Should filter out 2024-12-31 (before start)
      expect(bars).toHaveLength(2);
      // Should be sorted ascending
      expect(bars[0]?.date).toBe('2025-01-02');
      expect(bars[1]?.date).toBe('2025-01-03');
      expect(bars[0]?.close.toString()).toBe('183.66');
      expect(bars[1]?.close.toString()).toBe('185.92');
    });
  });

  describe('getLimits', () => {
    it('returns default limits', () => {
      const limits = provider.getLimits();
      expect(limits.requestsPerMinute).toBe(5);
      expect(limits.requestsPerDay).toBe(25);
    });

    it('reads limits from environment variables', () => {
      vi.stubEnv('AV_RPM', '15');
      vi.stubEnv('AV_RPD', '100');

      const limits = provider.getLimits();
      expect(limits.requestsPerMinute).toBe(15);
      expect(limits.requestsPerDay).toBe(100);
    });
  });

  describe('API key', () => {
    it('throws when ALPHA_VANTAGE_API_KEY is not set', async () => {
      vi.stubEnv('ALPHA_VANTAGE_API_KEY', '');

      await expect(provider.getQuote('AAPL')).rejects.toThrow();
    });
  });
});
