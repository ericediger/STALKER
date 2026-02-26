// Calendar
export * from './calendar/index.js';

// Types & Errors
export * from './types.js';

// Rate Limiter
export { RateLimiter } from './rate-limiter.js';
export type { RateLimiterConfig } from './rate-limiter.js';

// Providers
export { FmpProvider } from './providers/fmp.js';
export { TiingoProvider } from './providers/tiingo.js';
export { AlphaVantageProvider } from './providers/alpha-vantage.js';
/** @deprecated Replaced by TiingoProvider in Session 11. Kept for reference only. */
export { StooqProvider, parseStooqCsv } from './providers/stooq.js';

// Cache
export { upsertQuote, getLatestQuote, isQuoteFresh } from './cache.js';
export type {
  LatestQuoteRecord,
  PrismaClientForCache,
  PrismaLatestQuoteDelegate,
} from './cache.js';

// Fetch Utility
export { fetchWithTimeout } from './fetch-with-timeout.js';

// Symbol Mapping
export { getProviderSymbol } from './symbol-map.js';

// Service (Fallback Chain)
export { MarketDataService } from './service.js';
export type { MarketDataServiceConfig, PollResult } from './service.js';
