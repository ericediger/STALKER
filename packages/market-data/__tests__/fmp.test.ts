import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FmpProvider } from '../src/providers/fmp.js';
import { ProviderError } from '../src/types.js';
import fmpSearchFixture from './fixtures/fmp-search.json';
import fmpQuoteFixture from './fixtures/fmp-quote.json';
import fmpHistoryFixture from './fixtures/fmp-history.json';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response;
}

describe('FmpProvider', () => {
  let provider: FmpProvider;

  beforeEach(() => {
    vi.stubEnv('FMP_API_KEY', 'test-key-123');
    provider = new FmpProvider();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('searchSymbols', () => {
    it('returns mapped search results from FMP', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(fmpSearchFixture));

      const results = await provider.searchSymbols('AAPL');

      expect(results).toHaveLength(2);
      expect(results[0]?.symbol).toBe('AAPL');
      expect(results[0]?.name).toBe('Apple Inc.');
      expect(results[0]?.exchange).toBe('NASDAQ');
      expect(results[1]?.symbol).toBe('AAPD');
    });

    it('throws PARSE_ERROR for non-array response', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'bad' }));

      try {
        await provider.searchSymbols('AAPL');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).type).toBe('PARSE_ERROR');
      }
    });
  });

  describe('getQuote', () => {
    it('returns a quote with Decimal price', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(fmpQuoteFixture));

      const quote = await provider.getQuote('AAPL');

      expect(quote.symbol).toBe('AAPL');
      expect(quote.price.toString()).toBe('185.92');
      expect(quote.provider).toBe('fmp');
    });

    it('throws NOT_FOUND for empty array response', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      try {
        await provider.getQuote('NONEXIST');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).type).toBe('NOT_FOUND');
      }
    });

    it('throws RATE_LIMITED on HTTP 429', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: () => Promise.resolve({}),
      } as Response);

      try {
        await provider.getQuote('AAPL');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).type).toBe('RATE_LIMITED');
      }
    });

    it('throws NETWORK_ERROR on fetch failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('DNS resolution failed'));

      try {
        await provider.getQuote('AAPL');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).type).toBe('NETWORK_ERROR');
        expect((error as ProviderError).message).toContain('DNS resolution failed');
      }
    });

    it('throws PARSE_ERROR when price is missing', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([{ symbol: 'AAPL' }]));

      try {
        await provider.getQuote('AAPL');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).type).toBe('PARSE_ERROR');
      }
    });
  });

  describe('getHistory', () => {
    it('returns price bars with Decimal values', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(fmpHistoryFixture));

      const bars = await provider.getHistory('AAPL', new Date('2025-01-01'), new Date('2025-01-31'), '1D');

      expect(bars).toHaveLength(2);
      expect(bars[0]?.date).toBe('2025-01-03');
      expect(bars[0]?.close.toString()).toBe('185.92');
      expect(bars[0]?.open.toString()).toBe('184.15');
      expect(bars[0]?.high.toString()).toBe('186.74');
      expect(bars[0]?.low.toString()).toBe('183.09');
      expect(bars[0]?.volume).toBe(46234500);
      expect(bars[0]?.provider).toBe('fmp');
      expect(bars[0]?.resolution).toBe('1D');
    });

    it('throws NOT_FOUND when no historical data', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ symbol: 'AAPL' }));

      await expect(
        provider.getHistory('AAPL', new Date('2025-01-01'), new Date('2025-01-31'), '1D')
      ).rejects.toThrow(ProviderError);
    });
  });

  describe('getLimits', () => {
    it('returns default limits', () => {
      const limits = provider.getLimits();
      expect(limits.requestsPerMinute).toBe(5);
      expect(limits.requestsPerDay).toBe(250);
    });

    it('reads limits from environment variables', () => {
      vi.stubEnv('FMP_RPM', '10');
      vi.stubEnv('FMP_RPD', '500');

      const limits = provider.getLimits();
      expect(limits.requestsPerMinute).toBe(10);
      expect(limits.requestsPerDay).toBe(500);
    });
  });

  describe('API key', () => {
    it('throws when FMP_API_KEY is not set', async () => {
      vi.stubEnv('FMP_API_KEY', '');

      await expect(provider.getQuote('AAPL')).rejects.toThrow();
    });
  });
});
