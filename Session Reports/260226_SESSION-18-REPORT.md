# Session 18 Report — Visual UAT Fixes + UX Enhancements

**Date:** 2026-02-26
**Session Type:** Solo (Lead only)
**Status:** Complete — all 6 phases delivered

---

## Session Overview

Session 18 addressed 5 issues discovered during the first visual browser UAT with the real 83-instrument portfolio, plus a documentation sync phase. The session focused on data completeness (extending price history to cover the full Dec 2022+ portfolio timeline), UX polish (column improvements, position preservation, add-another flow), and resilience (retry on transient errors).

---

## Work Completed

### Phase 1 — Backfill Lookback Extended to 10 Years (P0 — Critical)

**Problem:** Portfolio area chart flatlined before Feb 2024. Candlestick charts for instruments purchased in Dec 2022 showed no data before Feb 2024. Root cause: `triggerBackfill()` used a 2-year lookback hardcoded in three locations.

**Solution:**
- Changed backfill lookback from 2 years to 10 years in all three locations:
  - `apps/web/src/app/api/instruments/route.ts`
  - `apps/web/src/lib/auto-create-instrument.ts`
  - `scripts/backfill-missing.ts`
- Created `scripts/re-backfill-history.ts` — a one-time script to extend history on all existing instruments
  - Batches of 45 instruments with 61-second pause between batches (Tiingo rate limit: 50 req/hr)
  - Date-range dedup: queries existing bar dates per instrument, filters duplicates before insert
  - Idempotent via UNIQUE constraint on `(instrumentId, provider, resolution, date)`
- Executed re-backfill: **12,748 new bars** across **73 instruments**, 0 failures
- Triggered portfolio snapshot rebuild: **813 snapshots** covering Dec 29, 2022 – Feb 26, 2026 (was starting Feb 2024)
- Backed up database before changes: `portfolio.db.pre-s18`

**Remaining gaps:** 3 instruments (XRP, QTOP, TOPT) have limited/no Tiingo data — accepted as provider limitation.

### Phase 2 — Holding Detail Resilient Refetch (P1)

**Problem:** "Failed to load holding: HTTP 500" appeared intermittently after editing a transaction on the holding detail page.

**Investigation:** The session plan hypothesized `triggerSnapshotRebuild()` was fire-and-forget in the PUT handler, but investigation confirmed it's already properly `await`ed. Root cause is likely transient SQLite write contention.

**Solution (defensive):**
- Added `console.error` logging with symbol context to the holdings/[symbol] API endpoint
- Updated `useHoldingDetail` hook with retry-once on HTTP 500 (500ms delay)
- Error messages now include server-side error body for better diagnostics

### Phase 3 — Holdings Table Column Improvements (P2)

**Problem:** No average cost column. "Price" column label ambiguous. Column ordering not logically grouped.

**Solution:**
- Added `avgCostPerShare()` function to `holdings-utils.ts` — Decimal division with zero-quantity guard (returns null)
- Added "avgCost" to `SortColumn` type with null-safe sort logic (zero-qty positions sort last)
- Updated `PortfolioTable` columns: Symbol | Name | First Buy | Qty | **Avg Cost** | **Cost Basis** | **Current Price** | Value | PnL $ | PnL % | Alloc % | Actions
- Renamed "Price" → "Current Price" in both `PortfolioTable` and `HoldingsTable`
- 6 new tests covering `avgCostPerShare` and avgCost sorting

### Phase 4 — List Position Preservation on Delete (P3)

**Problem:** After deleting an instrument, the holdings list jumped back to page 1 / scrolled to top.

**Root cause:** `useHoldings` set `isLoading = true` on every refetch, causing React to swap `PortfolioTable` with `Skeleton`, unmounting the component and destroying its `currentPage` state.

**Solution:** Only show loading skeleton on initial load (`data === null`), not on refetch. Initial load still shows skeleton as expected.

### Phase 5 — Add Another Instrument Flow (P4)

**Problem:** After adding an instrument, the modal closed immediately. Adding multiple instruments required reopening the modal each time.

**Solution:** After successful creation, the modal shows a success state displaying the added symbol with two buttons:
- "Add Another" — resets the form for a new instrument
- "Done" — closes the modal

### Phase 6 — Documentation Sync

Updated all project documentation to reflect Session 18 changes:
- `HANDOFF.md` — Full state update with S18 changes, metrics, architecture decisions
- `KNOWN-LIMITATIONS.md` — Updated date header
- `CLAUDE.md` — Added Session 18 section (backfill, columns, hooks, utilities)
- `AGENTS.md` — Updated test count (677 → 683)

---

## Technical Details

### Architecture Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| AD-S18-1 | Backfill lookback: 10 years (static default) | Tiingo provides 30+ years free data. 10yr covers any reasonable transaction history. Backfill runs at instrument creation before any transactions exist, so computed-from-transactions is not possible. |
| AD-S18-2 | Holding detail refetch retries once on 500 | Transient SQLite contention can cause intermittent 500s. Single retry with 500ms delay resolves most cases without degrading UX. |
| AD-S18-3 | Avg Cost = costBasis / totalQuantity (Decimal division) | Standard brokerage column. Guards divide-by-zero for fully closed positions (returns null). |
| AD-S18-4 | Re-backfill is a one-time script, not automatic migration | Existing instruments needed history gap filled. Future instruments get 10yr lookback automatically. Script is idempotent (UNIQUE constraint handles dedup). |
| AD-S18-5 | useHoldings skips loading skeleton on refetch | Prevents PortfolioTable unmount that destroyed pagination/scroll state. Initial load still shows skeleton. |

### Key Implementation Patterns

- **Decimal division with zero-guard:** `avgCostPerShare()` returns `null` for zero-quantity positions, rendered as em dash in UI
- **Retry-once pattern:** `useHoldingDetail` retries failed requests once with 500ms delay, only on HTTP 500
- **Conditional loading state:** `useHoldings` distinguishes initial load (show skeleton) from refetch (keep current data visible)
- **Two-phase success state:** `AddInstrumentModal` uses `addedSymbol` state to toggle between form and success UI

---

## Files Changed

### Modified
| File | Change |
|------|--------|
| `apps/web/src/app/api/instruments/route.ts` | Backfill lookback 2yr → 10yr |
| `apps/web/src/lib/auto-create-instrument.ts` | Backfill lookback 2yr → 10yr |
| `scripts/backfill-missing.ts` | Backfill lookback 2yr → 10yr |
| `apps/web/src/app/api/portfolio/holdings/[symbol]/route.ts` | Added error logging with symbol context |
| `apps/web/src/lib/hooks/useHoldingDetail.ts` | Retry once on 500, error body extraction |
| `apps/web/src/lib/holdings-utils.ts` | `avgCostPerShare()`, "avgCost" sort column |
| `apps/web/src/components/dashboard/PortfolioTable.tsx` | Avg Cost column, column rename/reorder |
| `apps/web/src/components/holdings/HoldingsTable.tsx` | "Price" → "Current Price" |
| `apps/web/src/lib/hooks/useHoldings.ts` | Skip loading skeleton on refetch |
| `apps/web/src/components/instruments/AddInstrumentModal.tsx` | Success state with Add Another / Done |
| `apps/web/src/lib/__tests__/holdings-utils.test.ts` | 6 new tests |
| `HANDOFF.md` | Post-Session 18 state |
| `KNOWN-LIMITATIONS.md` | Date header update |
| `CLAUDE.md` | Session 18 section |
| `AGENTS.md` | Test count update |

### Created
| File | Purpose |
|------|---------|
| `scripts/re-backfill-history.ts` | One-time re-backfill script for extending price history |

---

## Testing & Validation

- **TypeScript:** `tsc --noEmit` — 0 errors (checked after each phase)
- **Test suite:** `pnpm test` — **683 tests passing** across **59 test files** (6 new tests added)
- **Database validation:**
  - 12,748 new price bars confirmed via SQL count
  - 813 portfolio value snapshots covering Dec 29, 2022 – Feb 26, 2026
  - Only 3 instruments with remaining gaps (provider data unavailable)
- **Re-backfill script:** 73 instruments processed, 0 failures, all bars deduplicated

---

## Issues Encountered

1. **Phase 2 hypothesis was wrong:** Session plan hypothesized fire-and-forget rebuild in PUT handler, but investigation showed it's already synchronous. Applied defensive retry instead.
2. **3 instruments with data gaps:** XRP, QTOP, TOPT have limited/no Tiingo coverage. Accepted as provider limitation — no mitigation possible without adding a new data provider.

---

## Outstanding Items

- **KL-2/KL-3:** Advisor context window management — token counting and summary generation for long threads
- **Responsive refinements:** Tablet/mobile layout adjustments (user is on desktop, low priority)

---

## Metrics

| Metric | Before S18 | After S18 |
|--------|-----------|-----------|
| Tests | 677 | 683 (+6) |
| Price bars | ~40,900 | ~53,600 (+12,748) |
| Snapshots | ~400 (from Feb 2024) | 813 (from Dec 2022) |
| Portfolio chart start | Feb 2024 | Dec 2022 |

---

## Next Steps

1. **Advisor context window management** — Token counting, summary generation for long threads (KL-2/KL-3)
2. **Responsive refinements** — Tablet/mobile layout adjustments
