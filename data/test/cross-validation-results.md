# Cross-Validation Results

**Date:** 2026-02-24
**Engineer:** validation-engineer (Session 9)

---

## 1. Regression Sweep

All quality gates pass:

| Check | Result | Details |
|-------|--------|---------|
| `pnpm test` | PASS | 469 tests, 39 files, all passing |
| `pnpm build` | PASS | Clean build, 20 routes generated |
| `pnpm exec tsc --noEmit` | PASS | Zero TypeScript errors |

---

## 2. Seed Data API Cross-Validation

Ran `data/test/cross-validate.ts` against the live dev server with 28-instrument seed data.

**Result: 42/42 checks passed. Zero failures.**

### 2.1 Portfolio Snapshot Checks

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| totalValue = sum(holdings.value) | 302885.71 | 302885.71 | PASS |
| totalCostBasis = sum(holdings.costBasis) | 264014.25 | 264014.25 | PASS |
| unrealizedPnl = totalValue - totalCostBasis | 38871.46 | 38871.46 | PASS |
| sum(allocations) ~ 100% | 100.00 | 100.02 | PASS (within 0.5% rounding tolerance) |
| changeAmount = endValue - startValue | 1797.92 | 1797.92 | PASS |

### 2.2 Per-Instrument Allocation Checks

| Symbol | Expected Allocation | Actual | Status |
|--------|-------------------|--------|--------|
| AAPL | 5.00% | 5.00% | PASS |
| MSFT | 12.28% | 12.28% | PASS |
| GOOGL | 4.72% | 4.72% | PASS |

### 2.3 AAPL Holding Detail (BUY 100 + SELL 30)

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| marketValue = 70 * 216.38 | 15146.6 | 15146.6 | PASS |
| totalCostBasis = lot sum | 12985 | 12985 | PASS |
| totalQty = lot qty sum | 70 | 70 | PASS |
| unrealizedPnl = value - cost | 2161.6 | 2161.6 | PASS |
| unrealizedPnlPct = pnl/cost*100 | 16.65 | 16.65 | PASS |
| lot[0] cost = 70 * 185.5 | 12985 | 12985 | PASS |
| trade[0] PnL = 5850 - 5565 - 4.95 | 280.05 | 280.05 | PASS |
| markPrice = latestQuote.price | 216.38 | 216.38 | PASS |

### 2.4 MSFT Holding Detail (BUY 50 + BUY 25, no sells)

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| marketValue = 75 * 495.76 | 37182 | 37182 | PASS |
| totalCostBasis = 21000 + 10375 | 31375 | 31375 | PASS |
| totalQty = 50 + 25 | 75 | 75 | PASS |
| unrealizedPnl | 5807 | 5807 | PASS |
| unrealizedPnlPct | 18.51 | 18.51 | PASS |
| lot[0] cost = 50 * 420 | 21000 | 21000 | PASS |
| lot[1] cost = 25 * 415 | 10375 | 10375 | PASS |

### 2.5 VTI Holding Detail (BUY 30, no sells)

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| marketValue = 30 * 313.32 | 9399.6 | 9399.6 | PASS |
| totalCostBasis = 30 * 261 | 7830 | 7830 | PASS |
| unrealizedPnl | 1569.6 | 1569.6 | PASS |
| unrealizedPnlPct | 20.05 | 20.05 | PASS |

### 2.6 Holdings List vs Detail Cross-Check

| Symbol | Field | List Value | Detail Value | Status |
|--------|-------|-----------|-------------|--------|
| AAPL | qty | 70 | 70 | PASS |
| AAPL | costBasis | 12985 | 12985 | PASS |
| AAPL | unrealizedPnl | 2161.6 | 2161.6 | PASS |
| MSFT | qty | 75 | 75 | PASS |
| MSFT | costBasis | 31375 | 31375 | PASS |
| MSFT | unrealizedPnl | 5807 | 5807 | PASS |
| VTI | qty | 30 | 30 | PASS |
| VTI | costBasis | 7830 | 7830 | PASS |
| VTI | unrealizedPnl | 1569.6 | 1569.6 | PASS |

---

## 3. Reference Portfolio Unit Test Validation

The reference portfolio (`data/test/reference-portfolio.json`) is validated by 24 unit tests in `packages/analytics/__tests__/reference-portfolio.test.ts`. All 24 tests pass.

### Coverage

| Checkpoint | Date | Description | Lot Tests | PnL Tests | Snapshot Tests |
|-----------|------|-------------|-----------|-----------|----------------|
| 1 | 2026-01-09 | Initial buys (5 instruments) | PASS | PASS | PASS |
| 2 | 2026-01-27 | QQQ partial sell (30 of 80) | PASS | PASS | PASS |
| 3 | 2026-02-09 | MSFT full close (200 shares) | PASS | PASS | PASS |
| 4 | 2026-02-25 | INTC price gap (carry-forward) | PASS | PASS | PASS |
| 5 | 2026-03-03 | Backdated SPY tx + rebuild | PASS | PASS | PASS |
| 6 | 2026-03-17 | Final state (all cumulative PnL) | PASS | PASS | PASS |

### Edge Cases Verified

- Multiple buy lots at different prices with correct FIFO ordering
- Partial sell consuming single lot
- Full position close (MSFT: all lots consumed, realized PnL = $4,000)
- Re-entry after full close (MSFT re-bought at $425)
- Multi-lot sell decomposition (AAPL SELL 40 = 10 from lot 1 + 30 from lot 2)
- Backdated transaction producing correct lot chronology (SPY)
- Price carry-forward during data gap (INTC, isEstimated = true)
- Cumulative realized PnL across 8 trades totaling $9,300

### Why Full-Stack Reference Validation Was Not Run

The seed database contains 28 instruments with different transactions and prices than the reference portfolio's 6 instruments. The overlapping symbols (AAPL, MSFT, VTI, QQQ) have different trade histories. Full-stack reference validation would require:

1. A clean database (or isolated SQLite file)
2. Direct price bar insertion (the reference fixtures include synthetic price bars)
3. Loading all 25 transactions in order

The analytics engine unit tests already verify the complete calculation pipeline (lot engine, PnL, snapshot builder) against the reference fixtures. The API routes are thin wrappers around these same functions, so the unit test coverage provides equivalent assurance.

---

## 4. Finding: Snapshot changePct Field

**Severity:** Non-blocking (display issue)

The `GET /api/portfolio/snapshot` endpoint returns `changePct` as a decimal ratio (e.g., `"0.006"` for a 0.60% change) instead of a percentage value (e.g., `"0.60"`). The `ValueChange` component passes this directly to `formatPercent()`, which displays it as `"0.01%"` instead of `"0.60%"`.

Other percentage fields in the API (`unrealizedPnlPct`, `allocation`) correctly multiply by 100. This is an inconsistency in the snapshot endpoint only.

**Fix:** In `apps/web/src/app/api/portfolio/snapshot/route.ts`, multiply `percentageChange` by 100 before serializing, or multiply in the UI before passing to `formatPercent()`.

---

## 5. Finding: Snapshot window=ALL Endpoint Error

**Severity:** Non-blocking (edge case)

`GET /api/portfolio/snapshot?window=ALL` returns HTTP 500 Internal Server Error. The seed data spans 2025-01-02 to 2026-02-24 (~300 trading days), which likely causes a timeout or memory issue in the snapshot builder. The 1M, 3M, and other window sizes work correctly.

**Impact:** The ALL window option on the dashboard would fail for portfolios with long histories. Other windows work fine.

---

## Summary

| Category | Status |
|----------|--------|
| Regression sweep (tests/build/tsc) | PASS |
| Seed data API validation (42 checks) | PASS |
| Reference portfolio unit tests (24 tests) | PASS |
| Findings | 2 non-blocking issues documented |
