# SESSION-14-PLAN.md — Data Integrity + UAT Completion

**Date:** 2026-02-25
**Author:** Systems Architect
**Inputs:** SESSION-13-REPORT.md, SPEC v4.0 §13, UX/UI Plan §11, STALKER_MASTER-PLAN.md v4.0
**Status:** Ready for execution

---

## 0. Session Context

Session 13 was the first live UAT. The user successfully imported their real portfolio (~83 instruments, 87 transactions), but the session surfaced several categories of issues:

1. **Data integrity gap** — No dedup guard on bulk import. User imported 3x, creating 255 transactions (87 unique). Cleaned manually via SQL.
2. **Performance bottleneck** — Snapshot rebuild for 83 instruments takes minutes. Prisma transaction timeout had to be raised from 30s → 600s.
3. **Incomplete UAT coverage** — Only instrument add + bulk import flows were tested. Advisor, scheduler, charts detail, holding detail, and the full acceptance criteria sweep were not reached.
4. **Instrument metadata gaps** — Many auto-created instruments show symbol-as-name because FMP search returned nothing.

**Portfolio size reality check:** The spec assumed 15–20 instruments. The real portfolio has 83. This 4–5x scale increase exposed SQLite write contention, snapshot rebuild latency, and rate limiter budget assumptions that were invisible at design-time scale. Session 14 must treat 80+ instruments as the new baseline.

---

## 1. Session Goals

| # | Goal | Priority | Rationale |
|---|------|----------|-----------|
| G1 | Bulk import idempotency | P0 | Data integrity. Re-import must not create duplicates. This is the #1 correctness risk for the product. |
| G2 | Snapshot rebuild performance | P0 | 80+ instruments makes the current O(instruments × trading_days × DB_queries) rebuild unacceptable. Target: < 30 seconds for full rebuild. |
| G3 | Instrument name resolution | P1 | ~40+ instruments display symbol-as-name. Poor UX and makes the advisor less useful. |
| G4 | Complete UAT acceptance sweep | P1 | 11 MVP acceptance criteria (Spec §13) must be verified against the real portfolio. S13 only covered criteria 1–2 partially. |
| G5 | Advisor UAT with real data | P1 | Verify all 5 intent categories (Spec §7.5) against 83-instrument portfolio. |
| G6 | Scheduler live verification | P2 | Start scheduler, observe one full polling cycle, verify quote freshness updates. |

---

## 2. Phase Structure

### Phase 0: Data Integrity Fixes (Lead — solo, blocks everything)

**Estimated effort:** 1–2 hours

#### Task 0A: Bulk Import Dedup Guard

The bulk import endpoint (`POST /api/transactions/bulk`) must detect and skip duplicate transactions. A transaction is considered a duplicate when all of: `(symbol, type, quantity, price, tradeAt)` match an existing transaction for that instrument.

**Implementation:**

1. In the bulk route handler, after resolving instruments but before inserting, query existing transactions for each instrument in the batch.
2. For each candidate row, check if an exact match exists on `(instrumentId, type, quantity, price, tradeAt)`.
3. Skip matched rows. Return them in the response as `{ skipped: [...], inserted: [...], autoCreated: [...] }`.
4. The UI should display: "Imported N transactions. Skipped M duplicates."

**Edge cases:**
- Same symbol, same date, different quantities → both are valid (multiple trades on one day).
- Same everything including quantity → duplicate. Skip.
- Decimal comparison: use `Decimal.eq()`, not `===` on strings (Prisma returns Decimal objects).

**Test cases:**
- Import 5 rows. Import same 5 rows again. Second import: 0 inserted, 5 skipped.
- Import 5 rows. Import 5 rows where 3 overlap. Second import: 2 inserted, 3 skipped.
- Import where quantity differs on one row. Both inserted.

#### Task 0B: Single Transaction Dedup Warning

The single-transaction `POST /api/transactions` endpoint should warn (not block) when a potential duplicate is detected. Add a `potentialDuplicate: boolean` field to the response. The UI can surface this as an informational toast.

#### Task 0C: Verify Current Data State

Before proceeding to other phases, verify the production database:
- Count transactions per instrument. Flag any that look like duplicates from the S13 triple-import.
- If S13's SQL cleanup was incomplete, re-run dedup SQL.
- Verify snapshot count and date range are coherent.

---

### Phase 1: Snapshot Rebuild Performance (Lead — solo)

**Estimated effort:** 2–3 hours

The current rebuild is slow because it does one DB query per instrument per trading day to look up the closing price. For 83 instruments over ~250 trading days, that's ~20,000 queries inside a single Prisma transaction.

#### Task 1A: Batch Price Lookups

Refactor the snapshot rebuild to pre-load all price data before iterating over dates:

```
Current (slow):
  for each date:
    for each instrument with open lots:
      query = SELECT close FROM PriceBar WHERE instrumentId = X AND date = D
      
Target (fast):
  Step 1: Determine date range (earliest transaction → today)
  Step 2: SELECT * FROM PriceBar WHERE instrumentId IN (...) AND date BETWEEN start AND end
  Step 3: Build in-memory map: Map<instrumentId, Map<date, closePrice>>
  Step 4: Iterate dates using map lookups (O(1) per lookup)
```

**Expected improvement:** ~20,000 queries → ~1 query (or 1 per instrument if batched by instrument). Rebuild should drop from minutes to seconds.

**Constraints:**
- Memory: 83 instruments × 250 dates × ~40 bytes = ~830KB. Trivially fits in memory.
- Must still respect the carry-forward rule: if no bar exists for a date, use the most recent prior close.
- Must remain inside a Prisma `$transaction` for atomicity (AD-S10a).

#### Task 1B: Reduce Prisma Transaction Timeout

After optimization, reduce the timeout back from 600s to a more reasonable value (60s or 120s). If the optimized rebuild still needs 600s, something is wrong.

#### Task 1C: Benchmark

Run rebuild on the real portfolio (83 instruments, 87 transactions, ~40,000+ price bars) and record:
- Wall-clock time
- Number of DB queries (log at DEBUG level)
- Peak memory usage (optional)

Target: < 30 seconds. Stretch goal: < 10 seconds.

---

### Phase 2: Instrument Name Resolution (Lead or Teammate)

**Estimated effort:** 1 hour

#### Task 2A: Batch Name Resolution Script

Create `scripts/resolve-instrument-names.ts`:

1. Query all instruments where `name = symbol` (the auto-create default).
2. For each, call FMP `searchSymbols(symbol)`.
3. If FMP returns a match: update `name`, `exchange`, `type` fields.
4. If FMP returns nothing: try Tiingo metadata endpoint (`/tiingo/daily/{symbol}`) which returns `name`.
5. Log results. Don't overwrite if instrument already has a proper name.

Rate limit consideration: If 40+ instruments need resolution, this uses 40+ FMP calls. With 250/day limit, this is fine as a one-time script but should not run on every startup.

#### Task 2B: Auto-Create Improvement

Update `findOrCreateInstrument()` to try Tiingo metadata as a fallback when FMP search returns nothing. Tiingo's metadata endpoint returns the instrument name and is included in the free tier.

---

### Phase 3: UAT Acceptance Criteria Sweep (Business Stakeholder + Lead)

**Estimated effort:** 2–3 hours

Walk through each MVP acceptance criterion (Spec §13) against the real portfolio. Record pass/fail with notes.

| Criterion | Description | Test Method |
|-----------|-------------|-------------|
| AC-1 | Add instruments by search with backfill + timezone | Add 1 new instrument via search. Verify backfill completes, `exchangeTz` is correct. |
| AC-2 | Record BUY/SELL with backdating + validation | Add a backdated BUY. Add a SELL that would create negative position — verify rejection with clear error. |
| AC-3 | Dashboard: total value, day change, window selector | Open dashboard. Verify hero metric shows total. Switch windows (1W, 1M, 3M, 1Y, ALL). Verify chart updates. |
| AC-4 | Holdings table: price, qty, value, PnL, allocation, staleness | Check at least 5 holdings. Verify numbers align with expectation. Check for stale indicators. |
| AC-5 | Single instrument chart with candles + date picker | Navigate to holding detail for 3 instruments. Verify candlestick chart renders. Change date range. |
| AC-6 | Realized vs unrealized PnL at portfolio + holding level | Compare dashboard PnL cards with holding-level detail. Verify realized PnL appears for instruments with SELL transactions. |
| AC-7 | Lot detail: FIFO lots with cost basis + unrealized PnL | Pick an instrument with multiple BUY lots. Verify lot table shows correct FIFO ordering, remaining quantities, per-lot PnL. |
| AC-8 | Advisor: 5 intent categories | Open advisor. Test each intent category from Spec §7.5 (cross-holding synthesis, tax-aware reasoning, performance attribution, concentration awareness, staleness check). |
| AC-9 | Quote staleness: timestamps + warnings | Check data health footer. Verify stale instruments show amber indicators. |
| AC-10 | Data health footer | Verify instrument count, polling status, API budget, freshness summary are accurate. |
| AC-11 | Empty states on all pages | (Already verified in S9. Quick recheck: delete all data from a test DB, verify each page.) |

**Failure handling:** Any AC failure becomes a hotfix task within this session if fixable in < 30 minutes. Otherwise, it's logged as a defect for a follow-up session.

---

### Phase 4: Advisor Deep Test (Business Stakeholder + Lead)

**Estimated effort:** 1 hour

This is the detailed version of AC-8. The advisor is the most differentiated feature and needs more than a checkbox.

| Intent | Test Query | Expected Behavior |
|--------|-----------|-------------------|
| 1 — Cross-holding synthesis | "Which positions are dragging my portfolio down this quarter?" | Advisor calls `getPortfolioSnapshot` with window, identifies worst performers by PnL contribution. |
| 2 — Tax-aware reasoning | "If I sold my oldest lots of [largest holding], what would the realized gain be?" | Advisor calls `getHolding`, identifies FIFO lots, computes hypothetical realized gain. |
| 3 — Performance attribution | "How much of my portfolio gain this year came from [top holding] versus everything else?" | Advisor calls `getPortfolioSnapshot` + `getHolding`, attributes gain by position. |
| 4 — Concentration awareness | "Am I overexposed to any single holding?" | Advisor calls `getPortfolioSnapshot`, identifies holdings > 10% allocation. |
| 5 — Staleness and data quality | "Are any of my holdings showing stale prices?" | Advisor calls `getQuotes`, checks `asOf` timestamps, flags stale instruments. |

**Advisor-specific checks:**
- Tool call indicators render correctly (collapsible, show tool name).
- Thread persistence: close panel, reopen — thread is preserved.
- New thread button works.
- Suggested prompts appear when no active thread exists.
- Missing API key state renders correctly (if testable).

---

### Phase 5: Scheduler Live Test (Lead — solo)

**Estimated effort:** 30 minutes

1. Start scheduler process (`pnpm run scheduler` or equivalent).
2. Observe startup log: verify budget calculation is correct for 83 instruments.
3. If market is open: wait for one polling cycle (30 min or trigger manually). Verify `LatestQuote` timestamps update.
4. If market is closed: verify scheduler idles correctly. Trigger manual refresh via UI button. Verify quotes update.
5. Check data health footer before and after refresh — freshness should update.

**Budget concern:** 83 instruments × 13 polls/day = 1,079 FMP calls. The free tier is 250/day. **This exceeds the budget by 4x.** The scheduler should log a warning and extend the polling interval. Verify it does.

**Recommendation:** If the scheduler doesn't handle this gracefully, add a budget-aware polling interval calculation:
```
effectiveInterval = max(configuredInterval, (instruments × marketHours × 2) / dailyLimit × 3600)
```

---

## 3. Architecture Decisions for This Session

| # | Decision | Rationale |
|---|----------|-----------|
| AD-S14-1 | Dedup is by exact match on (instrumentId, type, quantity, price, tradeAt) | Conservative. Avoids false positives. Two trades for the same instrument at different prices on the same day are distinct. |
| AD-S14-2 | Dedup uses Decimal.eq() for quantity and price comparison | String comparison would fail if Prisma returns "50.00" vs "50" for the same value. |
| AD-S14-3 | Batch price lookups via single query per instrument, loaded into Map | O(1) lookup per date vs O(1) query per date. Memory cost is trivial (~1MB). |
| AD-S14-4 | Instrument name resolution is a manual script, not an auto-startup task | FMP calls are expensive (250/day). One-time resolution, not repeated. |
| AD-S14-5 | Polling interval auto-adjusts when instrument count exceeds budget | 83 instruments × standard interval exceeds FMP's 250/day. Scheduler must self-throttle. |

---

## 4. Risk Assessment

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R-14-1 | Snapshot rebuild optimization breaks carry-forward logic | Medium | Critical | Pre-sort price bars by date. Binary search for most recent bar ≤ target date. Unit test with missing-bar scenarios. |
| R-14-2 | FMP rate limit hit during name resolution | Low | Low | Resolution script adds 300ms delay between calls. Run during off-hours. |
| R-14-3 | Advisor fails on 83-instrument portfolio (context too large) | Medium | Medium | `getPortfolioSnapshot` may return a very large holdings list. If advisor chokes, truncate to top 20 by allocation in the tool response. |
| R-14-4 | Scheduler budget warning not implemented | High | Medium | S12 may not have added budget-aware interval adjustment. If missing, add it in Phase 5. |
| R-14-5 | Dedup false negatives due to Decimal string format mismatch | Medium | High | Use Decimal.eq() not string comparison. Add test with "50" vs "50.00" vs "50.0000". |

---

## 5. Success Criteria

Session 14 is complete when:

1. ✅ Bulk import is idempotent — re-importing the same data produces 0 new transactions.
2. ✅ Snapshot rebuild for 83 instruments completes in < 30 seconds.
3. ✅ All 83 instruments have proper names (not symbol-as-name).
4. ✅ All 11 MVP acceptance criteria pass against the real portfolio.
5. ✅ All 5 advisor intent categories produce non-trivial responses.
6. ✅ Scheduler handles 83-instrument budget gracefully (warns + adjusts interval, or uses batched polling).
7. ✅ All existing tests pass (`pnpm test` — 598+ passing).
8. ✅ TypeScript compiles cleanly (`pnpm tsc --noEmit` — 0 errors).

---

## 6. Team Shape

**Lead Engineer** handles Phases 0, 1, and 5 (data integrity, performance, scheduler). These are backend-heavy, require careful reasoning about edge cases, and touch load-bearing code.

**Lead + Business Stakeholder** collaborate on Phases 3 and 4 (UAT sweep, advisor testing). The stakeholder operates the browser; the lead monitors the terminal and applies hotfixes.

**Teammate (optional)** can handle Phase 2 (name resolution) in parallel — it's isolated, low-risk work that doesn't touch core logic.

---

## 7. File Impact Estimate

| Area | Files Modified | Files Created |
|------|---------------|---------------|
| Bulk import dedup | `api/transactions/bulk/route.ts`, `BulkPastePanel.tsx` | — |
| Single transaction dedup | `api/transactions/route.ts` | — |
| Snapshot rebuild | `packages/analytics/src/portfolio-series.ts` (or equivalent) | — |
| Name resolution | — | `scripts/resolve-instrument-names.ts` |
| Auto-create fallback | `apps/web/src/lib/auto-create-instrument.ts` | — |
| Scheduler budget | `packages/scheduler/src/index.ts` (or equivalent) | — |
| Tests | Existing test files + new dedup tests | `__tests__/api/transactions/bulk-dedup.test.ts` |

Estimated: ~10 files modified, 2–3 files created.
