# SESSION-15-KICKOFF.md — Quote Pipeline Unblock + Scale UX Fixes

## Agent Instructions

You are starting Session 15 of the STALKER project. Read these documents in order before writing any code:

1. `CLAUDE.md` — Architecture overview, coding rules, agent protocol
2. `AGENTS.md` — Package inventory, coordination patterns
3. `STALKER_PHASE-II_ADDENDUM.md` — **Critical:** Provider architecture overrides. Tiingo is already implemented for history. You're extending it for batch quotes.
4. `SESSION-15-PLAN.md` — Full implementation spec for this session
5. `HANDOFF.md` — Current system state post-Session 14
6. `SESSION-14-REPORT.md` — What changed last session

## Context

STALKER is functionally correct (11/11 UAT, 602 tests) but has a critical operational problem: only 3 of 83 instruments have live quotes because the scheduler polls FMP one instrument at a time and FMP allows only 250 calls/day. At 83 instruments, this means ~3 polls/day and a full day to populate all quotes initially.

**Your job:** Wire Tiingo IEX batch endpoint as the primary quote source. One API call fetches all 83 instruments. Then fix the dashboard UX that breaks at 83-instrument scale.

## Session Priority Order

```
P0: Tiingo IEX batch quotes (getBatchQuotes + pollAllQuotes)
P1: Scheduler rewiring to Tiingo-primary
P2: Dashboard holdings table top-20 truncation
P3: Staleness banner adaptive text
P4: Data health footer multi-provider budget
```

If time runs short, P0 + P1 are the must-ship items. P2–P4 are high-value but not blocking.

## Critical Rules (from CLAUDE.md — reinforced)

1. **Decimal discipline:** All prices from Tiingo come as JSON numbers. Convert via `new Decimal(String(jsonNumber))` — never `new Decimal(jsonNumber)`. (AD-P2-10)
2. **No `Number()` outside chart-utils.** The batch quote pipeline must use Decimal throughout.
3. **Rate limiter:** Tiingo has a 50/hr bucket (AD-P2-11). A batch call counts as 1 request against this bucket.
4. **Error handling:** Tiingo returns HTTP 200 with text error body on some failures (R-II-12). Always try/catch JSON.parse.
5. **Tests for every new function.** Target: 615+ total tests.

## Phase 0 — Tiingo IEX Batch (Lead)

### Step 1: Examine existing TiingoProvider

Look at `packages/market-data/src/providers/tiingo.ts`. Understand the existing `getQuote()` and `getHistory()` methods. The new `getBatchQuotes()` method follows the same patterns (auth, error handling, Decimal conversion).

### Step 2: Implement getBatchQuotes()

```typescript
async getBatchQuotes(symbols: string[]): Promise<Quote[]>
```

- Endpoint: `GET https://api.tiingo.com/iex/?tickers={comma-separated}&token={key}`
- Chunk symbols into batches of 50
- Map each response item to a `Quote` object
- Use `providerSymbolMap.tiingo` from instruments when available
- Handle: partial results, empty array, HTTP 200 text errors
- 4 unit tests

### Step 3: Implement pollAllQuotes() on MarketDataService

```typescript
async pollAllQuotes(instruments: Instrument[]): Promise<PollResult>
```

- Call Tiingo batch → identify gaps → FMP single for gaps → AV for remaining gaps → write LatestQuote
- Return result summary
- 3 unit tests

### Step 4: Update scheduler

- Replace per-instrument poll loop with single `pollAllQuotes()` call
- Restore 30-minute poll interval (remove auto-adjustment that extended to ~130min)
- Update budget logging
- 2 unit tests

## Phase 1 — Dashboard UX (Teammate, parallel)

### Step 5: Dashboard holdings table truncation

- Show top 20 holdings by allocation on dashboard
- Add summary row: "Showing top 20 of {N} holdings · View all holdings →"
- Link to `/holdings`
- 2 tests

### Step 6: Staleness banner adaptive text

- < 30% stale: current behavior
- 30–79% stale: show both stale and fresh counts
- ≥ 80% stale: switch to blue "updating" style
- 3 tests

## Phase 2 — Integration (Lead)

### Step 7: Update /api/market/status

- Add Tiingo budget to response alongside FMP
- Update data health footer component to show multi-provider budget

### Step 8: Final verification

- `pnpm test` — all tests pass
- `pnpm tsc --noEmit` — 0 errors
- Review all new files for Decimal discipline

## Completion Checklist

- [ ] `getBatchQuotes()` implemented with 4 tests
- [ ] `pollAllQuotes()` implemented with 3 tests  
- [ ] Scheduler uses batch polling with 2 tests
- [ ] Dashboard shows top 20 holdings with 2 tests
- [ ] Staleness banner adapts with 3 tests
- [ ] Market status endpoint includes Tiingo budget (1 test)
- [ ] All existing 602 tests still pass
- [ ] 0 TypeScript errors
- [ ] `Number()` audit: no new violations outside chart-utils
- [ ] SESSION-15-REPORT.md written
- [ ] HANDOFF.md updated
