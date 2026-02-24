import {
  MarketDataService,
  FmpProvider,
  TiingoProvider,
  AlphaVantageProvider,
} from '@stalker/market-data';
import type { PrismaClientForCache } from '@stalker/market-data';
import { prisma } from './prisma';

let instance: MarketDataService | null = null;

/**
 * Returns a singleton MarketDataService with all providers initialized from env vars.
 *
 * Provider chain:
 *   Search:  FMP → Alpha Vantage
 *   Quotes:  FMP → cache → Alpha Vantage
 *   History: Tiingo (sole provider)
 *
 * The Prisma client is passed for LatestQuote cache operations.
 */
export function getMarketDataService(): MarketDataService {
  if (!instance) {
    const fmp = new FmpProvider();
    const tiingo = new TiingoProvider();
    const alphaVantage = new AlphaVantageProvider();

    instance = new MarketDataService({
      primaryProvider: fmp,
      secondaryProvider: alphaVantage,
      historyProvider: tiingo,
      prisma: prisma as unknown as PrismaClientForCache,
    });
  }
  return instance;
}
