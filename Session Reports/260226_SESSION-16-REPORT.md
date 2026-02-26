# Session 16 Report — UX Consolidation + Enhancements

**Date:** 2026-02-26
**Duration:** ~1.5 hours
**Mode:** Lead + 1 Teammate (parallel, worktree isolation)

---

## Summary

Consolidated the navigation from 5 tabs (Dashboard, Holdings, Transactions, Charts, Settings) to 3 tabs (Portfolio, Charts, Settings). The Portfolio page now serves as the unified entry point with a full holdings table featuring pagination, sorting, filtering, delete actions, and bulk paste. Added purchase date visibility, chart transaction markers, and delete instrument UI on both the table and Holding Detail page.

---

## What Changed

### Phase 0: API Enhancement (Lead)
- **`GET /api/portfolio/holdings`** now returns `firstBuyDate` per holding — derived from `MIN(tradeAt) WHERE type='BUY'` via Prisma `groupBy`
- **`Holding` type** gains `firstBuyDate: string | null` field
- **`sortHoldings()`** updated to handle date sorting with null-last semantics
- **`formatMonthYear()`** new utility in `format.ts` — renders "Jun '25" format
- 3 new tests for holdings-utils (firstBuyDate sorting, costBasis sorting)
- 5 new tests for formatMonthYear

### Phase 1: Navigation Consolidation (Teammate)
- **NavTabs** reduced from 4 tabs to 2: "Portfolio" (/) and "Charts" (/charts)
- **`/holdings`** page replaced with `redirect("/")` — bookmark-safe
- **`/transactions`** page replaced with `redirect("/")` — bookmark-safe
- **Holding Detail** back link updated: "Back to Portfolio" → `/`

### Phase 2: Enhanced Portfolio Table (Lead)
- **New `PortfolioTable` component** (`apps/web/src/components/dashboard/PortfolioTable.tsx`)
  - All holdings shown (no top-20 truncation from S15)
  - Client-side pagination: 20 rows/page, prev/next controls
  - 11 columns: Symbol, Name, First Buy, Qty, Price, Value, PnL $, PnL %, Cost Basis, Alloc %, Actions
  - Sortable headers: click → desc → asc → default (allocation desc). Active sort shows chevron
  - Search/filter bar: text filter by symbol/name, type dropdown
  - Totals row: sums Value, Cost Basis, PnL across all filtered holdings
  - Delete instrument: trash icon on hover → confirmation modal → API delete → refresh
- **Bulk paste** relocated from deleted Transactions page to collapsible section below table
- **`useHoldings` hook** updated with `refetch` capability
- 8 new tests (pagination, filtering, sort cycle, totals, firstBuyDate)

### Phase 3: Chart Transaction Markers (Teammate)
- **New `chart-marker-utils.ts`** — `transactionsToMarkers()` converts BUY/SELL to TradingView markers
  - BUY: green (#34D399) arrowUp below bar, label "B {qty}"
  - SELL: red (#F87171) arrowDown above bar, label "S {qty}"
  - Uses TradingView v5 `createSeriesMarkers()` plugin API (not deprecated `setMarkers()`)
- **CandlestickChart** accepts optional `transactions` prop, creates markers plugin
- **Holding Detail** passes `data.transactions` to CandlestickChart
- **Charts page** fetches transactions for selected instrument and overlays markers
- 7 new tests for chart-marker-utils

### Phase 4: Delete on Holding Detail (Lead)
- Danger-variant "Delete" button in page header
- Confirmation modal showing instrument name + transaction count
- On confirm: `DELETE /api/instruments/[id]` → redirect to `/` → toast
- 2 new tests for delete confirmation logic

---

## Test Summary

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Test count | 631 | 659 | +28 |
| Test files | 54 | 57 | +3 |
| TypeScript errors | 0 | 0 | 0 |

### New Test Files
- `apps/web/src/lib/__tests__/portfolio-table.test.ts` — 8 tests
- `apps/web/src/lib/__tests__/chart-marker-utils.test.ts` — 7 tests
- `apps/web/src/lib/__tests__/delete-instrument.test.ts` — 2 tests

### Updated Test Files
- `apps/web/src/lib/__tests__/holdings-utils.test.ts` — +3 tests (firstBuyDate, costBasis sorting)
- `apps/web/src/lib/__tests__/format.test.ts` — +5 tests (formatMonthYear)

---

## Architecture Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| AD-S16-1 | 3-tab navigation (Portfolio, Charts, Settings) | Redundant data across 5 tabs at 83-instrument scale. Single unified view is more intuitive. |
| AD-S16-2 | First BUY date as purchase date | Shows holding period for tax awareness (short vs long-term). `MIN(tradeAt) WHERE type='BUY'` per instrument. |
| AD-S16-3 | Chart markers on per-instrument charts only | Portfolio area chart too noisy with 83 instruments. |
| AD-S16-4 | TradingView v5 `createSeriesMarkers()` plugin | `series.setMarkers()` deprecated in v5. |
| AD-S16-5 | Client-side pagination (20/page) | Simple, sufficient for ~83 instruments. Virtual scroll for 500+. |
| AD-S16-6 | `parseFloat()` in `chart-marker-utils.ts` | Third exception — TradingView requires native numbers. Documented alongside `chart-utils.ts` and `chart-candlestick-utils.ts`. |

---

## Files Changed

### New Files (4)
- `apps/web/src/components/dashboard/PortfolioTable.tsx`
- `apps/web/src/lib/chart-marker-utils.ts`
- `apps/web/src/lib/__tests__/chart-marker-utils.test.ts`
- `apps/web/src/lib/__tests__/portfolio-table.test.ts`
- `apps/web/src/lib/__tests__/delete-instrument.test.ts`

### Modified Files (10)
- `apps/web/src/app/(pages)/page.tsx` — Full rewrite: PortfolioTable + BulkPaste
- `apps/web/src/app/(pages)/holdings/page.tsx` — Replaced with redirect
- `apps/web/src/app/(pages)/transactions/page.tsx` — Replaced with redirect
- `apps/web/src/app/(pages)/holdings/[symbol]/page.tsx` — Delete button, back link, transactions prop
- `apps/web/src/app/(pages)/charts/page.tsx` — Transaction fetching, markers prop
- `apps/web/src/app/api/portfolio/holdings/route.ts` — firstBuyDate field
- `apps/web/src/components/layout/NavTabs.tsx` — 2 tabs
- `apps/web/src/components/holding-detail/CandlestickChart.tsx` — Markers plugin
- `apps/web/src/lib/holdings-utils.ts` — firstBuyDate in Holding type, SortColumn, sortHoldings
- `apps/web/src/lib/format.ts` — formatMonthYear()
- `apps/web/src/lib/hooks/useHoldings.ts` — refetch capability
- `apps/web/src/lib/__tests__/holdings-utils.test.ts` — +3 tests
- `apps/web/src/lib/__tests__/format.test.ts` — +5 tests

---

## Manual Verification Checklist

| # | Check | Status |
|---|-------|--------|
| MV-1 | Navigation shows 2 tabs (Portfolio, Charts) | Verify |
| MV-2 | Portfolio page shows full table with all columns | Verify |
| MV-3 | Table sorting works on all columns | Verify |
| MV-4 | Pagination works at 83 instruments | Verify |
| MV-5 | Delete instrument from table row | Verify |
| MV-6 | Delete instrument from Holding Detail | Verify |
| MV-7 | Chart markers appear on Holding Detail | Verify |
| MV-8 | Chart markers appear on Charts page | Verify |
| MV-9 | Bulk paste accessible from Portfolio page | Verify |
| MV-10 | `/holdings` redirects to `/` | Verify |
| MV-11 | `/transactions` redirects to `/` | Verify |
| MV-12 | Holding Detail back link says "Back to Portfolio" | Verify |

---

## Scope Notes

All planned features delivered:
- Tab consolidation (Phase 1)
- Enhanced portfolio table with all columns, sorting, pagination, filtering, delete (Phase 2)
- Chart transaction markers (Phase 3)
- Delete instrument on Holding Detail (Phase 4)
- Bulk paste relocation (Phase 2G)
- Nothing was cut.
