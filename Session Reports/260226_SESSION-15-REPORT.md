# Session 15 Report — Quote Pipeline Unblock + Scale UX Fixes

**Date:** 2026-02-26
**Duration:** ~1 session
**Team Shape:** Solo (Lead)

---

## Summary

Resolved the critical quote starvation problem blocking production use. With 83 instruments and FMP's 250 calls/day limit, the scheduler could only poll ~3 times/day — taking a full trading day to populate all quotes. Wired Tiingo IEX batch endpoint as the primary quote source: one API call fetches all 83 instruments. Then fixed dashboard UX that broke at 83-instrument scale.

---

## What Changed

### Phase 0: Tiingo IEX Batch Quotes (P0 — Must Ship)

| Component | Change |
|-----------|--------|
| `TiingoProvider.getBatchQuotes()` | New method: `GET /iex/?tickers={comma-separated}&token={key}`. Chunks into batches of 50. Handles partial results, empty responses, HTTP 200 text errors. |
| `MarketDataService.pollAllQuotes()` | New method: Tiingo batch → FMP single → AV single fallback chain. Returns `PollResult` summary. |
| `Poller.pollInstruments()` | Prefers `pollAllQuotes()` over per-instrument `getQuote()`. Falls back gracefully if batch throws. |
| Scheduler `main()` | Budget calculation uses 1 call/cycle (not N). Provider chain logging. 30-min interval (no auto-extension). |

### Phase 1: Dashboard Scale UX

| Component | Change |
|-----------|--------|
| Dashboard page | Top-20 holdings truncation. "Showing top 20 of N holdings · View all holdings →" link to `/holdings`. |
| `StalenessBanner` | Adaptive text: 0%=hidden, 1-30%=amber standard, 31-79%=amber with counts, ≥80%=blue "Prices updating". |
| `staleness-banner-utils.ts` | New utility: `getStalenessState(staleCount, totalInstruments)` — testable pure function. |

### Phase 2: Multi-Provider Budget

| Component | Change |
|-----------|--------|
| `GET /api/market/status` | Returns `budget.primary` (Tiingo hourly+daily) + `budget.secondary` (FMP daily). Reads limits from env vars. |
| `DataHealthFooter` | Shows both Tiingo (hourly) and FMP (daily) budget. |
| `useMarketStatus` hook | Updated `MarketStatus` type with `ProviderBudget` interface for multi-provider budget. |

---

## Test Summary

| Metric | Before | After |
|--------|--------|-------|
| Test count | 602 | 631 (+29) |
| Test files | 50 | 54 (+4) |
| TypeScript errors | 0 | 0 |

### New Test Files

| File | Tests | Scope |
|------|-------|-------|
| `packages/market-data/__tests__/tiingo-batch.test.ts` | 9 | Batch quotes: 5-symbol, partial results, empty response, text error, chunking, fallback fields |
| `packages/market-data/__tests__/poll-all-quotes.test.ts` | 6 | pollAllQuotes: all Tiingo, Tiingo gaps + FMP fallback, Tiingo fail + FMP fallback, all fail, empty, symbol mapping |
| `apps/web/src/lib/__tests__/staleness-banner-utils.test.ts` | 10 | Staleness state: hidden, amber-standard, amber-detailed, blue-updating, boundary cases |
| `apps/web/__tests__/api/market/status.test.ts` | 2 | Multi-provider budget response structure, env var reading |

### Modified Test Files

| File | Change |
|------|--------|
| `packages/scheduler/__tests__/poller.test.ts` | +2 tests: batch polling preference, batch fail fallback |

---

## Architecture Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| AD-S15-1 | Tiingo IEX batch as primary quote source | 1 API call = all instruments. Eliminates quote starvation. |
| AD-S15-2 | Dashboard shows top 20 holdings by allocation | Summary view pattern. 83 rows defeats "health at a glance" goal. |
| AD-S15-3 | Staleness banner adapts based on stale ratio | "80 stale" reads as failure. "Prices updating — 3 refreshed" reads as progress. |
| AD-S15-4 | Quote chain: Tiingo batch → FMP single → AV single | Cheapest first. FMP/AV for instruments Tiingo misses (mutual funds, etc). |

---

## Completion Checklist

- [x] `getBatchQuotes()` implemented with 9 tests
- [x] `pollAllQuotes()` implemented with 6 tests
- [x] Scheduler uses batch polling with 2 tests
- [x] Dashboard shows top 20 holdings with "View all" link
- [x] Staleness banner adapts with 10 tests
- [x] Market status endpoint includes Tiingo budget (2 tests)
- [x] All existing 602 tests still pass (631 total)
- [x] 0 TypeScript errors
- [x] `Number()` audit: no new violations outside chart-utils
- [x] HANDOFF.md updated

---

## Manual Verification Needed (Post-Session)

- [ ] Run scheduler with real Tiingo API key, verify 83 instruments quoted
- [ ] Open dashboard in browser, verify top-20 truncation
- [ ] Verify staleness banner shows "updating" language during initial population
- [ ] Verify staleness banner reverts to standard text once quotes populated
- [ ] Full visual browser walkthrough (chart, detail, transactions, advisor)
