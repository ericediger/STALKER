# SESSION-18-PLAN.md — Visual UAT Fixes + UX Enhancements

**Date:** 2026-02-26
**Input:** Visual UAT Punch List (6 items), SESSION-17-REPORT.md, HANDOFF.md, KNOWN-LIMITATIONS.md
**Session Type:** Bug Fix + UX Enhancement
**Team Shape:** Solo
**Estimated Duration:** ~2 hours

---

## 1. Read First

1. `CLAUDE.md` — Architecture rules, Decimal precision, agent protocols
2. `AGENTS.md` — Package inventory, test patterns, tech stack
3. `HANDOFF.md` — Current state (post-S15, note: S16/S17 changes not yet reflected)
4. `KNOWN-LIMITATIONS.md` — KL-1 through KL-6
5. This plan

---

## 2. Context

The business stakeholder performed the first visual browser UAT with the real 83-instrument portfolio and reported 6 issues. This session resolves all of them.

### UAT Punch List (Triaged)

| # | Finding | Severity | Category |
|---|---------|----------|----------|
| **5+6** | Portfolio chart flatlines before Feb 27, 2024; candlestick charts start at Feb 26, 2024 — despite Dec 2022 purchases | **Critical** | Data / Backfill |
| **3** | "Failed to load holding: HTTP 500" after updating a transaction (update itself completes) | **Critical** | API Race Condition |
| **2/2a** | Need "Purchase Price" (avg cost) column; rename "Price" → "Current Price"; move Cost Basis next to Purchase Price | **Major** | UX / Columns |
| **1** | Holdings list resets scroll/page position when deleting an instrument | **Major** | UX / State |
| **4** | No "Add Another" option when adding instruments | **Minor** | UX / Flow |

### Priority (follows global: Correctness > Core CRUD > Dashboard UI > Polish)

```
P0: Phase 1 — Backfill date range fix (items 5+6)
P1: Phase 2 — HTTP 500 on transaction update (item 3)
P2: Phase 3 — Holdings table columns (items 2/2a)
P3: Phase 4 — List position on delete (item 1)
P4: Phase 5 — "Add Another" instruments (item 4)
P5: Phase 6 — Documentation sync
```

---

## 3. Phase 1: Fix Backfill Date Range (CRITICAL — Data Correctness)

### Root Cause Hypothesis

Feb 27, 2024 is ~2 years before today (Feb 26, 2026). The Tiingo `getHistory()` call during instrument creation backfill almost certainly uses a hardcoded 2-year lookback as the start date. Instruments with transactions before Feb 2024 have no price bars for that period, so:
- Portfolio value series falls back to cost-basis-only (flat line) per Spec §5.5
- Candlestick charts have no candle data before `firstBarDate`

### Step 1: Diagnose — Confirm the Gap

```bash
sqlite3 apps/web/data/portfolio.db "
  SELECT i.symbol,
         MIN(t.tradeAt) as earliest_trade,
         MIN(pb.date) as earliest_bar,
         i.firstBarDate
  FROM Instrument i
  JOIN [Transaction] t ON t.instrumentId = i.id
  LEFT JOIN PriceBar pb ON pb.instrumentId = i.id
  GROUP BY i.id
  HAVING earliest_trade < earliest_bar
  ORDER BY earliest_trade
  LIMIT 20;
"
```

Expected result: instruments with Dec 2022 transactions but Feb 2024 earliest bars.

### Step 2: Fix the Backfill Start Date

**Find the backfill call.** It will be in one of these locations:
- `apps/web/src/app/api/instruments/route.ts` (POST handler — instrument creation)
- `apps/web/src/lib/market-data-service.ts` or `apps/web/src/lib/market-data-client.ts`
- A backfill utility in `packages/market-data/`

**Search for the hardcoded lookback:**
```bash
cd apps/web && grep -rn "getHistory\|backfill\|startDate\|subYears\|subMonths\|2.*year" --include="*.ts" src/
cd ../../packages/market-data && grep -rn "getHistory\|backfill\|startDate\|subYears" --include="*.ts" src/
```

**Apply the fix.** Replace the hardcoded lookback with a generous default:

```typescript
// BEFORE (probable):
const startDate = subYears(new Date(), 2);

// AFTER:
const startDate = subYears(new Date(), 10);
```

Using 10 years: Tiingo provides 30+ years of free data (AD-P2-6), and the user profile targets someone with "historical trades in a spreadsheet" — they may have trades going back a decade. A 10-year window is generous, inexpensive (one API call per instrument regardless of range), and avoids this class of bug permanently.

**Architecture Decision AD-S18-1:** Backfill lookback extended to 10 years. This is a static default, not computed from transaction dates, because backfill runs at instrument creation time (before any transactions exist for that instrument). The re-backfill script handles existing instruments with insufficient history.

### Step 3: Write Re-Backfill Script

Create `apps/web/scripts/re-backfill-history.ts`:

**Purpose:** One-time script to extend price bar history for all instruments whose `firstBarDate` is after their earliest transaction.

**Logic:**
1. Query all instruments
2. For each, get earliest transaction date (if any) and current `firstBarDate`
3. If `firstBarDate` is null or after `earliest_transaction - 30d`, re-backfill from `max(earliest_transaction - 30d, 10_years_ago)`
4. Call `TiingoProvider.getHistory(symbol, startDate, firstBarDate)` — fetch only the missing range
5. Insert new PriceBars (skip any dates already in DB — UNIQUE constraint on `(instrumentId, provider, resolution, date)` handles dedup)
6. Update `firstBarDate` on the instrument to the earliest bar date

**Rate limiting considerations:**
- 83 instruments = 83 Tiingo calls
- Tiingo limit: 50/hr, 1000/day
- Chunk into batches of 45 with a 60-second pause between batches
- Log progress: `"[12/83] AAPL: backfilled 540 new bars (2016-02-26 → 2024-02-26)"`

**Running the script:**
```bash
cd apps/web && npx tsx scripts/re-backfill-history.ts
```

### Step 4: Trigger Full Snapshot Rebuild

After re-backfill completes:
```bash
curl -X POST http://localhost:3000/api/portfolio/rebuild
```

This recomputes all `PortfolioValueSnapshot` rows from the earliest transaction date with the newly available price data. The cost-basis-only flat values will be replaced with actual market values.

**Note:** Rebuild may take longer than the usual ~4s because the date range is now much wider (Dec 2022 → today instead of Feb 2024 → today). Monitor for timeout — the rebuild endpoint has a 60s timeout (AD-S10a).

### Step 5: Verify

1. Dashboard area chart — should show portfolio value from Dec 2022 onward, no flatline
2. Pick 2–3 instruments with pre-2024 transactions → Holding Detail → candlestick chart should show candles from before the first buy
3. `firstBarDate` on affected instruments should now be well before earliest transaction

### Tests

Create `apps/web/__tests__/scripts/re-backfill-history.test.ts` (or add to existing backfill tests):

| Test | What It Verifies |
|------|-----------------|
| Backfill start date is 10 years ago for new instruments | Default lookback |
| Re-backfill fetches only missing date range | Doesn't re-fetch existing bars |
| Re-backfill updates firstBarDate | Instrument metadata stays correct |
| Re-backfill respects rate limits | Batching with pauses |
| Re-backfill skips instruments with no transactions | No unnecessary API calls |

**Target: 5 tests**

---

## 4. Phase 2: Fix HTTP 500 on Transaction Update (CRITICAL)

### Root Cause Hypothesis

The `PUT /api/transactions/[id]` handler likely:
1. Updates the transaction ✅
2. Triggers `triggerSnapshotRebuild()` as fire-and-forget ✅
3. Returns 200 to the client ✅
4. Client's `useHoldingDetail` hook refetches `GET /api/portfolio/holdings/[symbol]`
5. The snapshot rebuild from step 2 hasn't completed yet
6. The holdings endpoint reads stale/mid-rebuild snapshot data → 500

### Step 1: Reproduce and Capture

```bash
# Start dev server with visible terminal output
pnpm dev

# In browser: go to any holding detail, edit a transaction
# Watch the terminal for the 500 error stack trace
# Check browser DevTools → Network tab to confirm which request fails
```

### Step 2: Identify the Fire-and-Forget Pattern

Search for the rebuild trigger in the transaction PUT handler:

```bash
grep -rn "triggerSnapshotRebuild\|rebuildSnapshot\|rebuild" apps/web/src/app/api/transactions/ --include="*.ts"
```

Also check the pattern used in POST and DELETE (which work correctly per S17 EC-2 and EC-3) vs PUT:

```bash
# Compare all three mutation handlers:
grep -A 5 "triggerSnapshotRebuild\|rebuild\|Rebuild" apps/web/src/app/api/transactions/route.ts apps/web/src/app/api/transactions/*/route.ts
```

### Step 3: Fix

**If the issue is fire-and-forget:** Make the rebuild `await`-ed before returning the response.

```typescript
// BEFORE (probable):
triggerSnapshotRebuild(earliestAffectedDate); // fire-and-forget
return NextResponse.json(updatedTransaction);

// AFTER:
await rebuildSnapshotsFrom(earliestAffectedDate); // synchronous
return NextResponse.json(updatedTransaction);
```

**AD-S18-2:** Snapshot rebuild is synchronous in all transaction mutation paths (POST/PUT/DELETE). A ~4s wait is acceptable — the user expects the operation to take a moment, and it prevents the 500 race condition.

**If the issue is something else** (e.g., Decimal serialization on the holdings endpoint): Fix the specific error based on the stack trace.

### Step 4: Also check the client refetch pattern

Look at the Holding Detail page to see how it handles the mutation callback:

```bash
grep -A 10 "onSuccess\|refetch\|mutate" apps/web/src/app/\(pages\)/holdings/\[symbol\]/page.tsx
```

If the refetch fires immediately without awaiting the PUT response:
```typescript
// BEFORE:
await updateTransaction(data);
refetch(); // fires before PUT response arrives

// AFTER:
await updateTransaction(data);
await refetch(); // or: the PUT response is already after rebuild, so refetch gets fresh data
```

### Tests

Add to `apps/web/__tests__/api/transactions/` (existing test directory):

| Test | What It Verifies |
|------|-----------------|
| PUT /api/transactions/[id] completes with snapshot rebuild before response | No race condition |
| GET /api/portfolio/holdings/[symbol] after PUT returns consistent data | Integration regression |
| Transaction update returns 200 with updated transaction data | Response correctness |

**Target: 3 tests**

---

## 5. Phase 3: Holdings Table Column Improvements (MAJOR)

### Column Layout Change

**Current columns:** Symbol | Name | Shares | Price | Market Value | P&L ($) | P&L (%) | Allocation

**New columns:** Symbol | Name | Shares | Avg Cost | Cost Basis | Current Price | Market Value | P&L ($) | P&L (%) | Allocation

### Step 1: Find the Holdings Table Components

```bash
# Dashboard holdings table (top-20):
find apps/web/src -name "*.tsx" | xargs grep -l "holdings\|Holdings" | head -20

# The main candidates:
# apps/web/src/components/dashboard/HoldingsTable.tsx (or similar)
# apps/web/src/components/holdings/HoldingsTable.tsx (full page)
# apps/web/src/app/(pages)/holdings/page.tsx
```

### Step 2: Add avgCostPerShare Computation

In the holdings utility file (likely `apps/web/src/lib/holdings-utils.ts` or inline in the component):

```typescript
import Decimal from 'decimal.js';

export function avgCostPerShare(costBasis: string, totalQuantity: string): string | null {
  const qty = new Decimal(totalQuantity);
  if (qty.isZero()) return null; // Fully closed position
  return new Decimal(costBasis).div(qty).toFixed(2);
}
```

**Use `Decimal.js` for the division.** This is financial arithmetic — no `Number()` allowed (CLAUDE.md rule).

### Step 3: Update Table Headers and Cells

For each holdings table component:

1. Rename the "Price" header to "Current Price"
2. Add "Avg Cost" column after "Shares"
3. Move "Cost Basis" column to be after "Avg Cost"
4. Format "Avg Cost" with `formatCurrency()` (existing formatter from `apps/web/src/lib/format.ts`)

**Dashboard table (top-20):** If 10 columns are too wide, drop "Allocation" from the dashboard table (it's available on the Holdings page). The dashboard is a summary view (AD-S15-2).

### Step 4: Update Sort Logic

If the table supports column sorting (S16 added sortable headers), add "Avg Cost" and "Cost Basis" as sortable columns:

```bash
grep -rn "sortBy\|SortColumn\|sortable" apps/web/src/components/ --include="*.tsx" | head -10
```

Add the new columns to the sort column type/enum.

### Tests

Add to existing holdings utility tests:

| Test | What It Verifies |
|------|-----------------|
| avgCostPerShare returns correct value | `10000 / 50 = 200.00` |
| avgCostPerShare with Decimal precision | `9999.99 / 33 = 303.03` |
| avgCostPerShare with zero quantity returns null | Guard against divide-by-zero |
| avgCostPerShare with small fractional shares | `500 / 0.5 = 1000.00` |

**Target: 4 tests**

---

## 6. Phase 4: Preserve List Position on Delete (MAJOR)

### Step 1: Find the Delete Flow

```bash
grep -rn "delete\|Delete\|onDelete\|handleDelete" apps/web/src/app/\(pages\)/holdings/ --include="*.tsx"
grep -rn "delete\|Delete\|onDelete\|handleDelete" apps/web/src/components/holdings/ --include="*.tsx"
```

### Step 2: Identify the State Reset

The delete likely triggers a refetch that causes React to re-render the entire list, resetting:
- Scroll position
- Current page (if paginated, from S16)

### Step 3: Implement Optimistic Removal + State Preservation

```typescript
// In the holdings page or wherever the delete callback lives:

const handleDelete = async (instrumentId: string) => {
  // 1. Save current page index
  const currentPage = page;

  // 2. Optimistic removal from local state
  setHoldings(prev => prev.filter(h => h.instrumentId !== instrumentId));

  // 3. Perform actual delete
  await fetch(`/api/instruments/${instrumentId}`, { method: 'DELETE' });

  // 4. Refetch for consistency
  await refetch();

  // 5. Restore page if needed
  // If we were on the last page and it's now empty, go to previous page
  const newTotalPages = Math.ceil((holdings.length - 1) / pageSize);
  if (currentPage >= newTotalPages && currentPage > 0) {
    setPage(currentPage - 1);
  }
};
```

**Note:** If the holdings table uses `useHoldings()` or `useInstruments()` hooks that auto-refetch and cause full re-renders, the optimistic removal may be overwritten by the refetch. In that case, the alternative is to use a `ref` to store scroll position:

```typescript
const scrollRef = useRef(0);

const handleDelete = async (instrumentId: string) => {
  scrollRef.current = window.scrollY;
  await deleteInstrument(instrumentId);
  await refetch();
  requestAnimationFrame(() => window.scrollTo(0, scrollRef.current));
};
```

### Tests

| Test | What It Verifies |
|------|-----------------|
| Page number preserved after delete | Doesn't reset to page 1 |
| Last item on page → navigates to previous page | Pagination edge case |

**Target: 2 tests**

---

## 7. Phase 5: "Add Another" Instrument Flow (MINOR)

### Step 1: Find the Add Instrument Modal

```bash
find apps/web/src -name "AddInstrumentModal*" -o -name "AddInstrument*" | head -5
```

### Step 2: Add Reset Flow

The modal likely has states: `search → select → creating → success`. After success:

```typescript
// Add state variable for the flow
const [showSuccess, setShowSuccess] = useState(false);

// On successful creation:
const handleSuccess = () => {
  setShowSuccess(true);
  toast.success(`${symbol} added successfully`);
};

// "Add Another" resets to search:
const handleAddAnother = () => {
  setShowSuccess(false);
  setSearchQuery('');
  setSelectedResult(null);
  // Focus the search input
  searchInputRef.current?.focus();
};

// In the success state render:
<div className="flex gap-3">
  <Button variant="secondary" onClick={handleAddAnother}>
    Add Another
  </Button>
  <Button onClick={onClose}>
    Done
  </Button>
</div>
```

### Tests

| Test | What It Verifies |
|------|-----------------|
| "Add Another" resets modal to search state | State reset without close |

**Target: 1 test**

---

## 8. Phase 6: Documentation Sync

### HANDOFF.md

Update to reflect S16 + S17 + S18:

| Section | Updates |
|---------|---------|
| Last Updated | `2026-02-26 (Post-Session 18)` |
| Current State | Add S16 nav consolidation (5→3 tabs), S17 transaction CRUD on Holding Detail, S18 UAT fixes |
| Navigation | 3 tabs: Dashboard, Holdings, Advisor (Transactions and Charts pages deleted S16) |
| Transaction CRUD | Now on Holding Detail page (S17) |
| Advisor tools | 5 tools (S17): getPortfolioSnapshot, getHoldingDetail, getTransactions, getQuotes, getTopHoldings |
| Test count | 692+ (S18 target) |
| KL-1 | CLOSED (S17 — NYSE holiday calendar) |
| Metrics table | Update test count, test files, component count |
| Post-MVP priorities | Update completed items |

### KNOWN-LIMITATIONS.md

- Close KL-1: `| KL-1 | ~~No holiday/half-day market calendar~~ | RESOLVED (S17) — NYSE holiday calendar with 20 holidays 2025-2026 |`
- Verify KL-2 through KL-6 are still accurate
- Add any new limitations discovered during S18

### CLAUDE.md

- Update navigation structure (3 tabs, not 5)
- Update Holding Detail capabilities (now includes + Add Transaction)
- Update advisor tool inventory (5 tools with names)
- Add `avgCostPerShare()` to utility function catalog
- Document the `Select` component's `disabled` prop (S17)

### AGENTS.md

- Update test count to S18 final
- Update component count
- Note S18 re-backfill script existence

---

## 9. Scope Cut Order

If session runs long, cut in reverse phase order:

```
LAST CUT:  Phase 6 (docs)              — Can be done post-session
           Phase 5 (Add Another)        — Minor UX, one button
           Phase 4 (list reset)         — Annoying but functional
           Phase 3 (columns)            — Visual only
NEVER CUT: Phase 2 (HTTP 500)           — Trust-eroding error
           Phase 1 (backfill)           — Data correctness
```

---

## 10. Quality Gates

Run after every major change:

```bash
pnpm tsc --noEmit        # 0 errors
pnpm test                # 692+ tests (677 current + ~15 new)
```

---

## 11. Exit Criteria

### Blocking

| # | Criterion | Phase |
|---|-----------|-------|
| EC-1 | Dashboard area chart shows data from earliest transaction (Dec 2022) — no flatline | P0 |
| EC-2 | Candlestick charts for pre-2024 instruments show data before first transaction | P0 |
| EC-3 | `firstBarDate` is correct for all instruments with pre-2024 transactions | P0 |
| EC-4 | Transaction update (PUT) does not produce HTTP 500 error | P1 |
| EC-5 | Holding detail refetch after transaction edit returns correct data | P1 |
| EC-6 | Holdings table shows "Avg Cost" column | P2 |
| EC-7 | "Price" column renamed to "Current Price" | P2 |
| EC-8 | `tsc --noEmit` — 0 errors | All |
| EC-9 | `pnpm test` — 692+ tests, 0 failures | All |

### Non-Blocking

| # | Criterion | Phase |
|---|-----------|-------|
| EC-10 | Holdings list preserves position after delete | P3 |
| EC-11 | "Add Another" button in Add Instrument modal | P4 |
| EC-12 | HANDOFF.md, KNOWN-LIMITATIONS.md, CLAUDE.md, AGENTS.md updated | P5 |

---

## 12. Architecture Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| AD-S18-1 | Backfill lookback extended to 10 years (static default) | Tiingo provides 30+ years free data. 10yr covers any reasonable transaction history. Computed-from-transactions would require transactions to exist before backfill runs (they don't — backfill is at instrument creation). |
| AD-S18-2 | Snapshot rebuild synchronous in all transaction mutation paths | ~4s wait prevents race condition that causes 500. User expects mutation to take a moment. Eliminates the fire-and-forget pattern that caused item 3. |
| AD-S18-3 | Avg Cost displayed as `costBasis / totalQuantity` (Decimal division) | Standard brokerage column. Guards divide-by-zero for fully closed positions (return null). |
| AD-S18-4 | Re-backfill is a one-time script, not automatic migration | Existing instruments need history gap filled. Future instruments get 10yr lookback automatically. Script is idempotent (UNIQUE constraint handles dedup). |
| AD-S18-5 | Dashboard table may drop Allocation column to fit Avg Cost + Cost Basis | Dashboard is a summary view (AD-S15-2). Allocation is available on full Holdings page. Fits within viewport width. |

---

## 13. Post-Session

```bash
# Final quality check
pnpm tsc --noEmit
pnpm test

# Update docs (Phase 6)
# HANDOFF.md, KNOWN-LIMITATIONS.md, CLAUDE.md, AGENTS.md

# Commit
git add -A
git commit -m "Session 18: Visual UAT fixes — backfill range, 500 race condition, column improvements"
git push origin main
```

### Generate Report

Write `SESSION-18-REPORT.md` covering:
- UAT punch list: item-by-item resolution
- Root cause for each finding
- Re-backfill results (instruments affected, bars added, time taken)
- Test count delta
- Architecture decisions applied
- Scope cuts (if any)
- Exit criteria checklist
- Updated metrics
