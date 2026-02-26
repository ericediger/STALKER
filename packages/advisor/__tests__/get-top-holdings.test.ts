import { describe, it, expect, vi } from 'vitest';
import { createGetTopHoldingsExecutor } from '../src/tools/get-top-holdings.js';

describe('createGetTopHoldingsExecutor', () => {
  it('defaults count to 10 and sortBy to allocation', async () => {
    const fetchTopHoldings = vi.fn().mockResolvedValue({ holdings: [] });
    const executor = createGetTopHoldingsExecutor({ fetchTopHoldings });

    await executor({});

    expect(fetchTopHoldings).toHaveBeenCalledWith(10, 'allocation');
  });

  it('passes count and sortBy when provided', async () => {
    const fetchTopHoldings = vi.fn().mockResolvedValue({ holdings: [] });
    const executor = createGetTopHoldingsExecutor({ fetchTopHoldings });

    await executor({ count: 5, sortBy: 'value' });

    expect(fetchTopHoldings).toHaveBeenCalledWith(5, 'value');
  });

  it('caps count at 20 even if higher requested', async () => {
    const fetchTopHoldings = vi.fn().mockResolvedValue({ holdings: [] });
    const executor = createGetTopHoldingsExecutor({ fetchTopHoldings });

    await executor({ count: 50 });

    expect(fetchTopHoldings).toHaveBeenCalledWith(20, 'allocation');
  });

  it('clamps count to at least 1', async () => {
    const fetchTopHoldings = vi.fn().mockResolvedValue({ holdings: [] });
    const executor = createGetTopHoldingsExecutor({ fetchTopHoldings });

    await executor({ count: 0 });

    expect(fetchTopHoldings).toHaveBeenCalledWith(1, 'allocation');
  });

  it('returns the result from fetchTopHoldings', async () => {
    const mockData = { summary: 'Portfolio: 83 holdings', holdings: [{ symbol: 'VTI' }] };
    const fetchTopHoldings = vi.fn().mockResolvedValue(mockData);
    const executor = createGetTopHoldingsExecutor({ fetchTopHoldings });

    const result = await executor({ count: 5, sortBy: 'pnl' });

    expect(result).toBe(mockData);
  });
});
