# Session 13 Report — UAT + Live Data Fixes

**Date:** 2026-02-25
**Session Type:** User Acceptance Testing (UAT)
**Role Split:** Business Stakeholder (browser) + Lead Engineer (terminal)

---

## Session Overview

Session 13 was the first live UAT session where the business stakeholder operated the application in a browser while the engineer monitored the terminal, diagnosed issues, and applied real-time hotfixes. The session surfaced 12+ UX issues across search, forms, charts, navigation, and bulk import — all resolved during the session. The user successfully imported their real portfolio (~83 instruments, 87 unique transactions) covering stocks, ETFs, funds, and speculative positions. Data correctness was verified after cleanup of duplicate imports and backfill of missing price data.

---

## Work Completed

### Phase 1: UX Hotfixes (3 commits)

**Hotfix 1 — Search + Dashboard Visibility + Price Auto-fill:**
- Symbol search flooded the page with unlimited results at 1 character. Fixed: min 3 chars, max 10 results, scrollable dropdown (`max-h-60 overflow-y-auto`), clears on select.
- Search selection didn't populate form fields. Fixed: added `onSelect(SearchResult)` callback that auto-fills symbol, name, exchange (with `mapExchange()` normalization), and type.
- Dashboard showed empty state when instruments existed but had no transactions. Fixed: check `instruments.length` not `holdings.length`.
- Transaction form required manual price entry. Fixed: auto-fill from `/api/market/history` for selected instrument + date.

**Hotfix 2 — Persistent Add Instrument Button:**
- "Add Instrument" button only existed in empty state components. Added persistent "+ Add Instrument" button to both Dashboard and Holdings page headers.

**Hotfix 3 — Charts + ALL Window + Combined Instrument+Buy:**
- Charts never rendered due to React lifecycle timing bug: `useChart` hook's `useEffect` fired during mount, but the container div was conditionally rendered (replaced by Skeleton). `containerRef.current` was `null`. Fixed: container div always in DOM, hidden with `invisible absolute inset-0` during loading.
- ALL window returned no data: `usePortfolioTimeseries` sent no `startDate` param, but the API requires both. Fixed: default to `1970-01-01`.
- Added optional "Initial Purchase" section to AddInstrumentModal with trade date, shares, price per share, and fees. Price auto-fills from historical close. Button label changes to "Add Instrument + Buy" when purchase fields are populated.

### Phase 2: Auto-Create Instruments (2 commits)

**Auto-create on transaction add:**
- Created `findOrCreateInstrument()` shared helper that checks if instrument exists, tries FMP search for metadata (name, exchange, type), creates with defaults if search fails, and triggers Tiingo backfill.
- Modified `POST /api/transactions/bulk` to auto-create missing instruments instead of rejecting with "Unknown symbol" error.
- Modified `POST /api/transactions` to accept symbol as alternative to instrumentId, auto-creating if needed.

**SQLite contention fix:**
- Initial implementation triggered concurrent fire-and-forget backfills that competed for SQLite's single-writer lock, causing timeouts for subsequent operations.
- Fixed: bulk import creates instruments with `skipBackfill=true`, inserts all transactions, then queues backfills sequentially in a fire-and-forget async IIFE.
- Snapshot rebuild also made fire-and-forget for bulk imports.
- Method name bug: `service.search()` → `service.searchSymbols()`.

### Phase 3: Data Cleanup + Backfill (1 commit)

- User imported portfolio data 3 times, creating triple duplicate transactions (255 total, 87 unique).
- Cleaned duplicates via SQL: `DELETE WHERE id NOT IN (SELECT MIN(id) GROUP BY instrumentId, type, quantity, price, tradeAt)`.
- 71 of 83 instruments had 0 price bars (backfills failed during SQLite contention).
- Created `scripts/backfill-missing.ts` — ran sequential Tiingo backfills for all 71 instruments. All succeeded (~500 bars each).
- Cleared stale snapshots and triggered full rebuild (826 snapshots generated).
- Increased Prisma interactive transaction timeout from 30s → 120s → 600s (10 minutes) for large portfolio rebuilds.

---

## Technical Details

### Chart Rendering Bug (Root Cause)

TradingView's `createChart()` requires a real DOM element. The previous pattern:
```tsx
{isLoading ? <Skeleton /> : <div ref={containerRef} />}
```
Meant that during loading, the container div was not in the DOM. `useChart`'s `useEffect` (with `[]` deps) fired on component mount — when `containerRef.current` was `null`. The chart was never created.

**Fix:** Always render the container, hide it visually:
```tsx
<div ref={containerRef} className={isLoading ? "invisible absolute inset-0" : ""} />
{isLoading && <Skeleton />}
```

### SQLite Write Contention Pattern

SQLite uses a single-writer lock. When the bulk import auto-created 70+ instruments, each triggered a fire-and-forget Tiingo backfill (~500 INSERT statements). All backfills competed for the write lock simultaneously, causing "Socket timeout" errors for subsequent Prisma operations.

**Fix:** Two-phase approach:
1. Create instruments with `skipBackfill=true` (fast, sequential creates)
2. Insert all transactions in a single `$transaction` block
3. Queue backfills sequentially in a fire-and-forget `async` IIFE after response

### Auto-Create Instrument Flow

```
Symbol not found by ID → findOrCreateInstrument(symbol, skipBackfill?)
  → Check prisma.instrument.findUnique({ symbol })
  → If exists: return immediately
  → If not: FMP searchSymbols(symbol) for metadata
  → Create with defaults (type=STOCK, exchange=NYSE if search fails)
  → Trigger Tiingo backfill (unless skipBackfill=true)
  → Return created instrument
```

---

## Files Changed

### New Files
| File | Purpose |
|------|---------|
| `apps/web/src/lib/auto-create-instrument.ts` | `findOrCreateInstrument()` + `triggerBackfill()` shared helper |
| `scripts/backfill-missing.ts` | One-off Tiingo backfill for instruments with 0 price bars |

### Modified Files
| File | Change |
|------|--------|
| `apps/web/src/components/instruments/SymbolSearchInput.tsx` | Min 3 chars, max 10 results, scrollable, onSelect callback |
| `apps/web/src/components/instruments/AddInstrumentModal.tsx` | Auto-populate from search, mapExchange/mapType, optional initial purchase |
| `apps/web/src/app/(pages)/page.tsx` | Instrument visibility fix, persistent add button |
| `apps/web/src/app/(pages)/holdings/page.tsx` | Same as dashboard page |
| `apps/web/src/components/transactions/TransactionForm.tsx` | Price auto-fill from historical close |
| `apps/web/src/components/dashboard/PortfolioChart.tsx` | Always render container div |
| `apps/web/src/components/holding-detail/CandlestickChart.tsx` | Same chart fix |
| `apps/web/src/lib/hooks/usePortfolioTimeseries.ts` | ALL window sends startDate=1970-01-01 |
| `apps/web/src/app/api/transactions/bulk/route.ts` | Auto-create instruments, sequential backfills, fire-and-forget rebuild |
| `apps/web/src/app/api/transactions/route.ts` | Accept symbol as alternative to instrumentId |
| `apps/web/src/components/transactions/BulkPastePanel.tsx` | Show auto-created instruments in toast |
| `apps/web/src/lib/snapshot-rebuild-helper.ts` | Timeout 30s → 600s |
| `apps/web/__tests__/api/transactions/bulk.test.ts` | Updated for auto-create behavior |
| `apps/web/__tests__/api/transactions/transactions.test.ts` | Updated for auto-create behavior |

---

## Testing & Validation

| Check | Result |
|-------|--------|
| `pnpm tsc --noEmit` | 0 errors |
| `pnpm test` | 598/598 passing (50 files) |
| Bulk import (single symbol, existing) | 201 — inserted 1 |
| Bulk import (2 new symbols) | 201 — inserted 2, autoCreated: [MSFT, AMZN] |
| Chart rendering (portfolio area) | Verified rendering after fix |
| ALL window timeseries | Verified returns data back to 1970-01-01 |
| Snapshot rebuild (83 instruments) | Completed within 10-minute timeout |
| CXDO holdings data | 500 shares, $2,920 value, $905 cost, +$2,015 PnL |

---

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Search results flood page | Min 3 chars, max 10, scrollable dropdown |
| Search doesn't populate form | Added onSelect(SearchResult) callback |
| Dashboard empty with instruments | Check instruments.length not holdings.length |
| Charts never render | Container div always in DOM, hidden when loading |
| ALL window returns no data | Send startDate=1970-01-01 |
| Bulk import rejects unknown symbols | Auto-create via findOrCreateInstrument() |
| service.search() not a function | Corrected to service.searchSymbols() |
| SQLite timeout during bulk create | Skip backfill, queue sequentially after |
| Snapshot rebuild timeout | Increased to 10 minutes |
| Triple duplicate transactions | SQL cleanup, keeping MIN(id) per group |
| 71 instruments with 0 price bars | Sequential backfill script |

---

## Outstanding Items

1. **Bulk import duplicate detection** — No idempotency guard. User imported 3x and got triple entries.
2. **Instrument name resolution** — Many auto-created instruments show symbol as name (FMP search returned nothing).
3. **UAT phases 1-6 incomplete** — Only the instrument add + bulk import flows were tested. Advisor, scheduler, charts detail pages, and full acceptance criteria sweep remain.
4. **Snapshot rebuild performance** — 80+ instruments makes rebuild slow (minutes). May need optimization (batch price lookups, parallel processing within the transaction).

---

## Next Steps

1. **Add bulk import dedup** — Detect existing transactions by (instrumentId, type, quantity, price, tradeAt) and skip duplicates
2. **Batch instrument name resolution** — FMP search to fill in proper names for auto-created instruments
3. **Continue UAT** — Phases 1-6 from SESSION-13-PLAN.md (advisor, scheduler, charts, acceptance sweep)
4. **Optimize snapshot rebuild** — Batch price lookups to reduce query count for large portfolios
5. **Holiday/half-day calendar** — Reduce wasted API calls on non-trading days

---

## Commit Log

```
8c50dab Session 13: Move planning docs to Planning/ directory
0604946 Session 13: Snapshot rebuild timeout increase + backfill script
f1faa3b Session 13: Fix bulk import — SQLite timeout, sequential backfills, correct search method
f3a319e Session 13: Auto-create instruments on transaction add and bulk import
8bcb9be Session 13: Hotfix — charts not rendering, ALL window bug, combined instrument+buy flow
a0d905c Session 13: Hotfix — persistent Add Instrument button on Dashboard and Holdings
ab55dcd Session 13: Hotfix — instrument search UX, dashboard visibility, price auto-fill
```

7 commits, 16 files modified, 2 new files created.
