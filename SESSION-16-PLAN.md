# SESSION-16-PLAN.md — UX Consolidation + Enhancements

**Session:** 16
**Epic:** 13 (UX Refinement)
**Mode:** Lead + 1 Teammate (Parallel)
**Depends on:** Session 15 ✅ + Design decisions confirmed
**Blocks:** Visual Browser UAT (re-run)
**Duration estimate:** 2–3 hours

---

## 1. Session Objective

Consolidate the navigation from 5 tabs to 3 tabs (Portfolio | Charts | Settings), add purchase date visibility, add transaction markers on charts, and expose instrument deletion in the UI. All changes are frontend-only — no API schema changes, no new endpoints.

**Entry state:** 631 tests, 0 TypeScript errors, 83 instruments in production database.

**Exit state:** Consolidated navigation, enhanced table with sorting + purchase date, chart markers, delete instrument UI. All existing tests pass plus new coverage.

---

## 2. Architecture Impact

### What Changes

| Layer | Impact |
|-------|--------|
| API routes | **One addition only:** `GET /api/portfolio/holdings` response gains `firstBuyDate` field per holding |
| Page routes | Remove `/holdings` page, remove `/transactions` page. `/holdings/[symbol]` (detail) STAYS. |
| Navigation | 3 tabs: Portfolio, Charts, Settings. Remove Holdings and Transactions tabs. |
| Dashboard → Portfolio | Merge: full holdings table replaces top-20 truncation. Add sorting, filtering, first buy date column, delete action. |
| Bulk paste | Moves from Transactions page to collapsible section on Portfolio page. |
| Chart components | Add `setMarkers()` call for transaction markers on candlestick charts. |

### What Does NOT Change

| Layer | Status |
|-------|--------|
| Database schema | Unchanged — `firstBuyDate` is derived from existing Transaction data |
| Analytics engine | Unchanged |
| Market data service | Unchanged |
| Scheduler | Unchanged |
| Advisor tools | Unchanged |
| Holding Detail page | Route stays at `/holdings/[symbol]`, content unchanged except for delete button |

---

## 3. Design Decisions (Confirm Before Starting)

| # | Decision | Default | Confirm? |
|---|----------|---------|----------|
| D-16-1 | Consolidate to 3 tabs (Portfolio, Charts, Settings) | Yes | ☐ |
| D-16-2 | Purchase date = First BUY date (earliest `tradeAt` where `type='BUY'`) | Yes | ☐ |
| D-16-3 | Chart markers on Holding Detail + Charts page (not portfolio area chart) | Yes | ☐ |
| D-16-4 | Holdings table shows all 83 with pagination (20/page) vs. virtual scroll | Pagination | ☐ |
| D-16-5 | Delete instrument available on table row hover + Holding Detail header | Yes | ☐ |

---

## 4. Phase 0: API Enhancement (Lead — 20 min)

### 4A: Add `firstBuyDate` to Holdings Response

**File:** `apps/web/src/app/api/portfolio/holdings/route.ts` (or the analytics function it calls)

Add a query to derive the first BUY date per instrument:

```sql
SELECT instrumentId, MIN(tradeAt) as firstBuyDate
FROM Transaction
WHERE type = 'BUY'
GROUP BY instrumentId
```

Merge into the holdings response. Each holding gains:

```typescript
{
  symbol: "VTI",
  name: "Vanguard Total Stock Market ETF",
  // ... existing fields ...
  firstBuyDate: "2025-06-15T00:00:00Z" | null  // null if no BUY transactions
}
```

**Test:** Add 2 tests in holdings API test file:
1. `firstBuyDate` returns earliest BUY date for instrument with multiple buys
2. `firstBuyDate` returns null for instrument with no transactions

### 4B: Verify Delete Instrument Endpoint

`DELETE /api/instruments/[id]` already exists and cascades to transactions (Spec §8.1). Verify:
- Deleting an instrument also deletes all its transactions
- Snapshot rebuild is triggered after deletion
- Returns 404 for unknown instrument

**Test:** Add 1 test confirming cascade delete + snapshot rebuild.

---

## 5. Phase 1: Navigation Consolidation (Teammate 1 — 45 min)

### 5A: Update Navigation Component

**File:** `apps/web/src/components/layout/Navigation.tsx` (or equivalent)

Change tabs from:
```
Dashboard │ Holdings │ Transactions │ Charts │ [⚙]
```
To:
```
Portfolio │ Charts │ [⚙]
```

- "Portfolio" links to `/` (same route as old Dashboard)
- "Charts" links to `/charts` (unchanged)
- Settings icon links to settings modal/page (unchanged)

### 5B: Remove Standalone Pages

**Delete or redirect:**
- `apps/web/src/app/(pages)/holdings/page.tsx` — DELETE (the `/holdings` route)
- `apps/web/src/app/(pages)/transactions/page.tsx` — DELETE (the `/transactions` route)

**Keep:**
- `apps/web/src/app/(pages)/holdings/[symbol]/page.tsx` — KEEP (Holding Detail)

**Redirect handling:** If someone navigates to `/holdings` or `/transactions` directly (bookmark, URL), redirect to `/`.

### 5C: Update Holding Detail Back Link

**File:** `apps/web/src/app/(pages)/holdings/[symbol]/page.tsx`

Change "← Back to Holdings" to "← Back to Portfolio" and link to `/` instead of `/holdings`.

### 5D: Update All Internal Links

Search codebase for links to `/holdings` (without `[symbol]`) and `/transactions`. Update to `/`.

**Test:** 3-4 tests:
1. Navigation renders 2 tabs (Portfolio, Charts)
2. `/holdings` redirects to `/`
3. `/transactions` redirects to `/`
4. Holding Detail back link goes to `/`

---

## 6. Phase 2: Enhanced Portfolio Table (Lead — 60 min)

This is the session's most complex phase. The dashboard's holdings table absorbs all capabilities from the deleted Holdings and Transactions pages.

### 6A: Full Holdings Table (Replace Top-20 Truncation)

**File:** `apps/web/src/app/(pages)/page.tsx` (dashboard/portfolio page)

Remove the S15 top-20 truncation logic. Show all holdings with client-side pagination:

- Default: 20 rows per page
- Pagination controls at bottom: "← Prev | Page 1 of 5 | Next →"
- Total count always visible: "83 holdings"

### 6B: Add Columns

Current dashboard columns:
```
Symbol | Name | Qty | Price | Value | PnL ($, %) | Alloc %
```

New columns:
```
Symbol | Name | First Buy | Qty | Price | Value | Day Chg ($,%) | PnL ($,%) | Cost Basis | Alloc %
```

| Column | Source | Format | Alignment |
|--------|--------|--------|-----------|
| First Buy | `firstBuyDate` from API | `MMM 'YY` (e.g., "Jun '25") | Left |
| Day Change | Existing (was only on Holdings page) | `+$X.XX (+X.XX%)` gain/loss color | Right |
| Cost Basis | Existing (was only on Holdings page) | `$XX,XXX.XX` | Right |

**Remove "Realized PnL" column** from the table — it's a portfolio-level metric (shown in summary cards) and a holding-level metric (shown on Holding Detail). Adding it to every row creates too many columns at 83 instruments. Keep it in summary cards and on Holding Detail.

### 6C: Sortable Column Headers

Wire the existing sort logic (from the old Holdings page) to the Portfolio table:

- Click column header → sort descending (first click)
- Click again → sort ascending
- Click again → default order (allocation descending)
- Active sort column shows ChevronUp/ChevronDown icon
- **Default sort: Allocation % descending**

Sortable columns: Symbol (alpha), First Buy (date), Qty (numeric), Price (numeric), Value (numeric), Day Change (numeric by $), PnL (numeric by $), Cost Basis (numeric), Alloc % (numeric).

### 6D: Search/Filter Bar

Move from old Holdings page:
- Text input to filter by symbol or name (client-side filter)
- Dropdown for instrument type (STOCK/ETF/FUND/ALL)
- Position: Above the table, below summary cards

### 6E: Totals Row

Bottom of table (or bottom of current page if paginated):
- Sum: Value, Cost Basis, PnL ($)
- Weighted average: Alloc %
- Blank: Symbol, Name, First Buy, Qty, Price, Day Change

### 6F: Row Actions

On hover, show action icons at the right edge of each row:

| Icon | Action | Behavior |
|------|--------|----------|
| Trash (Lucide Trash2) | Delete instrument | Confirmation modal → `DELETE /api/instruments/[id]` → refresh |

**Delete confirmation modal:**
```
⚠ Delete [SYMBOL]?

This will permanently delete [NAME] and all [N] transactions
associated with it. Portfolio snapshots will be rebuilt.

This action cannot be undone.

        [Cancel]  [Delete Instrument]
```

Modal uses the existing confirmation modal pattern (Bookworm): `bg-black/60` backdrop, centered modal, danger button.

### 6G: Move Bulk Paste

Move the bulk paste component from the deleted Transactions page to a collapsible section below the holdings table:

```
▶ Bulk Import Transactions
```

Expanding reveals the existing paste textarea + parse + preview + import flow. No logic changes — just a new parent location.

**Test:** 8-10 tests:
1. Table renders all 83 holdings (or mock count)
2. Pagination shows 20 per page
3. Sort by each sortable column (3 sort tests: asc, desc, default)
4. Filter by symbol text
5. First Buy date column shows correct date
6. Totals row sums correctly
7. Delete instrument shows confirmation modal
8. Delete instrument removes row and refreshes data
9. Bulk paste section is collapsible and functional

---

## 7. Phase 3: Chart Transaction Markers (Teammate 1 — 30 min)

### 7A: Build Marker Utility

**New file:** `apps/web/src/lib/chart-marker-utils.ts`

```typescript
import type { SeriesMarker, Time } from 'lightweight-charts';

interface TransactionForMarker {
  type: 'BUY' | 'SELL';
  quantity: string;      // Decimal as string
  price: string;         // Decimal as string
  tradeAt: string;       // ISO datetime
}

export function transactionsToMarkers(
  transactions: TransactionForMarker[]
): SeriesMarker<Time>[] {
  return transactions
    .map(tx => ({
      time: tx.tradeAt.split('T')[0] as Time,  // YYYY-MM-DD
      position: tx.type === 'BUY' ? 'belowBar' : 'aboveBar',
      color: tx.type === 'BUY' ? '#34D399' : '#F87171',
      shape: tx.type === 'BUY' ? 'arrowUp' : 'arrowDown',
      text: `${tx.type === 'BUY' ? 'B' : 'S'} ${formatQty(tx.quantity)}`,
    }))
    .sort((a, b) => (a.time < b.time ? -1 : 1));  // Must be sorted by time
}

function formatQty(qty: string): string {
  const n = parseFloat(qty);
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}
```

**Note:** The `Number()`/`parseFloat()` exception here is justified because TradingView requires native JS values. Document this alongside the existing exceptions in `chart-utils.ts` and `chart-candlestick-utils.ts`.

### 7B: Wire Markers to Holding Detail Chart

**File:** `apps/web/src/components/holding-detail/CandlestickChart.tsx` (or equivalent)

After the candlestick series is created and data is set, add markers:

```typescript
import { transactionsToMarkers } from '@/lib/chart-marker-utils';

// After series.setData(candlestickData):
if (transactions && transactions.length > 0) {
  const markers = transactionsToMarkers(transactions);
  series.setMarkers(markers);
}
```

The transactions are already fetched on the Holding Detail page — no additional API call needed.

### 7C: Wire Markers to Charts Page

**File:** `apps/web/src/app/(pages)/charts/page.tsx` (or chart component)

When a symbol is selected, fetch its transactions (if any) and overlay markers on the candlestick chart.

- If the symbol has no transactions (user is just viewing price data), no markers shown.
- Markers update when the symbol selection changes.

### 7D: Marker Filtering by Visible Range

Only show markers that fall within the chart's visible time range. TradingView handles this automatically — `setMarkers()` includes all markers but the library only renders visible ones. No custom filtering needed.

**Test:** 5-6 tests:
1. `transactionsToMarkers` converts BUY to green arrowUp
2. `transactionsToMarkers` converts SELL to red arrowDown
3. Markers are sorted by time ascending
4. Empty transactions array returns empty markers
5. Fractional quantities formatted correctly
6. Mixed BUY/SELL transactions produce correct marker array

---

## 8. Phase 4: Delete Instrument on Holding Detail (Lead — 15 min)

### 8A: Add Delete Button to Holding Detail Header

**File:** `apps/web/src/app/(pages)/holdings/[symbol]/page.tsx`

Add a danger-variant button in the page header, next to the instrument name:

```
← Back to Portfolio    VTI — Vanguard Total Stock Market ETF    [🗑 Delete]
```

Button uses the Danger variant (`#dc2626` bg, white text). On click, shows the same confirmation modal as the table row action. On confirm:

1. Call `DELETE /api/instruments/[id]`
2. Navigate to `/` (Portfolio page)
3. Show toast: "VTI deleted."

**Test:** 2 tests:
1. Delete button appears on Holding Detail
2. After delete, redirects to `/`

---

## 9. Quality Gates

### Before Sign-Off

```bash
pnpm tsc --noEmit          # 0 errors
pnpm test                   # 631 + new tests, 0 failures
```

### Manual Verification

| # | Check | Expected |
|---|-------|----------|
| MV-1 | Navigation shows 2 tabs (Portfolio, Charts) | No Holdings or Transactions tabs |
| MV-2 | Portfolio page shows full table with all columns | Symbol, Name, First Buy, Qty, Price, Value, Day Chg, PnL, Cost Basis, Alloc |
| MV-3 | Table sorting works on all columns | Click header → sorts correctly |
| MV-4 | Pagination works at 83 instruments | 5 pages of 20, last page has 3 |
| MV-5 | Delete instrument from table row | Trash icon → modal → confirm → row removed |
| MV-6 | Delete instrument from Holding Detail | Delete button → modal → confirm → redirect to Portfolio |
| MV-7 | Chart markers appear on Holding Detail | Green arrows for BUY, red for SELL |
| MV-8 | Chart markers appear on Charts page | Same markers when instrument selected |
| MV-9 | Bulk paste accessible from Portfolio page | Collapsible section at bottom |
| MV-10 | `/holdings` redirects to `/` | No 404 |
| MV-11 | `/transactions` redirects to `/` | No 404 |
| MV-12 | Holding Detail back link says "Back to Portfolio" | Links to `/` |

---

## 10. Scope Cut Order (If Running Long)

If the session exceeds 3 hours, cut in this order:

1. **Cut last:** Sortable headers (F-1) — core usability fix
2. **Cut second-to-last:** Delete instrument (F-5) — important but workaround exists (delete via API/DB)
3. **Cut middle:** Chart markers (F-2) — nice-to-have enhancement
4. **Cut early:** Bulk paste relocation — leave as orphaned (still works if user navigates to old URL)
5. **Never cut:** Tab consolidation (F-4) — this is the session's architectural deliverable

---

## 11. Teammate Prompts

### Lead Scope

| Phase | Work |
|-------|------|
| Phase 0 | API: `firstBuyDate` field + delete cascade verification |
| Phase 2 | Enhanced Portfolio table: full table, columns, sorting, pagination, delete action, totals row, bulk paste relocation |
| Phase 4 | Delete button on Holding Detail |
| Integration | Merge teammate work, resolve conflicts, run full test suite |

### Teammate 1 Scope

| Phase | Work |
|-------|------|
| Phase 1 | Navigation consolidation: 3-tab nav, remove pages, redirects, back link updates |
| Phase 3 | Chart transaction markers: utility function, wire to Holding Detail + Charts page |

**Filesystem boundaries (no overlap):**
- Lead: `apps/web/src/app/(pages)/page.tsx`, `apps/web/src/app/api/portfolio/`, `apps/web/src/components/dashboard/`, `apps/web/src/app/(pages)/holdings/[symbol]/page.tsx`
- Teammate 1: `apps/web/src/components/layout/Navigation.tsx`, `apps/web/src/app/(pages)/holdings/page.tsx` (delete), `apps/web/src/app/(pages)/transactions/` (delete), `apps/web/src/lib/chart-marker-utils.ts`, chart components

---

## 12. Post-Session

After Session 16, re-run the Visual Browser UAT (SESSION-UAT-PLAN.md) with updated checks for the new navigation structure. The UAT plan needs minor updates:

- Phase 1 checks updated for 3-tab navigation
- Holdings page checks become Portfolio table checks
- Transaction page checks become Holding Detail transaction checks
- Add chart marker verification
- Add delete instrument verification
