# SESSION-3-KICKOFF: Analytics Completion + PnL Validation Fixtures

**Session:** 3 of 9
**Epics:** 2 (remainder) + 8
**Mode:** SEQUENCED (Teammate 1 → Lead verify → Teammate 2)
**Prerequisite:** Session 2 complete (162 tests, zero type errors)

---

## Before You Start

Read `SESSION-3-PLAN.md` fully. This kickoff is the execution sequence — the plan has the rationale, interfaces, edge cases, and exit criteria.

**Key difference from Sessions 1–2:** This session is SEQUENCED. Do not launch Teammate 2 until Teammate 1 is complete and you've verified the output. The fixture engineer must build against correct code.

---

## Phase 0: Housekeeping (Lead)

Before pre-flight, add the following to `CLAUDE.md` if not already present:

```
Local repo path: ~/Desktop/_LOCAL APP DEVELOPMENT/STOCKER
GitHub: https://github.com/ericediger/STALKER
```

The codename and GitHub repo are STALKER; the local working directory is STOCKER. This prevents teammate confusion if they see the directory name in terminal output.

---

## Phase 1: Pre-Flight (Lead)

Run these checks before launching any teammate. All must pass.

```bash
# PF-1: Type check
pnpm tsc --noEmit

# PF-2: Baseline tests
pnpm test

# Expected: 162 tests pass, 0 failures
```

Then run these targeted verifications:

**PF-3: MarketCalendar date iteration.** In a scratch test or REPL, verify `getNextTradingDay()` can iterate 30+ consecutive trading days without skipping or duplicating. This loop is the core of the value series builder.

**PF-4: Prisma schema check.** Confirm `PortfolioValueSnapshot` table has columns matching Spec 4.2: `id`, `date` (UNIQUE), `totalValue`, `totalCostBasis`, `realizedPnl`, `unrealizedPnl`, `holdingsJson`, `rebuiltAt`.

**PF-5: Lot engine empty input.** Verify that the existing FIFO lot engine handles an empty transaction array gracefully (returns empty lots and empty realized trades). The value series builder will hit this for instruments with no transactions on early dates.

If any pre-flight fails, fix it before proceeding.

---

## Phase 2: Launch Teammate 1 — `analytics-completion`

### Role Assignment

```
You are analytics-completion, a senior backend engineer completing the analytics 
engine for the STALKER portfolio tracker.
```

### Scope

Build in `packages/analytics/`:
1. **`PriceLookup` interface** + mock implementation for tests
2. **`SnapshotStore` interface** + in-memory mock for tests
3. **`buildPortfolioValueSeries()`** — the portfolio value series builder (Spec 5.4)
4. **`rebuildSnapshotsFrom()`** — the rebuild trigger for transaction writes
5. **Missing price handling** — carry-forward logic (Spec 5.5)
6. **`queryPortfolioWindow()`** — flexible window queries (Spec 5.6)
7. **Unit tests** for all of the above (~25–30 tests)

### Key Instructions for Teammate 1

**Architecture:**
- Define `PriceLookup` and `SnapshotStore` as interfaces (not concrete classes). Export them from the package index.
- Provide mock implementations alongside the interfaces for testing.
- Follow the interface pattern established in Session 2 (`PrismaClientForCache`, `MarketDataServiceLike`).
- The analytics package must have ZERO dependency on `@prisma/client` or `@stalker/market-data`. It depends only on `@stalker/shared`.

**Value series builder algorithm:**
- Iterate trading dates using `MarketCalendar.getNextTradingDay()` from `@stalker/market-data/calendar`.
  - Note: MarketCalendar is the one allowed import from market-data. If this feels wrong, the calendar module could be moved to shared — but for now, it's an acceptable cross-package read.
- For each date, determine open lots by replaying transactions through that date.
- **Optimization:** Don't replay from scratch each day. Sort transactions by `tradeAt`. Between transaction boundaries (dates where no new transaction occurs), carry lot state forward — only prices change. When a transaction falls on the current date, re-run the lot engine with the updated transaction set.
- **Critical:** When carrying lot state forward, deep-copy the lot array. Do NOT share array references across dates.
- Look up close prices via `PriceLookup.getClosePriceOrCarryForward()`.
- Build `holdingsJson` keyed by ticker symbol. Include `isEstimated: true` when carry-forward was used.

**Carry-forward rules (Spec 5.5):**
- If no price bar exists for a trading date but earlier bars exist → use most recent prior close, flag as estimated.
- If no price bar exists at all (instrument has no price data) → exclude from portfolio value. holdingsJson entry should indicate `costBasisOnly: true`.
- If trade date is before `firstBarDate` → allow it. Snapshots before `firstBarDate` exclude this instrument's market value.

**Rebuild trigger (`rebuildSnapshotsFrom`):**
- Accepts: affected date, full transaction set, instruments, PriceLookup, SnapshotStore, calendar.
- Deletes snapshots from affected date forward.
- Calls `buildPortfolioValueSeries()` with `startDate = affectedDate`.
- Returns `{ snapshotsRebuilt: number }`.
- This is the function Session 4's API layer will call. Its signature must be clean and stable.

**Window queries (`queryPortfolioWindow`):**
- Read snapshots from `SnapshotStore.getRange()`.
- If `asOf` is provided, filter transactions to `tradeAt <= asOf` before replay.
- Compute: start value, end value, absolute change, percentage change (4 decimal places), realized PnL within window, unrealized PnL at end, per-instrument breakdown.

**Tests must cover:**
- Happy path: 3 instruments, 5 transactions, 10 trading dates → correct series
- Carry-forward: instrument with price gap → correct value, `isEstimated` flag
- No price data: instrument with zero bars → excluded from value, `costBasisOnly`
- Trade before firstBarDate: transaction allowed, snapshots exclude market value until bars exist
- Rebuild from midpoint: insert backdated transaction → rebuild only from that date forward
- Window query with `asOf`: transactions after `asOf` are invisible
- Window percentage calculation: verify against manual computation
- Empty portfolio: no transactions → empty series, zero values

**Files to create:**
```
packages/analytics/src/interfaces.ts          # PriceLookup, SnapshotStore interfaces
packages/analytics/src/mocks.ts               # Mock implementations for tests
packages/analytics/src/value-series.ts        # buildPortfolioValueSeries
packages/analytics/src/snapshot-rebuild.ts    # rebuildSnapshotsFrom
packages/analytics/src/window-query.ts        # queryPortfolioWindow
packages/analytics/__tests__/value-series.test.ts
packages/analytics/__tests__/snapshot-rebuild.test.ts
packages/analytics/__tests__/window-query.test.ts
packages/analytics/__tests__/price-lookup-mock.test.ts
packages/analytics/src/index.ts               # update exports
```

**Do NOT touch:** `packages/market-data/`, `packages/scheduler/`, `apps/web/src/`, `data/test/`

---

## Phase 3: Lead Verification Gate

**Do not skip this.** Run after Teammate 1 completes, before launching Teammate 2.

### Automated checks

```bash
# All types clean
pnpm tsc --noEmit

# All tests pass (should be ~190+)
pnpm test

# Specifically run new analytics tests
pnpm --filter @stalker/analytics test
```

### Manual code review

Check these specific items:

1. **Carry-forward direction:** Open `getClosePriceOrCarryForward` mock (and the interface doc). Confirm it returns the most recent *prior* close, not the next future close. The query should be `WHERE date <= ? ORDER BY date DESC LIMIT 1`.

2. **Null handling for no-data instruments:** Confirm that when `getFirstBarDate()` returns null, the instrument is excluded from `totalValue` (not valued at zero, which would dilute the portfolio).

3. **Lot state deep copy:** In the value series builder, find where lots are carried forward between dates. Confirm the array is deep-copied (e.g., `lots.map(l => ({ ...l }))` or equivalent). Shared references would cause mutations to propagate backward.

4. **Rebuild deletes correct range:** Confirm `rebuildSnapshotsFrom()` deletes from `affectedDate` forward — not from `affectedDate - 1` and not from `affectedDate + 1`.

5. **holdingsJson shape:** Confirm it's keyed by ticker symbol (not instrumentId) per Spec 4.2. Confirm each entry has `{ qty, value, costBasis }` minimum.

6. **Interface exports:** Confirm `PriceLookup`, `SnapshotStore`, `buildPortfolioValueSeries`, `rebuildSnapshotsFrom`, and `queryPortfolioWindow` are all exported from `packages/analytics/src/index.ts`.

7. **Rebuild trigger signature:** Write down the actual signature. Confirm it's usable by Session 4's API layer (receives everything it needs, doesn't require internal analytics state).

### If issues found

Fix them before launching Teammate 2. The fixture tests must be built against correct code. Even small bugs in carry-forward or rebuild range will cascade into wrong expected values.

---

## Phase 4: Launch Teammate 2 — `validation-engineer`

### Role Assignment

```
You are validation-engineer, a senior QA engineer building the reference portfolio 
and validation test suite for the STALKER portfolio tracker.
```

### Scope

Build:
1. `data/test/reference-portfolio.json` — 6 instruments, 22–28 transactions, mock price bars
2. `data/test/expected-outputs.json` — independently computed expected values at 4–6 checkpoint dates
3. `data/test/computation-notes.md` — documents how expected values were manually computed
4. `packages/analytics/__tests__/reference-portfolio.test.ts` — fixture-based automated tests (~15–20 tests)

### Key Instructions for Teammate 2

**Reference portfolio design:**

Design the reference portfolio with these 6 instruments. Use simple round-number prices for easy manual verification:

| Symbol | Purpose | Transactions |
|--------|---------|-------------|
| AAPL | Multi-lot FIFO + partial sell | 3 buys at $150, $160, $170 → partial sell of 50% of total qty |
| MSFT | Full position close | 1 buy → 1 sell of entire position |
| VTI | Pure unrealized | 3 buys at different prices, no sells |
| QQQ | Re-entry after partial sell | 1 buy → partial sell → 1 more buy |
| SPY | Backdated transaction | 2 buys in chronological order, then a 3rd buy inserted backdated between them |
| INTC | Carry-forward exercise | 1 buy, price bars have a 3–5 day gap |

**Mock price bars:** Create ~60 trading days of synthetic close prices for each instrument. Use predictable values (e.g., AAPL starts at $155 and moves in $1 increments). INTC must have a gap of 3–5 consecutive trading days with no price bars.

**Checkpoint dates (4–6):**
1. After the first transaction in the portfolio (single holding)
2. After multiple buys across 3+ instruments
3. Immediately after a sell (check realized PnL)
4. During the INTC price gap (check carry-forward)
5. After the backdated SPY transaction (check rebuild correctness)
6. Final date (full portfolio state — all positions, all PnL)

**CRITICAL: Compute expected values independently.** Do NOT run transactions through the analytics engine to get expected values. Compute by hand or spreadsheet:
- Walk through each buy → push FIFO lot
- Walk through each sell → consume from front of FIFO queue, compute realized PnL
- At each checkpoint date, compute: lot state, portfolio value (qty × close price), cost basis, unrealized PnL, cumulative realized PnL
- Document every calculation step in `computation-notes.md`

**Fixture test assertions:**
- All monetary comparisons use Decimal string equality (e.g., `expect(result.totalValue.toString()).toBe("15234.50")`)
- No float tolerance, no rounding — values must match to the cent
- Test each checkpoint independently (not cumulatively — each test sets up from scratch or uses a shared setup)

**Files to create:**
```
data/test/reference-portfolio.json
data/test/expected-outputs.json
data/test/computation-notes.md
packages/analytics/__tests__/reference-portfolio.test.ts
```

**Do NOT modify:** Any file in `packages/analytics/src/`. Read-only access to the analytics engine — import and call it, don't change it.

---

## Phase 5: Integration Verification (Lead)

After Teammate 2 completes:

```bash
# Full type check
pnpm tsc --noEmit

# Full test suite
pnpm test

# Specifically run the reference portfolio tests
pnpm --filter @stalker/analytics test -- reference-portfolio
```

### Verify fixture quality

1. Open `data/test/computation-notes.md`. Spot-check at least 2 checkpoint calculations against the expected outputs JSON.
2. Verify the reference portfolio includes all required scenarios from Spec 13.1:
   - [x] 5+ instruments (we target 6)
   - [x] 20–30 transactions
   - [x] Multiple buy lots at different prices
   - [x] Partial sell
   - [x] Full position close
   - [x] Backdated transaction
   - [x] Missing price bar date
3. Confirm expected outputs cover: lot state, realized PnL per sell, unrealized PnL at dates, portfolio value at dates.

### Final session checks

```bash
# Count total tests
pnpm test 2>&1 | tail -5
# Expected: ~210 tests, 0 failures

# Verify no type errors
pnpm tsc --noEmit
```

### Update CLAUDE.md

Add notes about:
- Analytics package interface pattern (`PriceLookup`, `SnapshotStore`)
- How Session 4 should wire Prisma-backed implementations
- Reference portfolio fixture location and purpose
- `rebuildSnapshotsFrom()` as the rebuild trigger interface

### Commit and push

Commit all work with clear descriptions per phase.

---

## Exit Criteria Quick Reference

See `SESSION-3-PLAN.md` Section 7 for full checklist. Key gates:

| Gate | Criterion |
|------|-----------|
| Teammate 1 done | Value series, rebuild, window queries — all tested with mocks |
| Lead verification | Carry-forward direction, null handling, deep copy, rebuild range, exports |
| Teammate 2 done | Reference portfolio, expected outputs, computation notes, fixture tests |
| Session complete | 200+ total tests, zero type errors, all committed |
