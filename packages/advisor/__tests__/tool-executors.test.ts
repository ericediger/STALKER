import { describe, it, expect, vi } from 'vitest';
import {
  createGetPortfolioSnapshotExecutor,
  createGetHoldingExecutor,
  createGetTransactionsExecutor,
  createGetQuotesExecutor,
} from '../src/tools/index.js';

describe('createGetPortfolioSnapshotExecutor', () => {
  it('passes window argument to fetchSnapshot', async () => {
    const fetchSnapshot = vi.fn().mockResolvedValue({ totalValue: '$10,000' });
    const executor = createGetPortfolioSnapshotExecutor({ fetchSnapshot });

    await executor({ window: '1M' });

    expect(fetchSnapshot).toHaveBeenCalledWith('1M');
  });

  it('defaults window to ALL when not provided', async () => {
    const fetchSnapshot = vi.fn().mockResolvedValue({ totalValue: '$10,000' });
    const executor = createGetPortfolioSnapshotExecutor({ fetchSnapshot });

    await executor({});

    expect(fetchSnapshot).toHaveBeenCalledWith('ALL');
  });

  it('returns the result from fetchSnapshot', async () => {
    const mockData = { totalValue: '$50,000', holdings: [] };
    const fetchSnapshot = vi.fn().mockResolvedValue(mockData);
    const executor = createGetPortfolioSnapshotExecutor({ fetchSnapshot });

    const result = await executor({ window: '1Y' });

    expect(result).toBe(mockData);
  });
});

describe('createGetHoldingExecutor', () => {
  it('passes uppercased symbol to fetchHolding', async () => {
    const fetchHolding = vi.fn().mockResolvedValue({ symbol: 'AAPL' });
    const executor = createGetHoldingExecutor({ fetchHolding });

    await executor({ symbol: 'aapl' });

    expect(fetchHolding).toHaveBeenCalledWith('AAPL');
  });

  it('returns error when symbol is missing', async () => {
    const fetchHolding = vi.fn();
    const executor = createGetHoldingExecutor({ fetchHolding });

    const result = await executor({});

    expect(result).toEqual({ error: 'symbol parameter is required' });
    expect(fetchHolding).not.toHaveBeenCalled();
  });

  it('returns the result from fetchHolding', async () => {
    const mockData = { symbol: 'VTI', totalShares: '100' };
    const fetchHolding = vi.fn().mockResolvedValue(mockData);
    const executor = createGetHoldingExecutor({ fetchHolding });

    const result = await executor({ symbol: 'VTI' });

    expect(result).toBe(mockData);
  });
});

describe('createGetTransactionsExecutor', () => {
  it('passes all filter arguments through', async () => {
    const fetchTransactions = vi.fn().mockResolvedValue({ transactions: [] });
    const executor = createGetTransactionsExecutor({ fetchTransactions });

    await executor({
      symbol: 'AAPL',
      startDate: '2026-01-01',
      endDate: '2026-02-01',
      type: 'BUY',
    });

    expect(fetchTransactions).toHaveBeenCalledWith({
      symbol: 'AAPL',
      startDate: '2026-01-01',
      endDate: '2026-02-01',
      type: 'BUY',
    });
  });

  it('passes undefined for omitted filters', async () => {
    const fetchTransactions = vi.fn().mockResolvedValue({ transactions: [] });
    const executor = createGetTransactionsExecutor({ fetchTransactions });

    await executor({});

    expect(fetchTransactions).toHaveBeenCalledWith({
      symbol: undefined,
      startDate: undefined,
      endDate: undefined,
      type: undefined,
    });
  });
});

describe('createGetQuotesExecutor', () => {
  it('passes uppercased symbols to fetchQuotes', async () => {
    const fetchQuotes = vi.fn().mockResolvedValue({ quotes: [] });
    const executor = createGetQuotesExecutor({ fetchQuotes });

    await executor({ symbols: ['aapl', 'vti'] });

    expect(fetchQuotes).toHaveBeenCalledWith(['AAPL', 'VTI']);
  });

  it('returns error when symbols is missing', async () => {
    const fetchQuotes = vi.fn();
    const executor = createGetQuotesExecutor({ fetchQuotes });

    const result = await executor({});

    expect(result).toEqual({
      error: 'symbols parameter is required and must be a non-empty array',
    });
    expect(fetchQuotes).not.toHaveBeenCalled();
  });

  it('returns error when symbols is empty array', async () => {
    const fetchQuotes = vi.fn();
    const executor = createGetQuotesExecutor({ fetchQuotes });

    const result = await executor({ symbols: [] });

    expect(result).toEqual({
      error: 'symbols parameter is required and must be a non-empty array',
    });
    expect(fetchQuotes).not.toHaveBeenCalled();
  });

  it('returns the result from fetchQuotes', async () => {
    const mockData = { quotes: [{ symbol: 'AAPL', price: '$185.50' }] };
    const fetchQuotes = vi.fn().mockResolvedValue(mockData);
    const executor = createGetQuotesExecutor({ fetchQuotes });

    const result = await executor({ symbols: ['AAPL'] });

    expect(result).toBe(mockData);
  });
});
