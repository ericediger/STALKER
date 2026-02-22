import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Instrument, Quote } from '@stalker/shared';
import { Decimal } from '@stalker/shared';
import { Poller } from '../src/poller.js';
import type { MarketDataServiceLike, InstrumentFetcher } from '../src/poller.js';

// Mock isMarketOpen from @stalker/market-data
vi.mock('@stalker/market-data', () => ({
  isMarketOpen: vi.fn(),
}));

import { isMarketOpen } from '@stalker/market-data';
const mockIsMarketOpen = vi.mocked(isMarketOpen);

function createMockInstrument(symbol: string, exchange: string = 'NYSE'): Instrument {
  return {
    id: `inst-${symbol}`,
    symbol,
    name: `${symbol} Inc`,
    type: 'STOCK',
    currency: 'USD',
    exchange,
    exchangeTz: 'America/New_York',
    providerSymbolMap: {},
    firstBarDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createMockQuote(symbol: string): Quote {
  return {
    symbol,
    price: new Decimal('150.00'),
    asOf: new Date(),
    provider: 'fmp',
  };
}

describe('Poller', () => {
  let mockService: MarketDataServiceLike;
  let instruments: Instrument[];
  let fetchInstruments: InstrumentFetcher;

  beforeEach(() => {
    vi.useFakeTimers();
    mockIsMarketOpen.mockReset();

    instruments = [
      createMockInstrument('AAPL'),
      createMockInstrument('GOOG'),
      createMockInstrument('MSFT'),
    ];

    mockService = {
      getQuote: vi.fn().mockImplementation((inst: Instrument) =>
        Promise.resolve(createMockQuote(inst.symbol)),
      ),
    };

    fetchInstruments = vi.fn().mockResolvedValue(instruments);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should poll instruments when market is open', async () => {
    mockIsMarketOpen.mockReturnValue(true);

    const poller = new Poller({
      fetchInstruments,
      marketDataService: mockService,
      pollIntervalMs: 5000,
      postCloseDelayMs: 1000,
    });

    // Start the poller (runs asynchronously)
    const pollerPromise = poller.start();

    // Allow the first poll cycle to execute
    await vi.advanceTimersByTimeAsync(0);

    // Verify getQuote was called for all 3 instruments
    expect(mockService.getQuote).toHaveBeenCalledTimes(3);
    expect(mockService.getQuote).toHaveBeenCalledWith(instruments[0]);
    expect(mockService.getQuote).toHaveBeenCalledWith(instruments[1]);
    expect(mockService.getQuote).toHaveBeenCalledWith(instruments[2]);

    // Stop the poller
    poller.stop();
    await vi.advanceTimersByTimeAsync(0);
    await pollerPromise;
  });

  it('should not poll instruments when market is closed', async () => {
    mockIsMarketOpen.mockReturnValue(false);

    const poller = new Poller({
      fetchInstruments,
      marketDataService: mockService,
      pollIntervalMs: 5000,
      postCloseDelayMs: 1000,
    });

    const pollerPromise = poller.start();

    // Allow the cycle to execute
    await vi.advanceTimersByTimeAsync(0);

    // getQuote should NOT have been called
    expect(mockService.getQuote).not.toHaveBeenCalled();

    poller.stop();
    await vi.advanceTimersByTimeAsync(0);
    await pollerPromise;
  });

  it('should trigger post-close fetch when market transitions from open to closed', async () => {
    // First cycle: market is open
    let callCount = 0;
    mockIsMarketOpen.mockImplementation(() => {
      callCount++;
      // Open for first 3 calls (initial poll), closed for the rest
      return callCount <= 3;
    });

    const poller = new Poller({
      fetchInstruments,
      marketDataService: mockService,
      pollIntervalMs: 5000,
      postCloseDelayMs: 2000,
    });

    const pollerPromise = poller.start();

    // First cycle: market open, should poll
    await vi.advanceTimersByTimeAsync(0);
    expect(mockService.getQuote).toHaveBeenCalledTimes(3);

    // Advance past the poll interval to trigger next cycle
    vi.mocked(mockService.getQuote).mockClear();
    await vi.advanceTimersByTimeAsync(5000);

    // Second cycle: market closed after being open = post-close fetch
    // Advance past the post-close delay
    await vi.advanceTimersByTimeAsync(2000);

    // Post-close fetch should have polled all instruments
    expect(mockService.getQuote).toHaveBeenCalledTimes(3);

    poller.stop();
    await vi.advanceTimersByTimeAsync(0);
    await pollerPromise;
  });

  it('should set shutdownRequested on stop()', () => {
    const poller = new Poller({
      fetchInstruments,
      marketDataService: mockService,
      pollIntervalMs: 5000,
      postCloseDelayMs: 1000,
    });

    expect(poller.getShutdownRequested()).toBe(false);
    poller.stop();
    expect(poller.getShutdownRequested()).toBe(true);
  });

  it('should handle empty instrument list', async () => {
    const emptyFetcher: InstrumentFetcher = vi.fn().mockResolvedValue([]);

    const poller = new Poller({
      fetchInstruments: emptyFetcher,
      marketDataService: mockService,
      pollIntervalMs: 5000,
      postCloseDelayMs: 1000,
    });

    const pollerPromise = poller.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(mockService.getQuote).not.toHaveBeenCalled();

    poller.stop();
    await vi.advanceTimersByTimeAsync(0);
    await pollerPromise;
  });

  it('should continue polling after a getQuote failure', async () => {
    mockIsMarketOpen.mockReturnValue(true);

    // First call fails, rest succeed
    let callIndex = 0;
    vi.mocked(mockService.getQuote).mockImplementation((inst: Instrument) => {
      callIndex++;
      if (callIndex === 1) {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve(createMockQuote(inst.symbol));
    });

    const poller = new Poller({
      fetchInstruments,
      marketDataService: mockService,
      pollIntervalMs: 5000,
      postCloseDelayMs: 1000,
    });

    const pollerPromise = poller.start();
    await vi.advanceTimersByTimeAsync(0);

    // All 3 instruments should have been attempted
    expect(mockService.getQuote).toHaveBeenCalledTimes(3);

    poller.stop();
    await vi.advanceTimersByTimeAsync(0);
    await pollerPromise;
  });

  it('should only poll instruments whose market is open', async () => {
    const mixedInstruments = [
      createMockInstrument('AAPL', 'NYSE'),
      createMockInstrument('BARC', 'LSE'),
    ];
    const mixedFetcher: InstrumentFetcher = vi.fn().mockResolvedValue(mixedInstruments);

    // NYSE open, LSE closed
    mockIsMarketOpen.mockImplementation((_now: Date, exchange: string) => {
      return exchange === 'NYSE';
    });

    const poller = new Poller({
      fetchInstruments: mixedFetcher,
      marketDataService: mockService,
      pollIntervalMs: 5000,
      postCloseDelayMs: 1000,
    });

    const pollerPromise = poller.start();
    await vi.advanceTimersByTimeAsync(0);

    // Only the NYSE instrument should be polled
    expect(mockService.getQuote).toHaveBeenCalledTimes(1);
    expect(mockService.getQuote).toHaveBeenCalledWith(mixedInstruments[0]);

    poller.stop();
    await vi.advanceTimersByTimeAsync(0);
    await pollerPromise;
  });

  it('should stop immediately on stop() even during sleep', async () => {
    mockIsMarketOpen.mockReturnValue(false);

    const poller = new Poller({
      fetchInstruments,
      marketDataService: mockService,
      pollIntervalMs: 60000, // 1 minute
      postCloseDelayMs: 1000,
    });

    const pollerPromise = poller.start();
    await vi.advanceTimersByTimeAsync(0);

    // Poller is now sleeping for 60 seconds
    expect(poller.getIsRunning()).toBe(true);

    // Stop should interrupt immediately
    poller.stop();
    await vi.advanceTimersByTimeAsync(0);
    await pollerPromise;

    expect(poller.getIsRunning()).toBe(false);
  });

  it('should not start if already running', async () => {
    mockIsMarketOpen.mockReturnValue(false);
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const poller = new Poller({
      fetchInstruments,
      marketDataService: mockService,
      pollIntervalMs: 5000,
      postCloseDelayMs: 1000,
    });

    const pollerPromise = poller.start();
    await vi.advanceTimersByTimeAsync(0);

    // Try to start again while running
    await poller.start();
    expect(consoleSpy).toHaveBeenCalledWith('[scheduler] Poller already running');

    poller.stop();
    await vi.advanceTimersByTimeAsync(0);
    await pollerPromise;

    consoleSpy.mockRestore();
  });

  it('should poll again after the configured interval', async () => {
    mockIsMarketOpen.mockReturnValue(true);

    const poller = new Poller({
      fetchInstruments,
      marketDataService: mockService,
      pollIntervalMs: 10000,
      postCloseDelayMs: 1000,
    });

    const pollerPromise = poller.start();

    // First cycle
    await vi.advanceTimersByTimeAsync(0);
    expect(mockService.getQuote).toHaveBeenCalledTimes(3);

    // Advance through poll interval
    await vi.advanceTimersByTimeAsync(10000);

    // Second cycle should have executed
    expect(mockService.getQuote).toHaveBeenCalledTimes(6);

    poller.stop();
    await vi.advanceTimersByTimeAsync(0);
    await pollerPromise;
  });
});
