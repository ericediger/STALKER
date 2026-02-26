# S13 Assessment + S14 Recommendations

**Date:** 2026-02-25
**Author:** Systems Architect

---

## S13 Assessment: What Went Right, What Needs Attention

### What Went Right

1. **Provider interface abstraction paid off again.** Auto-create instruments, Tiingo backfill, FMP search — all worked through the existing `MarketDataProvider` interface. No core rewrites needed.

2. **Event-sourced architecture held.** Even after triple-importing 255 transactions, the system was recoverable: delete duplicates from the source-of-truth table, rebuild caches. This is exactly the scenario event-sourcing is designed for.

3. **Real-time hotfix capability.** 12+ UX issues found and resolved in a single session. The SPM/monorepo structure makes targeted fixes fast.

4. **Test suite remained green.** 526 → 598 tests, 0 regressions. The CI gates are doing their job.

### What Needs Attention

#### 1. Scale Mismatch (Critical)

The spec assumed 15–20 instruments. The real portfolio has **83**. This 4–5x difference exposed:

| Assumption | Reality | Impact |
|-----------|---------|--------|
| Snapshot rebuild: ~15 instruments | 83 instruments | Minutes instead of sub-second. Timeout raised to 600s. |
| FMP budget: 195/250 calls/day | 1,079/250 calls/day | Budget exceeded by 4x. Scheduler will exhaust by late morning. |
| SQLite single-writer: low contention | 70+ concurrent backfills | Socket timeouts, write starvation |

**Recommendation:** Treat 100 instruments as the design target going forward. The current user has 83; growth to 100 is plausible. All performance and budget calculations should use 100 as the baseline.

#### 2. Idempotency Gap (Critical)

No dedup guard on bulk import. This is a data integrity violation — the most important invariant for a portfolio tracker ("the numbers must be right"). The user imported 3x and got 3x the transactions. This was caught and cleaned manually, but it should never have been possible.

**Root cause:** The bulk import feature was built in S10 with the assumption that the user would only import once. That's a developer assumption, not a user assumption. Users re-import when they're not sure if it worked, when they add new rows to their spreadsheet, or when they want to update.

**Lesson:** Any data ingestion endpoint that accepts batches must be idempotent by default. This is not a "nice to have" — it's a correctness requirement.

#### 3. SQLite Under Concurrent Load

SQLite's single-writer lock is fine for the read-heavy workload STALKER was designed for. But bulk operations that trigger many fire-and-forget writes (backfills) overwhelm it. The S13 fix (sequential backfills) is correct but reveals that any future feature involving concurrent writes needs careful sequencing.

**Recommendation:** Add a write queue abstraction if more bulk operations are planned. For now, the sequential-backfill pattern is sufficient.

#### 4. Instrument Metadata Quality

FMP search doesn't return results for all tickers (especially small-cap, international, or delisted). Auto-created instruments with symbol-as-name degrade the UX and make the advisor less useful (it can't distinguish "CXDO" from "AAPL" by name).

**Recommendation:** Tiingo's metadata endpoint (`/tiingo/daily/{symbol}`) returns names for most US equities and should be used as a fallback. This is a quick win.

---

## Master Plan Updates Required

After S14 completes, the Master Plan (v4.0) needs these updates for v5.0:

### Session Status Tracker

| Session | Status | Tests | Notes |
|---------|--------|-------|-------|
| 13 | ✅ Complete | 598 (+72) | UAT Phase 1: import flow, hotfixes, auto-create, backfill. Partial UAT. |
| **14** | **🟡 Next** | **Target: 620+** | **Data integrity + performance + UAT completion** |

### New Architecture Decisions

| # | Session | Decision | Rationale |
|---|---------|----------|-----------|
| AD-S13a | S13 | Auto-create instruments on transaction add (single + bulk) | Users should not need to separately add each instrument before importing trades. |
| AD-S13b | S13 | Sequential backfills, not concurrent fire-and-forget | SQLite single-writer lock causes timeouts under concurrent writes. |
| AD-S13c | S13 | TradingView container always in DOM, hidden via CSS | `createChart()` requires a real DOM element. Conditional rendering breaks the lifecycle. |
| AD-S14-1 | S14 | Bulk import dedup by exact match on (instrumentId, type, quantity, price, tradeAt) | Prevents duplicate imports. Conservative matching avoids false positives. |
| AD-S14-2 | S14 | Batch price lookups in snapshot rebuild | Reduces ~20K queries to ~1 per instrument. Enables 80+ instrument scale. |
| AD-S14-3 | S14 | Scheduler auto-adjusts polling interval when budget exceeded | 83 instruments × standard interval exceeds FMP free tier. |

### New/Updated Risks

| # | Risk | Status | Notes |
|---|------|--------|-------|
| R-6 | Snapshot rebuild performance at scale | **Updated** | Was "Low likelihood, Low impact." Now confirmed: 83 instruments = minutes. Mitigation: batch lookups (S14). |
| R-II-13 | Single-provider dependency | **Updated** | With 83 instruments, FMP budget is exhausted. Need paid tier or polling optimization. |
| R-14-1 | Advisor context overflow with 83 instruments | New | `getPortfolioSnapshot` returns all 83 holdings. May exceed useful context. |

### New Lessons

| # | Lesson | Evidence |
|---|--------|---------|
| L-11 | **Design for 5x the stated user volume.** Spec said 15–20 instruments; reality is 83. Every performance assumption was wrong. | S13: snapshot timeout, SQLite contention, API budget exhaustion. |
| L-12 | **Bulk ingestion must be idempotent from day one.** Users re-import. | S13: triple-import creating 255 transactions. |
| L-13 | **Conditional DOM rendering breaks imperative library lifecycles.** | S13: TradingView chart never created because container was unmounted during loading. |

---

## Post-S14 Outlook

If S14 succeeds (dedup, performance, full UAT pass), the system is ready for daily production use. The remaining path:

```
S14 (this session) — Data integrity + performance + UAT completion
    └──→ Production use with real portfolio
         └──→ Future sessions (as needed):
              - Paid market data provider for 83-instrument budget
              - Holiday calendar
              - Overlay chart
              - Advisor web search + hypotheticals
```

The original plan had S13 as the final session before production use. S13 was partial, so S14 completes it. No further sessions should be needed before the user can rely on the system for daily portfolio tracking — assuming all acceptance criteria pass.
