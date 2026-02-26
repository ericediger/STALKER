# SESSION-17-KICKOFF.md — Production Hardening + Transaction UX Closure

**Paste this into Claude Code to start Session 17.**

---

## Context

You are the **Lead Engineer** for STALKER Session 17 — the final engineering session before production. Session 16 consolidated navigation (5 tabs → 3) and built the unified Portfolio table. However, it created a UX gap: the standalone Transactions page was deleted, but individual transaction Add/Edit/Delete was **not relocated** to Holding Detail. This means the user currently has no UI path to record a single trade.

Session 17 closes this gap, tunes the advisor for 83-instrument scale, and fixes visual UAT findings.

## Document Reading Order

Read these documents in this exact order:

1. `CLAUDE.md` — Architecture + coding rules
2. `AGENTS.md` — Package inventory
3. `HANDOFF.md` — Current state (post-Session 16)
4. `SESSION-17-PLAN.md` — **This session's full spec**
5. `SESSION-16-REPORT.md` — Previous session context (check for scope cuts)

## Session Summary

**Transaction CRUD on Holding Detail:** Restore the ability to add, edit, and delete individual transactions — now scoped to per-instrument on the Holding Detail page.

**Advisor tuning:** Add `getTopHoldings` tool to avoid sending all 83 instruments in every tool response.

**Visual UAT fixes:** Reserve capacity for browser-reported issues.

**Holiday calendar:** Stretch goal — reduce wasted API calls on market holidays.

## Team Shape: Solo

All phases are cross-cutting (UI → API → analytics) and don't parallelize well. Single engineer with full codebase context.

---

## Pre-Flight: S16 Scope Cut Assessment (5 min)

Before starting any implementation, read `SESSION-16-REPORT.md` and answer:

1. Did tab consolidation ship? (3 tabs: Portfolio, Charts, ⚙)
2. Did the paginated portfolio table ship? (sort, filter, search, 20/page)
3. Did bulk paste relocate to Portfolio page?
4. Did chart transaction markers ship?
5. Did delete instrument ship?
6. Did sortable headers + `firstBuyDate` column ship?

**If tab consolidation did NOT ship → STOP. Make S17 a S16 completion session.**

For any other scope cuts: items 3, 5, 6 are production-relevant and should be completed in Phase 1 below. Item 4 (chart markers) can be skipped — it's visual polish, not functional.

---

## Phase 0 — Transaction CRUD on Holding Detail (45 min)

This is the session's #1 deliverable. **Without this, the user cannot record a trade.**

### Step 1: Audit Existing Components (5 min)

Check if transaction form components survive from the deleted Transactions page:

```bash
# Look for orphaned transaction components
find apps/web/src/components -name "*transaction*" -o -name "*Transaction*" | head -20
find apps/web/src/components -name "*txn*" -o -name "*Txn*" | head -20

# Check git for deleted files that might be recoverable
git log --diff-filter=D --name-only -- "apps/web/src/components/*transaction*" "apps/web/src/components/*Transaction*" | head -20
```

If `TransactionForm.tsx` or similar exists → reuse it.
If deleted → rebuild using the patterns from the existing UI (modal with form fields, validation display).

### Step 2: Add Transaction Form Component

If rebuilding, create `apps/web/src/components/holding-detail/TransactionForm.tsx`:

```typescript
interface TransactionFormProps {
  instrumentId: string;
  symbol: string;
  transaction?: ExistingTransaction; // If editing, pre-populate
  onSuccess: () => void; // Refresh parent data
  onCancel: () => void;
}
```

Fields:
- **Type:** BUY/SELL toggle (two buttons, BUY default). BUY: `bg-interactive` when active. SELL: `bg-surface-overlay` when active.
- **Quantity:** Numeric input. Label: "Shares." Supports fractional (Spec 2.5).
- **Price:** Numeric input with `$` prefix. Label: "Price per share."
- **Date:** Date input. Default: today. Supports backdating. Label: "Trade date."
- **Fees:** Numeric input, optional, default $0.00. Label: "Fees."
- **Notes:** Text input, optional. Label: "Notes."
- **Submit:** "Add Transaction" or "Save Changes" (if editing).

**Symbol is NOT a field** — it's inherited from the Holding Detail page context.

API calls:
- Create: `POST /api/transactions` with `{ instrumentId, type, quantity, price, tradeAt, fees?, notes? }`
- Edit: `PUT /api/transactions/[id]` with same shape
- Both already exist and are fully tested.

### Step 3: Wire to Holding Detail Page

**File:** `apps/web/src/app/(pages)/holdings/[symbol]/page.tsx`

1. Add "+ Add Transaction" button in the transactions section header.
2. Button click → show `TransactionForm` (inline panel below button, or modal — match existing UI pattern).
3. Each transaction row gets a pencil icon (edit) and trash icon (delete) on hover.
4. Pencil click → show `TransactionForm` pre-populated with transaction data.
5. Trash click → existing confirmation modal pattern → `DELETE /api/transactions/[id]` → refresh → toast.
6. On any successful mutation → refetch holding detail data → lot table and PnL update.

### Step 4: Sell Validation Error Display

When a SELL transaction violates the sell invariant, the API returns:
```json
{
  "error": "Sell validation failed",
  "details": {
    "date": "2025-06-15",
    "deficit": "10.5",
    "instrument": "VTI"
  }
}
```

Display this inline below the form:
> ❌ Cannot sell — position goes negative on Jun 15, 2025 (deficit: 10.5 shares)

Use `loss-fg` color for the error text. Do NOT clear the form — let the user adjust and retry.

### Tests (4-5)

```
apps/web/__tests__/components/holding-detail/TransactionForm.test.ts (NEW)
```

1. Form renders with correct fields for Add mode (type, quantity, price, date)
2. Form pre-populates fields in Edit mode
3. Submit calls POST /api/transactions with correct payload
4. Sell validation error displays inline with deficit details
5. Cancel button closes form without API call

---

## Phase 1 — S16 Scope Cut Completion (Variable — 0-30 min)

**Skip this phase entirely if S16 had no scope cuts.**

If scope cuts occurred, complete them in this order:

1. **Bulk paste relocation** (if cut): Move `BulkPastePanel` from deleted Transactions page to a collapsible section below the Portfolio table on `page.tsx`. The component and `useBulkImport` hook should still exist in the codebase.

2. **Delete instrument** (if cut): Add trash icon to Portfolio table rows → confirmation modal → `DELETE /api/instruments/[id]` → refresh. Add danger-variant Delete button on Holding Detail header → confirmation → redirect to `/` → toast.

3. **Sortable headers + `firstBuyDate`** (if cut): Wire click-to-sort on table headers (desc → asc → default cycle). Add chevron indicator. Add `firstBuyDate` from `GET /api/portfolio/holdings` response.

**Do NOT complete chart markers here even if cut.** They are visual polish, not functional.

### Tests

Add tests only for items actually completed. Estimate 2-3 per scope cut item.

---

## Phase 2 — Advisor 83-Instrument Tuning (25 min)

### Step 1: Add `getTopHoldings` Tool Definition

**File:** `packages/advisor/src/tools/tool-definitions.ts` (or equivalent — check `AGENTS.md` for exact path)

Add new tool:
```typescript
{
  name: 'getTopHoldings',
  description: 'Get the top N holdings by a chosen metric. Use for overview questions, concentration analysis, or "what are my biggest positions" queries. Prefer this over getPortfolioSnapshot for general portfolio questions.',
  input_schema: {
    type: 'object',
    properties: {
      count: {
        type: 'number',
        description: 'Number of holdings to return (default 10, max 20)'
      },
      sortBy: {
        type: 'string',
        enum: ['allocation', 'value', 'pnl', 'dayChange'],
        description: 'Sort criterion (default: allocation)'
      }
    }
  }
}
```

### Step 2: Implement Tool Executor

**File:** `packages/advisor/src/tools/tool-executors.ts` (or equivalent)

```typescript
async function executeGetTopHoldings(params: { count?: number; sortBy?: string }): Promise<string> {
  const count = Math.min(params.count ?? 10, 20);
  const sortBy = params.sortBy ?? 'allocation';
  // Call existing holdings endpoint, sort, truncate to count
  // Format as readable text for the LLM
  // Include portfolio summary header:
  // "Portfolio: 83 holdings, total value $XXX,XXX. Showing top {count} by {sortBy}:"
}
```

Use `Decimal.js` for all financial values in the executor. Use `formatNum()` for display (no `parseFloat()`).

### Step 3: Add Portfolio Summary to `getPortfolioSnapshot`

Enhance the existing executor to prepend a summary:
```
--- Portfolio Summary ---
Total holdings: 83
Total value: $XXX,XXX.XX
Total cost basis: $XXX,XXX.XX
Total PnL: +$XX,XXX.XX (+X.X%)
Top 5 by allocation: VTI (18.2%), QQQ (12.1%), AAPL (8.3%), MSFT (7.1%), AMZN (5.4%)
Stale quotes: 3 of 83
--- Full Holdings Below ---
```

This gives the LLM high-level facts without parsing all 83 rows for simple questions.

### Step 4: Update System Prompt

Add to the advisor system prompt (append, don't replace existing content):

```
## Tool Selection Guidance

When asked about portfolio overview, top positions, concentration, or general portfolio questions:
→ Use getTopHoldings (efficient, returns only what's needed)

When asked about a specific instrument, specific transaction, or when you need full portfolio detail:
→ Use getPortfolioSnapshot or getHolding

When asked about transactions for a specific instrument:
→ Use getTransactions

Prefer getTopHoldings over getPortfolioSnapshot for most questions — it's faster and uses less context.
```

### Tests (4-5)

```
packages/advisor/__tests__/tool-executors.test.ts (ADD to existing)
```

1. `getTopHoldings` returns correct count (default 10)
2. `getTopHoldings` with count=5 returns 5 holdings
3. `getTopHoldings` caps at 20 even if higher requested
4. `getTopHoldings` sorts by allocation by default
5. `getPortfolioSnapshot` response includes summary header

---

## Phase 3 — Visual UAT Punch List (30 min reserved)

**This phase executes only if the human stakeholder has provided visual UAT feedback.**

If no feedback is available, use this time for:
1. Self-review: open the app in the terminal-available browser (if any) or manually inspect component rendering logic for edge cases
2. Audit the S16 portfolio table for edge cases: What happens with instruments that have very long names? What happens when an instrument has no transactions (0 shares, $0 value)? What does pagination look like with exactly 20, 21, 40, and 83 instruments?

### Likely Fixes (Budget ~5 min Each)

1. **Long instrument name truncation:** Add `truncate` class + tooltip with full name
2. **Zero-holding row display:** Instruments with 0 shares should show "—" for PnL, not "$0.00"
3. **Sort indicator visibility:** Ensure chevron uses `text-muted` (not `text`), transitions to `text-heading` when active
4. **Toast positioning:** Verify toasts don't overlap the pagination controls
5. **Delete confirmation modal copy:** Should include instrument name and consequence ("This will delete VTI and all 5 associated transactions. This cannot be undone.")
6. **Empty state after deleting last instrument:** Portfolio page should show the first-run empty state, not a broken table

### Tests

No new tests for CSS/layout fixes.

---

## Phase 4 — Holiday Calendar (Stretch — 20 min)

**Only if Phases 0-2 are complete and quality gates pass.**

### Step 1: Create Holiday Data

**File:** `packages/market-data/src/calendar/nyse-holidays.ts` (NEW)

```typescript
/**
 * NYSE observed holidays for 2025–2026.
 * Update annually. Source: https://www.nyse.com/markets/hours-calendars
 */
export const NYSE_HOLIDAYS: ReadonlySet<string> = new Set([
  // 2025
  '2025-01-01', // New Year's Day
  '2025-01-20', // MLK Day
  '2025-02-17', // Presidents' Day
  '2025-04-18', // Good Friday
  '2025-05-26', // Memorial Day
  '2025-06-19', // Juneteenth
  '2025-07-04', // Independence Day
  '2025-09-01', // Labor Day
  '2025-11-27', // Thanksgiving
  '2025-12-25', // Christmas
  // 2026
  '2026-01-01', // New Year's Day
  '2026-01-19', // MLK Day
  '2026-02-16', // Presidents' Day
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
  '2026-06-19', // Juneteenth
  '2026-07-03', // Independence Day (observed)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving
  '2026-12-25', // Christmas
]);

export function isNYSEHoliday(dateStr: string): boolean {
  return NYSE_HOLIDAYS.has(dateStr);
}
```

### Step 2: Wire into MarketCalendar

**File:** `packages/market-data/src/calendar/market-calendar.ts` (or equivalent)

Update `isMarketOpen()`:
```typescript
// Before (current):
// return isWeekday(date) && isWithinMarketHours(date, timezone)

// After:
// return isWeekday(date) && !isNYSEHoliday(formatDate(date)) && isWithinMarketHours(date, timezone)
```

### Step 3: Update Known Limitations

If shipped, close KL-1 in `KNOWN-LIMITATIONS.md`:
```
| KL-1 | ~~No holiday/half-day market calendar~~ | RESOLVED: NYSE holidays for 2025-2026 added. Half-days not tracked (negligible waste). |
```

### Tests (3)

```
packages/market-data/src/calendar/__tests__/nyse-holidays.test.ts (NEW)
```

1. `isNYSEHoliday` returns true for Christmas 2025
2. `isNYSEHoliday` returns false for a regular weekday
3. `isMarketOpen` returns false on July 4, 2025 during market hours

---

## Quality Gates

```bash
# After each phase:
pnpm tsc --noEmit          # 0 errors
pnpm test                   # All existing + new tests pass

# Before session sign-off:
pnpm tsc --noEmit && pnpm test
# Expected: S16 count + ~12-15 new tests
```

## `Number()` Audit

No new exceptions expected in S17. All new code follows Decimal.js rules. Advisor tool executors use `formatNum()` from existing utilities.

## Scope Cut Order (If Running Long)

```
1. Never cut:  Phase 0 (Transaction CRUD) — production blocker
2. Cut first:  Phase 4 (Holiday calendar) — stretch goal
3. Cut early:  Phase 3 (Visual UAT fixes) — defer to async
4. Cut middle: Phase 2 (Advisor tuning) — works today, just suboptimal
5. Cut late:   Phase 1 (S16 scope cuts) — only if truly non-blocking
```

## Post-Session

```bash
git add -A
git commit -m "Session 17: Transaction CRUD on Holding Detail, advisor getTopHoldings, production hardening"
git push origin main
```

Write `SESSION-17-REPORT.md` with:
- What changed, test summary, architecture decisions
- S16 scope cut resolution status
- Visual UAT findings and fixes
- Production readiness assessment
- Updated KNOWN-LIMITATIONS.md
- Manual verification checklist

Update `HANDOFF.md`:
- Last Session: Session 17
- Status: Production Ready
- Close any resolved known limitations
