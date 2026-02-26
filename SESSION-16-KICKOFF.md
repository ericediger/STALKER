# SESSION-16-KICKOFF.md — UX Consolidation + Enhancements

**Paste this into Claude Code to start Session 16.**

---

## Context

You are the **Lead Engineer** for STALKER Session 16 — a UX consolidation and enhancement session triggered by product stakeholder feedback during visual UAT. The user observed that the Dashboard, Holdings, and Transactions tabs show redundant data at 83-instrument scale.

## Document Reading Order

Read these documents in this exact order:

1. `CLAUDE.md` — Architecture + coding rules
2. `AGENTS.md` — Package inventory
3. `STALKER_PHASE-II_ADDENDUM.md` — Provider overrides (Tiingo, FMP stable)
4. `HANDOFF.md` — Current state (post-Session 15)
5. `SESSION-16-PLAN.md` — **This session's full spec**
6. `SESSION-15-REPORT.md` — Previous session context

## Session Summary

**Navigation consolidation:** 5 tabs → 3 tabs (Portfolio | Charts | Settings). The Holdings and Transactions pages are eliminated. Their unique capabilities move to the Portfolio page (full table, sorting, filtering, bulk paste) and Holding Detail page (per-instrument transactions).

**Enhancements:** Purchase date column, sortable headers, transaction markers on charts, delete instrument UI.

## Team Shape: Lead + 1 Teammate (Parallel)

### YOUR SCOPE (Lead):

**Phase 0 — API (20 min):**
1. Add `firstBuyDate` to `GET /api/portfolio/holdings` response. Derive from `MIN(tradeAt) WHERE type='BUY'` per instrument.
2. Verify `DELETE /api/instruments/[id]` cascades correctly (transactions deleted, snapshots rebuilt).
3. Add 3 tests.

**Phase 2 — Enhanced Portfolio Table (60 min):**
This is the session's core deliverable. Transform the dashboard page into the unified Portfolio page.

1. **Remove top-20 truncation** from S15. Show all holdings.
2. **Add pagination:** 20 rows per page, prev/next controls, total count.
3. **Add columns:** First Buy (`MMM 'YY` format), Day Change ($, %), Cost Basis. Remove Realized PnL column (it's in summary cards).
4. **Wire sortable headers:** Click to sort desc → asc → default. Active sort shows chevron icon. Default: Allocation % descending.
5. **Add search/filter bar:** Text input (filter by symbol/name), type dropdown (STOCK/ETF/FUND/ALL).
6. **Add totals row:** Sum of Value, Cost Basis, PnL. Blank for non-summable columns.
7. **Add delete row action:** Trash icon on hover → confirmation modal → `DELETE /api/instruments/[id]` → refresh.
8. **Move bulk paste:** Relocate the bulk paste component from deleted Transactions page to collapsible section below the table.
9. Add 8-10 tests.

**Phase 4 — Delete on Holding Detail (15 min):**
1. Add danger-variant Delete button in Holding Detail page header.
2. Confirmation modal → delete → redirect to `/` → toast "VTI deleted."
3. Add 2 tests.

**Integration:** Merge teammate work, resolve conflicts, full test suite.

YOUR FILES:
```
apps/web/src/app/(pages)/page.tsx
apps/web/src/app/api/portfolio/holdings/route.ts
apps/web/src/components/dashboard/*
apps/web/src/app/(pages)/holdings/[symbol]/page.tsx
apps/web/src/hooks/useHoldings.ts (or equivalent)
```

### TEAMMATE 1 PROMPT: `navigation-charts-engineer`

```
You are `navigation-charts-engineer` on Session 16 of STALKER. Your scope: navigation consolidation (5 tabs → 3 tabs) and chart transaction markers.

READ FIRST:
- CLAUDE.md
- AGENTS.md
- SESSION-16-PLAN.md (Sections 5, 7 — your full spec)
- STALKER-ux-ui-plan.md Section 2.1 (current navigation model)

PHASE 1 — Navigation Consolidation (45 min):

1. Update the navigation component to show 2 tabs: "Portfolio" (links to `/`) and "Charts" (links to `/charts`). Remove "Holdings" and "Transactions" tabs. Keep the ⚙ settings icon.

2. DELETE the standalone Holdings page: `apps/web/src/app/(pages)/holdings/page.tsx`
   - BUT KEEP: `apps/web/src/app/(pages)/holdings/[symbol]/page.tsx` (Holding Detail)

3. DELETE the standalone Transactions page: `apps/web/src/app/(pages)/transactions/page.tsx`

4. Add redirects: If someone navigates to `/holdings` or `/transactions`, redirect to `/`.
   - Create `apps/web/src/app/(pages)/holdings/redirect.tsx` or use Next.js `redirect()` in a catch-all.

5. Update Holding Detail back link: Change "← Back to Holdings" to "← Back to Portfolio" and link to `/` instead of `/holdings`.

6. Search the codebase for any other links to `/holdings` (without [symbol]) or `/transactions`. Update them to `/`.

Tests (3-4):
- Navigation renders 2 tabs (Portfolio, Charts)
- `/holdings` redirects to `/`
- `/transactions` redirects to `/`
- Holding Detail back link text and href

PHASE 3 — Chart Transaction Markers (30 min):

1. Create `apps/web/src/lib/chart-marker-utils.ts`:

```typescript
import type { SeriesMarker, Time } from 'lightweight-charts';

interface TransactionForMarker {
  type: 'BUY' | 'SELL';
  quantity: string;
  price: string;
  tradeAt: string;
}

export function transactionsToMarkers(
  transactions: TransactionForMarker[]
): SeriesMarker<Time>[] {
  // BUY = green arrowUp below bar, label "B {qty}"
  // SELL = red arrowDown above bar, label "S {qty}"
  // Must be sorted by time ascending
  // Colors: BUY = '#34D399', SELL = '#F87171'
}
```

2. Wire markers to Holding Detail candlestick chart:
   - After `series.setData()`, call `series.setMarkers(transactionsToMarkers(transactions))`
   - Transactions are already fetched on this page — no new API call.

3. Wire markers to Charts page candlestick chart:
   - When a symbol is selected, fetch its transactions and overlay markers.
   - If no transactions for the symbol, no markers shown.

Note: `parseFloat()` is acceptable in `chart-marker-utils.ts` for the same reason as `chart-utils.ts` — TradingView requires native numbers. Add a comment documenting this exception.

Tests (5-6):
- BUY transaction → green arrowUp, belowBar
- SELL transaction → red arrowDown, aboveBar
- Markers sorted by time ascending
- Empty array → empty markers
- Fractional quantities formatted correctly
- Mixed BUY/SELL produces correct array

YOUR FILES (do not touch files outside this list):
```
apps/web/src/components/layout/Navigation.tsx (or equivalent)
apps/web/src/app/(pages)/holdings/page.tsx (DELETE)
apps/web/src/app/(pages)/transactions/page.tsx (DELETE)
apps/web/src/app/(pages)/holdings/[symbol]/page.tsx (back link only)
apps/web/src/lib/chart-marker-utils.ts (NEW)
apps/web/src/lib/__tests__/chart-marker-utils.test.ts (NEW)
apps/web/src/components/holding-detail/CandlestickChart.tsx (markers)
apps/web/src/app/(pages)/charts/page.tsx (markers)
```

RULES:
- `parseFloat()` ONLY in chart-marker-utils.ts. Document the exception.
- Dark theme tokens from tailwind.config.ts — do not hardcode colors outside chart config.
- Run `tsc --noEmit` and `pnpm test` before reporting done.
```

---

## Quality Gates

```bash
# After each phase:
pnpm tsc --noEmit          # 0 errors
pnpm test                   # All existing + new tests pass

# Before session sign-off:
pnpm tsc --noEmit && pnpm test
# Expected: 631 + ~20-28 new tests = 651-659 total
```

## `Number()` Audit

New exception: `parseFloat()` in `chart-marker-utils.ts` (justified — TradingView requires native numbers). Add to the documented exceptions alongside `chart-utils.ts` and `chart-candlestick-utils.ts`.

## Scope Cut Order (If Running Long)

1. Never cut: Tab consolidation
2. Cut early: Bulk paste relocation
3. Cut middle: Chart markers
4. Cut late: Delete instrument
5. Cut last: Sortable headers + purchase date column

## Post-Session

```bash
git add -A
git commit -m "Session 16: UX consolidation — 5 tabs → 3 tabs, purchase dates, chart markers, delete instrument"
git push origin main
```

Write `SESSION-16-REPORT.md` with: what changed, test summary, architecture decisions, manual verification checklist.
