# SESSION-17-REPORT.md — Production Hardening + Transaction UX Closure

**Date:** 2026-02-26
**Duration:** ~1 hour
**Team Shape:** Solo

---

## Summary

Session 17 closed the transaction CRUD UX gap created by Session 16's navigation consolidation, tuned the advisor for 83-instrument scale with a new `getTopHoldings` tool, and added NYSE holiday awareness to the market calendar. All three planned features plus the stretch goal shipped. **STALKER is now production-ready.**

---

## What Changed

### Phase 0: Transaction CRUD on Holding Detail (P0)

**Problem:** Session 16 deleted the Transactions page but did not relocate Add Transaction to Holding Detail. Users had no UI path to record a single trade.

**Solution:** Reused existing `TransactionForm`, `TransactionFormModal`, `DeleteConfirmation`, and `SellValidationError` components — all survived the S16 page deletion.

| File | Change |
|------|--------|
| `apps/web/src/components/transactions/TransactionForm.tsx` | Added `defaultInstrumentId?: string` prop. Pre-selects instrument and disables Select when set. |
| `apps/web/src/components/transactions/TransactionFormModal.tsx` | Added `defaultInstrumentId` pass-through prop. |
| `apps/web/src/components/holding-detail/HoldingTransactions.tsx` | Added `onAdd?: () => void` prop. Renders "+ Add Transaction" button in section header (visible even in empty state). |
| `apps/web/src/components/ui/Select.tsx` | Added `disabled?: boolean` prop with opacity/cursor styling. |
| `apps/web/src/app/(pages)/holdings/[symbol]/page.tsx` | Added `showAddTx` state. Wired "+ Add Transaction" → TransactionFormModal in create mode with `defaultInstrumentId={data.instrumentId}`. |

**Edit and delete were already wired** on Holding Detail (since S7). No changes needed for those flows.

### Phase 2: Advisor 83-Instrument Tuning

**Problem:** `getPortfolioSnapshot` returns all 83 holdings, consuming excessive context window for overview questions.

| File | Change |
|------|--------|
| `packages/advisor/src/tools/get-top-holdings.ts` | **NEW** — Tool definition + executor factory. Returns top N holdings by allocation/value/pnl. Count clamped 1-20, default 10. |
| `packages/advisor/src/tools/index.ts` | Added exports + `getTopHoldingsDefinition` to `allToolDefinitions` (4 → 5 tools). |
| `packages/advisor/src/index.ts` | Added barrel exports for new tool. |
| `packages/advisor/src/system-prompt.ts` | Updated tool list from 4 to 5. Added tool selection guidance section. |
| `apps/web/src/app/api/advisor/chat/route.ts` | Added `getTopHoldings` executor (Prisma-backed, sorts by allocation/value/pnl, includes portfolio summary). Enhanced `getPortfolioSnapshot` with summary header (total holdings, value, top 5, stale count). |

### Phase 4: NYSE Holiday Calendar (Stretch)

**Problem:** KL-1 — Polling on market holidays wastes API calls.

| File | Change |
|------|--------|
| `packages/market-data/src/calendar/nyse-holidays.ts` | **NEW** — Static `NYSE_HOLIDAYS` Set with 20 holidays (2025-2026). `isNYSEHoliday()` lookup. |
| `packages/market-data/src/calendar/market-calendar.ts` | `isTradingDay()` now checks `isNYSEHoliday()` for NYSE/NASDAQ/AMEX exchanges. Non-US exchanges unaffected. |
| `packages/market-data/src/calendar/index.ts` | Added `isNYSEHoliday`, `NYSE_HOLIDAYS` exports. |

### Test Fixes

| File | Change |
|------|--------|
| `packages/advisor/__tests__/exports.test.ts` | Updated: expects 5 tools (was 4). |
| `apps/web/__tests__/api/advisor/chat.test.ts` | Added `createGetTopHoldingsExecutor` to mock. |

### Documentation Updates

| File | Change |
|------|--------|
| `HANDOFF.md` | Updated to production-ready state. S17 changes, metrics, ADs. |
| `CLAUDE.md` | Updated advisor tool count (4→5), Select `disabled` prop, calendar decision. |
| `AGENTS.md` | Updated test count, tool count, calendar description. |
| `KNOWN-LIMITATIONS.md` | Closed KL-1 (holiday calendar resolved). |

---

## S16 Scope Cut Resolution

**No scope cuts in S16.** All items shipped:
- Tab consolidation (5→3): Shipped
- Paginated portfolio table: Shipped
- Bulk paste relocation: Shipped
- Chart transaction markers: Shipped
- Delete instrument UI: Shipped
- Sortable headers + firstBuyDate: Shipped

Phase 1 (S16 completion) was skipped entirely.

---

## Test Summary

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Test count | 659 | 677 | +18 |
| Test files | 57 | 59 | +2 |
| TypeScript errors | 0 | 0 | — |

### New Test Files

| File | Tests | Scope |
|------|-------|-------|
| `packages/advisor/__tests__/get-top-holdings.test.ts` | 5 | Executor: default count/sortBy, custom params, count cap, min clamp, result passthrough |
| `packages/market-data/__tests__/nyse-holidays.test.ts` | 13 | Holiday lookup, 2025/2026 coverage, isTradingDay integration, isMarketOpen on holidays, getNextTradingDay skips holidays, non-US exchange exemption |

---

## Architecture Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| AD-S17-1 | Transaction CRUD on Holding Detail page | Transactions page deleted in S16. Holding Detail already shows per-instrument transactions — natural home for CRUD. |
| AD-S17-2 | `getTopHoldings` advisor tool | 83 instruments in a single tool response is wasteful. Top-N query reduces token usage and improves response quality. |
| AD-S17-3 | Portfolio summary in advisor snapshot | High-level facts (total holdings, value, top 5, stale count) without requiring LLM to parse all 83 rows. |
| AD-S17-4 | Static NYSE holiday list (2025-2026) | Simplest correct implementation. Annual manual update is acceptable for single-user app. |
| AD-S17-5 | Reuse existing transaction components | All S7 components survived S16 deletion. Added `defaultInstrumentId` prop for holding-scoped usage — minimal change. |

---

## Exit Criteria Verification

| # | Criterion | Status |
|---|-----------|--------|
| EC-1 | User can add a transaction from Holding Detail | PASS — "+ Add Transaction" button → modal with locked instrument |
| EC-2 | User can edit a transaction from Holding Detail | PASS — Already existed (pencil icon → edit modal) |
| EC-3 | User can delete a transaction from Holding Detail | PASS — Already existed (trash icon → confirmation modal) |
| EC-4 | Portfolio table provides path to transaction management | PASS — Row click → Holding Detail → full transaction CRUD |
| EC-5 | Advisor handles "what are my top holdings?" efficiently | PASS — `getTopHoldings` tool returns top N by metric |
| EC-6 | All S16 scope cuts completed or documented | PASS — No S16 scope cuts occurred |
| EC-7 | Visual UAT findings addressed | N/A — No visual UAT walkthrough conducted this session |
| EC-8 | All quality gates pass | PASS — 0 tsc errors, 677 tests pass |

---

## Production Readiness Assessment

STALKER is **production-ready** for daily use:

- **Functionally complete:** All CRUD flows accessible from the UI. No orphaned capabilities.
- **Operationally stable:** Quote pipeline running at 83-instrument scale with batch polling.
- **Advisor tuned:** 5 tools with efficient top-N queries for large portfolios.
- **Calendar aware:** NYSE holidays prevent wasted API calls.
- **Test-covered:** 677 tests, 0 TypeScript errors, CI green.

### Remaining Known Limitations (Non-Blocking)

| ID | Limitation | Acceptable? |
|----|-----------|-------------|
| KL-2 | Advisor context window not managed | Yes — user can start new thread |
| KL-3 | No summary generation for long threads | Yes — manual thread clearing adequate |
| KL-4 | Bulk paste date conversion uses noon UTC | Yes — matches single-transaction pattern |
| KL-5 | Single provider for historical bars | Yes — Tiingo is stable, existing bars cached |
| KL-6 | Rate limiter is in-process only | Yes — single user, negligible impact |

None are production blockers.
