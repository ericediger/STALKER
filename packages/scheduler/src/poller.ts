import type { Instrument, Quote } from '@stalker/shared';
import { isMarketOpen } from '@stalker/market-data';

/**
 * Minimal interface for the market data service.
 * The real MarketDataService class (from @stalker/market-data) will satisfy this.
 * Using an interface allows the scheduler to be built independently.
 */
export interface MarketDataServiceLike {
  getQuote(instrument: Instrument): Promise<Quote | null>;
}

/**
 * Function type for fetching the list of tracked instruments.
 */
export type InstrumentFetcher = () => Promise<Instrument[]>;

interface PollCycleResult {
  polled: number;
  succeeded: number;
  failed: number;
  durationMs: number;
}

export interface PollerOptions {
  fetchInstruments: InstrumentFetcher;
  marketDataService: MarketDataServiceLike;
  pollIntervalMs: number;
  postCloseDelayMs: number;
}

/**
 * Poller class that fetches quotes for tracked instruments during market hours.
 * Uses setTimeout (never setInterval) to prevent overlapping poll cycles.
 * Supports graceful shutdown via stop().
 */
export class Poller {
  private readonly fetchInstruments: InstrumentFetcher;
  private readonly marketDataService: MarketDataServiceLike;
  private readonly pollIntervalMs: number;
  private readonly postCloseDelayMs: number;

  private isRunning: boolean = false;
  private shutdownRequested: boolean = false;
  private postCloseFetchDone: boolean = false;
  private wasMarketOpen: boolean = false;
  private currentTimer: ReturnType<typeof setTimeout> | null = null;
  private sleepResolve: (() => void) | null = null;

  constructor(options: PollerOptions) {
    this.fetchInstruments = options.fetchInstruments;
    this.marketDataService = options.marketDataService;
    this.pollIntervalMs = options.pollIntervalMs;
    this.postCloseDelayMs = options.postCloseDelayMs;
  }

  /**
   * Start the polling loop. Runs until stop() is called.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('[scheduler] Poller already running');
      return;
    }

    this.isRunning = true;
    this.shutdownRequested = false;
    console.log('[scheduler] Poller started');

    while (!this.shutdownRequested) {
      try {
        const now = new Date();
        const instruments = await this.fetchInstruments();

        if (instruments.length === 0) {
          console.log('[scheduler] No instruments tracked. Sleeping...');
          await this.sleep(this.pollIntervalMs);
          continue;
        }

        // Determine which instruments have their market open right now
        const openInstruments = instruments.filter((inst) =>
          isMarketOpen(now, inst.exchange),
        );
        const anyMarketOpen = openInstruments.length > 0;

        if (anyMarketOpen) {
          // Market is open — poll instruments with open markets
          const result = await this.pollInstruments(openInstruments);
          this.logCycleResult(result, openInstruments.length);
          this.postCloseFetchDone = false;
          this.wasMarketOpen = true;
        } else if (this.wasMarketOpen && !this.postCloseFetchDone) {
          // Market just closed — do the post-close fetch after delay
          console.log(
            `[scheduler] Market closed. Waiting ${Math.round(this.postCloseDelayMs / 1000)}s for post-close fetch...`,
          );
          await this.sleep(this.postCloseDelayMs);

          if (this.shutdownRequested) break;

          console.log(`[scheduler] Running post-close fetch for ${instruments.length} instruments...`);
          const result = await this.pollInstruments(instruments);
          this.logCycleResult(result, instruments.length);
          console.log(`[scheduler] Post-close fetch complete for ${instruments.length} instruments.`);
          this.postCloseFetchDone = true;
          this.wasMarketOpen = false;
        } else {
          // Market is closed, no post-close fetch needed
          this.wasMarketOpen = false;
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[scheduler] Poll cycle error: ${errorMessage}`);
      }

      if (!this.shutdownRequested) {
        await this.sleep(this.pollIntervalMs);
      }
    }

    this.isRunning = false;
    console.log('[scheduler] Poller stopped');
  }

  /**
   * Request graceful shutdown. Cancels any pending timers.
   */
  stop(): void {
    this.shutdownRequested = true;

    if (this.currentTimer !== null) {
      clearTimeout(this.currentTimer);
      this.currentTimer = null;
    }

    // Resolve any pending sleep to unblock the loop immediately
    if (this.sleepResolve !== null) {
      this.sleepResolve();
      this.sleepResolve = null;
    }

    console.log('[scheduler] Shutdown requested');
  }

  /**
   * Returns whether the poller is currently in its running loop.
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Returns whether a shutdown has been requested.
   */
  getShutdownRequested(): boolean {
    return this.shutdownRequested;
  }

  /**
   * Poll all given instruments for quotes.
   */
  private async pollInstruments(instruments: Instrument[]): Promise<PollCycleResult> {
    const startTime = Date.now();
    let succeeded = 0;
    let failed = 0;

    for (const instrument of instruments) {
      if (this.shutdownRequested) break;

      try {
        const quote = await this.marketDataService.getQuote(instrument);
        if (quote !== null) {
          succeeded++;
        } else {
          failed++;
        }
      } catch (error: unknown) {
        failed++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[scheduler] Failed to fetch quote for ${instrument.symbol}: ${errorMessage}`);
      }
    }

    return {
      polled: instruments.length,
      succeeded,
      failed,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Cancellable sleep. Stores the timer reference so stop() can cancel it.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this.sleepResolve = resolve;
      this.currentTimer = setTimeout(() => {
        this.currentTimer = null;
        this.sleepResolve = null;
        resolve();
      }, ms);
    });
  }

  private logCycleResult(result: PollCycleResult, total: number): void {
    console.log(
      `[scheduler] Poll cycle: ${result.succeeded}/${total} succeeded, ` +
      `${result.failed} failed, ${result.durationMs}ms`,
    );
  }
}
