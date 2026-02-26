# SESSION-15-PLAN.md — Quote Pipeline Unblock + Scale UX Fixes

**Date:** 2026-02-25
**Session:** 15
**Epic:** 11 (completion) + 13 (new: Scale UX)
**Depends On:** Session 14 ✅
**Blocks:** Visual browser UAT (human), production use
**Team Shape:** Lead (Phase 0 + integration) + 1 Teammate (Phase 2 parallel)

---

## 0. Session Context

### Problem Statement

STALKER is functionally correct (11/11 UAT, 602 tests, 749/749 PnL cross-validation) but operationally broken at 83-instrument scale:

1. **Quote starvation:** Only 3/83 instruments have live quotes. FMP's 250 calls/day means ~3 full polls/day. Initial population takes an entire trading day.
2. **UI scale mismatch:** Dashboard holdings table, staleness indicators, and data health footer were designed for 15–20 instruments. At 83, the UX breaks down.

### Solution

Wire Tiingo IEX batch endpoint as the primary quote source for the scheduler. One API call fetches all 83 instruments. Then adapt the dashboard UX for the actual portfolio size.

### Success Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| SC-1 | Tiingo IEX batch fetches quotes for all held instruments in a single call | Unit test: mock 83-symbol batch request, assert all 83 LatestQuote rows written |
| SC-2 | Scheduler uses Tiingo batch as primary poll, falls back to FMP single | Integration test: verify poll cycle calls Tiingo first, FMP only on Tiingo failure |
| SC-3 | Dashboard holdings table shows top 20 by allocation with "View all N" link | Render test: 83 holdings → only 20 rows visible, link present |
| SC-4 | Staleness banner adapts for majority-stale state | Unit test: 80/83 stale → "Prices updating" text, not "80 stale" |
| SC-5 | Full scheduler poll cycle completes under 30 seconds with live APIs | E2E: timed poll cycle with real Tiingo key |
| SC-6 | All existing tests pass (602+) | CI gate: `pnpm test` |

---

## 1. Phase 0: Tiingo IEX Batch Provider (Lead — ~2 hours)

### Background

The Tiingo IEX endpoint supports batch quote requests:
```
GET https://api.tiingo.com/iex/?tickers=AAPL,MSFT,VTI,...&token={key}
```

Returns an array of quote objects with `last`, `prevClose`, `timestamp`, etc. One API call = all instruments.

### Task 0A: TiingoProvider.getBatchQuotes()

Add a new method to the existing TiingoProvider:

```typescript
// packages/market-data/src/providers/tiingo.ts

interface TiingoBatchQuote {
  ticker: string;
  last: number;        // Last traded price (IEX)
  prevClose: number;   // Previous day close
  timestamp: string;   // ISO-8601
  // ... other fields we don't need
}

async getBatchQuotes(symbols: string[]): Promise<Quote[]> {
  // Tiingo IEX expects comma-separated tickers
  // Chunk into groups of 100 if needed (API limit unclear, be defensive)
  // GET /iex/?tickers={joined}&token={key}
  // Map response to Quote[] using String intermediary for Decimal (AD-P2-10)
  // Handle: partial results (some symbols not found), empty response, rate limit
}
```

**Implementation notes:**
- Tiingo IEX uses its own symbol format (e.g., `BRK-B` not `BRK.B`). Use `providerSymbolMap.tiingo` from Instrument.
- If `providerSymbolMap.tiingo` is missing for an instrument, derive from symbol (most are identical).
- Chunk symbols into batches of 50 to stay safely under any per-request URL length limits.
- Parse JSON carefully — Tiingo returns HTTP 200 with text error body on some failures (R-II-12).
- Convert all prices via `new Decimal(String(jsonNumber))` per AD-P2-10.

**Tests (4):**
1. Batch of 5 symbols → 5 Quote objects with correct Decimal prices
2. Batch with 1 unknown symbol → 4 results, 1 missing (no error)
3. Empty response → empty array
4. HTTP 200 with text error body → graceful failure, empty array

### Task 0B: MarketDataService.pollAllQuotes()

Add (or refactor) a method on MarketDataService that the scheduler calls:

```typescript
async pollAllQuotes(instruments: Instrument[]): Promise<PollResult> {
  // 1. Try Tiingo IEX batch for all instruments
  // 2. Identify any instruments that Tiingo didn't return
  // 3. Fall back to FMP single-symbol for missing ones (up to budget)
  // 4. Fall back to AV for any remaining
  // 5. Write all LatestQuote rows
  // 6. Return: { updated: N, failed: M, skipped: K, provider: 'tiingo-batch' }
}
```

**Key design:**
- This replaces the current per-instrument poll loop in the scheduler
- Single Tiingo batch call covers 83 instruments → 1 API call
- FMP individual calls only for instruments Tiingo couldn't find
- Massive budget improvement: from ~250 FMP calls/day to ~13 Tiingo calls/day + a handful of FMP fallbacks

**Tests (3):**
1. 83 instruments, Tiingo returns all → 83 updated, 0 FMP calls
2. 83 instruments, Tiingo returns 80 → 80 from Tiingo, 3 attempted via FMP
3. Tiingo fails entirely → falls back to FMP single-symbol (budget-constrained)

### Task 0C: Scheduler Integration

Update the scheduler's poll loop to call `pollAllQuotes()` instead of iterating per-instrument.

**Changes:**
- `packages/scheduler/src/index.ts` (or equivalent): replace per-instrument loop with single `pollAllQuotes()` call
- Budget calculation: Tiingo batch counts as 1 call per poll cycle, not N
- Logging: log poll result summary ("Polled 83 instruments via Tiingo batch. 83 updated, 0 failed.")
- Restore polling interval to 30 minutes (from the auto-adjusted ~130 minutes)

**Tests (2):**
1. Scheduler poll cycle calls `pollAllQuotes` and logs result
2. Budget calculation correctly counts batch as 1 call

---

## 2. Phase 1: Staleness UX Adaptation (Teammate — ~1 hour, parallel with Phase 0)

### Task 1A: Staleness Banner Adaptive Text

The staleness banner (dashboard) currently shows a count of stale instruments. At 80/83 stale, this is alarming rather than informative.

**New behavior:**

| Stale Ratio | Banner Text | Style |
|---|---|---|
| 0% | (hidden) | — |
| 1–30% | "⚠ {N} instruments have stale prices (> {threshold})" | Amber (current) |
| 31–79% | "⚠ {N} of {total} instruments have stale prices. {fresh} instruments current." | Amber |
| 80–100% | "📊 Prices updating — {fresh} of {total} instruments refreshed so far" | Blue (informational, not warning) |

**Rationale:** During initial population, "prices updating" signals progress rather than failure. Once most quotes are populated, the banner reverts to the standard "N stale" pattern.

**Location:** Component that renders the staleness banner (likely in dashboard page or a shared component).

**Tests (3):**
1. 0 stale → banner hidden
2. 5 of 83 stale → amber, standard text
3. 80 of 83 stale → blue, "updating" text

### Task 1B: Dashboard Holdings Table Truncation

The dashboard holdings table should show a manageable number of rows, not all 83.

**Changes:**
- Dashboard page: Limit holdings table to top 20 by allocation (default sort)
- Add a summary row below the table: "Showing top 20 of 83 holdings · [View all holdings →]"
- "View all holdings" links to `/holdings` page
- The Holdings page (`/holdings`) continues to show all instruments (no truncation)

**Implementation:**
- Simple `.slice(0, 20)` on the sorted holdings array before rendering
- Conditional rendering of the summary row when `holdings.length > 20`
- No pagination needed — this is a "summary view" pattern, not a "paginated table" pattern

**Tests (2):**
1. 83 holdings → dashboard shows 20 rows + summary link
2. 15 holdings → dashboard shows all 15, no summary link

---

## 3. Phase 2: Integration + Data Health Footer Update (Lead — ~1 hour)

### Task 2A: Data Health Footer Accuracy

The footer currently shows FMP budget. With Tiingo batch as primary, the footer should reflect the actual poll source.

**Changes:**
- Footer should show: "{N} instruments · Polling {interval} · Tiingo: {used}/{limit}/hr · FMP: {used}/{limit}/day"
- The `GET /api/market/status` endpoint needs to include Tiingo budget alongside FMP

**Updates to `/api/market/status`:**
```typescript
budget: {
  primary: { provider: 'tiingo', usedThisHour: N, hourlyLimit: 50 },
  secondary: { provider: 'fmp', usedToday: N, dailyLimit: 250 }
}
```

**Tests (1):**
1. Status endpoint returns both provider budgets

### Task 2B: Provider Chain Documentation

Update the provider chain comment/constant wherever it's defined to reflect the new order:
```
Real-time Quotes: Tiingo IEX (batch) → FMP (single) → AV (single) → cache
```

No test needed — documentation/comment change only.

---

## 4. Phase 3: Pre-Visual-UAT Hardening (Lead — ~30 min)

### Task 3A: Holdings Table Overflow Audit

With 83 instruments, verify that:
- Long instrument names truncate with ellipsis (not wrap or overflow)
- The "Name" column has `max-width` and `text-overflow: ellipsis`
- Dollar values with 6+ digits ($224,437.52) don't overflow their column

**Implementation:** Review holdings table component. Add `truncate` (Tailwind) to the name column if not already present. Verify tabular-nums alignment still holds at $100K+ values.

### Task 3B: Advisor Tool Response at Scale

The advisor's `getPortfolioSnapshot` tool returns all holdings. With 83 instruments, this is a large JSON payload that could consume significant context window.

**Check:**
- How many tokens does a 83-instrument holdings response consume?
- If > 4K tokens, add a `topN` parameter to the tool (default 20, return top 20 by allocation with a "and N more" summary)

**Conditional implementation:** Only if the token estimate exceeds 4K. Otherwise, skip.

---

## 5. Verification Protocol

### Automated (all must pass)
- [ ] `pnpm test` — all 602+ existing tests pass
- [ ] New tests pass (target: 615+)
- [ ] `pnpm tsc --noEmit` — 0 TypeScript errors
- [ ] Tiingo IEX batch: mock returns 83 quotes from single call
- [ ] Scheduler: single poll cycle fetches all instruments
- [ ] Dashboard: 20 rows shown for 83 holdings

### Manual (human post-session)
- [ ] Run scheduler with real Tiingo API key, verify 83 instruments quoted
- [ ] Open dashboard in browser, verify top-20 truncation
- [ ] Verify staleness banner shows "updating" language during initial population
- [ ] Verify staleness banner reverts to standard text once quotes populated
- [ ] Full visual browser walkthrough (chart, detail, transactions, advisor)

---

## 6. Files Expected to Change

| File | Change Type | Phase |
|------|-------------|-------|
| `packages/market-data/src/providers/tiingo.ts` | Modified — add `getBatchQuotes()` | 0 |
| `packages/market-data/src/service.ts` | Modified — add `pollAllQuotes()` | 0 |
| `packages/market-data/src/__tests__/tiingo-batch.test.ts` | **NEW** — batch quote tests | 0 |
| `packages/scheduler/src/index.ts` | Modified — use `pollAllQuotes()` | 0 |
| `packages/scheduler/src/__tests__/poll-cycle.test.ts` | Modified — batch poll tests | 0 |
| Dashboard staleness banner component | Modified — adaptive text | 1 |
| Dashboard holdings table component | Modified — top-20 truncation | 1 |
| `apps/web/src/app/api/market/status/route.ts` | Modified — multi-provider budget | 2 |
| Holdings table UI component | Modified — truncation audit | 3 |

---

## 7. Architecture Decision Record

| # | Decision | Rationale |
|---|----------|-----------|
| AD-S15-1 | Tiingo IEX batch as primary quote source for scheduler | 1 API call = all instruments. Eliminates quote starvation. FMP reserved for search + single-symbol fallback. |
| AD-S15-2 | Dashboard shows top 20 holdings by allocation | Dashboard is a summary view. Full list on Holdings page. 83 rows below the fold defeats the "health at a glance" design goal. |
| AD-S15-3 | Staleness banner adapts based on stale ratio | "80 instruments stale" reads as system failure. "Prices updating — 3 of 83 refreshed" reads as progress. |
| AD-S15-4 | Quote provider chain: Tiingo batch → FMP single → AV single → cache | Cheapest per-instrument call first. FMP and AV as fallbacks for instruments Tiingo misses (e.g., mutual funds not on IEX). |

---

## 8. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R-S15-1 | Tiingo IEX doesn't cover all 83 symbols (mutual funds, foreign) | Medium | Medium | FMP single-symbol fallback catches gaps. Log missing symbols for manual review. |
| R-S15-2 | Tiingo IEX batch URL too long for 83 symbols | Low | Low | Chunk into batches of 50. Two calls still vastly better than 83. |
| R-S15-3 | Tiingo IEX returns delayed data (15 min) | Certain | Low | Same delay as FMP free tier. User profile checks daily/weekly — 15 min delay is immaterial. |
| R-S15-4 | Dashboard truncation confuses user who expects to see all holdings | Low | Low | Summary row + clear "View all" link. Holdings page unchanged. |
