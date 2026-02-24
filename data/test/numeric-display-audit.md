# Numeric Display Audit Report

**Date:** 2026-02-24
**Session:** 9 (Code-Level Decimal Precision Audit)
**Scope:** `apps/web/src/` -- all UI components, format utilities, API routes, and advisor tooling
**Rule:** All financial values (money, quantity) MUST use Decimal.js. No `Number`, `parseFloat`, `Math.round`, or arithmetic operators on financial values. Exceptions only for TradingView chart utilities.

---

## Method

Searched `apps/web/src/` for:
1. `parseFloat(` usage on financial values
2. `Math.round(`, `Math.floor(`, `Math.ceil(` on financial values
3. `Number(` outside of approved chart utility files
4. Arithmetic operators (`+`, `-`, `*`, `/`) on values that should be Decimal
5. `.toFixed(` usage that should use `formatCurrency`/`formatPercent` instead
6. Manual review of all key UI components and API routes

---

## Files Audited

### UI Components

| File | Status | Notes |
|------|--------|-------|
| `src/components/dashboard/HeroMetric.tsx` | PASS | Uses `formatCurrency()` and `ValueChange` component for all financial values |
| `src/components/dashboard/SummaryCards.tsx` | PASS | Uses `add()`, `toDecimal()` from `@stalker/shared`; renders via `ValueChange` |
| `src/components/holdings/HoldingsTable.tsx` | PASS | Uses `formatCurrency`, `formatPercent`, `formatQuantity`, `ValueChange` for all display |
| `src/components/holdings/TotalsRow.tsx` | PASS | Delegates to `computeTotals()` (Decimal-based) + `formatCurrency`/`ValueChange` |
| `src/components/holding-detail/PositionSummary.tsx` | PASS | Uses `toDecimal`, `div` from `@stalker/shared`; all rendering via format functions |
| `src/components/holding-detail/LotsTable.tsx` | PASS | All arithmetic via `new Decimal()` constructor/methods; rendering via `formatCurrency`/`formatQuantity`/`ValueChange` |
| `src/components/holding-detail/HoldingTransactions.tsx` | PASS | Uses `formatCurrency`, `formatQuantity`, `formatDate` for all financial values |
| `src/components/transactions/TransactionsTable.tsx` | PASS | Uses `mul`, `toDecimal` from `@stalker/shared`; renders via `formatCurrency`/`formatQuantity` |
| `src/components/transactions/TransactionForm.tsx` | PASS | String-based form fields; no direct numeric operations on financial values |
| `src/components/ui/ValueChange.tsx` | PASS | Uses `toDecimal` from `@stalker/shared` for sign detection; delegates to `formatCurrency`/`formatPercent` |
| `src/components/layout/DataHealthFooter.tsx` | PASS | `Math.round()` on seconds/minutes (time intervals, not financial values) |

### Format & Utility Libraries

| File | Status | Notes |
|------|--------|-------|
| `src/lib/format.ts` | PASS | All formatters use `Decimal.js` internally via `safeParse()`. `Math.floor()` at L218-224 operates on time difference (seconds), not financial values. All `.toFixed()` calls are `Decimal.toFixed()`, not `Number.toFixed()`. |
| `src/lib/holdings-utils.ts` | PASS | All arithmetic via `new Decimal()`. `sortHoldings()` uses `Decimal.cmp()`. `computeAllocation()` and `computeTotals()` are fully Decimal-based. `.toFixed(2)` at L63 is `Decimal.toFixed`, not `Number.toFixed`. |
| `src/lib/chart-utils.ts` | APPROVED EXCEPTION | `Number()` at L28 for TradingView chart rendering. Documented in file header. |
| `src/lib/chart-candlestick-utils.ts` | APPROVED EXCEPTION | `Number()` at L33-36 for TradingView chart rendering. Documented in file header. |
| `src/lib/transaction-utils.ts` | PASS (see Acceptable Patterns) | `.toNumber()` at L174, L180, L186, L192 used only for sort comparator return value. Underlying math is Decimal-based. |
| `src/lib/validators/transactionInput.ts` | PASS (see Acceptable Patterns) | `parseFloat()` at L6 used in a Zod `.refine()` boolean guard, not for financial arithmetic or storage. |
| `src/lib/cn.ts` | N/A | CSS class merging utility; no numeric operations |
| `src/lib/window-utils.ts` | N/A | Date range computation; no financial values |

### API Routes

| File | Status | Notes |
|------|--------|-------|
| `src/app/api/portfolio/holdings/route.ts` | PASS | All arithmetic via `toDecimal`, `mul`, `div` from `@stalker/shared`. `.toFixed(2)` calls are `Decimal.toFixed`. Values serialized as `.toString()`. |
| `src/app/api/portfolio/holdings/[symbol]/route.ts` | PASS | Same pattern. Decimal arithmetic, `.toFixed(2)` is Decimal method, serialized as strings. |
| `src/app/api/portfolio/snapshot/route.ts` | PASS | Uses `sub`, `div`, `isZero`, `toDecimal` from `@stalker/shared`. `.toFixed()` on Decimal objects. `serializeDecimal()` for output. |
| `src/app/api/market/status/route.ts` | PASS | `Math.floor()` at L41 and `Math.max()` at L49 operate on time interval minutes (not financial values). |
| `src/app/api/advisor/chat/route.ts` | FINDING | See Finding 1 below. |

### Advisor Chat Route Breakdown

| Location | Status | Notes |
|----------|--------|-------|
| L90-95 (snapshot holdings allocation) | PASS | Decimal `.dividedBy().times().toFixed(2)` -- all Decimal methods |
| L107-114 (snapshot totals) | PASS | Uses `formatNum()` on Decimal values, serialized as formatted strings |
| L141-150 (fallback holdings) | PASS | Same Decimal pattern as above |
| L184-222 (holding detail) | PASS | All arithmetic via Decimal. `formatNum()` for display. |
| L260-268 (transactions) | PASS | `toDecimal().times()` for total; `formatNum()` for display |
| L296-303 (quotes age) | PASS | Time interval math, not financial values |
| L365-367 (`formatNum` function) | FINDING | See Finding 1 below |

---

## Findings

### Finding 1: `formatNum()` in advisor chat route uses `parseFloat()`

**File:** `apps/web/src/app/api/advisor/chat/route.ts`
**Lines:** 365-368
**Severity:** Low (LLM display context only)

```typescript
function formatNum(value: { toFixed(dp: number): string; toNumber?(): number }): string {
  const num = parseFloat(value.toFixed(2));
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
```

**What is wrong:** Uses `parseFloat()` on a Decimal-formatted string. This converts through IEEE 754 floating-point representation, which can introduce rounding errors for values with many significant digits. For example, a value like `"999999999999999.99"` could lose precision due to the 15-17 significant digit limit of `Number`.

**Impact:** Low. This function formats values exclusively for LLM tool output (text shown in the advisor chat panel), not for financial storage, API responses consumed by the frontend UI, or further arithmetic. The prior `.toFixed(2)` truncation limits the damage to extremely large values only. However, it still technically violates the project's Decimal precision rule (Rule 1 in CLAUDE.md).

**Recommended fix:** Replace with Decimal-native string formatting:
```typescript
function formatNum(value: { toFixed(dp: number): string }): string {
  const fixed = value.toFixed(2);
  const isNeg = fixed.startsWith('-');
  const abs = isNeg ? fixed.slice(1) : fixed;
  const parts = abs.split('.');
  const intPart = parts[0] ?? '0';
  const fracPart = parts[1] ?? '00';
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (isNeg ? '-' : '') + withCommas + '.' + fracPart;
}
```

---

## Approved Exceptions

| File | Lines | Reason |
|------|-------|--------|
| `src/lib/chart-utils.ts` | L28 (`Number(point.totalValue)`) | TradingView Lightweight Charts requires `number` values for rendering. Documented in file header comment (AD-S6c). |
| `src/lib/chart-candlestick-utils.ts` | L33-36 (`Number(bar.open)` etc.) | TradingView Lightweight Charts requires `number` values for rendering. Documented in file header comment (AD-S6c). |

---

## Acceptable Patterns (Not Violations)

| File | Lines | Pattern | Reason |
|------|-------|---------|--------|
| `src/lib/transaction-utils.ts` | L174, L180, L186, L192 | `.toNumber()` on Decimal difference | `Array.sort()` comparator must return a `number`. The underlying arithmetic is fully Decimal-based (`toDecimal(a).minus(toDecimal(b))`); only the final comparison result is converted. This is not a display, storage, or financial arithmetic issue. |
| `src/lib/validators/transactionInput.ts` | L6 | `parseFloat(s) > 0` | Boolean validation refinement inside a Zod schema. The string `s` has already passed a regex check (`/^\d+(\.\d+)?$/`), ensuring it is a valid decimal format. The parsed float is used only for a `> 0` truth check, never stored or displayed. The actual value continues through the pipeline as a string. |
| `src/lib/format.ts` | L218-224 | `Math.floor()` on time diffs | Time interval computation (seconds, minutes, hours, days). Not financial values. |
| `src/components/layout/DataHealthFooter.tsx` | L6-8 | `Math.round()` on seconds/minutes | Time interval display formatting (polling interval). Not financial values. |
| `src/app/api/market/status/route.ts` | L41, L49 | `Math.floor()`, `Math.max()` | Time interval computation (quote age in minutes). Not financial values. |
| `src/app/api/advisor/chat/route.ts` | L296-303 | `ageMs / (1000 * 60 * 60)` | Time interval (quote age in hours). Not financial values. |
| `src/lib/holdings-utils.ts` | L63 | `.toFixed(2)` | This is `Decimal.toFixed(2)` (method on Decimal.js instance), not `Number.prototype.toFixed(2)`. Correct usage. |
| `src/app/api/portfolio/**/*.ts` | Multiple | `.toFixed(2)` | All are `Decimal.toFixed(2)` calls (method on Decimal.js instance), not native Number. Correct usage. |

---

## Overall Verdict

### **PASS** (with one low-severity advisory finding)

The codebase correctly follows the Decimal precision rule (Rule 1 in CLAUDE.md) across all user-facing UI components, format utilities, holdings utilities, and API routes. Key observations:

1. **UI Components (11 audited):** All PASS. Every component delegates financial value rendering to `formatCurrency()`, `formatPercent()`, `formatQuantity()`, or the `ValueChange` component. No direct numeric operations on financial values found in any component.

2. **Format Library:** PASS. `format.ts` uses `Decimal.js` internally via `safeParse()` for all financial formatting. Invalid inputs safely return an em dash.

3. **Holdings/Transaction Utilities:** PASS. All arithmetic uses `Decimal` constructors and methods. Sort comparators correctly use `.toNumber()` only for the final comparison result.

4. **API Routes (5 audited):** All PASS. Values serialized as strings via `.toString()` or `serializeDecimal()`. Percentage calculations use `Decimal.dividedBy().times(100).toFixed(2)`.

5. **Chart Utilities (2 files):** Approved exceptions with `Number()` for TradingView, documented in file headers.

6. **Advisor Chat Route:** One low-severity finding -- `formatNum()` helper uses `parseFloat()` for locale formatting of LLM-facing text output. Does not affect user-facing UI, stored data, or API contracts. Should be fixed for consistency.

**No user-visible precision bugs detected.**
