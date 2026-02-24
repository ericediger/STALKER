import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FmpProvider } from '../src/providers/fmp.js';
import { ProviderError } from '../src/types.js';
import fmpSearchFixture from './fixtures/fmp-search.json';
import fmpQuoteFixture from './fixtures/fmp-quote.json';

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
    it('returns mapped search results from FMP /stable/ API', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(fmpSearchFixture));

      const results = await provider.searchSymbols('AAPL');

      expect(results).toHaveLength(2);
      expect(results[0]?.symbol).toBe('AAPL');
      expect(results[0]?.name).toBe('Apple Inc.');
      expect(results[0]?.exchange).toBe('NASDAQ');
      expect(results[0]?.type).toBe('STOCK');
      expect(results[1]?.symbol).toBe('AAPD');
    });

    it('uses /stable/search-symbol endpoint', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(fmpSearchFixture));

      await provider.searchSymbols('AAPL');

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('/stable/search-symbol');
      expect(calledUrl).toContain('query=AAPL');
      expect(calledUrl).not.toContain('/api/v3/');
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
    it('returns a quote with Decimal price from /stable/ API', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(fmpQuoteFixture));

      const quote = await provider.getQuote('AAPL');

      expect(quote.symbol).toBe('AAPL');
      expect(quote.price.toString()).toBe('272.11');
      expect(quote.provider).toBe('fmp');
    });

    it('uses /stable/quote endpoint with symbol as query param', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(fmpQuoteFixture));

      await provider.getQuote('AAPL');

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('/stable/quote');
      expect(calledUrl).toContain('symbol=AAPL');
      expect(calledUrl).not.toContain('/api/v3/');
    });

    it('handles integer price (no decimal point) correctly', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([{
        symbol: 'TEST',
        price: 268,
        timestamp: 1771965875,
      }]));

      const quote = await provider.getQuote('TEST');
      expect(quote.price.toString()).toBe('268');
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
    it('throws because FMP free tier does not support historical data', async () => {
      await expect(
        provider.getHistory('AAPL', new Date('2025-01-01'), new Date('2025-01-31'), '1D')
      ).rejects.toThrow('FMP free tier does not support historical data');
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
