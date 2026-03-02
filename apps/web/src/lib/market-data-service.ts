import {
  MarketDataService,
  FmpProvider,
  TiingoProvider,
  AlphaVantageProvider,
  CoinGeckoProvider,
} from '@stalker/market-data';
import type { PrismaClientForCache } from '@stalker/market-data';
import { prisma } from './prisma';

let instance: MarketDataService | null = null;

/**
 * Returns a singleton MarketDataService with all providers initialized from env vars.
 *
 * Provider chain:
 *   Search:  FMP → Alpha Vantage (equities) + CoinGecko (crypto, merged)
 *   Quotes:  FMP → cache → Alpha Vantage (equities) | CoinGecko (crypto)
 *   History: Tiingo (equities) | CoinGecko (crypto)
 *
 * The Prisma client is passed for LatestQuote cache operations.
 */
export function getMarketDataService(): MarketDataService {
  if (!instance) {
    const fmp = new FmpProvider();
    const tiingo = new TiingoProvider();
    const alphaVantage = new AlphaVantageProvider();
    const coinGecko = new CoinGeckoProvider();

    instance = new MarketDataService({
      primaryProvider: fmp,
      secondaryProvider: alphaVantage,
      historyProvider: tiingo,
      cryptoProvider: coinGecko,
      prisma: prisma as unknown as PrismaClientForCache,
    });
  }
  return instance;
}
