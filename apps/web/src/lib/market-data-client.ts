import { isMarketOpen } from '@stalker/market-data';

/**
 * Thin wrapper around market-data package for use in API routes.
 * For MVP, provides calendar checks. Full MarketDataService instantiation
 * requires API keys and is deferred to when providers are configured.
 */

export function isMarketCurrentlyOpen(exchange: string): boolean {
  return isMarketOpen(new Date(), exchange);
}
