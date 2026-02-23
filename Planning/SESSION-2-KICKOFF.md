# SESSION-2-KICKOFF: Market Data Service + Scheduler

**Session:** 2 of 9
**Epics:** 1 (Market Data Service) + 4 (Scheduler)
**Prereqs:** Session 1 complete (commit `247f2b5`)
**Team:** Lead + 2 parallel teammates

---

## Pre-Flight (Lead — Before Teammates Start)

Run these verification steps first. They confirm Session 1 assumptions that Session 2 builds on. If any test fails, fix it before launching teammates. ~10 minutes total.

### PF-1: Baseline Check
1. `pnpm test` passes (71 tests from Session 1)
2. `tsc --noEmit` passes

### PF-2: Decimal Round-Trip Through Prisma/SQLite
Add an integration test that writes a Decimal value via Prisma, reads it back, and asserts exact string equality. Test values: `"123.456789012345"`, `"0.1"`, `"99999999.99"`, `"0.00000001"`. If any round-trip loses precision, Session 2's LatestQuote writes and Session 3's portfolio value series will silently produce wrong numbers. **Stop and fix if this fails.**

### PF-3: FIFO Engine Backdated Insert Replay
Add a test in `packages/analytics/__tests__/lot-engine.test.ts`:
```
Scenario:
  1. BUY 100 @ $10 on Jan 1
  2. SELL 50 @ $15 on Feb 1
  3. Then INSERT a BUY 50 @ $8 on Jan 15 (backdated)

Expected after full replay (transactions sorted by tradeAt):
  - FIFO order: Lot1(Jan1, 100@$10), Lot2(Jan15, 50@$8)
  - SELL on Feb 1 consumes from Lot1 first (FIFO)
  - Open lots: Lot1(50 remaining @$10), Lot2(50 remaining @$8)
  - Realized PnL on the sell: (15-10)*50 = $250
```
This is Risk R-1 in the master plan. Session 3's snapshot rebuild depends on this. **Stop and fix if this fails.**

### PF-4: MarketCalendar DST Boundaries
Add tests in `packages/market-data/__tests__/market-calendar.test.ts`:
```
Spring Forward 2026 (March 8):
  - getPriorTradingDay(Monday March 9) → Friday March 6
  - getNextTradingDay(Friday March 6) → Monday March 9
  - getSessionTimes(Monday March 9, 'America/New_York') → 13:30-20:00 UTC (EDT)

Fall Back 2025 (November 2):
  - getSessionTimes(Monday November 3, 'America/New_York') → 14:30-21:00 UTC (EST)
```
Session 2's scheduler uses these functions in a loop. Proceed even if these fail (non-blocking), but log the issue for Session 3 remediation.

### PF-5: Document .env Dual-File Situation
Update `CLAUDE.md` with a note explaining that `apps/web/.env` exists for Prisma (`DATABASE_URL`) and `apps/web/.env.local` exists for Next.js/app config. The scheduler (Session 2) will establish its own env loading pattern — this note prevents future confusion.

### PF-6: Confirm Pre-Flight
After PF-2 through PF-5:
- `pnpm test` still passes (now 71 + new verification tests)
- `tsc --noEmit` still passes
- Commit the verification tests and CLAUDE.md update before launching teammates

---

## Teammate 1: `market-data-engineer`

### Identity & Scope

You are the market data engineer. You build the provider-agnostic market data layer in `packages/market-data/`. The MarketCalendar in `packages/market-data/src/calendar/` already exists — do not modify it.

### Read First
- `SPEC.md` Section 6 (Market Data Service) — provider interface, polling strategy, rate limiter, fallback
- `SPEC.md` Section 11.1 (Error Handling — Market Data)
- `SPEC.md` Section 4.2 (PriceBar and LatestQuote table definitions)
- `SESSION-2-PLAN.md` Sections 3 (Teammate 1), 5 (Architecture Decisions), 6 (Provider API Details)
- `packages/shared/src/types.ts` — existing type definitions
- `packages/shared/src/decimal.ts` — Decimal utility functions you must use

### Build Order

1. **Types & Interface** — `packages/market-data/src/types.ts`
   - Define `MarketDataProvider` interface per Spec 6.1
   - Define `ProviderError` with classification: `RATE_LIMITED | NOT_FOUND | NETWORK_ERROR | PARSE_ERROR | UNKNOWN`
   - Re-export relevant types from `@stalker/shared` or define here

2. **Rate Limiter** — `packages/market-data/src/rate-limiter.ts`
   - Token bucket with per-minute and per-day buckets
   - Constructor takes `ProviderLimits`
   - Methods: `canCall()`, `waitForSlot(timeoutMs?)`, `recordCall()`, `getRemainingDaily()`, `getRemainingMinute()`
   - Day bucket resets at midnight UTC
   - `waitForSlot` uses `setTimeout`-based Promise, not busy-wait

3. **FMP Provider** — `packages/market-data/src/providers/fmp.ts`
   - Implements `MarketDataProvider`
   - Uses native `fetch`
   - All prices parsed via `toDecimal()` from `@stalker/shared`
   - Handle 429 → throw `ProviderError` with `RATE_LIMITED`
   - Handle network errors → `NETWORK_ERROR`
   - Handle unexpected response shapes → `PARSE_ERROR`

4. **Stooq Provider** — `packages/market-data/src/providers/stooq.ts`
   - `getHistory` only. `searchSymbols` and `getQuote` throw `NotSupportedError`.
   - CSV parsing: split lines, split commas, skip header. No external CSV library.
   - Date format in URL params: YYYYMMDD (no dashes)
   - Symbol mapping: use `providerSymbolMap.stooq` (e.g., `"aapl.us"`)

5. **Alpha Vantage Provider** — `packages/market-data/src/providers/alpha-vantage.ts`
   - Quote + search. History as backup.
   - **Critical:** AV returns HTTP 200 with `"Thank you for using Alpha Vantage"` when rate-limited. Detect this in the response body and throw `RATE_LIMITED`, not treat as success.
   - Response keys are numbered strings (`"01. symbol"`, `"05. price"`) — parse carefully.

6. **LatestQuote Cache** — `packages/market-data/src/cache.ts`
   - `upsertQuote(instrumentId, provider, price, asOf)` → Prisma upsert
   - `getLatestQuote(instrumentId)` → most recent across all providers
   - `isQuoteFresh(quote, isMarketOpen)` → < 1hr if market open, < 24hr otherwise

7. **Symbol Mapping** — `packages/market-data/src/symbol-map.ts`
   - `getProviderSymbol(instrument, providerName)` → resolve from `providerSymbolMap` JSON field, fallback to `instrument.symbol`

8. **Fallback Chain / MarketDataService** — `packages/market-data/src/service.ts`
   - `MarketDataService` class wrapping all providers
   - Constructor: takes Prisma client, provider configs
   - `getQuote(instrument)`: FMP → cache check → Alpha Vantage → stale
   - `getHistory(instrument, start, end)`: Stooq → FMP
   - `searchSymbols(query)`: FMP → Alpha Vantage
   - Each call goes through the provider's rate limiter
   - On success, auto-upsert LatestQuote

9. **Barrel Export** — `packages/market-data/src/index.ts`
   - Export: `MarketDataService`, `MarketDataProvider`, rate limiter, cache, all providers, types

10. **Tests** — `packages/market-data/__tests__/`
    - Create fixture directory: `packages/market-data/__tests__/fixtures/`
    - Fixture files: `fmp-search.json`, `fmp-quote.json`, `fmp-history.json`, `fmp-429.json`, `stooq-history.csv`, `stooq-empty.csv`, `av-quote.json`, `av-search.json`, `av-rate-limited.json`
    - Test files: `fmp.test.ts`, `stooq.test.ts`, `alpha-vantage.test.ts`, `rate-limiter.test.ts`, `fallback.test.ts`, `cache.test.ts`
    - Mock `fetch` globally using Vitest's `vi.fn()` — return fixture data per test
    - Target: 30+ tests

### Constraints
- All prices → `Decimal` via `toDecimal()`. Never `parseFloat()` for financial values.
- API keys read from env vars. Never hardcode. Never log.
- Use native `fetch`. No axios, no got.
- Provider limits from env vars with sensible defaults (FMP: 5rpm/250rpd, AV: 5rpm/25rpd, Stooq: 10rpm/1000rpd).

---

## Teammate 2: `scheduler-engineer`

### Identity & Scope

You are the scheduler engineer. You build the standalone polling process in `packages/scheduler/`. You import from `@stalker/market-data` and `@stalker/shared` but do not modify them. If `MarketDataService` isn't available yet, stub it with a mock interface.

### Read First
- `SPEC.md` Section 6.3 (Polling Strategy) — flat polling, budget check, market hours, post-close
- `SPEC.md` Section 3.2 (Process Model) — scheduler is a standalone Node process
- `SESSION-2-PLAN.md` Sections 3 (Teammate 2), 5 (Architecture Decisions AD-2, AD-5)
- `packages/market-data/src/calendar/` — MarketCalendar you'll use for market hours checks

### Build Order

1. **Config** — `packages/scheduler/src/config.ts`
   - Load env vars using `dotenv` (point to correct `.env.local` path)
   - Export typed config object:
     ```typescript
     interface SchedulerConfig {
       databaseUrl: string;
       fmpApiKey: string;
       alphaVantageApiKey?: string;
       pollIntervalSeconds: number;      // default 1800
       postCloseDelaySeconds: number;    // default 900
     }
     ```
   - Fail fast with descriptive error if `DATABASE_URL` or `FMP_API_KEY` missing

2. **Budget Check** — `packages/scheduler/src/budget.ts`
   - `checkBudget(instrumentCount, pollIntervalSeconds, providerLimits)`:
     - Market hours ≈ 6.5 hours (9:30–16:00 ET)
     - `estimatedCalls = instrumentCount × Math.ceil(marketHoursSeconds / pollIntervalSeconds)`
     - Compare against `providerLimits.requestsPerDay`
     - If over: compute safe interval, return it with warning message
     - If within: return original interval with OK message
   - Log the result in the Spec 6.3 format:
     ```
     Polling plan: {N} instruments every {interval}min during market hours (~6.5hrs)
     Estimated daily calls: {estimate}/{limit} ({provider}). Budget OK.
     ```

3. **Poller** — `packages/scheduler/src/poller.ts`
   - `Poller` class with `start()` and `stop()` methods
   - State: `isRunning`, `postCloseFetchDone` (per trading day), `shutdownRequested`
   - Poll loop (uses `setTimeout`, not `setInterval`):
     ```
     while (!shutdownRequested):
       instruments = fetch all from Instrument table
       if any market is open for these instruments:
         for each instrument where market is open:
           await marketDataService.getQuote(instrument)
         postCloseFetchDone = false
       else if !postCloseFetchDone and just transitioned to closed:
         await sleep(postCloseDelaySeconds)
         for each instrument: await marketDataService.getQuote(instrument)
         postCloseFetchDone = true
       await sleep(pollIntervalMs)
     ```
   - "Just transitioned to closed" detection: track whether the previous tick saw an open market. If previous=open and current=closed, trigger post-close.
   - Log each poll cycle: instrument count, success/failure counts, duration.

4. **Entry Point** — `packages/scheduler/src/index.ts`
   - Load config
   - Initialize Prisma client
   - Initialize MarketDataService (import from `@stalker/market-data`)
   - Run budget check → log result → adjust interval if needed
   - Create Poller → start
   - Register shutdown handlers:
     ```typescript
     process.on('SIGTERM', () => shutdown());
     process.on('SIGINT', () => shutdown());
     
     async function shutdown() {
       console.log('[scheduler] Shutting down gracefully...');
       poller.stop();
       await prisma.$disconnect();
       process.exit(0);
     }
     ```

5. **Package Setup** — `packages/scheduler/package.json`
   - Add dependencies: `dotenv`, `tsx` (for TypeScript execution)
   - Add script: `"start": "tsx src/index.ts"`
   - Add `@stalker/market-data`, `@stalker/shared` as workspace dependencies

6. **Root Dev Script** — root `package.json`
   - Add `concurrently` as root dev dependency: `pnpm add -w -D concurrently`
   - Update `dev` script:
     ```json
     "dev": "concurrently -n web,sched -c blue,green \"pnpm --filter web dev\" \"pnpm --filter @stalker/scheduler start\""
     ```

7. **Tests** — `packages/scheduler/__tests__/`
   - `budget.test.ts`: Within budget, over budget (interval extension), edge cases (1 instrument, 50 instruments)
   - `poller.test.ts`:
     - Mock MarketCalendar and MarketDataService
     - Market open → polls instruments → verify getQuote called N times
     - Market closed → does not poll
     - Market close transition → post-close fetch triggered after delay
     - Graceful shutdown → poller.stop() cancels pending sleep
   - Target: 10+ tests

### Constraints
- Use `setTimeout`, never `setInterval` (AD-5)
- Graceful shutdown is mandatory — no orphan timers on SIGTERM
- Log all state transitions: startup, budget result, poll cycles, post-close trigger, shutdown
- If `MarketDataService` class isn't importable yet (teammate 1 still building), define a minimal interface and mock it. Wire the real class after both teammates merge.

---

## Lead Tasks (Post-Teammate)

After both teammates complete:

1. **Verify integration:** Ensure scheduler imports from `@stalker/market-data` compile correctly (not just stubs).
2. **Run full test suite:** `pnpm test` — all Session 1 tests (71) + pre-flight tests (~4) + Session 2 tests (target 40+) pass.
3. **Run `tsc --noEmit`** — zero errors across all packages.
4. **Smoke test `pnpm dev`:** Both Next.js and scheduler start. Scheduler logs budget check. If no API key is configured, scheduler logs a clear error and exits (fail-fast behavior).
5. **Update CLAUDE.md:**
   - Document rate limiter in-process limitation (AD-2 from SESSION-2-PLAN)
   - Document provider fixture strategy for future test updates
6. **Commit and push.**

---

## Quality Gate

| Check | Target |
|-------|--------|
| `tsc --noEmit` | 0 errors |
| `pnpm test` | 115+ tests (71 existing + ~4 pre-flight + 40+ new) |
| `pnpm dev` | Both processes start without crash |
| Scheduler budget check | Logs expected output format |
| No API keys in committed code | Grep for key patterns in committed files |

---

## Exit Report Template

After session completes, write the session report covering:
- What was planned vs delivered
- Test count and breakdown
- Exit criteria checklist (from SESSION-2-PLAN.md Section 7)
- Scope cuts (if any)
- Blocking issues discovered
- Notable decisions made during session
- What's next (Session 3 preview)
