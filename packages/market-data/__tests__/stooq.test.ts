import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StooqProvider, parseStooqCsv } from '../src/providers/stooq.js';
import { NotSupportedError, ProviderError } from '../src/types.js';
import { readFileSync } from 'fs';
import { join } from 'path';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const fixturesDir = join(import.meta.dirname, 'fixtures');

function textResponse(text: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: () => Promise.resolve(text),
    json: () => Promise.resolve({}),
  } as Response;
}

describe('StooqProvider', () => {
  let provider: StooqProvider;

  beforeEach(() => {
    provider = new StooqProvider();
    mockFetch.mockReset();
  });

  describe('searchSymbols', () => {
    it('throws NotSupportedError', async () => {
      await expect(provider.searchSymbols('AAPL')).rejects.toThrow(NotSupportedError);
    });
  });

  describe('getQuote', () => {
    it('throws NotSupportedError', async () => {
      await expect(provider.getQuote('AAPL')).rejects.toThrow(NotSupportedError);
    });
  });

  describe('getHistory', () => {
    it('parses CSV into PriceBar array', async () => {
      const csv = readFileSync(join(fixturesDir, 'stooq-history.csv'), 'utf-8');
      mockFetch.mockResolvedValueOnce(textResponse(csv));

      const bars = await provider.getHistory(
        'aapl.us',
        new Date('2025-01-01'),
        new Date('2025-01-31'),
        '1D'
      );

      expect(bars).toHaveLength(2);
      expect(bars[0]?.date).toBe('2025-01-02');
      expect(bars[0]?.open.toString()).toBe('182.09');
      // Decimal.js drops trailing zeros: 184.50 -> '184.5'
      expect(bars[0]?.high.toString()).toBe('184.5');
      expect(bars[0]?.low.toString()).toBe('181.44');
      expect(bars[0]?.close.toString()).toBe('183.66');
      expect(bars[0]?.volume).toBe(52134200);
      expect(bars[1]?.date).toBe('2025-01-03');
      expect(bars[1]?.close.toString()).toBe('185.92');
    });

    it('returns empty array for empty CSV (header only)', async () => {
      const csv = readFileSync(join(fixturesDir, 'stooq-empty.csv'), 'utf-8');
      mockFetch.mockResolvedValueOnce(textResponse(csv));

      const bars = await provider.getHistory(
        'aapl.us',
        new Date('2025-01-01'),
        new Date('2025-01-31'),
        '1D'
      );

      expect(bars).toHaveLength(0);
    });

    it('throws NETWORK_ERROR on fetch failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      try {
        await provider.getHistory('aapl.us', new Date('2025-01-01'), new Date('2025-01-31'), '1D');
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
        await provider.getHistory('aapl.us', new Date('2025-01-01'), new Date('2025-01-31'), '1D');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).type).toBe('RATE_LIMITED');
      }
    });
  });

  describe('getLimits', () => {
    it('returns default limits (no API key needed)', () => {
      const limits = provider.getLimits();
      expect(limits.requestsPerMinute).toBe(10);
      expect(limits.requestsPerDay).toBe(1000);
    });
  });
});

describe('parseStooqCsv', () => {
  it('parses valid CSV with trailing newline', () => {
    const csv = 'Date,Open,High,Low,Close,Volume\n2025-01-02,182.09,184.50,181.44,183.66,52134200\n';
    const bars = parseStooqCsv(csv, 'stooq');

    expect(bars).toHaveLength(1);
    expect(bars[0]?.date).toBe('2025-01-02');
    expect(bars[0]?.close.toString()).toBe('183.66');
  });

  it('returns empty for header-only CSV', () => {
    const csv = 'Date,Open,High,Low,Close,Volume\n';
    const bars = parseStooqCsv(csv, 'stooq');
    expect(bars).toHaveLength(0);
  });

  it('returns empty for single-line response', () => {
    const csv = 'Date,Open,High,Low,Close,Volume';
    const bars = parseStooqCsv(csv, 'stooq');
    expect(bars).toHaveLength(0);
  });

  it('throws PARSE_ERROR for invalid header', () => {
    const csv = 'Bad,Header,Format\n1,2,3\n';
    expect(() => parseStooqCsv(csv, 'stooq')).toThrow(ProviderError);
  });

  it('throws PARSE_ERROR for line with too few fields', () => {
    const csv = 'Date,Open,High,Low,Close,Volume\n2025-01-02,182.09,184.50\n';
    expect(() => parseStooqCsv(csv, 'stooq')).toThrow(ProviderError);
  });

  it('handles rows without volume column', () => {
    const csv = 'Date,Open,High,Low,Close\n2025-01-02,182.09,184.50,181.44,183.66\n';
    const bars = parseStooqCsv(csv, 'stooq');
    expect(bars).toHaveLength(1);
    expect(bars[0]?.volume).toBeNull();
  });
});
