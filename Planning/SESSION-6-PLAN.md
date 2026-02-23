# SESSION-6-PLAN: Dashboard + Holdings UI

**Date:** 2026-02-22
**Epic:** 6A — Dashboard + Holdings
**Mode:** PARALLEL (dashboard-engineer + holdings-engineer)
**Depends On:** Session 4 (API layer), Session 5 (UI foundation)
**Blocks:** Session 7 (Holding Detail + Transactions + Charts)

---

## 1. Session Goal

Build the two most important pages in the application. The dashboard is the product's front door — it must communicate portfolio health at a glance. The holdings page is the drill-down that power users will live in. Both pages transition from the empty states built in Session 5 to live, data-wired views.

After this session, a user with seeded data should be able to load the dashboard, see their total portfolio value with a chart, scan their holdings table, and understand the overall health of their data.

---

## 2. Scope

### In Scope

**Dashboard Page (`/`)**
- Hero metric block: total portfolio value, day change ($, %), window selector
- Portfolio value area chart (TradingView Lightweight Charts)
- Window selector (PillToggle: 1D / 1W / 1M / 3M / 1Y / ALL)
- Summary cards: total gain/loss, realized PnL, unrealized PnL
- Dashboard holdings table: symbol, name, qty, current price, market value, unrealized PnL ($, %), allocation %
- Staleness banner: conditional "Prices as of [timestamp]" with amber badge
- Data health footer: wired to `GET /api/market/status` (replacing Session 5 mock)
- Empty state → data state transition: show `DashboardEmpty` when no instruments exist, full dashboard otherwise

**Holdings Page (`/holdings`)**
- Enhanced holdings table: all dashboard columns + sortable headers + filters
- Totals row: aggregate market value, cost basis, unrealized PnL
- "Add Instrument" button (navigates to add flow — actual modal is Session 7)
- Staleness indicators per instrument (staleness badge in price column)
- Empty state → data state transition: show `HoldingsEmpty` when no instruments exist

**Shared Infrastructure**
- Data fetching hooks (SWR or plain fetch wrappers) for portfolio and market endpoints
- API response → chart data transformation utilities
- Window date range computation utility (PillToggle option → startDate/endDate)
- TradingView chart wrapper component (area chart variant)
- Loading states using `Skeleton` component from Session 5

### Out of Scope
- Holding detail page (Session 7)
- Transaction add/edit forms (Session 7)
- Add instrument modal with symbol search (Session 7)
- Candlestick chart variant (Session 7 — holding detail)
- Manual refresh button wiring to `POST /api/market/refresh` (defer to Session 7 or 9)
- Responsive optimization below desktop breakpoint (Session 9)

---

## 3. Architecture Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| AD-1 | Client-side data fetching with `fetch` + `useState`/`useEffect`, no SWR | Minimal dependency. Single user, no cache invalidation complexity. Revalidation on window focus is unnecessary for local app. If polling/revalidation is needed later, SWR can be added as a drop-in. |
| AD-2 | TradingView chart wrapped in a dedicated `PortfolioChart` client component with `useRef` lifecycle | TradingView Lightweight Charts must create/dispose chart instances imperatively. `useRef` holds the chart instance, `useEffect` creates on mount and destroys on cleanup. Resize observer handles container changes. |
| AD-3 | Window date ranges computed client-side, passed as query params | The PillToggle selection maps to `{ startDate, endDate }` computed from `new Date()` and the selected window. The API already accepts these params on `GET /api/portfolio/timeseries`. No new API work needed. |
| AD-4 | Decimal strings from API rendered via Session 5 formatters only | All API responses return Decimal values as strings (SD-3). The UI must never `parseFloat()` for display. Use `formatCurrency(value)`, `formatPercent(value)`, `formatQuantity(value)` from `apps/web/src/lib/format.ts`. Intermediate math (e.g., allocation %) uses `Decimal.js` before passing to formatters. |
| AD-5 | Conditional rendering for empty vs. data states at page level | Each page component checks instrument count from the portfolio snapshot. If zero → render existing empty state component. If nonzero → render full dashboard/holdings. No additional loading spinner on zero data — the empty state is the first render. |
| AD-6 | Holdings table shares data between dashboard and holdings page via separate fetch calls | Dashboard's inline table and the `/holdings` page both call `GET /api/portfolio/holdings` independently. No shared state layer. The data is small (<20 instruments) and the calls are local — latency is negligible. This avoids a global state manager. |

---

## 4. API Dependencies

Session 6 consumes these endpoints (all built in Session 4):

| Endpoint | Used By | Data |
|----------|---------|------|
| `GET /api/portfolio/snapshot` | Dashboard hero, summary cards | totalValue, totalCostBasis, realizedPnl, unrealizedPnl |
| `GET /api/portfolio/timeseries?startDate=&endDate=` | Dashboard chart | Array of `{ date, totalValue }` for chart rendering |
| `GET /api/portfolio/holdings` | Dashboard table, Holdings page | Array of holdings with qty, value, costBasis, unrealizedPnl per instrument |
| `GET /api/market/status` | Data health footer | instrumentCount, pollingInterval, budget, freshness |
| `GET /api/instruments` | Empty state check, instrument metadata | Array of instruments (symbol, name, exchange) |

**Known limitation from Session 4:** Historical backfill was deferred, so newly added instruments may have `firstBarDate = null` and empty timeseries data. The dashboard must handle this gracefully — the chart shows whatever data exists, and instruments without prices show cost-basis-only in the holdings table with a visual indicator.

---

## 5. Teammate Assignments

### Teammate 1: `dashboard-engineer`

**Scope:** Everything above the fold on the dashboard page, plus the chart and data health footer.

**Files owned:**
- `apps/web/src/app/(pages)/page.tsx` — Dashboard page (replace stub)
- `apps/web/src/components/dashboard/HeroMetric.tsx`
- `apps/web/src/components/dashboard/SummaryCards.tsx`
- `apps/web/src/components/dashboard/PortfolioChart.tsx` — TradingView wrapper
- `apps/web/src/components/dashboard/WindowSelector.tsx` — PillToggle integration
- `apps/web/src/components/layout/DataHealthFooter.tsx` — Replace mock with live data
- `apps/web/src/lib/hooks/usePortfolioSnapshot.ts`
- `apps/web/src/lib/hooks/usePortfolioTimeseries.ts`
- `apps/web/src/lib/hooks/useMarketStatus.ts`
- `apps/web/src/lib/chart-utils.ts` — timeseries → TradingView format
- `apps/web/src/lib/window-utils.ts` — PillToggle option → date range

**Execution order:**
1. `window-utils.ts` + `chart-utils.ts` (pure functions, testable)
2. Data fetching hooks
3. `HeroMetric` + `SummaryCards` (wired to snapshot hook)
4. `PortfolioChart` (TradingView integration — highest risk, do early)
5. `WindowSelector` (wires PillToggle to chart + snapshot refetch)
6. `DataHealthFooter` (replace mock, wire to market status hook)
7. Dashboard page: compose components, handle empty vs. data state

### Teammate 2: `holdings-engineer`

**Scope:** Dashboard inline holdings table, staleness UX, and standalone holdings page.

**Files owned:**
- `apps/web/src/components/holdings/HoldingsTable.tsx` — Shared table component
- `apps/web/src/components/holdings/HoldingsTableRow.tsx`
- `apps/web/src/components/holdings/TotalsRow.tsx`
- `apps/web/src/components/holdings/StalenessBanner.tsx`
- `apps/web/src/components/holdings/StalenessIndicator.tsx` — Per-instrument badge
- `apps/web/src/app/(pages)/holdings/page.tsx` — Holdings page (replace stub)
- `apps/web/src/lib/hooks/useHoldings.ts`
- `apps/web/src/lib/holdings-utils.ts` — sorting, filtering, allocation calc

**Execution order:**
1. `holdings-utils.ts` (sorting, filtering, allocation % — pure functions, testable)
2. `useHoldings` hook
3. `HoldingsTable` + `HoldingsTableRow` (table with sorting)
4. `TotalsRow` (aggregated footer row)
5. `StalenessIndicator` (per-instrument amber badge with tooltip)
6. `StalenessBanner` (conditional banner above table)
7. Holdings page: compose table + banner + filters + empty state
8. Wire `HoldingsTable` into dashboard page (import, pass `compact` prop for fewer columns)

**Parallel safety:** Teammate 1 owns `dashboard/` components, chart utils, and window utils. Teammate 2 owns `holdings/` components and holdings utils. The only shared touchpoint is the dashboard `page.tsx` — Teammate 1 builds it first with a placeholder for the holdings table, Teammate 2 wires in `HoldingsTable` at the end. If timing conflicts arise, Teammate 2 exports the component and Teammate 1 imports it during lead integration.

---

## 6. Key Technical Details

### 6.1 TradingView Lightweight Charts Integration

```typescript
// PortfolioChart.tsx — Lifecycle pattern
"use client";
import { createChart, IChartApi, ISeriesApi } from "lightweight-charts";
import { useRef, useEffect } from "react";

// 1. useRef for chart + series instances
// 2. useEffect(() => { create chart, add area series, return () => chart.remove() }, [])
// 3. Separate useEffect to update series data when timeseries changes
// 4. ResizeObserver on container div for responsive width
```

**Chart theming** must use the STALKER dark theme tokens:
- Background: `bg-base-1` equivalent hex
- Grid lines: `bg-base-3` equivalent hex
- Area fill: accent color with opacity gradient
- Crosshair: `text-secondary` equivalent
- Text: `text-primary` equivalent, use `font-mono` for axis labels

**Risk R-3 mitigation:** If TradingView's built-in styling can't match the dark theme precisely, use a custom tooltip overlay (absolutely positioned div tracking crosshair position) rather than fighting the library's constraints. Validate theming in step 4 of Teammate 1's execution order — if it takes >30 minutes to theme, switch to the overlay approach.

### 6.2 Day Change Calculation

Day change = `latestQuotePrice - priorTradingDayClose`

The API's `GET /api/portfolio/snapshot` should already compute this. If it doesn't return day change directly, the dashboard engineer computes it client-side:
1. Get latest snapshot `totalValue`
2. Get timeseries, find prior trading day's `totalValue`
3. Day change = current - prior

Use `formatCurrency()` with sign for dollar change, `formatPercent()` with sign for percentage.

### 6.3 Window Selector → Date Range Mapping

| Window | startDate Computation |
|--------|----------------------|
| 1D | Prior trading day (use MarketCalendar if available client-side, else subtract 1 weekday) |
| 1W | today - 7 days |
| 1M | today - 1 month |
| 3M | today - 3 months |
| 1Y | today - 1 year |
| ALL | earliest transaction date (from snapshot) or omit startDate |

`endDate` is always today. Pass as ISO date strings to `GET /api/portfolio/timeseries`.

### 6.4 Staleness Logic

A quote is considered stale when:
- During market hours: `asOf` > 60 minutes ago
- Outside market hours: `asOf` > 24 hours ago

The `GET /api/market/status` endpoint returns `freshness.staleInstruments[]` — use this to drive the `StalenessBanner` visibility and per-instrument `StalenessIndicator` badges.

### 6.5 Allocation Percentage

```
allocationPct = (holdingMarketValue / totalPortfolioValue) × 100
```

Both values are Decimal strings from the API. Compute using `Decimal.js`:
```typescript
new Decimal(holding.value).div(new Decimal(snapshot.totalValue)).mul(100)
```
Then format with `formatPercent()`.

### 6.6 Holdings Table Column Spec

**Dashboard (compact) variant:**

| Column | Alignment | Format | Font |
|--------|-----------|--------|------|
| Symbol | Left | Raw text | `font-sans` bold |
| Name | Left | Raw text | `font-sans` |
| Qty | Right | `formatQuantity()` | `font-mono` |
| Price | Right | `formatCurrency()` | `font-mono` |
| Market Value | Right | `formatCurrency()` | `font-mono` |
| Unrealized PnL ($) | Right | `formatCurrency()` with sign | `font-mono` + `ValueChange` color |
| Unrealized PnL (%) | Right | `formatPercent()` with sign | `font-mono` + `ValueChange` color |
| Allocation | Right | `formatPercent()` | `font-mono` |

**Holdings page (full) variant:** Same columns + sortable headers + staleness indicator on price column + totals row.

---

## 7. Scope Cut Rules

If time pressure hits, cut in this order (last item cut first):

1. ~~Data health footer live wiring~~ → keep Session 5 mock, wire in Session 9
2. ~~Holdings page filters~~ → defer to Session 9 (table still renders, just no filter UI)
3. ~~Sortable columns on holdings table~~ → defer to Session 7 or 9
4. ~~Staleness banner~~ → defer, per-instrument indicators are sufficient
5. Summary cards → **do not cut** (MVP acceptance criterion #6)
6. Chart → **do not cut** (MVP acceptance criterion #3)
7. Holdings table → **do not cut** (MVP acceptance criterion #4)
8. Hero metric → **do not cut** (MVP acceptance criterion #3)

---

## 8. Exit Criteria

### Blocking (all must pass for session signoff)

- [ ] Dashboard renders hero metric: total portfolio value, day change ($, %)
- [ ] Portfolio area chart renders with TradingView Lightweight Charts
- [ ] Chart responds to window selector (at minimum 1M, 1Y, ALL)
- [ ] Chart uses dark theme consistent with STALKER design tokens
- [ ] Summary cards show total gain/loss, realized PnL, unrealized PnL
- [ ] Dashboard holdings table renders with correct columns (see §6.6)
- [ ] Holdings table numeric columns use `font-mono`, right-aligned
- [ ] Holdings table PnL columns use `ValueChange` coloring (green/red)
- [ ] Allocation percentages computed correctly (sum to ~100%)
- [ ] Holdings page renders enhanced table with totals row
- [ ] Staleness indicator visible on stale instruments (amber badge)
- [ ] Data health footer shows live data from `GET /api/market/status`
- [ ] Empty state renders when no instruments exist (both pages)
- [ ] Loading states use `Skeleton` components during fetch
- [ ] All Decimal values displayed via Session 5 formatters (no `parseFloat`)
- [ ] `tsc --noEmit` — 0 errors
- [ ] `pnpm test` — 345+ tests, 0 regressions

### Targets
- New tests: 25+ (window-utils, chart-utils, holdings-utils, allocation calc)
- Total tests: 350+
- Regressions: 0

---

## 9. Checklists Applied

Per master plan Section 5:
- **Frontend: All sections** — component quality, accessibility basics, performance
- **UX/UI: Visual Design** — dark theme compliance, typography, spacing
- **UX/UI: Interaction Design** — chart interaction, window selector, staleness indicators

Key checklist items to verify:
- [ ] No raw `number` arithmetic on financial values in UI code
- [ ] All client components have `"use client"` directive
- [ ] Chart cleanup on unmount (no memory leaks)
- [ ] Keyboard navigation works on PillToggle and table sorting
- [ ] Color contrast ratios meet WCAG AA on dark background
- [ ] No layout shift when data loads (Skeleton → content transition)

---

## 10. Risk Mitigations

| Risk | Mitigation |
|------|------------|
| R-3: TradingView theming too limited | Validate in Teammate 1's step 4. If >30 min on theming, switch to custom tooltip overlay. |
| R-7: DM Sans tabular-nums not working | Verify numeric columns render with tabular figures. If DM Sans fails, use JetBrains Mono for all numeric table cells. |
| Session 4 backfill deferral: empty timeseries | Chart renders empty gracefully (no crash, shows "No data" or flat line). Holdings table shows cost-basis-only view with indicator for unpriced instruments. |
| API returns unexpected shape | Each fetch hook handles error states: show Toast on failure, render degraded view (e.g., summary cards show "--" instead of crashing). |
| Holdings table performance with many rows | Not a concern for MVP (15–20 instruments). No virtualization needed. If tested with >100 rows, add `React.memo` on row components. |
