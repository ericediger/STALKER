# SESSION-6-KICKOFF: Dashboard + Holdings UI

**Read SESSION-6-PLAN.md first.** This document is the execution guide.

---

## Phase 0: Housekeeping (Lead)

Before pre-flight, handle these items:

1. **Verify Session 5 font rendering.** Open the app in browser, inspect a numeric element. Confirm:
   - `DM Sans` with `font-variant-numeric: tabular-nums` renders aligned digits
   - If tabular-nums fails on `DM Sans`, switch numeric table columns to `JetBrains Mono` in the Table component (Risk R-7)
   - Document the finding in `CLAUDE.md`

2. **Install TradingView Lightweight Charts:**
   ```bash
   cd apps/web
   pnpm add lightweight-charts
   ```

3. **Install Decimal.js in the web app** (if not already available — analytics package has it, but the web app may need its own):
   ```bash
   cd apps/web
   pnpm add decimal.js
   ```

4. **Verify the `--font-*-ref` CSS variable pattern** from Session 5 is documented in `CLAUDE.md`. If not, add a note so teammates don't accidentally break font resolution by renaming CSS variables.

---

## Phase 1: Pre-Flight (Lead)

Run these checks before launching any teammate. All must pass.

```bash
# PF-1: Type check
pnpm tsc --noEmit

# PF-2: Baseline tests
pnpm test
# Expected: 324 tests pass, 0 failures

# PF-3: Build check
cd apps/web && pnpm build
# Expected: Compiled successfully

# PF-4: Dev server starts
pnpm dev
# Verify: Next.js starts, pages render at localhost:3000

# PF-5: API endpoints respond
curl http://localhost:3000/api/instruments
# Expected: 200, JSON array (may be empty)

curl http://localhost:3000/api/portfolio/snapshot
# Expected: 200, JSON with totalValue, etc. (may be zeros)

curl http://localhost:3000/api/portfolio/holdings
# Expected: 200, JSON array

curl http://localhost:3000/api/market/status
# Expected: 200, JSON with instrumentCount, budget, freshness
```

**If PF-5 fails:** Session 4 endpoints may need the database seeded. Run `pnpm db:seed` (or equivalent) to populate test data. If no seed script exists, create a minimal one that adds 2–3 instruments with transactions so the dashboard has data to render.

**Seed data recommendation:** If seeding, use instruments from the reference portfolio fixture (`data/test/reference-portfolio.json` from Session 3) to ensure price bars exist. At minimum:
- 2 instruments with BUY transactions and price bars (so chart has data)
- 1 instrument with both BUY and SELL (so realized PnL > 0)

---

## Phase 2: Teammate 1 — `dashboard-engineer`

### Identity

You are the dashboard engineer for a financial portfolio tracker. You are building the main dashboard page — the product's front door. Every number you display comes from the API as a Decimal string. You must never use `parseFloat()` or `Number()` for display formatting — use the formatters in `apps/web/src/lib/format.ts`.

### Read First
- `SESSION-6-PLAN.md` — full scope and architecture decisions
- `CLAUDE.md` — project conventions
- `apps/web/src/lib/format.ts` — the 6 formatting functions (study the API)
- `apps/web/src/components/ui/` — available base components (Card, Badge, PillToggle, Skeleton, ValueChange)
- `SPEC_v4.md` Section 9.1 — Dashboard page specification
- `SPEC_v4.md` Section 10 — Charting specification

### Step-by-Step

**Step 1: Pure utility functions** (~10 min)

Create `apps/web/src/lib/window-utils.ts`:
```typescript
// Maps PillToggle option to { startDate: string, endDate: string }
// Options: "1D" | "1W" | "1M" | "3M" | "1Y" | "ALL"
// 1D = prior weekday, 1W = -7d, 1M = -1mo, 3M = -3mo, 1Y = -1yr, ALL = no startDate
// Returns ISO date strings (YYYY-MM-DD)
export function getWindowDateRange(window: string, today?: Date): { startDate?: string; endDate: string }
```

Create `apps/web/src/lib/chart-utils.ts`:
```typescript
// Transforms API timeseries response to TradingView format
// Input: Array<{ date: string; totalValue: string }> (Decimal strings)
// Output: Array<{ time: string; value: number }> (TradingView expects number)
// NOTE: This is the ONE place where Decimal → number conversion is acceptable,
//       because the chart library requires numeric values for rendering.
//       Use parseFloat() here ONLY. Document why.
export function toAreaChartData(timeseries: TimeseriesPoint[]): AreaData[]
```

Create tests for both in `apps/web/src/lib/__tests__/`:
- `window-utils.test.ts` — all 6 windows, edge cases (weekend dates, year boundary)
- `chart-utils.test.ts` — empty array, single point, multiple points, handles zero values

**Step 2: Data fetching hooks** (~10 min)

Create `apps/web/src/lib/hooks/usePortfolioSnapshot.ts`:
```typescript
// Fetches GET /api/portfolio/snapshot with optional window params
// Returns { data, isLoading, error }
// Refetches when window changes
```

Create `apps/web/src/lib/hooks/usePortfolioTimeseries.ts`:
```typescript
// Fetches GET /api/portfolio/timeseries?startDate=&endDate=
// Returns { data, isLoading, error }
// Refetches when date range changes
```

Create `apps/web/src/lib/hooks/useMarketStatus.ts`:
```typescript
// Fetches GET /api/market/status
// Returns { data, isLoading, error }
```

Pattern for all hooks:
```typescript
"use client";
import { useState, useEffect } from "react";

export function usePortfolioSnapshot(window?: string) {
  const [data, setData] = useState<SnapshotResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (window) { /* add startDate/endDate from getWindowDateRange */ }
    fetch(`/api/portfolio/snapshot?${params}`)
      .then(res => res.json())
      .then(setData)
      .catch(setError)
      .finally(() => setIsLoading(false));
  }, [window]);

  return { data, isLoading, error };
}
```

**Step 3: Hero metric + Summary cards** (~15 min)

Create `apps/web/src/components/dashboard/HeroMetric.tsx`:
- Total portfolio value (large, `font-heading` / Crimson Pro)
- Day change: dollar amount + percentage, using `ValueChange` component for coloring
- If `isLoading`: render `Skeleton` blocks matching the layout

Create `apps/web/src/components/dashboard/SummaryCards.tsx`:
- 3 cards using Session 5 `Card` component
- Card 1: Total Gain/Loss (unrealizedPnl + realizedPnl)
- Card 2: Realized PnL
- Card 3: Unrealized PnL
- Each card shows value with `ValueChange` coloring
- If `isLoading`: render 3 `Skeleton` cards

**Step 4: Portfolio chart — HIGHEST RISK** (~25 min)

Create `apps/web/src/components/dashboard/PortfolioChart.tsx`:
```typescript
"use client";
// This is the most technically complex component in the session.
// Validate theming FIRST before building the full integration.
```

Implementation checklist:
- [ ] `useRef<HTMLDivElement>` for chart container
- [ ] `useRef<IChartApi>` for chart instance
- [ ] `useEffect` — create chart on mount, dispose on unmount
- [ ] `useEffect` — update series data when `timeseries` prop changes
- [ ] `ResizeObserver` on container for responsive width
- [ ] Area series with gradient fill (accent color → transparent)
- [ ] Dark theme applied: background, grid, text, crosshair colors
- [ ] Crosshair with value tooltip
- [ ] Empty state: if no data points, show centered "No data for selected window" text
- [ ] **Theming validation:** After initial render, verify colors match STALKER dark theme. If TradingView can't match within 30 minutes, implement custom tooltip as overlay div.

Chart configuration reference:
```typescript
const chart = createChart(containerRef.current, {
  width: container.clientWidth,
  height: 300,
  layout: {
    background: { color: '#0a0f1a' },  // bg-base-1 equivalent
    textColor: '#94a3b8',               // text-secondary equivalent
    fontFamily: "'JetBrains Mono', monospace",
  },
  grid: {
    vertLines: { color: '#1e293b' },    // bg-base-3 equivalent
    horzLines: { color: '#1e293b' },
  },
  crosshair: {
    mode: 0, // Normal
  },
  timeScale: {
    borderColor: '#1e293b',
  },
});
```

> **Important:** The hex values above are examples. Use the actual values from the Tailwind v4 CSS theme defined in Session 5. Check `apps/web/src/app/globals.css` for the `@theme` block.

**Step 5: Window selector** (~10 min)

Create `apps/web/src/components/dashboard/WindowSelector.tsx`:
- Wraps Session 5 `PillToggle` with options: `["1D", "1W", "1M", "3M", "1Y", "ALL"]`
- Default selection: `"1M"`
- `onChange` callback triggers refetch of both snapshot and timeseries via parent state
- Placed between hero metric and chart

**Step 6: Data health footer** (~10 min)

Update `apps/web/src/components/layout/DataHealthFooter.tsx`:
- Replace mock content with live data from `useMarketStatus` hook
- Display: instrument count, polling interval, budget usage bar, freshness summary
- Format: compact single line — e.g., "15 instruments · Polling 30min · 183/250 calls · Updated 5 min ago"
- If any stale instruments: amber text — "3 quotes stale > 2hr"
- If `isLoading` or error: show "Checking data health..." or last known state

**Step 7: Compose dashboard page** (~10 min)

Update `apps/web/src/app/(pages)/page.tsx`:
- Check if instruments exist (fetch instrument list or check snapshot)
- If no instruments → render `DashboardEmpty` (from Session 5)
- If instruments exist → render full dashboard:
  ```
  <WindowSelector>
  <HeroMetric>
  <PortfolioChart>
  <SummaryCards>
  <HoldingsTable compact>  ← imported from Teammate 2
  <DataHealthFooter>
  ```
- Manage `selectedWindow` state at page level, pass to child components

### Tests to Write
- `window-utils.test.ts` — 8+ tests (each window option, edge cases)
- `chart-utils.test.ts` — 5+ tests (empty, single, multiple, zero values)
- Total: **13+ new tests**

---

## Phase 3: Teammate 2 — `holdings-engineer`

### Identity

You are the holdings engineer for a financial portfolio tracker. You are building the holdings table — the core data view that users will scan daily. Numeric precision and visual alignment are critical. Every number comes from the API as a Decimal string. Use `Decimal.js` for any arithmetic (e.g., allocation %), and use the formatters in `apps/web/src/lib/format.ts` for display.

### Read First
- `SESSION-6-PLAN.md` — full scope and architecture decisions
- `CLAUDE.md` — project conventions
- `apps/web/src/lib/format.ts` — the 6 formatting functions
- `apps/web/src/components/ui/Table.tsx` — base Table component from Session 5
- `apps/web/src/components/ui/Badge.tsx` — for staleness indicators
- `apps/web/src/components/ui/ValueChange.tsx` — for PnL coloring
- `SPEC_v4.md` Section 9.1 — Dashboard holdings table columns
- `SPEC_v4.md` Section 8.3 — Portfolio holdings endpoint

### Step-by-Step

**Step 1: Pure utility functions** (~10 min)

Create `apps/web/src/lib/holdings-utils.ts`:
```typescript
import Decimal from "decimal.js";

// Sort holdings by column
export type SortColumn = "symbol" | "name" | "qty" | "price" | "value" | "unrealizedPnl" | "unrealizedPnlPct" | "allocation";
export type SortDirection = "asc" | "desc";
export function sortHoldings(holdings: Holding[], column: SortColumn, direction: SortDirection): Holding[]

// Compute allocation percentage (returns Decimal string)
export function computeAllocation(holdingValue: string, totalValue: string): string

// Compute totals for footer row
export function computeTotals(holdings: Holding[]): { totalValue: string; totalCostBasis: string; totalUnrealizedPnl: string }

// Determine if a quote is stale
export function isQuoteStale(asOf: string, marketOpen: boolean): boolean
// During market hours: stale if > 60 minutes
// Outside market hours: stale if > 24 hours
```

Create tests in `apps/web/src/lib/__tests__/holdings-utils.test.ts`:
- `sortHoldings` — sort by each column, ascending and descending
- `computeAllocation` — normal case, zero total, small values
- `computeTotals` — multiple holdings, single holding, empty array
- `isQuoteStale` — fresh during market hours, stale during market hours, fresh outside hours, stale outside hours

**Step 2: Data fetching hook** (~5 min)

Create `apps/web/src/lib/hooks/useHoldings.ts`:
```typescript
// Fetches GET /api/portfolio/holdings
// Returns { data: Holding[], isLoading, error }
```

**Step 3: Holdings table components** (~20 min)

Create `apps/web/src/components/holdings/HoldingsTable.tsx`:
- Props: `{ holdings: Holding[], totalValue: string, compact?: boolean, onSort?: (col, dir) => void }`
- `compact` mode: no sort headers, no staleness column — used by dashboard
- Full mode: sortable column headers (click to toggle asc/desc), staleness indicator
- Uses Session 5 `Table` component for structure
- All numeric columns: `text-right font-mono`
- PnL columns: wrap values in `ValueChange` component

Create `apps/web/src/components/holdings/HoldingsTableRow.tsx`:
- Renders a single holding row
- Columns: Symbol (bold), Name, Qty, Price + staleness badge, Market Value, Unrealized PnL ($), Unrealized PnL (%), Allocation %
- Symbol is a link to `/holdings/[symbol]` (Session 7 will create the page)
- If holding has no price data: show "—" for price and value, add `Badge` "No price" variant

Create `apps/web/src/components/holdings/TotalsRow.tsx`:
- Bold bottom row with aggregate: total market value, total cost basis, total unrealized PnL
- Uses `computeTotals()` from holdings-utils

**Step 4: Staleness components** (~10 min)

Create `apps/web/src/components/holdings/StalenessIndicator.tsx`:
- Small amber `Badge` showing relative time: "5m ago" or "2h ago"
- Uses `formatRelativeTime()` from Session 5 formatters
- Tooltip (Session 5 `Tooltip` component) shows full ISO timestamp
- Only renders when `isQuoteStale()` returns true

Create `apps/web/src/components/holdings/StalenessBanner.tsx`:
- Conditional banner above holdings table
- Renders when ANY holding has a stale quote
- Text: "Some prices may be outdated. Prices as of [oldest asOf timestamp]."
- Amber/warning background color

**Step 5: Holdings page** (~15 min)

Update `apps/web/src/app/(pages)/holdings/page.tsx`:
- Fetch holdings via `useHoldings` hook
- If no holdings → render `HoldingsEmpty` (from Session 5)
- If holdings exist → render:
  ```
  <StalenessBanner>
  <HoldingsTable full mode, with sort>
  <TotalsRow>
  "Add Instrument" button (for now: navigates to /transactions or shows Toast "Coming soon")
  ```
- Manage sort state: `{ column: SortColumn, direction: SortDirection }`

**Step 6: Wire into dashboard** (~5 min)

Export `HoldingsTable` for import by Teammate 1's dashboard page:
```typescript
// In dashboard page.tsx:
import { HoldingsTable } from "@/components/holdings/HoldingsTable";
// Render with compact={true}, no onSort
```

If Teammate 1 has already composed the dashboard page, add the table below the summary cards. If not, create the import and let the lead integrate.

### Tests to Write
- `holdings-utils.test.ts` — 12+ tests (sort, allocation, totals, staleness)
- Total: **12+ new tests**

---

## Phase 4: Lead Integration

After both teammates complete:

1. **Verify imports compile:**
   ```bash
   pnpm tsc --noEmit
   ```

2. **Run full test suite:**
   ```bash
   pnpm test
   # Expected: 349+ tests (324 + 13+ dashboard + 12+ holdings)
   ```

3. **Build check:**
   ```bash
   cd apps/web && pnpm build
   ```

4. **Visual smoke tests** (manual, in browser):

   **Smoke Test 1: Dashboard with data**
   ```
   Navigate to http://localhost:3000
   Verify: Hero metric shows total value and day change
   Verify: Area chart renders with data points
   Verify: Summary cards show PnL values
   Verify: Holdings table shows instruments with correct formatting
   Verify: Data health footer shows live status
   ```

   **Smoke Test 2: Window selector**
   ```
   Click each PillToggle option: 1D, 1W, 1M, 3M, 1Y, ALL
   Verify: Chart updates to show different date ranges
   Verify: Hero metric updates if snapshot supports window param
   ```

   **Smoke Test 3: Holdings page**
   ```
   Navigate to /holdings
   Verify: Full table with sortable headers
   Verify: Click column header to sort
   Verify: Totals row at bottom
   Verify: Staleness indicators on stale instruments (if any)
   ```

   **Smoke Test 4: Empty state**
   ```
   Clear database or use empty DB
   Navigate to /
   Verify: DashboardEmpty renders with "Add Instrument" button
   Navigate to /holdings
   Verify: HoldingsEmpty renders
   ```

   **Smoke Test 5: Numeric formatting**
   ```
   On holdings table, verify:
   - Dollar values show $ prefix, comma separators, 2 decimal places
   - Percentages show % suffix, sign prefix
   - Quantities preserve fractional precision
   - Negative PnL shows red, positive shows green
   - All numeric columns are right-aligned, monospaced
   ```

   **Smoke Test 6: Chart theming**
   ```
   Verify chart background matches page background
   Verify grid lines are subtle (not bright white)
   Verify crosshair tooltip is readable
   Verify area fill uses accent color gradient
   ```

5. **Fix any integration issues** (import paths, prop mismatches, CSS conflicts).

6. **Update CLAUDE.md:**
   - Document TradingView chart lifecycle pattern
   - Document the `parseFloat()` exception for chart data (AD-4 note)
   - Document data fetching hook pattern for Session 7 reference
   - Note any Session 5 font findings from Phase 0

7. **Commit and push:**
   ```
   Session 6: Dashboard — hero metric, area chart, summary cards, window selector, data health footer
   Session 6: Holdings — table with sorting, staleness indicators, totals row, holdings page
   Session 6: Lead integration — smoke tests, CLAUDE.md updates
   ```

---

## Definition of Done

- [ ] All 17 blocking exit criteria met (see SESSION-6-PLAN.md §8)
- [ ] 349+ total tests, all green
- [ ] `tsc --noEmit` clean
- [ ] `next build` succeeds
- [ ] All 6 smoke tests pass
- [ ] No `parseFloat()` or `Number()` on financial values except chart data transform (documented)
- [ ] CLAUDE.md updated with Session 6 patterns
- [ ] Committed and pushed
