# SESSION 11 REPORT — Provider Integration Testing

**Date:** 2026-02-24
**Session:** 11
**Epic:** Provider Integration Testing (Phase II)
**Status:** Complete

---

## Session Overview

Session 11 was the first time STALKER contacted real market data APIs. Phase 0 (manual smoke tests, performed before this session) revealed that FMP's entire `/api/v3/` endpoint namespace is dead for new accounts, FMP historical data is premium-only, and response shapes differ significantly from the mock fixtures built in Session 2. This session migrated FMP to the `/stable/` API, built a new Tiingo provider to replace Stooq for historical bars, rewired the provider chain, and updated all mock fixtures to match real API response shapes.

---

## Work Completed

### 1. FMP `/stable/` Migration
- Rewrote all FMP endpoint URLs from dead `/api/v3/` to working `/stable/` API
- Search: `/api/v3/search` → `/stable/search-symbol` (query param unchanged)
- Quote: `/api/v3/quote/{symbol}` → `/stable/quote?symbol={symbol}` (symbol moved to query param)
- Updated search response parser: `stockExchange`/`exchangeShortName` → `exchangeFullName`/`exchange`, no `type` field (defaults to `"STOCK"`)
- Updated quote response parser: `changesPercentage` → `changePercentage`, all prices are JSON numbers
- Disabled `getHistory()` — throws ProviderError explaining free tier limitation

### 2. Tiingo Provider (New — Replaces Stooq)
- Created `TiingoProvider` implementing full `MarketDataProvider` interface
- History endpoint: `GET /tiingo/daily/{symbol}/prices?startDate=...&endDate=...&token=...`
- Quote endpoint: `GET /iex/{symbol}?token=...`
- Search: returns empty array (Tiingo has no search API)
- Uses adjusted prices (`adjClose`/`adjOpen`/`adjHigh`/`adjLow`) to account for splits/dividends
- Extracts YYYY-MM-DD from ISO date strings (`"2025-01-02T00:00:00.000Z"` → `"2025-01-02"`)
- Text-first JSON parsing catches HTTP 200 rate limit responses
- Symbol mapping: Tiingo uses hyphens (BRK-B), handled via `providerSymbolMap`

### 3. Rate Limiter Enhancement
- Added optional `requestsPerHour` to `RateLimiterConfig` and `ProviderLimits`
- Implemented per-hour sliding window bucket in `RateLimiter` class
- Tiingo defaults: 50 req/hr, 1000 req/day
- Backward compatible — existing per-minute + per-day behavior unchanged

### 4. Provider Chain Rewiring
- Updated `MarketDataService` to pass `requestsPerHour` to rate limiters
- Removed FMP history fallback from `getHistory()` (sole provider is Tiingo)
- Updated `index.ts` exports: added `TiingoProvider`, marked `StooqProvider` as `@deprecated`
- Updated scheduler to use `TiingoProvider` instead of `StooqProvider`
- Added Tiingo config to scheduler: `tiingoApiKey`, `tiingoRph`, `tiingoRpd`

### 5. Stooq Deprecation
- Added deprecation header comment to `stooq.ts`
- Removed from all active provider chains
- Code preserved for reference

### 6. Fixture & Test Updates
- Updated FMP fixtures to match `/stable/` response shapes (new field names, JSON number types)
- Created Tiingo fixtures from real API responses (VTI history, BRK-B)
- Rewrote FMP tests: added URL verification, removed history tests, added integer price test
- Created 17 Tiingo tests: history parsing, adjusted prices, date extraction, BRK-B, error handling, quotes
- Updated fallback tests: Tiingo as history provider, removed FMP fallback assertion

---

## Technical Details

### Decimal Precision Audit
All JSON number values from FMP and Tiingo convert via:
```typescript
toDecimal(String(item.price))  // "272.11" → exact Decimal
```
Zero instances of `parseFloat()`, `Number()`, or direct `new Decimal(number)` in provider code. Tiingo's 10-decimal-place adjusted prices (e.g., `285.7787708514`) are preserved exactly.

### Provider Chain (Final)
```
Search:   FMP (/stable/search-symbol) — no fallback
Quotes:   FMP (/stable/quote) → cache → Alpha Vantage (GLOBAL_QUOTE)
History:  Tiingo (/tiingo/daily/{sym}/prices) — no fallback
```

### Environment Variables
```
FMP_API_KEY=...              # Financial Modeling Prep (search + quotes)
ALPHA_VANTAGE_API_KEY=...    # Alpha Vantage (backup quotes)
TIINGO_API_KEY=...           # Tiingo (historical bars + backup quotes)
TIINGO_RPH=50                # Tiingo requests per hour
TIINGO_RPD=1000              # Tiingo requests per day
```

---

## Files Changed

### Created (6 source + 5 fixture/data)
| File | Description |
|------|-------------|
| `packages/market-data/src/providers/tiingo.ts` | TiingoProvider — history, quotes, adjusted prices |
| `packages/market-data/__tests__/tiingo.test.ts` | 17 tests for Tiingo provider |
| `packages/market-data/__tests__/fixtures/tiingo-history.json` | 3-bar VTI history fixture |
| `packages/market-data/__tests__/fixtures/tiingo-brk-b.json` | 2-bar BRK-B fixture |
| `data/test/provider-smoke-results.md` | Phase 0 findings with exact response shapes |
| `data/test/smoke-responses/*.json` | 6 raw API response files |

### Modified (13 files)
| File | Description |
|------|-------------|
| `packages/shared/src/types/index.ts` | Added `requestsPerHour?: number` to ProviderLimits |
| `packages/market-data/src/rate-limiter.ts` | Per-hour sliding window bucket, `getRemainingHour()` |
| `packages/market-data/src/providers/fmp.ts` | Full rewrite: /stable/ URLs, new parsers, disabled history |
| `packages/market-data/src/providers/stooq.ts` | Deprecation comment |
| `packages/market-data/src/service.ts` | Removed FMP history fallback, updated comments |
| `packages/market-data/src/index.ts` | Export TiingoProvider, deprecate StooqProvider |
| `packages/market-data/src/symbol-map.ts` | Updated doc comment |
| `packages/scheduler/src/config.ts` | Added Tiingo config fields |
| `packages/scheduler/src/index.ts` | TiingoProvider replaces StooqProvider |
| `packages/market-data/__tests__/fmp.test.ts` | Updated for /stable/, URL assertions, removed history tests |
| `packages/market-data/__tests__/fallback.test.ts` | Tiingo as history, no FMP fallback |
| `packages/market-data/__tests__/fixtures/fmp-search.json` | /stable/ response shape |
| `packages/market-data/__tests__/fixtures/fmp-quote.json` | /stable/ response shape |

---

## Testing & Validation

| Check | Result |
|-------|--------|
| `pnpm tsc --noEmit` | 0 errors |
| `pnpm test` | **526 tests passing, 43 test files** |
| New Tiingo tests | 17 tests (history, quotes, errors, BRK-B, URL, precision) |
| Updated FMP tests | 14 tests (search, quote, history-disabled, URL verification) |
| Updated fallback tests | 10 tests (Tiingo history, no FMP fallback) |
| No `/api/v3/` in active code | Verified via grep — only in docs/comments |
| No `parseFloat`/`Number()` on financial values | Verified via grep in provider code |
| Exit checklist | **14/14 items PASS** |

---

## Issues Encountered

| Issue | Resolution |
|-------|-----------|
| FMP `/api/v3/` completely dead | Migrated to `/stable/` endpoints with new URL structure |
| FMP history premium-only | Removed FMP history, Tiingo sole history provider |
| FMP response field names changed | Updated interfaces and parsers (`changesPercentage` → `changePercentage`, etc.) |
| FMP prices are JSON numbers (not strings) | All converted via `toDecimal(String(value))` |
| Tiingo HTTP 200 text on rate limit | Text-first JSON parsing with try/catch |
| Rate limiter had no per-hour bucket | Added optional per-hour sliding window |

---

## Outstanding Items

- [ ] Wire API route stubs to live `MarketDataService` (search, refresh, historical backfill) — providers are ready, routes still return stubs
- [ ] End-to-end testing with `pnpm dev` using real API keys
- [ ] Rate limiter integration tests (teammate scope — deferred)
- [ ] Fallback chain live tests with invalid keys (teammate scope — deferred)

---

## Next Steps

1. **Wire API stubs** — Connect `/api/market/search`, `/api/market/refresh`, and instrument creation backfill to live MarketDataService with FMP + Tiingo
2. **E2E verification** — Run `pnpm dev`, verify scheduler polls quotes via FMP and scheduler can fetch history via Tiingo
3. **Holiday calendar** — Add market holiday awareness to reduce wasted API calls
4. **Advisor context management** — Token counting and summary generation for long threads
