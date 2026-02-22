# SESSION-2-PLAN: Market Data Service + Scheduler

**Date:** 2026-02-21
**Author:** Engineering Lead
**Epics:** 1 (Market Data Service — full) + 4 (Scheduler — full)
**Depends on:** Session 1 (complete, commit `247f2b5`)
**Team shape:** Lead + 2 teammates (parallel)
**Estimated complexity:** High

---

## 1. Session Goal

Build the complete market data layer — three provider implementations, token bucket rate limiter, provider fallback chain, LatestQuote cache management — and the standalone scheduler process that polls for quotes during market hours. After this session, the system can fetch live market data and keep quotes fresh automatically.

---

## 2. What Exists (Session 1 Outputs)

| Asset | Location | Status |
|-------|----------|--------|
| Prisma schema (PriceBar, LatestQuote, Instrument) | `apps/web/prisma/schema.prisma` | Complete |
| Prisma client singleton | `apps/web/src/lib/prisma.ts` | Complete |
| Shared types (Quote, PriceBar, SymbolSearchResult, ProviderLimits) | `packages/shared/` | Complete |
| Decimal utilities | `packages/shared/src/decimal.ts` | Complete |
| MarketCalendar | `packages/market-data/src/calendar/` | Complete + tested |
| EXCHANGE_TIMEZONE_MAP, session time constants | `packages/shared/src/constants.ts` | Complete |
| Scheduler package shell | `packages/scheduler/` | Placeholder only |
| .env.example with all Spec 12 variables | `apps/web/.env.example` | Complete |

---

## 3. Teammate Assignment

### Teammate 1: `market-data-engineer`

**Scope:** Everything in `packages/market-data/` except the calendar (already done).

**Deliverables:**

1. **MarketDataProvider interface** (`packages/market-data/src/types.ts`)
   - Matches Spec 6.1 exactly: `searchSymbols`, `getQuote`, `getHistory`, `getLimits`
   - Export `ProviderLimits`, `Quote`, `SymbolSearchResult` (re-export from @stalker/shared if already defined, or define here and push to shared)

2. **FMP Provider** (`packages/market-data/src/providers/fmp.ts`)
   - `searchSymbols(query)` → `GET /api/v3/search?query={q}&apikey={key}`
   - `getQuote(symbol)` → `GET /api/v3/quote/{symbol}?apikey={key}`
   - `getHistory(symbol, start, end)` → `GET /api/v3/historical-price-full/{symbol}?from={start}&to={end}&apikey={key}`
   - Parse responses into typed objects. All prices → `Decimal`.
   - `providerSymbol` mapping: use instrument's `providerSymbolMap.fmp` if present, else raw symbol.
   - `getLimits()` → read `FMP_RPM` and `FMP_RPD` from env (defaults: 5 rpm, 250 rpd).

3. **Stooq Provider** (`packages/market-data/src/providers/stooq.ts`)
   - Historical daily bars only (no search, no real-time quotes).
   - `getHistory(symbol, start, end)` → `GET https://stooq.com/q/d/l/?s={stooqSymbol}&d1={start}&d2={end}&i=d`
   - Response is CSV: `Date,Open,High,Low,Close,Volume`. Parse with simple string splitting (no CSV library needed for this format).
   - Symbol mapping: `providerSymbolMap.stooq` (e.g., `"aapl.us"` for US stocks).
   - `searchSymbols` and `getQuote` → throw `NotSupportedError` (Stooq is history-only).
   - `getLimits()` → no API key, generous limits. Set reasonable defaults (10 rpm, 1000 rpd).

4. **Alpha Vantage Provider** (`packages/market-data/src/providers/alpha-vantage.ts`)
   - Backup quote provider only.
   - `getQuote(symbol)` → `GET /query?function=GLOBAL_QUOTE&symbol={symbol}&apikey={key}`
   - `getHistory(symbol, start, end)` → `GET /query?function=TIME_SERIES_DAILY&symbol={symbol}&outputsize=full&apikey={key}` (filter to date range client-side).
   - `searchSymbols(query)` → `GET /query?function=SYMBOL_SEARCH&keywords={query}&apikey={key}`
   - `getLimits()` → read `AV_RPM` and `AV_RPD` from env (defaults: 5 rpm, 25 rpd).

5. **Token Bucket Rate Limiter** (`packages/market-data/src/rate-limiter.ts`)
   - Per-provider instance (not global singleton).
   - Two buckets: per-minute and per-day.
   - `canCall(): boolean` — check both buckets.
   - `waitForSlot(): Promise<void>` — wait until a slot is available (with timeout).
   - `recordCall(): void` — consume a token from both buckets.
   - Minute bucket refills continuously (token bucket algorithm). Day bucket resets at midnight UTC.
   - Limits read from `getLimits()` on the associated provider.
   - **Important:** The rate limiter is in-process only. The scheduler (separate Node process) and Next.js each have independent rate limiter state. This is acceptable for MVP (single user, low volume). Document this in CLAUDE.md as a known limitation.

6. **Provider Fallback Chain** (`packages/market-data/src/fallback.ts`)
   - `MarketDataService` class that wraps multiple providers.
   - `getQuote(instrumentId)`: Try primary (FMP) → if rate-limited/error, check LatestQuote cache (fresh < 1hr during market hours, < 24hr otherwise) → try secondary (Alpha Vantage) → if all fail, return stale indicator.
   - `getHistory(instrumentId, start, end)`: Try Stooq first (best for history) → fallback to FMP.
   - `searchSymbols(query)`: Try FMP → fallback to Alpha Vantage.
   - Each call goes through the provider's rate limiter before dispatch.
   - On successful quote fetch, upsert `LatestQuote` row via Prisma.

7. **LatestQuote Cache Manager** (`packages/market-data/src/cache.ts`)
   - `upsertQuote(instrumentId, provider, price, asOf)` → Prisma upsert on `(instrumentId, provider)` unique constraint. Set `fetchedAt` and `rebuiltAt` to now.
   - `getLatestQuote(instrumentId)` → return most recent across providers.
   - `isQuoteFresh(quote, isMarketHours)` → < 1 hour if market open, < 24 hours otherwise.

8. **Provider Symbol Mapping Utility** (`packages/market-data/src/symbol-map.ts`)
   - Given an `Instrument`, resolve the correct symbol string for a given provider using `providerSymbolMap`.
   - Fallback to raw `instrument.symbol` if no mapping exists.

9. **Unit Tests** (`packages/market-data/__tests__/`)
   - **One test file per provider** with mocked HTTP responses captured from real API calls (fixture files in `packages/market-data/__tests__/fixtures/`).
   - FMP fixtures: search response, quote response, history response, rate limit (429) response, error response.
   - Stooq fixtures: CSV history response, empty CSV, malformed CSV.
   - Alpha Vantage fixtures: quote response, search response, "Thank you for using" rate limit response (AV returns 200 with a message, not 429).
   - **Rate limiter tests:** Token consumption, bucket refill timing, day reset, waitForSlot timeout.
   - **Fallback chain tests:** Primary success, primary fail → cache hit, primary fail → secondary success, all fail → stale indicator.
   - **Cache tests:** Upsert, freshness check during/outside market hours.

**Filesystem scope:** `packages/market-data/src/` (excluding `calendar/`), `packages/market-data/__tests__/`

---

### Teammate 2: `scheduler-engineer`

**Scope:** Everything in `packages/scheduler/` plus root dev script wiring.

**Deliverables:**

1. **Scheduler Entry Point** (`packages/scheduler/src/index.ts`)
   - Standalone Node process. Not a Next.js API route.
   - On startup: load env vars, initialize Prisma client, initialize MarketDataService, run budget check, start polling loop.
   - Graceful shutdown handler: listen for `SIGTERM` and `SIGINT`, cancel any pending timers, close Prisma connection, exit cleanly.

2. **Budget Check** (`packages/scheduler/src/budget.ts`)
   - On startup, count tracked instruments (`Instrument` table).
   - Given N instruments, polling interval, and market hours duration (~6.5 hours):
     ```
     estimatedDailyCalls = N × (marketHoursDuration / pollInterval)
     ```
   - Compare against provider daily limit.
   - If over budget: compute a safe interval that fits, log warning, use the extended interval.
   - If within budget: log confirmation (format per Spec 6.3 example).

3. **Polling Loop** (`packages/scheduler/src/poller.ts`)
   - `startPolling()` — kicks off the loop.
   - On each tick:
     1. Check `isMarketOpen()` via MarketCalendar for each exchange timezone in use.
     2. If no market is open → sleep until next market open (or check every 5 minutes).
     3. If market is open → fetch all instruments → call `MarketDataService.getQuote()` for each → LatestQuote cache updated automatically by the service.
     4. After poll completes → schedule next tick at `POLL_INTERVAL_MARKET_HOURS` seconds.
   - Use `setTimeout` (not `setInterval`) to prevent overlap if a poll cycle takes longer than the interval.

4. **Post-Close Fetch** (`packages/scheduler/src/poller.ts`)
   - After detecting market close (transition from open → closed):
     - Wait `POST_CLOSE_DELAY` seconds (default 900 = 15 min).
     - Fetch final closing quotes for all instruments.
     - Log: "Post-close fetch complete for N instruments."
   - Only trigger once per close event (not repeatedly during off-hours).

5. **Environment Loading** (`packages/scheduler/src/config.ts`)
   - Load from `.env.local` in the project root (or `apps/web/.env.local` — align with the pattern established in V-4 remediation).
   - Required: `DATABASE_URL`, `FMP_API_KEY`
   - Optional: `ALPHA_VANTAGE_API_KEY`, `POLL_INTERVAL_MARKET_HOURS` (default 1800), `POST_CLOSE_DELAY` (default 900), provider limit overrides.
   - Fail fast with clear error message if required vars are missing.

6. **Concurrently Setup** (root `package.json`)
   - Add `concurrently` as a root dev dependency.
   - Update root `pnpm dev` script:
     ```json
     "dev": "concurrently \"pnpm --filter web dev\" \"pnpm --filter scheduler start\""
     ```
   - Scheduler `start` script: `tsx src/index.ts` (or `ts-node --esm`).
   - Ensure scheduler output is prefixed/colored differently from Next.js output.

7. **Integration Test** (`packages/scheduler/__tests__/poller.test.ts`)
   - Mock `MarketDataService` and `MarketCalendar`.
   - Test: market open → polls N instruments → sleeps for interval → polls again.
   - Test: market closed → does not poll → idles.
   - Test: market transitions to closed → triggers post-close fetch after delay.
   - Test: budget check logs warning when over budget and extends interval.
   - Test: graceful shutdown cancels timers.

**Filesystem scope:** `packages/scheduler/`, root `package.json` (dev script only)

---

## 4. Parallel Execution Strategy

Both teammates work independently with non-overlapping filesystem scope:

| Area | market-data-engineer | scheduler-engineer |
|------|---------------------|-------------------|
| `packages/market-data/src/providers/` | ✅ Writes | Reads (via import) |
| `packages/market-data/src/rate-limiter.ts` | ✅ Writes | Reads (via import) |
| `packages/market-data/src/fallback.ts` | ✅ Writes | Reads (via import) |
| `packages/market-data/src/cache.ts` | ✅ Writes | Reads (via import) |
| `packages/market-data/__tests__/` | ✅ Writes | — |
| `packages/scheduler/` | — | ✅ Writes |
| Root `package.json` | — | ✅ Edits (dev script) |

**Coordination point:** The scheduler-engineer imports `MarketDataService` from `@stalker/market-data`. If the market-data-engineer hasn't finished the service class yet, the scheduler-engineer stubs it with a mock that satisfies the `MarketDataProvider` interface. The real implementation wires in when both are done.

**Recommended approach:** Scheduler-engineer should define the interface they need from MarketDataService (essentially: `getQuoteForInstrument(instrument: Instrument): Promise<Quote | null>`) and code against that. Market-data-engineer ensures the MarketDataService class exposes this method.

---

## 5. Architecture Decisions for This Session

### AD-1: HTTP Client Choice

Use `fetch` (Node 18+ native). No axios, no got, no node-fetch. Reasons:
- Zero dependencies.
- The providers make simple GET requests with query params. No complex interceptors needed.
- The rate limiter handles retry logic, not the HTTP client.

### AD-2: Rate Limiter Is In-Process, Not Shared

The scheduler and Next.js are separate processes. Each has its own rate limiter instance. This means:
- A manual refresh (via Next.js API route) immediately after a scheduler poll could exceed the provider's actual rate limit.
- For MVP, this is acceptable: single user, manual refresh is rare, providers have some tolerance.
- Document in CLAUDE.md as a known limitation.
- Post-MVP mitigation: track call counts in a SQLite table (`ProviderCallLog`) that both processes read.

### AD-3: Stooq CSV Parsing

Stooq returns simple, consistent CSV. Do not add a CSV parsing library (Papa Parse, csv-parse). Split on newlines, split on commas. Handle:
- Header row (skip it).
- Empty responses (no data for date range).
- Occasional trailing newline.

If the format proves more complex during implementation, `csv-parse` is the fallback — but start simple.

### AD-4: Provider Error Classification

Each provider implementation must classify errors into:
- `RATE_LIMITED` — provider explicitly returned rate limit error.
- `NOT_FOUND` — symbol doesn't exist.
- `NETWORK_ERROR` — timeout, DNS failure, connection refused.
- `PARSE_ERROR` — response was 200 but body was unexpected.
- `UNKNOWN` — anything else.

The fallback chain uses this classification to decide whether to try the next provider (yes for RATE_LIMITED and NETWORK_ERROR, no for NOT_FOUND).

### AD-5: Scheduler Uses setTimeout, Not setInterval

`setInterval` can cause overlapping poll cycles if a cycle takes longer than the interval. `setTimeout` at the end of each cycle guarantees sequential execution. The pattern:

```typescript
async function pollLoop() {
  while (!shutdownRequested) {
    await pollAllInstruments();
    await sleep(pollIntervalMs);
  }
}
```

---

## 6. Provider API Details (Reference for Implementation)

### FMP (Financial Modeling Prep)

```
Base URL: https://financialmodelingprep.com

GET /api/v3/search?query=AAPL&apikey={key}
→ [{ symbol, name, currency, stockExchange, exchangeShortName }]

GET /api/v3/quote/AAPL?apikey={key}
→ [{ symbol, name, price, changesPercentage, change, dayLow, dayHigh, 
      yearHigh, yearLow, volume, avgVolume, exchange, open, previousClose, timestamp }]

GET /api/v3/historical-price-full/AAPL?from=2025-01-01&to=2025-12-31&apikey={key}
→ { symbol, historical: [{ date, open, high, low, close, adjClose, volume, ... }] }

Rate limit response: HTTP 429
```

### Stooq

```
GET https://stooq.com/q/d/l/?s=aapl.us&d1=20250101&d2=20251231&i=d
→ CSV body:
Date,Open,High,Low,Close,Volume
2025-01-02,185.52,186.74,183.09,185.15,46234500
...

No API key. Date format in params: YYYYMMDD.
Rate limit: None explicit, but be respectful (max 1 req/sec recommended).
```

### Alpha Vantage

```
Base URL: https://www.alphavantage.co

GET /query?function=GLOBAL_QUOTE&symbol=AAPL&apikey={key}
→ { "Global Quote": { "01. symbol", "02. open", "05. price", "06. volume", 
     "07. latest trading day", "08. previous close", "09. change", "10. change percent" } }

GET /query?function=SYMBOL_SEARCH&keywords=AAPL&apikey={key}
→ { bestMatches: [{ "1. symbol", "2. name", "3. type", "4. region", "8. currency" }] }

GET /query?function=TIME_SERIES_DAILY&symbol=AAPL&outputsize=full&apikey={key}
→ { "Time Series (Daily)": { "2025-01-02": { "1. open", "2. high", "3. low", "4. close", "5. volume" } } }

Rate limit: Returns HTTP 200 with body containing "Thank you for using Alpha Vantage" message.
Must detect this as a rate limit, not a success.
```

---

## 7. Exit Criteria

### Must Pass (Blocking)

- [ ] `MarketDataProvider` interface defined and exported
- [ ] FMP provider: searchSymbols, getQuote, getHistory — all working against mocked fixtures
- [ ] Stooq provider: getHistory (CSV parse) — working against mocked fixtures
- [ ] Alpha Vantage provider: getQuote, searchSymbols — working against mocked fixtures
- [ ] Token bucket rate limiter: per-minute and per-day enforcement tested
- [ ] Fallback chain: primary → cache → secondary → stale path tested
- [ ] LatestQuote upsert and freshness check working
- [ ] Scheduler standalone process starts, runs budget check, enters polling loop
- [ ] Scheduler polls during market hours, idles during off-hours
- [ ] Scheduler post-close fetch triggers once after market close
- [ ] Scheduler graceful shutdown (SIGTERM handler)
- [ ] `concurrently` wired in root `pnpm dev`
- [ ] `tsc --noEmit` — zero errors across all packages
- [ ] All tests passing (target: 40+ new tests)
- [ ] All work committed and pushed

### Should Pass (Important, not blocking)

- [ ] Provider error classification (RATE_LIMITED, NOT_FOUND, NETWORK_ERROR, PARSE_ERROR)
- [ ] Alpha Vantage rate limit detection (200 + "Thank you" message)
- [ ] Budget check interval extension when over budget
- [ ] CLAUDE.md updated with rate limiter limitation and .env documentation
- [ ] Scheduler console output is prefixed/colored differently from Next.js

---

## 8. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| FMP API response format changes | Fixture files captured from real responses. If format drifts, update fixtures. Provider implementation uses defensive parsing with fallback to null fields. |
| Stooq blocks programmatic access | Stooq is history-only. If blocked, FMP history is the fallback (already in the fallback chain). No scheduler change needed. |
| Alpha Vantage rate limit detection missed | Test specifically for the "Thank you" 200 response. This is the #1 AV gotcha. |
| Scheduler and Next.js double-dip on rate limits | Documented as known limitation (AD-2). Acceptable for MVP. |
| Large historical backfill exceeds daily API budget | Backfill uses Stooq (no API key, generous limits). FMP is for quotes only. Budget pressure is on FMP. |

---

## 9. Checklist Matrix (from Master Plan Section 5)

**Applied checklists:** Backend: General, Code Quality, Performance, Security

| Category | Check | How |
|----------|-------|-----|
| Code Quality | All financial values use Decimal.js | Review provider response parsing — prices must be `toDecimal()` not `parseFloat()` |
| Code Quality | No hardcoded API limits | Verify limits read from env with defaults |
| Performance | Rate limiter doesn't busy-wait | `waitForSlot()` uses setTimeout/Promise, not a while loop |
| Security | API keys not logged | Review all `console.log` statements — no key values in output |
| Security | API keys not in committed files | `.env.local` in `.gitignore`, `.env.example` has placeholder values only |
| General | Error paths return typed errors | Provider errors classified per AD-4 |
| General | All async functions have try/catch or .catch | No unhandled promise rejections in scheduler loop |

---

## 10. What This Session Unblocks

| Downstream Session | What it needs from Session 2 |
|-------------------|------------------------------|
| Session 3 (Analytics Completion) | PriceBar data in the database (via backfill). MarketDataService for fetching history. |
| Session 4 (API Layer) | MarketDataService for `/api/market/*` endpoints. LatestQuote cache for quote endpoints. |
| Session 6 (Dashboard UI) | `/api/market/status` data (instrument count, polling status, budget, freshness) |
