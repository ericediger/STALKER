# Cross-Validation Results

**Date:** 2026-02-24
**Engineer:** validation-engineer (Session 9)
**Script:** `data/test/cross-validate.ts`

---

## 1. Quality Gates

All quality gates pass with zero errors:

| Check | Result | Details |
|-------|--------|---------|
| `pnpm tsc --noEmit` | PASS | Zero TypeScript errors |
| `pnpm test` | PASS | 469 tests across 39 files, all passing |
| Reference portfolio tests | PASS | 24/24 tests in `packages/analytics/__tests__/reference-portfolio.test.ts` |

---

## 2. Standalone Cross-Validation Script

The script `data/test/cross-validate.ts` performs three independent validation paths against the 6-instrument reference portfolio (25 transactions, 6 checkpoint dates).

### Usage

```bash
npx tsx data/test/cross-validate.ts
```

### Result: 749/749 checks passed. Zero failures.

---

## 3. Part A: Analytics Engine Validation

Uses `processTransactions()`, `computeRealizedPnL()`, and `buildPortfolioValueSeries()` from `@stalker/analytics` to verify the engine produces correct results against hand-computed expected values.

### Checkpoint Results

| CP | Date | Description | Lot State | Realized Trades | Cumulative PnL | Snapshot Totals | Per-Holding Values |
|----|------|-------------|-----------|-----------------|----------------|-----------------|--------------------|
| 1 | 2026-01-09 | Initial buys (5 instruments) | PASS | PASS (0 trades) | PASS ($0) | PASS | PASS (5 holdings) |
| 2 | 2026-01-27 | QQQ partial sell (30 of 80) | PASS | PASS (1 trade) | PASS ($300) | PASS | PASS (6 holdings) |
| 3 | 2026-02-09 | MSFT full close (200 shares) | PASS | PASS (2 trades) | PASS ($4,300) | PASS | PASS (5 holdings, MSFT absent) |
| 4 | 2026-02-25 | INTC price gap (carry-forward) | PASS | PASS (3 trades) | PASS ($6,550) | PASS | PASS (5 holdings, INTC isEstimated=true) |
| 5 | 2026-03-03 | Backdated SPY tx + MSFT re-entry | PASS | PASS (4 trades) | PASS ($7,550) | PASS | PASS (6 holdings, MSFT re-entered) |
| 6 | 2026-03-17 | Final state (all cumulative PnL) | PASS | PASS (8 trades) | PASS ($9,300) | PASS | PASS (6 holdings) |

### Edge Cases Verified

- Single-lot BUY creating one open lot per instrument
- Partial sell consuming portion of FIFO lot (QQQ: 30 of 80)
- Full position close removing all lots (MSFT: 200/200)
- Re-entry after full close creating new lot (MSFT: BUY 100 @ $425)
- Multi-lot sell decomposition (AAPL SELL 40 = 10 from lot 1 @ $150 + 30 from lot 2 @ $160)
- Backdated transaction maintaining correct chronological lot order (SPY BUY on Feb 3 sorted before Feb 20)
- Price carry-forward during data gap (INTC Feb 23-27, isEstimated flag set)
- Lot openedAt timestamps verified for all lots at all checkpoints
- CostBasisPerShare and costBasisRemaining verified per lot

---

## 4. Part B: Independent Calculation Cross-Check

A fully independent FIFO engine (separate from `@stalker/analytics`) recomputes all lot states, realized PnL, and portfolio valuations from scratch using only Decimal.js arithmetic and raw fixture data.

### Per-Checkpoint Verification

| CP | Date | Holdings Qty | Holdings Value | Holdings CostBasis | Total Value | Total CostBasis | Unrealized PnL | Realized PnL |
|----|------|-------------|----------------|-------------------|-------------|-----------------|----------------|--------------|
| 1 | 2026-01-09 | PASS | PASS | PASS | $183,282.50 | $181,300 | $1,982.50 | $0 |
| 2 | 2026-01-27 | PASS | PASS | PASS | $190,475 | $185,850 | $4,625 | $300 |
| 3 | 2026-02-09 | PASS | PASS | PASS | $129,235 | $125,825 | $3,410 | $4,300 |
| 4 | 2026-02-25 | PASS | PASS | PASS | $165,420 | $160,925 | $4,495 | $6,550 |
| 5 | 2026-03-03 | PASS | PASS | PASS | $183,885 | $179,425 | $4,460 | $7,550 |
| 6 | 2026-03-17 | PASS | PASS | PASS | $156,530 | $151,485 | $5,045 | $9,300 |

All per-holding quantities, values, and cost bases match expected outputs exactly.

---

## 5. Part C: Engine vs Independent Consistency

Direct comparison of the analytics engine results against the independent calculation at every checkpoint. Verifies both implementations produce identical lot counts, remaining quantities, cost bases, and realized PnL.

| CP | Date | Realized PnL Match | Lot Counts Match | Lot Quantities Match | Lot CostBasis Match |
|----|------|--------------------|------------------|---------------------|---------------------|
| 1 | 2026-01-09 | PASS | PASS (all 6 instruments) | PASS | PASS |
| 2 | 2026-01-27 | PASS | PASS (all 6 instruments) | PASS | PASS |
| 3 | 2026-02-09 | PASS | PASS (all 6 instruments) | PASS | PASS |
| 4 | 2026-02-25 | PASS | PASS (all 6 instruments) | PASS | PASS |
| 5 | 2026-03-03 | PASS | PASS (all 6 instruments) | PASS | PASS |
| 6 | 2026-03-17 | PASS | PASS (all 6 instruments) | PASS | PASS |

The analytics engine and the independent implementation produce bit-identical results at every checkpoint for every instrument.

---

## 6. Full Test Suite Confirmation

```
Test Files  39 passed (39)
     Tests  469 passed (469)
  Duration  7.29s
```

### Test Distribution by Package

| Package | Test Files | Tests |
|---------|-----------|-------|
| `@stalker/shared` | 1 | 24 |
| `@stalker/analytics` | 6 | 70 |
| `@stalker/market-data` | 7 | 82 |
| `@stalker/advisor` | 4 | 33 |
| `@stalker/scheduler` | 2 | 17 |
| `apps/web` (API routes) | 8 | 77 |
| `apps/web` (lib/utils) | 7 | 132 |
| `apps/web` (integration) | 4 | 34 |
| **Total** | **39** | **469** |

---

## 7. Reference Portfolio Test Breakdown (24 tests)

All 24 tests in `packages/analytics/__tests__/reference-portfolio.test.ts` pass:

| # | Test Name | Status |
|---|-----------|--------|
| 1 | CP1: lot state - all 5 instruments have single open lots | PASS |
| 2 | CP1: realized PnL - zero (no sells yet) | PASS |
| 3 | CP1: portfolio value snapshot matches hand-computed totals | PASS |
| 4 | CP2: lot state - QQQ has 50 remaining after selling 30 of 80 | PASS |
| 5 | CP2: realized PnL - QQQ sell produces $300 | PASS |
| 6 | CP2: portfolio value snapshot at checkpoint 2 | PASS |
| 7 | CP3: lot state - MSFT has zero open lots after full close | PASS |
| 8 | CP3: realized PnL - MSFT close produces $4,000 | PASS |
| 9 | CP3: lot state - SPY has 2 lots (including backdated Feb 3 buy) | PASS |
| 10 | CP3: portfolio value snapshot - MSFT absent from holdings | PASS |
| 11 | CP4: lot state - AAPL has 3 lots after partial sell of 90 | PASS |
| 12 | CP4: INTC carry-forward - isEstimated flag is set during price gap | PASS |
| 13 | CP4: portfolio value snapshot at checkpoint 4 | PASS |
| 14 | CP5: lot state - QQQ has 1 lot after second sell consumed Lot 1 | PASS |
| 15 | CP5: lot state - MSFT has 1 lot after re-entry | PASS |
| 16 | CP5: rebuild correctness - SPY backdated transaction results in correct 3-lot state | PASS |
| 17 | CP5: portfolio value snapshot at checkpoint 5 | PASS |
| 18 | CP6: lot state - AAPL has 3 lots after 2 sells and 1 rebuy | PASS |
| 19 | CP6: lot state - MSFT has 1 lot with 50 remaining after partial sell | PASS |
| 20 | CP6: lot state - SPY has 3 lots after partial sell of 30 | PASS |
| 21 | CP6: cumulative realized PnL - $9,300 across all instruments | PASS |
| 22 | CP6: AAPL multi-lot SELL 40 produces 2 realized trades | PASS |
| 23 | CP6: portfolio value snapshot - final totals | PASS |
| 24 | CP6: final holdings breakdown - all 6 instruments with correct values | PASS |

---

## 8. TypeScript Clean Confirmation

```
$ pnpm tsc --noEmit
(no output -- zero errors)
```

---

## 9. Regression Summary

| Category | Status | Details |
|----------|--------|---------|
| TypeScript strict mode | PASS | Zero errors |
| Full test suite (469 tests) | PASS | All passing, no skips |
| Reference portfolio (24 tests) | PASS | All 6 checkpoints verified |
| Cross-validation script (749 checks) | PASS | Engine + Independent + Consistency |
| Regressions found | NONE | No regressions detected |

---

## 10. Cross-Validation Methodology

The 749 checks break down as follows:

| Part | Description | Checks |
|------|-------------|--------|
| A: Engine | Lot state, realized trades, cumulative PnL, snapshot totals, per-holding values via `@stalker/analytics` | ~400 |
| B: Independent | Fully independent FIFO engine + valuation from scratch using only `Decimal.js` | ~175 |
| C: Consistency | Bit-for-bit comparison of engine vs independent at every checkpoint | ~175 |
| **Total** | | **749** |

All financial arithmetic uses `Decimal.js` throughout. No `Number()`, `parseFloat()`, or arithmetic operators on financial values. String comparison (`toString()`) is used for all assertions.
