import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TiingoProvider } from '../src/providers/tiingo.js';
import { ProviderError } from '../src/types.js';

/**
 * Regression tests for Tiingo HTTP 200 rate limit detection.
 *
 * Tiingo returns HTTP 200 with a plain text body (not JSON) when rate limits
 * are exceeded. The TiingoProvider's fetchJson() method must detect this
 * pattern and throw a ProviderError — NOT a JSON parse error.
 *
 * The fix exists in Session 11 (text-first parsing in fetchJson), but these
 * tests serve as a regression guard to ensure it is never broken.
 */

// Mock global fetch to avoid real network calls
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function textResponse(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    text: () => Promise.resolve(body),
    json: () => Promise.reject(new Error('Not JSON')),
    headers: new Headers(),
  } as Response;
}

function jsonResponse(data: unknown, status = 200): Response {
  const text = JSON.stringify(data);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(data),
    headers: new Headers(),
  } as Response;
}

describe('Tiingo HTTP 200 Rate Limit Regression', () => {
  let provider: TiingoProvider;

  beforeEach(() => {
    vi.stubEnv('TIINGO_API_KEY', 'test-tiingo-key');
    provider = new TiingoProvider();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('getHistory throws ProviderError (not JSON parse error) on HTTP 200 rate limit text', async () => {
    const rateLimitMessage = 'You have exceeded your hourly rate limit of 50 requests. Please wait before making more requests.';
    mockFetch.mockResolvedValueOnce(textResponse(rateLimitMessage));

    try {
      await provider.getHistory('VTI', new Date('2025-01-01'), new Date('2025-01-31'), '1D');
      expect.fail('Should have thrown a ProviderError');
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      const providerError = error as ProviderError;
      // Must NOT be classified as a JSON parse error — the text-first approach
      // should detect this as a provider-level error
      expect(providerError.message).toContain('Tiingo error');
      expect(providerError.message).toContain('exceeded');
      expect(providerError.provider).toBe('tiingo');
      // Verify the error is NOT a generic SyntaxError from JSON.parse
      expect(providerError.name).toBe('ProviderError');
    }
  });

  it('getQuote throws ProviderError (not JSON parse error) on HTTP 200 rate limit text', async () => {
    const rateLimitMessage = 'You have exceeded your hourly rate limit of 50 requests. Please wait before making more requests.';
    mockFetch.mockResolvedValueOnce(textResponse(rateLimitMessage));

    try {
      await provider.getQuote('VTI');
      expect.fail('Should have thrown a ProviderError');
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      const providerError = error as ProviderError;
      expect(providerError.message).toContain('Tiingo error');
      expect(providerError.message).toContain('exceeded');
      expect(providerError.provider).toBe('tiingo');
    }
  });

  it('handles Tiingo daily API limit exceeded message', async () => {
    const dailyLimitMessage = 'You have exceeded your daily API request limit of 1000. Please upgrade your plan or wait until tomorrow.';
    mockFetch.mockResolvedValueOnce(textResponse(dailyLimitMessage));

    try {
      await provider.getHistory('AAPL', new Date('2025-01-01'), new Date('2025-01-31'), '1D');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      const providerError = error as ProviderError;
      expect(providerError.message).toContain('Tiingo error');
      expect(providerError.message).toContain('exceeded');
    }
  });

  it('handles arbitrary non-JSON HTML error page returned with HTTP 200', async () => {
    const htmlError = '<html><body><h1>Service Temporarily Unavailable</h1></body></html>';
    mockFetch.mockResolvedValueOnce(textResponse(htmlError));

    try {
      await provider.getHistory('MSFT', new Date('2025-01-01'), new Date('2025-01-31'), '1D');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      const providerError = error as ProviderError;
      expect(providerError.message).toContain('Tiingo error');
      expect(providerError.provider).toBe('tiingo');
    }
  });

  it('truncates very long text error body to 200 chars in error message', async () => {
    const longMessage = 'A'.repeat(500);
    mockFetch.mockResolvedValueOnce(textResponse(longMessage));

    try {
      await provider.getQuote('SPY');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      const providerError = error as ProviderError;
      // The fetchJson method truncates text to 200 chars: text.substring(0, 200)
      expect(providerError.message.length).toBeLessThanOrEqual(200 + 'Tiingo error: '.length);
    }
  });

  it('still parses valid JSON responses correctly after text-first check', async () => {
    // Verify the fix doesn't break normal operation
    const validQuote = [{
      ticker: 'VTI',
      tngoLast: 336.46,
      last: 336.00,
      lastSaleTimestamp: '2026-02-23T21:00:00+00:00',
    }];
    mockFetch.mockResolvedValueOnce(jsonResponse(validQuote));

    const quote = await provider.getQuote('VTI');
    expect(quote.symbol).toBe('VTI');
    expect(quote.price.toString()).toBe('336.46');
  });
});
