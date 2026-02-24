import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TiingoProvider } from '../src/providers/tiingo.js';
import { ProviderError } from '../src/types.js';
import tiingoHistoryFixture from './fixtures/tiingo-history.json';
import tiingoBrkBFixture from './fixtures/tiingo-brk-b.json';

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

function textResponse(text: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: () => Promise.resolve(text),
    json: () => Promise.reject(new Error('Not JSON')),
  } as Response;
}

describe('TiingoProvider', () => {
  let provider: TiingoProvider;

  beforeEach(() => {
    vi.stubEnv('TIINGO_API_KEY', 'test-tiingo-key');
    provider = new TiingoProvider();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('searchSymbols', () => {
    it('returns empty array (Tiingo has no search)', async () => {
      const results = await provider.searchSymbols('AAPL');
      expect(results).toEqual([]);
    });
  });

  describe('getHistory', () => {
    it('returns correct bar count with adjusted prices', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(tiingoHistoryFixture));

      const bars = await provider.getHistory(
        'VTI',
        new Date('2025-01-01'),
        new Date('2025-01-31'),
        '1D'
      );

      expect(bars).toHaveLength(3);
      expect(bars[0]?.provider).toBe('tiingo');
      expect(bars[0]?.resolution).toBe('1D');
    });

    it('extracts YYYY-MM-DD date from ISO string', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(tiingoHistoryFixture));

      const bars = await provider.getHistory(
        'VTI',
        new Date('2025-01-01'),
        new Date('2025-01-31'),
        '1D'
      );

      expect(bars[0]?.date).toBe('2025-01-02');
      expect(bars[1]?.date).toBe('2025-01-03');
      expect(bars[2]?.date).toBe('2025-01-06');
    });

    it('uses adjusted prices (adjClose, adjOpen, adjHigh, adjLow)', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(tiingoHistoryFixture));

      const bars = await provider.getHistory(
        'VTI',
        new Date('2025-01-01'),
        new Date('2025-01-31'),
        '1D'
      );

      // adjClose for first bar: 285.7787708514
      expect(bars[0]?.close.toString()).toBe('285.7787708514');
      // adjOpen for first bar: 287.9424143146
      expect(bars[0]?.open.toString()).toBe('287.9424143146');
      // adjHigh for first bar: 289.0242360462
      expect(bars[0]?.high.toString()).toBe('289.0242360462');
      // adjLow for first bar: 283.8868177774
      expect(bars[0]?.low.toString()).toBe('283.8868177774');
    });

    it('preserves high-precision Decimal values', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(tiingoHistoryFixture));

      const bars = await provider.getHistory(
        'VTI',
        new Date('2025-01-01'),
        new Date('2025-01-31'),
        '1D'
      );

      // Verify 10 decimal places are preserved from adjClose
      const closeStr = bars[0]?.close.toString();
      expect(closeStr).toBe('285.7787708514');
      expect(closeStr?.split('.')[1]?.length).toBe(10);
    });

    it('handles BRK-B symbol correctly', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(tiingoBrkBFixture));

      const bars = await provider.getHistory(
        'BRK-B',
        new Date('2025-01-01'),
        new Date('2025-01-10'),
        '1D'
      );

      expect(bars).toHaveLength(2);
      expect(bars[0]?.date).toBe('2025-01-02');
      // BRK-B adjClose = raw close (splitFactor=1.0)
      expect(bars[0]?.close.toString()).toBe('451.1');
    });

    it('uses correct URL with /tiingo/daily/ path', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      await provider.getHistory(
        'VTI',
        new Date('2025-01-01'),
        new Date('2025-01-31'),
        '1D'
      );

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('/tiingo/daily/VTI/prices');
      expect(calledUrl).toContain('startDate=2025-01-01');
      expect(calledUrl).toContain('endDate=2025-01-31');
      expect(calledUrl).toContain('token=test-tiingo-key');
    });

    it('throws ProviderError for non-JSON response (rate limit)', async () => {
      mockFetch.mockResolvedValueOnce(
        textResponse('Rate limit exceeded. Please try again later.')
      );

      try {
        await provider.getHistory('VTI', new Date('2025-01-01'), new Date('2025-01-31'), '1D');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).message).toContain('Tiingo error');
        expect((error as ProviderError).message).toContain('Rate limit exceeded');
      }
    });

    it('throws PARSE_ERROR for non-array JSON response', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'invalid' }));

      try {
        await provider.getHistory('VTI', new Date('2025-01-01'), new Date('2025-01-31'), '1D');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).type).toBe('PARSE_ERROR');
      }
    });

    it('throws NETWORK_ERROR on fetch failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      try {
        await provider.getHistory('VTI', new Date('2025-01-01'), new Date('2025-01-31'), '1D');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).type).toBe('NETWORK_ERROR');
      }
    });

    it('throws RATE_LIMITED on HTTP 429', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: () => Promise.resolve(''),
      } as Response);

      try {
        await provider.getHistory('VTI', new Date('2025-01-01'), new Date('2025-01-31'), '1D');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).type).toBe('RATE_LIMITED');
      }
    });

    it('throws NOT_FOUND on HTTP 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve(''),
      } as Response);

      try {
        await provider.getHistory('NONEXIST', new Date('2025-01-01'), new Date('2025-01-31'), '1D');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).type).toBe('NOT_FOUND');
      }
    });

    it('returns volume from adjVolume', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(tiingoHistoryFixture));

      const bars = await provider.getHistory(
        'VTI',
        new Date('2025-01-01'),
        new Date('2025-01-31'),
        '1D'
      );

      expect(bars[0]?.volume).toBe(3799816);
    });
  });

  describe('getQuote', () => {
    it('returns quote from IEX endpoint', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([{
        ticker: 'VTI',
        tngoLast: 336.46,
        last: 336.00,
        lastSaleTimestamp: '2026-02-23T21:00:00+00:00',
        timestamp: '2026-02-23T21:00:00+00:00',
        prevClose: 340.27,
      }]));

      const quote = await provider.getQuote('VTI');

      expect(quote.symbol).toBe('VTI');
      expect(quote.price.toString()).toBe('336.46');
      expect(quote.provider).toBe('tiingo');
    });

    it('throws NOT_FOUND for empty array', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      try {
        await provider.getQuote('NONEXIST');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).type).toBe('NOT_FOUND');
      }
    });

    it('uses /iex/ endpoint URL', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([{
        ticker: 'VTI',
        tngoLast: 336.46,
      }]));

      await provider.getQuote('VTI');

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('/iex/VTI');
      expect(calledUrl).toContain('token=test-tiingo-key');
    });
  });

  describe('getLimits', () => {
    it('returns default limits with per-hour bucket', () => {
      const limits = provider.getLimits();
      expect(limits.requestsPerMinute).toBe(10);
      expect(limits.requestsPerHour).toBe(50);
      expect(limits.requestsPerDay).toBe(1000);
    });

    it('reads per-hour limit from environment', () => {
      vi.stubEnv('TIINGO_RPH', '25');
      vi.stubEnv('TIINGO_RPD', '500');

      const limits = provider.getLimits();
      expect(limits.requestsPerHour).toBe(25);
      expect(limits.requestsPerDay).toBe(500);
    });
  });

  describe('API key', () => {
    it('throws when TIINGO_API_KEY is not set', async () => {
      vi.stubEnv('TIINGO_API_KEY', '');

      await expect(provider.getQuote('VTI')).rejects.toThrow();
    });
  });
});
