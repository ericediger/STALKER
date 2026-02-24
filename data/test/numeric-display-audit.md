# Numeric Display Audit

**Date:** 2026-02-24
**Engineer:** validation-engineer (Session 9)

---

## Method

For each value, I compare:
1. **API Response** — the raw string value from the API endpoint
2. **Hand Computation** — independent calculation from source data
3. **Expected UI Display** — what `formatCurrency()` / `formatPercent()` would produce
4. **Checks** — formatting correctness (commas, decimals, sign, precision)

API data fetched from localhost:3000 with seed database (28 instruments, 30 transactions).

---

## Audit Values

### 1. Portfolio Total Value (Dashboard Hero Metric)

- **API Source:** `GET /api/portfolio/snapshot` → `totalValue: "302885.71"`
- **Hand Computation:** Sum of 28 holdings values = $302,885.71 (verified in cross-validation)
- **Expected UI:** `formatCurrency("302885.71")` = `"$302,885.71"`
- **Checks:**
  - Commas: present at thousands separator
  - Decimals: exactly 2 decimal places
  - No float artifacts (no 302885.709999...)
  - **PASS**

### 2. Day Change Amount

- **API Source:** `snapshot.window.changeAmount: "1797.92"`
- **Hand Computation:** 302885.71 - 301087.79 = 1797.92
- **Expected UI:** `formatCurrency("1797.92", { showSign: true })` = `"+$1,797.92"` (positive)
- **Checks:**
  - Positive sign shown: + prefix
  - Commas: present
  - Color: green (accent-positive) since value is positive
  - **PASS**

### 3. Day Change Percentage

- **API Source:** `snapshot.window.changePct: "0.006"`
- **Hand Computation:** 1797.92 / 301087.79 = 0.005970... (ratio), which is 0.60% (percentage)
- **Expected UI:** `formatPercent("0.006", { showSign: true })` = `"+0.01%"`
- **Finding:**
  - The API returns the decimal ratio (0.006) not the percentage (0.60)
  - The UI displays "+0.01%" but the correct display should be "+0.60%"
  - All other % fields (unrealizedPnlPct, allocation) multiply by 100 correctly
  - **ISSUE — changePct not multiplied by 100 (see cross-validation-results.md)**

### 4. AAPL Unrealized PnL

- **API Source:** `GET /api/portfolio/holdings/AAPL` → `unrealizedPnl: "2161.6"`
- **Hand Computation:** 70 * 216.38 - 70 * 185.50 = 15146.6 - 12985 = 2161.6
- **Expected UI:** `formatCurrency("2161.6")` = `"$2,161.60"`
- **Checks:**
  - Two decimal places: .60 (toFixed(2) pads)
  - Commas: present
  - No float artifacts
  - **PASS**

### 5. MSFT Unrealized PnL

- **API Source:** `GET /api/portfolio/holdings/MSFT` → `unrealizedPnl: "5807"`
- **Hand Computation:** 75 * 495.76 - (50*420 + 25*415) = 37182 - 31375 = 5807
- **Expected UI:** `formatCurrency("5807")` = `"$5,807.00"`
- **Checks:**
  - Two decimal places: .00 (toFixed(2) pads integer)
  - Commas: present
  - **PASS**

### 6. GOOGL Unrealized PnL

- **API Source:** `GET /api/portfolio/holdings` → GOOGL `unrealizedPnl: "1164.75"`
- **Hand Computation:** 75 * 190.53 - 75 * 175 = 14289.75 - 13125 = 1164.75
- **Expected UI:** `formatCurrency("1164.75")` = `"$1,164.75"`
- **Checks:**
  - Commas: present
  - Exact two decimal places
  - **PASS**

### 7. AAPL Allocation Percentage

- **API Source:** `snapshot.holdings[AAPL].allocation: "5.00"`
- **Hand Computation:** 15146.6 / 302885.71 * 100 = 5.001...% rounded to "5.00"
- **Expected UI:** `formatPercent("5.00")` = `"5.00%"`
- **Checks:**
  - Two decimal places
  - No sign prefix (allocation is always positive)
  - **PASS**

### 8. MSFT Allocation Percentage

- **API Source:** `snapshot.holdings[MSFT].allocation: "12.28"`
- **Hand Computation:** 37182 / 302885.71 * 100 = 12.276...% rounded to "12.28"
- **Expected UI:** `formatPercent("12.28")` = `"12.28%"`
- **Checks:**
  - Two decimal places
  - Correct rounding (12.276 → 12.28)
  - **PASS**

### 9. AAPL Lot Cost Basis (Holding Detail)

- **API Source:** `GET /api/portfolio/holdings/AAPL` → `lots[0].costBasisRemaining: "12985"`
- **Hand Computation:** 70 shares * $185.50/share = $12,985.00
- **Expected UI:** `formatCurrency("12985")` = `"$12,985.00"`
- **Checks:**
  - Commas: present
  - Two decimal places
  - **PASS**

### 10. AAPL Realized PnL (Holding Detail)

- **API Source:** `GET /api/portfolio/holdings/AAPL` → `realizedPnl: "280.05"`
- **Hand Computation:**
  - SELL 30 @ $195.00 = proceeds $5,850.00
  - Cost basis: 30 * $185.50 = $5,565.00
  - Fees: $4.95
  - Realized PnL: $5,850.00 - $5,565.00 - $4.95 = $280.05
- **Expected UI:** `formatCurrency("280.05")` = `"$280.05"`
- **Checks:**
  - Exact two decimal places
  - Positive value (no minus sign)
  - Fees correctly deducted
  - **PASS**

---

## Summary

| # | Value | API String | Expected Display | Correct? |
|---|-------|-----------|-----------------|----------|
| 1 | Portfolio total value | "302885.71" | $302,885.71 | PASS |
| 2 | Day change amount | "1797.92" | +$1,797.92 | PASS |
| 3 | Day change % | "0.006" | +0.60% | ISSUE |
| 4 | AAPL unrealized PnL | "2161.6" | $2,161.60 | PASS |
| 5 | MSFT unrealized PnL | "5807" | $5,807.00 | PASS |
| 6 | GOOGL unrealized PnL | "1164.75" | $1,164.75 | PASS |
| 7 | AAPL allocation | "5.00" | 5.00% | PASS |
| 8 | MSFT allocation | "12.28" | 12.28% | PASS |
| 9 | AAPL lot cost basis | "12985" | $12,985.00 | PASS |
| 10 | AAPL realized PnL | "280.05" | $280.05 | PASS |

**Result: 9/10 PASS, 1 ISSUE**

---

## Formatting Quality Assessment

### Decimal Precision
All API values use exact string representation via Decimal.js. No floating-point artifacts detected (no values like 280.04999999...). The `formatCurrency()` function correctly uses `toFixed(2)` via Decimal.js, not native JavaScript `Number.toFixed()`.

### Sign Handling
- `formatCurrency()` with `showSign: true` correctly prefixes positive values with "+"
- Negative values use "-$" format (minus before dollar sign)
- Zero is never displayed as "-$0.00" (normalized via `d.isZero() ? d.abs() : d`)

### Comma Separators
- `addThousandsSeparators()` uses regex `/\B(?=(\d{3})+(?!\d))/g` — correct for all tested values
- Applied to integer portion only, decimal portion preserved

### Font
- Financial values use `font-mono tabular-nums` CSS classes for aligned columns
- `ValueChange` component applies `tabular-nums` for consistent number width

### Issue: changePct Semantic Mismatch
The `changePct` field in the snapshot response is the ONLY percentage-type field in the API that returns a decimal ratio instead of a percentage value. The fix is a one-line change in `apps/web/src/app/api/portfolio/snapshot/route.ts`:
- Current: `toDecimal(div(absoluteChange, startValue).toFixed(4))`
- Fix: `toDecimal(div(absoluteChange, startValue).times(100).toFixed(2))`

Or equivalently, the `buildResponseFromSnapshots` function's `percentageChange` should multiply by 100.
