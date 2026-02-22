import { PrismaClient } from '@prisma/client';
import type { Instrument, InstrumentType, Quote } from '@stalker/shared';
import { loadConfig } from './config.js';
import { checkBudget } from './budget.js';
import { Poller } from './poller.js';
import type { MarketDataServiceLike, InstrumentFetcher } from './poller.js';

// Re-export for library consumers
export { loadConfig } from './config.js';
export { checkBudget } from './budget.js';
export type { BudgetResult } from './budget.js';
export { Poller } from './poller.js';
export type { MarketDataServiceLike, InstrumentFetcher, PollerOptions } from './poller.js';
export type { SchedulerConfig } from './config.js';

/**
 * Stub MarketDataService for use until the real one from @stalker/market-data is integrated.
 * Logs a warning and returns null for all quote requests.
 */
class StubMarketDataService implements MarketDataServiceLike {
  async getQuote(instrument: Instrument): Promise<Quote | null> {
    console.warn(`[scheduler] MarketDataService not yet wired — stub called for ${instrument.symbol}`);
    return null;
  }
}

/**
 * Create an instrument fetcher function backed by Prisma.
 * Reads all instruments from the database and maps Prisma rows to our typed Instrument interface.
 */
function createInstrumentFetcher(prisma: PrismaClient): InstrumentFetcher {
  return async (): Promise<Instrument[]> => {
    const rows = await prisma.instrument.findMany();
    return rows.map((row) => ({
      id: row.id,
      symbol: row.symbol,
      name: row.name,
      type: row.type as InstrumentType,
      currency: row.currency,
      exchange: row.exchange,
      exchangeTz: row.exchangeTz,
      providerSymbolMap: JSON.parse(row.providerSymbolMap) as Record<string, string>,
      firstBarDate: row.firstBarDate,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  };
}

/**
 * Main entry point for the scheduler process.
 */
async function main(): Promise<void> {
  console.log('[scheduler] Starting...');

  // 1. Load configuration
  const config = loadConfig();
  console.log('[scheduler] Configuration loaded');

  // 2. Initialize Prisma
  const prisma = new PrismaClient({
    datasources: {
      db: { url: config.databaseUrl },
    },
  });

  // 3. Initialize MarketDataService (stub for now)
  const marketDataService: MarketDataServiceLike = new StubMarketDataService();

  // 4. Run budget check
  const fetchInstruments = createInstrumentFetcher(prisma);
  const instruments = await fetchInstruments();

  const budgetResult = checkBudget(
    instruments.length,
    config.pollIntervalSeconds,
    {
      requestsPerMinute: config.fmpRpm,
      requestsPerDay: config.fmpRpd,
      supportsIntraday: false,
      quoteDelayMinutes: 15,
    },
  );

  console.log(`[scheduler] ${budgetResult.message}`);

  // Adjust interval if over budget
  let effectivePollIntervalSeconds = config.pollIntervalSeconds;
  if (!budgetResult.ok && budgetResult.safeInterval !== undefined) {
    effectivePollIntervalSeconds = budgetResult.safeInterval;
    console.warn(
      `[scheduler] Using extended interval: ${effectivePollIntervalSeconds}s instead of ${config.pollIntervalSeconds}s`,
    );
  }

  // 5. Create and start poller
  const poller = new Poller({
    fetchInstruments,
    marketDataService,
    pollIntervalMs: effectivePollIntervalSeconds * 1000,
    postCloseDelayMs: config.postCloseDelaySeconds * 1000,
  });

  // 6. Register shutdown handlers
  let shuttingDown = false;

  async function shutdown(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log('[scheduler] Shutting down gracefully...');
    poller.stop();
    await prisma.$disconnect();
    console.log('[scheduler] Shutdown complete');
    process.exit(0);
  }

  process.on('SIGTERM', () => {
    void shutdown();
  });
  process.on('SIGINT', () => {
    void shutdown();
  });

  // 7. Start the polling loop (blocks until shutdown)
  await poller.start();
}

// Run the scheduler
main().catch((error: unknown) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(`[scheduler] Fatal error: ${errorMessage}`);
  process.exit(1);
});
