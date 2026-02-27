# SESSION-18-KICKOFF.md — Visual UAT Fixes + UX Enhancements

## Read First (in order)
1. `CLAUDE.md`
2. `AGENTS.md`
3. `HANDOFF.md`
4. `KNOWN-LIMITATIONS.md`
5. `SESSION-18-PLAN.md` — **Full implementation spec. Follow it phase by phase.**

## Session Summary

The business stakeholder performed the first visual browser UAT and reported 6 issues. This session fixes them in priority order. **Solo session — no teammates.**

## Findings (Priority Order)

| Priority | Issue | Fix |
|----------|-------|-----|
| **P0** | Portfolio chart flatlines before Feb 2024; candlestick charts start at Feb 2024 despite Dec 2022 purchases | Backfill lookback is ~2 years — extend to 10 years. Write re-backfill script for existing instruments. Rebuild snapshots. |
| **P1** | "Failed to load holding: HTTP 500" after editing a transaction (edit itself succeeds) | Race condition — snapshot rebuild is fire-and-forget, client refetch hits mid-rebuild state. Make rebuild synchronous before response. |
| **P2** | Need "Purchase Price" column, rename "Price" → "Current Price", move Cost Basis next to purchase price | Add `avgCostPerShare()` (Decimal division), new column, rename, reorder. |
| **P3** | Holdings list resets to top when deleting an instrument | Optimistic removal + preserve scroll/page position across refetch. |
| **P4** | No "Add Another" when adding instruments | Add "Add Another" button to modal success state that resets to search. |

## Phase Execution Order

1. **Phase 1: Backfill date range** — Diagnose with SQLite query, fix lookback to 10yr, write re-backfill script (batch 45/hr for Tiingo limits), run it, rebuild snapshots, verify charts.
2. **Phase 2: HTTP 500 fix** — Reproduce, capture stack trace, make snapshot rebuild synchronous in PUT handler, verify refetch returns clean data.
3. **Phase 3: Column improvements** — Add Avg Cost column, rename Price → Current Price, reorder columns. Decimal division with zero-guard.
4. **Phase 4: List position on delete** — Save scroll/page, optimistic removal, restore after refetch.
5. **Phase 5: Add Another** — Reset modal to search state without closing.
6. **Phase 6: Docs** — Update HANDOFF.md, KNOWN-LIMITATIONS.md, CLAUDE.md, AGENTS.md.

## Key Rules

- **Decimal.js for avgCostPerShare division.** No `Number()` for financial math.
- **Re-backfill script respects Tiingo rate limits:** batch 45, pause 60s between batches.
- **Back up database before re-backfill:** `cp apps/web/data/portfolio.db apps/web/data/portfolio.db.pre-s18`
- **Run quality gates after each phase:** `pnpm tsc --noEmit && pnpm test`

## Scope Cut Order (if time pressure)

Cut from bottom: Phase 5 → Phase 4 → Phase 3 → Phase 6. **Never cut Phases 1 or 2.**

## Quality Gates

```bash
pnpm tsc --noEmit    # 0 errors
pnpm test            # 692+ tests (677 + ~15 new)
```

## Delegation Mode

Solo. No teammates. Execute phases sequentially. Commit after each phase lands clean.
