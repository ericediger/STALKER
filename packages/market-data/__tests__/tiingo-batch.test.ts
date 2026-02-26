import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TiingoProvider } from '../src/providers/tiingo.js';

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

describe('TiingoProvider.getBatchQuotes', () => {
  let provider: TiingoProvider;

  beforeEach(() => {
    vi.stubEnv('TIINGO_API_KEY', 'test-tiingo-key');
    provider = new TiingoProvider();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fetches batch of 5 symbols and returns 5 Quote objects with correct Decimal prices', async () => {
    const batchResponse = [
      { ticker: 'AAPL', tngoLast: 185.25, lastSaleTimestamp: '2026-02-25T20:00:00+00:00', prevClose: 184.00 },
      { ticker: 'MSFT', tngoLast: 420.50, lastSaleTimestamp: '2026-02-25T20:00:00+00:00', prevClose: 418.00 },
      { ticker: 'VTI', tngoLast: 290.75, lastSaleTimestamp: '2026-02-25T20:00:00+00:00', prevClose: 289.00 },
      { ticker: 'GOOGL', tngoLast: 175.80, lastSaleTimestamp: '2026-02-25T20:00:00+00:00', prevClose: 174.00 },
      { ticker: 'AMZN', tngoLast: 205.15, lastSaleTimestamp: '2026-02-25T20:00:00+00:00', prevClose: 204.00 },
    ];

    mockFetch.mockResolvedValueOnce(jsonResponse(batchResponse));

    const quotes = await provider.getBatchQuotes(['AAPL', 'MSFT', 'VTI', 'GOOGL', 'AMZN']);

    expect(quotes).toHaveLength(5);
    expect(quotes[0]?.symbol).toBe('AAPL');
    expect(quotes[0]?.price.toString()).toBe('185.25');
    expect(quotes[0]?.provider).toBe('tiingo');
    expect(quotes[1]?.symbol).toBe('MSFT');
    expect(quotes[1]?.price.toString()).toBe('420.5');
    expect(quotes[4]?.symbol).toBe('AMZN');
    expect(quotes[4]?.price.toString()).toBe('205.15');

    // Verify single batch URL with tickers param
    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('/iex/?tickers=AAPL,MSFT,VTI,GOOGL,AMZN');
    expect(calledUrl).toContain('token=test-tiingo-key');
  });

  it('returns partial results when some symbols are not found by Tiingo', async () => {
    // Tiingo silently omits unknown symbols from the response
    const batchResponse = [
      { ticker: 'AAPL', tngoLast: 185.25, lastSaleTimestamp: '2026-02-25T20:00:00+00:00' },
      { ticker: 'MSFT', tngoLast: 420.50, lastSaleTimestamp: '2026-02-25T20:00:00+00:00' },
      { ticker: 'VTI', tngoLast: 290.75, lastSaleTimestamp: '2026-02-25T20:00:00+00:00' },
      { ticker: 'GOOGL', tngoLast: 175.80, lastSaleTimestamp: '2026-02-25T20:00:00+00:00' },
    ];

    mockFetch.mockResolvedValueOnce(jsonResponse(batchResponse));

    const quotes = await provider.getBatchQuotes(['AAPL', 'MSFT', 'VTI', 'GOOGL', 'FAKESYM']);

    expect(quotes).toHaveLength(4);
    expect(quotes.map((q) => q.symbol)).toEqual(['AAPL', 'MSFT', 'VTI', 'GOOGL']);
  });

  it('returns empty array for empty response', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    const quotes = await provider.getBatchQuotes(['FAKESYM1', 'FAKESYM2']);

    expect(quotes).toEqual([]);
  });

  it('returns empty array when Tiingo returns HTTP 200 with text error body', async () => {
    mockFetch.mockResolvedValueOnce(
      textResponse('Rate Limit Exceeded. You have exceeded the hourly limit of 50 requests.')
    );

    const quotes = await provider.getBatchQuotes(['AAPL', 'MSFT']);

    expect(quotes).toEqual([]);
    // Should not throw — graceful degradation
  });

  it('returns empty array for empty input', async () => {
    const quotes = await provider.getBatchQuotes([]);

    expect(quotes).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('chunks symbols into batches of 50', async () => {
    // Create 75 symbols — should result in 2 fetch calls (50 + 25)
    const symbols = Array.from({ length: 75 }, (_, i) => `SYM${i}`);

    const batch1Response = Array.from({ length: 50 }, (_, i) => ({
      ticker: `SYM${i}`,
      tngoLast: 100 + i,
      lastSaleTimestamp: '2026-02-25T20:00:00+00:00',
    }));
    const batch2Response = Array.from({ length: 25 }, (_, i) => ({
      ticker: `SYM${50 + i}`,
      tngoLast: 150 + i,
      lastSaleTimestamp: '2026-02-25T20:00:00+00:00',
    }));

    mockFetch
      .mockResolvedValueOnce(jsonResponse(batch1Response))
      .mockResolvedValueOnce(jsonResponse(batch2Response));

    const quotes = await provider.getBatchQuotes(symbols);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(quotes).toHaveLength(75);

    // Verify first batch URL has 50 tickers
    const firstUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(firstUrl).toContain('SYM0');
    expect(firstUrl).toContain('SYM49');
    expect(firstUrl).not.toContain('SYM50');

    // Verify second batch URL has 25 tickers
    const secondUrl = mockFetch.mock.calls[1]?.[0] as string;
    expect(secondUrl).toContain('SYM50');
    expect(secondUrl).toContain('SYM74');
  });

  it('uses last field as fallback when tngoLast is missing', async () => {
    const batchResponse = [
      { ticker: 'AAPL', last: 185.25, lastSaleTimestamp: '2026-02-25T20:00:00+00:00' },
    ];

    mockFetch.mockResolvedValueOnce(jsonResponse(batchResponse));

    const quotes = await provider.getBatchQuotes(['AAPL']);

    expect(quotes).toHaveLength(1);
    expect(quotes[0]?.price.toString()).toBe('185.25');
  });

  it('skips items with no price', async () => {
    const batchResponse = [
      { ticker: 'AAPL', tngoLast: 185.25, lastSaleTimestamp: '2026-02-25T20:00:00+00:00' },
      { ticker: 'BADDATA' }, // No price fields
      { ticker: 'MSFT', tngoLast: 420.50, lastSaleTimestamp: '2026-02-25T20:00:00+00:00' },
    ];

    mockFetch.mockResolvedValueOnce(jsonResponse(batchResponse));

    const quotes = await provider.getBatchQuotes(['AAPL', 'BADDATA', 'MSFT']);

    expect(quotes).toHaveLength(2);
    expect(quotes[0]?.symbol).toBe('AAPL');
    expect(quotes[1]?.symbol).toBe('MSFT');
  });

  it('continues with remaining chunks when one chunk fails', async () => {
    // First chunk fails (network error), second succeeds
    mockFetch
      .mockRejectedValueOnce(new Error('Network timeout'))
      .mockResolvedValueOnce(jsonResponse([
        { ticker: 'SYM50', tngoLast: 150.00, lastSaleTimestamp: '2026-02-25T20:00:00+00:00' },
      ]));

    const symbols = Array.from({ length: 75 }, (_, i) => `SYM${i}`);
    const quotes = await provider.getBatchQuotes(symbols);

    // Only the second chunk's results returned
    expect(quotes).toHaveLength(1);
    expect(quotes[0]?.symbol).toBe('SYM50');
  });
});
