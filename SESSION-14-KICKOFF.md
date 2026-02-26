# SESSION-14-KICKOFF.md — Data Integrity + UAT Completion

**Paste this into Claude Code to start Session 14.**

---

## Context

You are starting Session 14 of the STALKER project (Stock & Portfolio Tracker + LLM Advisor). Read these documents in order:

1. `CLAUDE.md` — Architecture overview + coding rules
2. `AGENTS.md` — Package inventory + coordination patterns
3. `STALKER_PHASE-II_ADDENDUM.md` — Provider overrides (binding)
4. `SESSION-13-REPORT.md` — Previous session report (what changed, what's outstanding)
5. `SESSION-14-PLAN.md` — This session's full plan

## What happened in Session 13

Session 13 was the first live UAT. The user imported their real portfolio (~83 instruments, 87 transactions). Several issues were found and fixed:
- Chart rendering bug (container not in DOM during mount)
- Search UX issues (flooding, no auto-populate)
- Auto-create instruments on bulk import
- SQLite write contention during concurrent backfills
- Triple duplicate transactions from 3x re-import (cleaned via SQL)
- 71 instruments with 0 price bars (backfilled via script)

**Current state:** 598 tests passing, 0 TypeScript errors, 83 instruments with price data, 87 unique transactions, 826 snapshots.

## Session 14 Scope — Five Phases

### Phase 0: Data Integrity (P0 — do this first, blocks everything)

**Task 0A: Bulk Import Dedup Guard**

Modify `POST /api/transactions/bulk` in `apps/web/src/app/api/transactions/bulk/route.ts`:

1. After resolving instruments and before inserting transactions, query existing transactions for each instrument in the batch.
2. For each candidate row, check for exact match on `(instrumentId, type, quantity, price, tradeAt)`.
3. Use `Decimal` comparison for quantity and price (not string `===`). Import Decimal from Prisma or Decimal.js — use `.eq()` method.
4. Skip matched rows. Include them in the response: `{ inserted: [...], skipped: [...], autoCreated: [...] }`.
5. Update `BulkPastePanel.tsx` to display: "Imported N transactions. Skipped M duplicates." in the success toast.

**Task 0B: Single Transaction Dedup Warning**

In `POST /api/transactions` (`apps/web/src/app/api/transactions/route.ts`):
1. Before inserting, check if an exact match exists on `(instrumentId, type, quantity, price, tradeAt)`.
2. If match found, still insert (don't block), but add `potentialDuplicate: true` to the response.
3. UI can use this to show an informational warning.

**Task 0C: Tests**

Add tests for dedup behavior:
- Import 5 rows, import same 5 again → 0 inserted, 5 skipped
- Import 5 rows, import 5 where 3 overlap → 2 inserted, 3 skipped  
- Import where quantity differs → both inserted (not duplicates)
- Decimal edge case: "50" vs "50.00" → treated as equal

### Phase 1: Snapshot Rebuild Performance (P0)

The current rebuild does one DB query per instrument per trading day. For 83 instruments × 250 days = ~20,000 queries. This takes minutes.

**Task 1A: Batch Price Lookups**

Find the snapshot rebuild function (likely in `packages/analytics/` or `apps/web/src/lib/`). Refactor:

```
BEFORE (slow):
  for each date:
    for each instrument:
      SELECT close FROM PriceBar WHERE instrumentId = ? AND date = ?

AFTER (fast):
  Step 1: SELECT * FROM PriceBar WHERE instrumentId IN (...all held instruments...) AND date BETWEEN earliest AND latest
  Step 2: Build Map<instrumentId, Map<dateString, closePrice>>
  Step 3: For carry-forward: sort dates per instrument, use binary search or linear scan to find most recent bar ≤ target date
  Step 4: Iterate dates using in-memory map lookups
```

**Critical: Carry-forward logic must be preserved.** If no bar exists for a date, use the most recent prior close. Test this explicitly.

**Task 1B: Reduce Timeout**

After optimization works, reduce the Prisma interactive transaction timeout in `apps/web/src/lib/snapshot-rebuild-helper.ts` from 600s back to 120s (or 60s if rebuild is fast enough).

**Task 1C: Benchmark**

After optimization, log the rebuild time. Run a full rebuild on the real portfolio. Target: < 30 seconds.

### Phase 2: Instrument Name Resolution (P1 — can run in parallel)

**Task 2A: Create `scripts/resolve-instrument-names.ts`**

```typescript
// Pseudocode:
const unnamed = await prisma.instrument.findMany({ where: { name: { equals: prisma.raw('symbol') } } });
// Or: where name matches the symbol field value

for (const inst of unnamed) {
  // Try FMP search
  const fmpResults = await fmpProvider.searchSymbols(inst.symbol);
  if (fmpResults.length > 0) {
    await prisma.instrument.update({ where: { id: inst.id }, data: { name: fmpResults[0].name, ... } });
    continue;
  }
  
  // Try Tiingo metadata
  const tiingoMeta = await fetch(`https://api.tiingo.com/tiingo/daily/${inst.symbol}?token=${TIINGO_KEY}`);
  if (tiingoMeta.ok) {
    const data = await tiingoMeta.json();
    if (data.name) {
      await prisma.instrument.update({ where: { id: inst.id }, data: { name: data.name } });
    }
  }
  
  // 300ms delay between API calls to respect rate limits
  await new Promise(r => setTimeout(r, 300));
}
```

**Task 2B: Improve `findOrCreateInstrument()`**

In `apps/web/src/lib/auto-create-instrument.ts`, add Tiingo metadata as a fallback when FMP search returns no results, so future auto-creates get proper names.

### Phase 3: UAT Acceptance Sweep (P1 — after Phases 0-1)

This is a manual verification phase. Walk through each acceptance criterion against the live app with the real portfolio. For each:
- Note PASS or FAIL
- If FAIL: fix if < 30 min, otherwise log as defect

**Criteria to verify (Spec §13):**
1. Add instrument by search with backfill + timezone
2. Record BUY/SELL with backdating + negative position validation
3. Dashboard: total value, day change, window selector (all windows)
4. Holdings table: price, qty, value, PnL, allocation %, staleness
5. Single instrument chart: candles + date range picker
6. Realized vs unrealized PnL at portfolio + holding level
7. Lot detail: FIFO ordering, remaining qty, per-lot PnL
8. Advisor: 5 intent categories (see Phase 4)
9. Quote staleness: timestamps + warnings
10. Data health footer: instrument count, polling, API budget, freshness
11. Empty states on all pages

### Phase 4: Advisor Deep Test (P1)

Test all 5 intent categories from Spec §7.5:

1. **Cross-holding synthesis:** "Which positions are dragging my portfolio down this quarter?"
2. **Tax-aware reasoning:** "If I sold my oldest lots of [pick largest holding], what would the realized gain be?"
3. **Performance attribution:** "How much of my portfolio gain came from [top holding] vs everything else?"
4. **Concentration awareness:** "Am I overexposed to any single holding?"
5. **Staleness/data quality:** "Are any of my holdings showing stale prices?"

Also verify: tool call indicators, thread persistence, new thread, suggested prompts.

**Important:** With 83 instruments, `getPortfolioSnapshot` returns a large holdings list. If the advisor fails or produces poor responses, check if the tool response is being truncated or if the context window is overflowing. If so, truncate `getPortfolioSnapshot` output to top 20 holdings by allocation.

### Phase 5: Scheduler Budget Check (P2)

**Critical discovery:** 83 instruments × 13 polls/day = 1,079 FMP calls. Free tier = 250/day. The scheduler will exhaust the budget by late morning.

1. Check if the scheduler already has budget-aware interval adjustment. If not, add it:
   ```
   const estimatedDailyCalls = instrumentCount * pollsPerDay;
   if (estimatedDailyCalls > dailyLimit * 0.9) {
     const adjustedInterval = Math.ceil((instrumentCount * marketHoursSeconds) / (dailyLimit * 0.9));
     log.warn(`Budget exceeded. Adjusting poll interval from ${configured}s to ${adjustedInterval}s`);
   }
   ```
2. Start the scheduler. Verify it logs the budget warning.
3. If market is open, observe one poll cycle. If closed, trigger manual refresh from UI.

## Coding Rules Reminders

- **Decimal discipline:** No `number` for money or quantity. All financial math uses `Decimal.js`.
- **`Number()` exception:** Only in `chart-utils.ts` and `chart-candlestick-utils.ts` (TradingView needs native numbers).
- **Prisma `$transaction`:** Snapshot rebuilds must be atomic (AD-S10a).
- **HTTP semantics:** GETs are safe and idempotent. State mutations use POST/PUT/DELETE.
- **Test everything:** Add tests for dedup logic and snapshot rebuild performance.
- **String intermediary for Decimal:** `new Decimal(String(jsonNumber))` not `new Decimal(jsonNumber)` (AD-P2-10).

## Success Criteria

1. Bulk import is idempotent — re-import produces 0 new transactions
2. Snapshot rebuild < 30 seconds for 83 instruments
3. All instruments have proper names
4. All 11 MVP acceptance criteria pass
5. All 5 advisor intent categories work
6. Scheduler handles 83-instrument budget
7. 598+ tests passing, 0 TypeScript errors

## Priority If Time Is Short

```
Phase 0 (dedup) → Phase 1 (performance) → Phase 3 (UAT sweep) → Phase 2 (names) → Phase 4 (advisor) → Phase 5 (scheduler)
```

Phases 0 and 1 are non-negotiable. Phase 3 is the primary purpose of the session. Phases 2, 4, 5 can be deferred to a follow-up if needed.
