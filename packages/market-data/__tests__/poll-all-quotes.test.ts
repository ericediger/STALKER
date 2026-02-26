import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarketDataService } from '../src/service.js';
import type { MarketDataProvider, Quote, Instrument, InstrumentType } from '../src/types.js';
import { toDecimal } from '@stalker/shared';

function makeInstrument(symbol: string, overrides?: Partial<Instrument>): Instrument {
  return {
    id: `inst-${symbol}`,
    symbol,
    name: symbol,
    type: 'STOCK' as InstrumentType,
    currency: 'USD',
    exchange: 'NYSE',
    exchangeTz: 'America/New_York',
    providerSymbolMap: { tiingo: symbol, fmp: symbol },
    firstBarDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeQuote(symbol: string, price: number, provider: string): Quote {
  return {
    symbol,
    price: toDecimal(String(price)),
    asOf: new Date('2026-02-25T20:00:00Z'),
    provider,
  };
}

function createMockProvider(name: string): MarketDataProvider & { getQuote: ReturnType<typeof vi.fn> } {
  return {
    name,
    searchSymbols: vi.fn().mockResolvedValue([]),
    getQuote: vi.fn().mockRejectedValue(new Error('Not found')),
    getHistory: vi.fn().mockResolvedValue([]),
    getLimits: () => ({
      requestsPerMinute: 10,
      requestsPerHour: 50,
      requestsPerDay: 1000,
      supportsIntraday: false,
      quoteDelayMinutes: 15,
    }),
  };
}

describe('MarketDataService.pollAllQuotes', () => {
  let fmpProvider: ReturnType<typeof createMockProvider>;
  let avProvider: ReturnType<typeof createMockProvider>;
  let tiingoProvider: ReturnType<typeof createMockProvider> & { getBatchQuotes: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    fmpProvider = createMockProvider('fmp');
    avProvider = createMockProvider('alpha-vantage');
    tiingoProvider = {
      ...createMockProvider('tiingo'),
      getBatchQuotes: vi.fn(),
    };
  });

  it('returns all instruments updated when Tiingo batch covers all', async () => {
    const instruments = Array.from({ length: 5 }, (_, i) =>
      makeInstrument(`SYM${i}`)
    );

    const batchQuotes = instruments.map((inst) =>
      makeQuote(inst.symbol, 100 + Math.random(), 'tiingo')
    );
    tiingoProvider.getBatchQuotes.mockResolvedValue(batchQuotes);

    const service = new MarketDataService({
      primaryProvider: fmpProvider,
      secondaryProvider: avProvider,
      historyProvider: tiingoProvider,
    });

    const result = await service.pollAllQuotes(instruments);

    expect(result.updated).toBe(5);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.source).toBe('tiingo-batch');
    // FMP should NOT have been called — Tiingo covered everything
    expect(fmpProvider.getQuote).not.toHaveBeenCalled();
    expect(avProvider.getQuote).not.toHaveBeenCalled();
  });

  it('falls back to FMP for instruments Tiingo missed', async () => {
    const instruments = [
      makeInstrument('AAPL'),
      makeInstrument('MSFT'),
      makeInstrument('MYSTERY'),
    ];

    // Tiingo returns only 2 of 3
    tiingoProvider.getBatchQuotes.mockResolvedValue([
      makeQuote('AAPL', 185.25, 'tiingo'),
      makeQuote('MSFT', 420.50, 'tiingo'),
    ]);

    // FMP can cover MYSTERY
    fmpProvider.getQuote.mockImplementation(async (symbol: string) => {
      if (symbol === 'MYSTERY') return makeQuote('MYSTERY', 50.00, 'fmp');
      throw new Error('Not found');
    });

    const service = new MarketDataService({
      primaryProvider: fmpProvider,
      secondaryProvider: avProvider,
      historyProvider: tiingoProvider,
    });

    const result = await service.pollAllQuotes(instruments);

    expect(result.updated).toBe(3);
    expect(result.failed).toBe(0);
    // FMP was called only for the one Tiingo missed
    expect(fmpProvider.getQuote).toHaveBeenCalledTimes(1);
  });

  it('falls back entirely to FMP when Tiingo batch fails', async () => {
    const instruments = [
      makeInstrument('AAPL'),
      makeInstrument('MSFT'),
    ];

    tiingoProvider.getBatchQuotes.mockRejectedValue(new Error('Network error'));

    // FMP covers both
    fmpProvider.getQuote.mockImplementation(async (symbol: string) => {
      return makeQuote(symbol, 100, 'fmp');
    });

    const service = new MarketDataService({
      primaryProvider: fmpProvider,
      secondaryProvider: avProvider,
      historyProvider: tiingoProvider,
    });

    const result = await service.pollAllQuotes(instruments);

    expect(result.updated).toBe(2);
    expect(result.failed).toBe(0);
    expect(fmpProvider.getQuote).toHaveBeenCalledTimes(2);
  });

  it('records failed instruments when all providers fail', async () => {
    const instruments = [
      makeInstrument('AAPL'),
      makeInstrument('MYSTERY'),
    ];

    // Tiingo returns only AAPL
    tiingoProvider.getBatchQuotes.mockResolvedValue([
      makeQuote('AAPL', 185.25, 'tiingo'),
    ]);

    // FMP and AV both fail for MYSTERY
    fmpProvider.getQuote.mockRejectedValue(new Error('Not found'));
    avProvider.getQuote.mockRejectedValue(new Error('Not found'));

    const service = new MarketDataService({
      primaryProvider: fmpProvider,
      secondaryProvider: avProvider,
      historyProvider: tiingoProvider,
    });

    const result = await service.pollAllQuotes(instruments);

    expect(result.updated).toBe(1);
    expect(result.failed).toBe(1);
  });

  it('returns empty result for empty instruments list', async () => {
    const service = new MarketDataService({
      primaryProvider: fmpProvider,
      secondaryProvider: avProvider,
      historyProvider: tiingoProvider,
    });

    const result = await service.pollAllQuotes([]);

    expect(result.updated).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.source).toBe('none');
    expect(tiingoProvider.getBatchQuotes).not.toHaveBeenCalled();
  });

  it('uses providerSymbolMap for Tiingo symbol mapping', async () => {
    const instruments = [
      makeInstrument('BRK.B', { providerSymbolMap: { tiingo: 'BRK-B', fmp: 'BRK.B' } }),
    ];

    // Tiingo returns with its symbol format
    tiingoProvider.getBatchQuotes.mockResolvedValue([
      makeQuote('BRK-B', 451.10, 'tiingo'),
    ]);

    const service = new MarketDataService({
      primaryProvider: fmpProvider,
      secondaryProvider: avProvider,
      historyProvider: tiingoProvider,
    });

    const result = await service.pollAllQuotes(instruments);

    expect(result.updated).toBe(1);
    // Verify getBatchQuotes was called with Tiingo symbol
    expect(tiingoProvider.getBatchQuotes).toHaveBeenCalledWith(['BRK-B']);
  });
});
