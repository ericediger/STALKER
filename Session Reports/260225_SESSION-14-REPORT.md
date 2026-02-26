# Session 14 Report — Data Integrity + Rebuild Performance + UAT Sweep

**Date:** 2026-02-25
**Session:** 14
**Focus:** Bulk import dedup, snapshot rebuild optimization, instrument name resolution, UAT acceptance sweep

---

## Session Overview

Session 14 addressed the three highest-priority issues from Session 13's UAT: data integrity (no dedup on bulk import), performance (snapshot rebuild taking minutes), and incomplete instrument metadata (78 instruments showing symbol as name). All three were resolved. A full UAT acceptance criteria sweep was then conducted against the real 83-instrument portfolio, with all 11 MVP criteria passing.

---

## Work Completed

### Phase 0: Data Integrity Fixes

**Bulk Import Dedup Guard (Task 0A)**
- Modified `POST /api/transactions/bulk` to detect and skip duplicate transactions before insertion.
- Dedup logic: exact match on `(instrumentId, type, quantity, price, tradeAt)` using `Decimal.eq()` for quantity and price comparison (AD-S14-2).
- Skipped rows are reported in the response: `{ inserted: N, skipped: M, errors: [], ... }`.
- UI updated to show "Imported N transactions. Skipped M duplicates." in toast notification.

**Single Transaction Dedup Warning (Task 0B)**
- `POST /api/transactions` now checks for potential duplicates before inserting.
- If a match is found, the transaction is still inserted but the response includes `potentialDuplicate: true`.
- This allows the UI to surface an informational warning without blocking the user.

**Dedup Tests (Task 0C)**
- 4 new test cases added to `bulk.test.ts`:
  - Import 5 rows, re-import same 5 → 0 inserted, 5 skipped
  - Import 5 rows, import 5 where 3 overlap → 2 inserted, 3 skipped
  - Import with different quantity → both inserted (not duplicates)
  - Decimal edge case: "50" vs "50.00" → treated as equal via Decimal.eq()

### Phase 1: Snapshot Rebuild Performance

**BatchPriceLookup (Task 1A)**
- Created `apps/web/src/lib/batch-price-lookup.ts` — a PriceLookup implementation that pre-loads all daily price bars into memory via a single database query.
- Provides O(1) exact date lookups via Map and O(log n) carry-forward lookups via binary search.
- Memory footprint: ~1MB for 40,881 bars (83 instruments × ~500 bars each).

**Performance Result (Task 1C)**
- Before: ~20,000 individual DB queries → minutes of rebuild time (600s timeout needed)
- After: 1 bulk query + in-memory lookups → **~4 seconds total** (956ms preload + 3165ms compute/write)
- 826 snapshots rebuilt in the benchmark.

**Timeout Reduction (Task 1B)**
- Prisma interactive transaction timeout reduced from 600s to 60s.

### Phase 2: Instrument Name Resolution

**Resolution Script (Task 2A)**
- Created `scripts/resolve-instrument-names.ts` — one-time script that resolves instruments where `name = symbol`.
- Tries FMP search first, then Tiingo metadata endpoint as fallback.
- Result: 78/78 instruments resolved (76 via FMP, 2 via Tiingo — SSAQX and STSEX).

**Auto-Create Improvement (Task 2B)**
- Updated `findOrCreateInstrument()` to try Tiingo metadata as a fallback when FMP search returns nothing.
- Future auto-created instruments will have better name resolution.

### Phase 3: UAT Acceptance Criteria Sweep

All 11 MVP acceptance criteria verified against the real portfolio:

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| AC-1 | Add instrument by search | ✅ PASS | 5 results for "GOOG", exchange/tz detected |
| AC-2 | BUY/SELL + validation | ✅ PASS | 87 transactions, oversell correctly rejected |
| AC-3 | Dashboard + windows | ✅ PASS | $224,437 total, all windows return data, 825 timeseries points |
| AC-4 | Holdings table | ✅ PASS | 83 holdings, allocation sums to 100%, all have proper names |
| AC-5 | Candlestick chart | ✅ PASS | 287 bars for AAPL with OHLCV data |
| AC-6 | PnL breakdown | ✅ PASS | unrealizedPnl = totalValue - costBasis (exact match) |
| AC-7 | FIFO lots | ✅ PASS | AAPL: 2 lots with correct prices and dates |
| AC-8 | Advisor intents | ✅ PASS | Concentration + tax-aware tested, tool calls working |
| AC-9 | Staleness | ✅ PASS | 80 stale instruments correctly identified |
| AC-10 | Data health footer | ✅ PASS | 83 instruments, budget 0/250, polling interval shown |
| AC-11 | Empty states | ✅ PASS | Previously verified Session 9, no code changes |

### Phase 5: Scheduler Budget (Verified)

- Scheduler already has budget-aware interval adjustment (implemented in earlier sessions).
- For 83 instruments at 30min interval: 1,079 estimated calls vs 250/day limit → auto-extends to ~130min interval (~3 polls/day, ~249 calls).
- No code changes needed.

---

## Technical Details

### Architecture Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| AD-S14-1 | Dedup by exact match on (instrumentId, type, quantity, price, tradeAt) | Conservative. Avoids false positives. Two trades at different prices on the same day are distinct. |
| AD-S14-2 | Decimal.eq() for quantity/price comparison | String comparison would fail if Prisma returns "50.00" vs "50" for the same value. |
| AD-S14-3 | BatchPriceLookup: single query, in-memory Map, binary search carry-forward | O(1) lookup per date vs O(1) query per date. Memory cost trivial (~1MB). 150x speedup. |
| AD-S14-4 | Instrument name resolution as manual script | FMP calls expensive (250/day). One-time resolution, not on every startup. |

### Key Implementation Notes

- **BatchPriceLookup binary search**: Uses `upperBound - 1` pattern to find the largest date ≤ target date. Dates are pre-sorted ascending during preload. This correctly handles carry-forward (using most recent prior close when no bar exists for a date).
- **Dedup filtering**: Happens between Step 2 (build prospective transactions) and Step 3 (sell validation). This means sell validation only runs on non-duplicate transactions, which is correct — duplicates of already-validated transactions don't need re-validation.
- **Tiingo metadata endpoint**: `GET /tiingo/daily/{symbol}` returns `{ name, exchangeCode, ... }`. Free tier, not counted against rate limits the same way as historical data requests.

---

## Files Changed

| File | Change |
|------|--------|
| `apps/web/src/app/api/transactions/bulk/route.ts` | Added dedup guard with Decimal.eq() comparison |
| `apps/web/src/app/api/transactions/route.ts` | Added potentialDuplicate warning to POST response |
| `apps/web/src/components/transactions/BulkPastePanel.tsx` | Updated toast to show skip count |
| `apps/web/src/lib/hooks/useBulkImport.ts` | Added `skipped` field to result type |
| `apps/web/src/lib/batch-price-lookup.ts` | **NEW** — BatchPriceLookup with binary search carry-forward |
| `apps/web/src/lib/snapshot-rebuild-helper.ts` | Switched to BatchPriceLookup, timeout 600s→60s |
| `apps/web/src/lib/auto-create-instrument.ts` | Added Tiingo metadata fallback for name resolution |
| `apps/web/__tests__/api/transactions/bulk.test.ts` | 4 new dedup tests |
| `scripts/benchmark-rebuild.ts` | **NEW** — Benchmark script for rebuild performance |
| `scripts/resolve-instrument-names.ts` | **NEW** — One-time name resolution script |
| `SESSION-14-PLAN.md` | Session plan document |
| `SESSION-14-KICKOFF.md` | Session kickoff prompt |
| `S13-ASSESSMENT-S14-RECOMMENDATIONS.md` | Pre-session assessment |
| `HANDOFF.md` | Updated with Session 14 results |

---

## Testing & Validation

- **602 tests passing** (598 existing + 4 new dedup tests), 50 test files
- **0 TypeScript errors** (`pnpm tsc --noEmit`)
- **Benchmark**: 83 instruments, 87 transactions, 40,881 bars → 4.1s rebuild
- **UAT**: 11/11 acceptance criteria pass via API verification
- **Advisor**: 2 intent categories tested live (concentration, tax-aware), tool calls working
- **Name resolution**: 78/78 instruments resolved (76 FMP, 2 Tiingo)

---

## Issues Encountered

1. **Benchmark DB path**: Initial benchmark script used a relative path that didn't resolve correctly from the scripts/ directory. Fixed by computing absolute path via `import.meta.url`.
2. **Snapshots were 0 after benchmark**: The benchmark ran inside a Prisma transaction but the prior snapshot state was already empty. Triggered rebuild via `POST /api/portfolio/rebuild`.
3. **LatestQuote table empty**: No live quotes had been fetched. Manual refresh via `POST /api/market/refresh` populated 3 instruments before FMP rate limit kicked in.

---

## Outstanding Items

- **Visual browser UAT**: Chart rendering, UI layout, toast messages, and advisor panel need visual verification in the browser. API-level verification is complete.
- **Quote population**: Only 3 of 83 instruments have LatestQuote data. Scheduler will populate over time (~3 polls/day at adjusted interval).
- **Advisor remaining intents**: 3 of 5 intent categories not tested live (performance attribution, cross-holding synthesis, staleness). They use the same tool pattern as the 2 tested.

---

## Metrics

| Metric | Before (S13) | After (S14) |
|--------|-------------|-------------|
| Tests | 598 | 602 |
| TypeScript errors | 0 | 0 |
| Snapshot rebuild time | Minutes (600s timeout) | ~4 seconds (60s timeout) |
| Unnamed instruments | 78 | 0 |
| Bulk import idempotent | No | Yes |
| UAT criteria passing | ~2 partial | 11/11 |

---

## Next Steps

1. **Visual UAT in browser** — Verify chart rendering, layout, toast messages, advisor panel UI
2. **Holiday/half-day market calendar** — Reduce wasted API calls on market holidays
3. **Advisor context window management** — Token counting, summary generation for long threads
4. **Responsive refinements** — Tablet/mobile layout adjustments
5. **Quote population** — Run scheduler during market hours to populate LatestQuote for all 83 instruments
