import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchWithTimeout } from '../src/fetch-with-timeout.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchWithTimeout', () => {
  it('returns response when fetch completes within timeout', async () => {
    const mockResponse = new Response('ok', { status: 200 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const result = await fetchWithTimeout('https://example.com', {}, 5000);
    expect(result.status).toBe(200);
  });

  it('rejects with AbortError when fetch exceeds timeout', async () => {
    // Make fetch hang until aborted
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_url: string | URL | Request, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }
        });
      },
    );

    await expect(fetchWithTimeout('https://example.com', {}, 50)).rejects.toThrow('aborted');
  });

  it('clears timeout after successful fetch', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));

    await fetchWithTimeout('https://example.com', {}, 5000);
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it('passes request options through to fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
    const headers = { Authorization: 'Bearer token' };

    await fetchWithTimeout('https://example.com', { headers }, 5000);

    const callArgs = fetchSpy.mock.calls[0]!;
    const passedOptions = callArgs[1] as RequestInit;
    expect(passedOptions.headers).toEqual(headers);
    expect(passedOptions.signal).toBeInstanceOf(AbortSignal);
  });
});
