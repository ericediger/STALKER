# SESSION-3-PLAN: Analytics Completion + PnL Validation Fixtures

**Date:** 2026-02-21
**Epics:** 2 (remainder) + 8
**Depends on:** Session 1 (FIFO lot engine, shared types, Decimal utils, MarketCalendar) + Session 2 (market data providers, price bar schema)
**Blocks:** Session 4 (API Layer)
**Team:** Lead + 2 teammates (SEQUENCED — not parallel)
**Est. Complexity:** High

---

## 1. Session Objective

Complete the analytics engine and build the regression-guarding reference portfolio. After this session, the system can replay any set of transactions against price history and produce a correct, auditable portfolio value series with realized and unrealized PnL — the computational heart of the product.

This is the highest-correctness-risk session in the entire roadmap. The portfolio value series builder touches every invariant simultaneously: FIFO lots, carry-forward pricing, calendar-aware date iteration, Decimal precision, and the rebuild strategy. If this is right, Sessions 4–7 are plumbing and UI. If it's wrong, it surfaces late.

---

## 2. What Exists (Session 1 + 2 Baseline)

| Package | Exists | Tests |
|---------|--------|-------|
| `packages/shared/` | Types, Decimal utils, ULID, constants | 24 |
| `packages/analytics/` | FIFO lot engine, realized PnL, unrealized PnL, sell validation | 27 |
| `packages/market-data/` | 3 providers, rate limiter, fallback, cache, MarketCalendar | 90 |
| `packages/scheduler/` | Budget check, poller, graceful shutdown | 17 |
| `apps/web/` | Prisma schema (all tables), basic project structure | 4 |
| **Total** | | **162 tests** |

**Key assets already available:**
- `MarketCalendar.isTradingDay()`, `getPriorTradingDay()`, `getNextTradingDay()` — tested, including DST
- FIFO lot engine: `processTransactions()` → `Lot[]` + `RealizedTrade[]`
- Decimal utility functions for all financial arithmetic
- Prisma schema with `PortfolioValueSnapshot` table (UNIQUE on `date`)
- `PriceBar` table schema with UNIQUE on `(instrumentId, provider, resolution, date)`

---

## 3. Scope — What Gets Built

### 3A. Teammate 1: Analytics Completion (`analytics-completion`)

**Package:** `packages/analytics/`

#### 3A.1 Price Lookup Interface

Define an interface for price data access so the analytics package stays decoupled from Prisma (following Session 2's interface pattern with `PrismaClientForCache` and `MarketDataServiceLike`).

```typescript
interface PriceLookup {
  /** Returns the daily close price for an instrument on a specific trading date. Null if no bar exists. */
  getClosePrice(instrumentId: string, date: string): Promise<Decimal | null>;

  /** Returns the most recent close price on or before the given date. Null if no price history exists. */
  getClosePriceOrCarryForward(instrumentId: string, date: string): Promise<{
    price: Decimal;
    actualDate: string;
    isCarryForward: boolean;
  } | null>;

  /** Returns the earliest available price bar date for an instrument. Null if no data. */
  getFirstBarDate(instrumentId: string): Promise<string | null>;
}
```

This interface has a mock implementation for tests and will be backed by Prisma queries when wired in Session 4.

#### 3A.2 Snapshot Persistence Interface

Define the write-side interface for snapshot storage:

```typescript
interface SnapshotStore {
  /** Delete all snapshots from the given date forward. */
  deleteFrom(date: string): Promise<number>;

  /** Write a batch of snapshot rows. */
  writeBatch(snapshots: PortfolioValueSnapshot[]): Promise<void>;

  /** Read snapshots within a date range. */
  getRange(startDate: string, endDate: string): Promise<PortfolioValueSnapshot[]>;

  /** Get the single snapshot for a specific date. Null if not built yet. */
  getByDate(date: string): Promise<PortfolioValueSnapshot | null>;
}
```

#### 3A.3 Portfolio Value Series Builder (Spec 5.4)

The core build function. This is the single most important piece of code in the product.

```typescript
async function buildPortfolioValueSeries(params: {
  transactions: Transaction[];      // all transactions, all instruments
  instruments: Instrument[];        // for exchangeTz, symbol
  priceLookup: PriceLookup;
  snapshotStore: SnapshotStore;
  calendar: MarketCalendar;
  startDate: string;               // earliest affected date
  endDate: string;                 // typically "today"
}): Promise<void>
```

**Algorithm (per Spec 5.4):**
1. Delete existing snapshots from `startDate` forward (via `snapshotStore.deleteFrom()`).
2. Iterate each exchange trading date from `startDate` to `endDate` (using `calendar`).
3. For each date, replay all transactions with `tradeAt <= end_of_this_date` through the FIFO lot engine. **Optimization:** don't re-replay from scratch each day — carry lot state forward between transaction boundaries. Only re-run the lot engine when a new transaction falls on this date.
4. For each open lot, look up the daily close price via `priceLookup.getClosePriceOrCarryForward()`.
5. Compute `totalValue`, `totalCostBasis`, `unrealizedPnl`, cumulative `realizedPnl`.
6. Build `holdingsJson` keyed by symbol: `{ qty, value, costBasis, isEstimated? }`.
7. Write the `PortfolioValueSnapshot` row via `snapshotStore.writeBatch()`.

**Critical edge cases (from Spec 5.5):**

| Scenario | Implementation |
|----------|---------------|
| No price bar exists, earlier bars exist | `getClosePriceOrCarryForward()` returns carry-forward price with `isCarryForward: true`. Mark instrument as `estimated` in holdingsJson. |
| No price bar exists at all for instrument | `getFirstBarDate()` returns null → exclude from portfolio value. holdingsJson entry shows `costBasisOnly: true`. |
| Trade date before `firstBarDate` | Transaction is accepted. Snapshots before `firstBarDate` exclude this instrument's market value. |

#### 3A.4 Snapshot Rebuild Trigger

The function that Session 4's API layer will call when transactions are inserted/edited/deleted:

```typescript
async function rebuildSnapshotsFrom(params: {
  affectedDate: string;            // earliest tradeAt that changed
  transactions: Transaction[];      // full transaction set (post-change)
  instruments: Instrument[];
  priceLookup: PriceLookup;
  snapshotStore: SnapshotStore;
  calendar: MarketCalendar;
}): Promise<{ snapshotsRebuilt: number }>
```

This is a thin wrapper around `buildPortfolioValueSeries` that:
1. Deletes snapshots from `affectedDate` forward.
2. Calls `buildPortfolioValueSeries` with `startDate = affectedDate`.
3. Returns the count of snapshots rebuilt (for logging/debugging).

**Interface contract for Session 4:** The API layer will call `rebuildSnapshotsFrom()` after any transaction write. It passes the full current transaction set and the earliest affected date. The analytics package handles the rest.

#### 3A.5 Flexible Window Queries (Spec 5.6)

```typescript
async function queryPortfolioWindow(params: {
  startDate: string;
  endDate: string;
  asOf?: string;                    // ignore transactions after this datetime
  transactions: Transaction[];
  instruments: Instrument[];
  priceLookup: PriceLookup;
  snapshotStore: SnapshotStore;
  calendar: MarketCalendar;
}): Promise<PortfolioWindowResult>

interface PortfolioWindowResult {
  series: PortfolioValueSnapshot[];   // snapshots in the window
  startValue: Decimal;
  endValue: Decimal;
  absoluteChange: Decimal;
  percentageChange: Decimal;          // 4 decimal places
  realizedPnlInWindow: Decimal;       // realized PnL from sells within the window
  unrealizedPnlAtEnd: Decimal;
  holdings: HoldingBreakdown[];       // per-instrument breakdown at end of window
}
```

When `asOf` is provided, filter transactions to only those with `tradeAt <= asOf` before replay. This enables historical point-in-time queries.

#### 3A.6 Unit Tests

Target: **25–30 new tests** in `packages/analytics/__tests__/`

| Test File | Scope | Est. Count |
|-----------|-------|------------|
| `value-series.test.ts` | Series builder with mock prices, carry-forward, multi-instrument | 12–15 |
| `snapshot-rebuild.test.ts` | Rebuild from affected date, backdated insert triggers correct rebuild range | 5–7 |
| `window-query.test.ts` | Date range filtering, asOf filtering, percentage calculations | 5–7 |
| `price-lookup-mock.test.ts` | Mock implementation correctness (carry-forward, null handling) | 3–4 |

**All tests use mock `PriceLookup` and `SnapshotStore` implementations.** No Prisma dependency in analytics tests.

---

### 3B. Teammate 2: Reference Portfolio + Validation Fixtures (`validation-engineer`)

**Starts AFTER Teammate 1 is complete and Lead has verified.**

**Files:** `data/test/` + `packages/analytics/__tests__/`

#### 3B.1 Reference Portfolio Design

Create `data/test/reference-portfolio.json` containing:

**Instruments (6):**

| Symbol | Exchange | Purpose |
|--------|----------|---------|
| AAPL | NASDAQ | Multiple buys at different prices + partial sell (exercises FIFO lot tracking + partial consumption) |
| MSFT | NASDAQ | Single buy → full close (exercises complete position close + realized PnL) |
| VTI | NYSE | Three buys, no sells (exercises pure unrealized PnL computation) |
| QQQ | NASDAQ | Buy → partial sell → another buy (exercises FIFO with position re-entry after partial liquidation) |
| SPY | NYSE | Backdated transaction (exercises snapshot rebuild from past date) |
| INTC | NASDAQ | Minimal data — has a missing price bar gap (exercises carry-forward logic) |

**Transaction count:** 22–28 transactions total across all instruments.

**Mock Price Bars:** Synthetic daily close prices for each instrument across a ~60 trading day window (3 months). Prices should be simple round numbers to make manual verification straightforward. INTC must have a 3–5 day gap in price bars to exercise carry-forward.

**Checkpoint Dates:** 4–6 specific dates where expected portfolio state is independently computed:
- Date after first transaction only
- Date after multiple buys across instruments
- Date immediately after a sell (realized PnL check)
- Date during the INTC price gap (carry-forward check)
- Date after the backdated SPY transaction (rebuild correctness check)
- Final date (full portfolio state)

#### 3B.2 Expected Outputs

Create `data/test/expected-outputs.json` containing independently computed values for each checkpoint date:

```typescript
interface ExpectedOutputs {
  checkpoints: Array<{
    date: string;
    description: string;                       // human-readable explanation
    expectedLotState: {
      [symbol: string]: Array<{
        openedAt: string;
        originalQty: string;
        remainingQty: string;
        costBasisPerShare: string;
        costBasisRemaining: string;
      }>;
    };
    expectedRealizedPnl: {
      cumulative: string;                       // total realized through this date
      trades: Array<{                           // only new sells since last checkpoint
        symbol: string;
        sellDate: string;
        qty: string;
        proceeds: string;
        costBasis: string;
        realizedPnl: string;
      }>;
    };
    expectedPortfolioValue: {
      totalValue: string;
      totalCostBasis: string;
      unrealizedPnl: string;
      realizedPnl: string;
      holdings: {
        [symbol: string]: {
          qty: string;
          value: string;
          costBasis: string;
          isEstimated?: boolean;                // true if carry-forward was used
        };
      };
    };
  }>;
}
```

**Computation method:** All expected values must be computed by hand or spreadsheet — NOT by running them through the analytics engine. The point is independent verification. Include a `computation-notes.md` file in `data/test/` documenting the manual calculation steps.

#### 3B.3 Fixture-Based Automated Tests

Create `packages/analytics/__tests__/reference-portfolio.test.ts`:

**Target: 15–20 tests**

| Test Group | Assertion | Count |
|------------|-----------|-------|
| Lot state at each checkpoint | For each instrument, assert lot count, remaining qty, cost basis to the cent | 6–8 |
| Realized PnL per sell | Assert proceeds, cost basis, and PnL for each sell transaction | 3–4 |
| Portfolio value at each checkpoint | Assert totalValue, totalCostBasis, unrealizedPnl, realizedPnl | 4–6 |
| Carry-forward correctness | Assert INTC uses carried-forward price on gap dates, marked as estimated | 1–2 |
| Backdated rebuild | Assert SPY backdated transaction correctly updates all checkpoints after its trade date | 1 |

**Precision:** All assertions compare Decimal strings. No float tolerance. Values must match to the cent (two decimal places for money, full precision for quantities).

---

## 4. Sequencing Protocol

This is the critical difference from Sessions 1 and 2. **Teammates do NOT run in parallel.**

```
Phase 1: Pre-flight checks (Lead)
    ↓
Phase 2: Teammate 1 (analytics-completion) builds value series + rebuild + window queries
    ↓
Phase 3: Lead verification gate
    ↓
Phase 4: Teammate 2 (validation-engineer) builds reference portfolio + fixtures + tests
    ↓
Phase 5: Integration verification (Lead)
```

### Phase 3: Lead Verification Gate

Before launching Teammate 2, the Lead must verify:

1. **`tsc --noEmit` passes** — no type errors introduced.
2. **All existing 162 tests still pass** — no regressions.
3. **New analytics tests pass** — value series, rebuild, window queries.
4. **Code review of carry-forward logic** — confirm that:
   - `getClosePriceOrCarryForward` returns the most recent prior close, not the *next* close.
   - Instruments with no price data at all are excluded (not valued at zero).
   - The `isEstimated` / `isCarryForward` flag propagates into `holdingsJson`.
5. **Code review of rebuild trigger** — confirm that:
   - `rebuildSnapshotsFrom()` deletes from the affected date forward (not the day before, not the day after).
   - The function signature is stable and usable by Session 4's API layer.
6. **Code review of the optimization** — confirm lot state carry-forward between transaction boundaries is correct (lots are deep-copied, not shared by reference).

**If verification fails:** Fix issues before launching Teammate 2. The fixture engineer must build against correct code.

---

## 5. Pre-Flight Checks

Run before any teammate starts.

| ID | Check | Expected | Failure Action |
|----|-------|----------|----------------|
| PF-1 | `tsc --noEmit` all packages | Zero errors | Fix before proceeding |
| PF-2 | `pnpm test` baseline | 162 tests pass | Fix before proceeding |
| PF-3 | MarketCalendar date iteration | `getNextTradingDay()` iterable across 30 days without skipping or duplicating | Verify manually; this is the loop core of the value series builder |
| PF-4 | Prisma schema: PortfolioValueSnapshot | Table exists, UNIQUE on `(date)`, columns match Spec 4.2 | If schema changed since Session 1, fix before proceeding |
| PF-5 | Existing lot engine processes empty transaction list | Returns empty lots, empty realized trades, no crash | Edge case — value series builder will hit this for instruments with no transactions |

---

## 6. Filesystem Scope

No concurrent writes — sequenced teammates — but documenting scope for clarity.

| Teammate | Creates / Modifies | Does NOT Touch |
|----------|-------------------|----------------|
| analytics-completion | `packages/analytics/src/value-series.ts` | `packages/market-data/` |
| | `packages/analytics/src/snapshot-rebuild.ts` | `packages/scheduler/` |
| | `packages/analytics/src/price-lookup.ts` (interface + mock) | `apps/web/src/` |
| | `packages/analytics/src/window-query.ts` | `data/test/` |
| | `packages/analytics/__tests__/value-series.test.ts` | |
| | `packages/analytics/__tests__/snapshot-rebuild.test.ts` | |
| | `packages/analytics/__tests__/window-query.test.ts` | |
| | `packages/analytics/__tests__/price-lookup-mock.test.ts` | |
| | `packages/analytics/src/index.ts` (exports) | |
| validation-engineer | `data/test/reference-portfolio.json` | `packages/market-data/` |
| | `data/test/expected-outputs.json` | `packages/scheduler/` |
| | `data/test/computation-notes.md` | `apps/web/src/` |
| | `packages/analytics/__tests__/reference-portfolio.test.ts` | `packages/analytics/src/` (reads only) |

---

## 7. Exit Criteria

### Must Pass (Blocking)

- [ ] Portfolio value series builder implemented and tested with mock price data
- [ ] Carry-forward logic handles: missing price with prior data, no price data at all, trade before firstBarDate
- [ ] Snapshot rebuild deletes from affected date forward and recomputes correctly
- [ ] Rebuild trigger function signature is stable (documented for Session 4)
- [ ] Flexible window queries return correct series, values, and percentage changes
- [ ] `asOf` parameter correctly filters transactions for point-in-time queries
- [ ] Reference portfolio: 6 instruments, 22–28 transactions, 4–6 checkpoint dates
- [ ] Expected outputs computed independently (not by running the analytics engine)
- [ ] All fixture-based tests assert to the cent (Decimal string comparison, no float tolerance)
- [ ] All fixture tests pass
- [ ] `tsc --noEmit` — zero errors across all packages
- [ ] All tests passing (target: 200+ total, 40+ new)
- [ ] All work committed and pushed

### Should Pass (Important, not blocking)

- [ ] `computation-notes.md` documents manual calculation methodology
- [ ] Lot state carry-forward optimization implemented (not re-replaying from scratch each date)
- [ ] `holdingsJson` marks carried-forward prices with `isEstimated` flag
- [ ] `PriceLookup` and `SnapshotStore` interfaces exported from analytics package index
- [ ] CLAUDE.md updated with analytics package interface patterns and Session 4 integration notes

---

## 8. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| R-1 (FIFO edge cases) | Reference portfolio deliberately exercises partial sells, full closes, re-entries, and backdated inserts. This is the primary mitigation. |
| R-4 (Prisma Decimal comparison) | Analytics package uses interfaces, not Prisma directly. All comparison in application code with Decimal.js. |
| Value series builder performance | Single user, <100 instruments, <60 trading days typical window. Sub-second. Don't optimize prematurely. |
| Carry-forward correctness | Lead verification gate specifically reviews this logic before fixtures are built. |
| Fixture engineer uses engine to compute "expected" values | Explicit instruction: expected outputs must be computed independently. computation-notes.md is a deliverable. |

---

## 9. Decisions Carried Forward to Session 4

These decisions are made in Session 3 and must be respected in Session 4:

1. **Rebuild trigger interface:** Session 4's transaction CRUD endpoints call `rebuildSnapshotsFrom()` after any insert/edit/delete. The API layer provides the full transaction set and the earliest affected date. The analytics package handles the rest.

2. **Price lookup wiring:** Session 4 must implement a Prisma-backed `PriceLookup` that satisfies the interface. The `getClosePriceOrCarryForward()` query should use `ORDER BY date DESC, LIMIT 1` with `WHERE date <= ?`.

3. **Historical backfill is NOT in Session 3 scope.** Session 4's instrument creation endpoint triggers backfill using Stooq/FMP providers from Session 2. Session 3 only provides mock price data.

4. **process.env for API keys (from Session 2):** When Session 4 wires market data providers into Next.js API routes, ensure `.env.local` is loaded by Next.js's built-in env handling — not the scheduler's `dotenv`. Next.js has its own env loading rules. Flag this in the Session 4 plan.

---

## 10. Test Target Summary

| Phase | New Tests | Running Total |
|-------|-----------|---------------|
| Pre-flight (PF-3, PF-5) | 2–3 | ~164 |
| Teammate 1 (analytics-completion) | 25–30 | ~192 |
| Teammate 2 (validation-engineer) | 15–20 | ~210 |
| **Session total** | **42–53** | **~210** |

---

## 11. Session 4 Preview

**Session 4: API Layer (Epic 3)**
- All Next.js App Router API endpoints
- Instrument CRUD (POST triggers historical backfill via market data providers)
- Transaction CRUD (POST/PUT/DELETE triggers `rebuildSnapshotsFrom()`)
- Portfolio analytics endpoints (read from SnapshotStore)
- Market data endpoints (quote, history, search, refresh, status)
- Parallel teammates: CRUD engineer + analytics-API engineer
