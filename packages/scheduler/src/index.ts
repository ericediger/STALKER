import { PrismaClient } from '@prisma/client';
import type { Instrument, InstrumentType } from '@stalker/shared';
import {
  MarketDataService,
  FmpProvider,
  TiingoProvider,
  AlphaVantageProvider,
} from '@stalker/market-data';
import { loadConfig } from './config.js';
import { checkBudget } from './budget.js';
import { Poller } from './poller.js';
import type { InstrumentFetcher } from './poller.js';

// Re-export for library consumers
export { loadConfig } from './config.js';
export { checkBudget } from './budget.js';
export type { BudgetResult } from './budget.js';
export { Poller } from './poller.js';
export type { MarketDataServiceLike, InstrumentFetcher, PollerOptions } from './poller.js';
export type { SchedulerConfig } from './config.js';

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

  // 3. Initialize MarketDataService with real providers
  // Providers read API keys from process.env (already loaded by dotenv in loadConfig)
  const fmpProvider = new FmpProvider();
  const tiingoProvider = new TiingoProvider();
  const alphaVantageProvider = new AlphaVantageProvider();

  const marketDataService = new MarketDataService({
    primaryProvider: fmpProvider,
    secondaryProvider: alphaVantageProvider,
    historyProvider: tiingoProvider,
    prisma,
  });

  // 4. Run budget check
  const fetchInstruments = createInstrumentFetcher(prisma);
  const instruments = await fetchInstruments();

  // With Tiingo batch polling, budget calculation uses Tiingo limits:
  // Each poll cycle = 1 Tiingo batch call (not N individual calls).
  // FMP is only used as single-symbol fallback for Tiingo misses.
  const budgetResult = checkBudget(
    1, // Batch polling: 1 API call per cycle regardless of instrument count
    config.pollIntervalSeconds,
    {
      requestsPerMinute: 10,
      requestsPerHour: config.tiingoRph,
      requestsPerDay: config.tiingoRpd,
      supportsIntraday: false,
      quoteDelayMinutes: 15,
    },
  );

  console.log(`[scheduler] ${instruments.length} instruments tracked`);
  console.log(`[scheduler] ${budgetResult.message}`);
  console.log(`[scheduler] Quote provider chain: Tiingo IEX (batch) → FMP (single) → AV (single)`);

  // With batch polling, budget should always be OK.
  // Keep the configured interval (no auto-adjustment needed).
  const effectivePollIntervalSeconds = config.pollIntervalSeconds;

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
