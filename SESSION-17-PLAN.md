# SESSION-17-PLAN.md — Production Hardening + Transaction UX Gap + Visual UAT Closure

**Version:** 1.0
**Date:** 2026-02-26
**Author:** Systems Architect
**Input:** SESSION-16-KICKOFF.md, HANDOFF.md (Post-S15), CLAUDE.md, AGENTS.md, SPEC v4.0, UX/UI Plan, KNOWN-LIMITATIONS.md
**Assumes:** Session 16 completed successfully (all items or with known scope cuts)

---

## 1. Session Thesis

Session 16 consolidated the navigation from 5 tabs to 3 and transformed the dashboard into the unified Portfolio page. But it created a critical UX gap: **there is no longer a dedicated surface for adding or editing transactions.** The standalone Transactions page was deleted, and the S16 plan did not add transaction CRUD to the Holding Detail page or the Portfolio page. This means the only way to add transactions post-S16 is bulk paste — there's no single-transaction "Add" flow accessible from the UI.

Session 17 closes this gap, completes any S16 scope cuts, tunes the advisor for 83-instrument scale, and reserves capacity for visual UAT findings. This is the final engineering session before the system enters sustained production use.

**Session 17 = last coding session. After this, STALKER is production-ready.**

---

## 2. Priority Order

```
P0: Transaction CRUD on Holding Detail (unblocks daily use — the only way to record a trade)
P1: S16 scope cut completion (if any items were cut — see §4)
P2: Add Transaction entry point from Portfolio page (new instrument flow)
P3: Advisor 83-instrument tuning
P4: Visual UAT punch list fixes (reserve 30 min)
P5: Holiday calendar (stretch — only if time remains)
```

### Explicit Non-Goals

- Responsive tablet/mobile (user is on desktop, confirmed)
- Overlay/compare chart (documented post-MVP deferral)
- Advisor context window management (KL-2/KL-3 — acceptable workaround exists)
- CSV export (not requested)
- Multi-currency (out of scope)

---

## 3. Prerequisite: S16 Outcome Assessment

Before S17 execution begins, the Lead must read `SESSION-16-REPORT.md` and assess:

| Check | If Yes | If No |
|-------|--------|-------|
| Tab consolidation complete (3 tabs)? | Proceed normally | **STOP. Fix in S17 Phase 0.** |
| Paginated portfolio table with sort/filter? | Proceed normally | Add to S17 Phase 1 scope |
| Chart transaction markers shipped? | Proceed normally | Deprioritize — not blocking production |
| Delete instrument UI shipped? | Proceed normally | Add to S17 Phase 2 scope |
| Bulk paste relocated to Portfolio page? | Proceed normally | Add to S17 Phase 1 scope |
| `firstBuyDate` column working? | Proceed normally | Add to S17 Phase 1 scope |
| Sortable headers working? | Proceed normally | Add to S17 Phase 1 scope |

**If tab consolidation failed, S17 becomes a S16 completion session.** Everything else in this plan shifts to S18.

---

## 4. Scope: S16 Scope Cut Completion (Conditional)

Per the S16 kickoff's scope cut order, the most likely cuts (in cut order) were:

1. Bulk paste relocation → If cut, add to S17 Phase 1
2. Chart markers → If cut, **skip entirely** — not blocking production
3. Delete instrument → If cut, add to S17 Phase 2
4. Sortable headers + purchase date → If cut, add to S17 Phase 1

The Lead determines which (if any) were cut by reading the S16 report, then adjusts the S17 phase plan accordingly.

---

## 5. Phase 0 — Transaction CRUD on Holding Detail (45 min)

**This is the session's most critical deliverable.** Without this, the user cannot record a new trade through the UI.

### 5.1 Context

Pre-S16, transactions were managed on `/transactions` which had:
- Full transaction table (all instruments, sortable/filterable)
- Add Transaction form (symbol autocomplete, type toggle, qty, price, date, fees, notes)
- Edit transaction (inline or modal, pre-populated form)
- Delete transaction (trash icon → confirmation modal)
- Bulk paste (collapsible section)

S16 deleted `/transactions` and moved bulk paste to the Portfolio page. But **individual transaction Add/Edit/Delete was not relocated.**

The Holding Detail page (`/holdings/[symbol]`) already shows per-instrument transactions in a list. It's the natural home for transaction CRUD for existing holdings.

### 5.2 Implementation

#### 5.2.1 Add Transaction Button on Holding Detail

**File:** `apps/web/src/app/(pages)/holdings/[symbol]/page.tsx`

1. Add "+ Add Transaction" button in the transactions section header, next to the section title.
2. Button opens an inline form or modal (match existing UI patterns — check if a transaction form component already exists from the deleted Transactions page).
3. Form fields: Type (BUY/SELL toggle), Quantity, Price, Date (default today), Fees (optional), Notes (optional).
4. **Symbol is pre-filled and locked** — we're already on the instrument's detail page.
5. On submit: `POST /api/transactions` with the instrument's ID → refresh the page data → show success toast.
6. If sell validation fails, show the specific error inline (date, deficit quantity) per CLAUDE.md Rule 7.

#### 5.2.2 Edit Transaction on Holding Detail

1. Add pencil icon on each transaction row (hover-visible, consistent with existing delete icon pattern).
2. Click opens the same form, pre-populated with transaction data.
3. On submit: `PUT /api/transactions/[id]` → refresh → toast.

#### 5.2.3 Delete Transaction on Holding Detail

1. Verify trash icon + confirmation modal already exists on Holding Detail transaction rows.
2. If not present (check S16 state), add: trash icon → confirmation modal → `DELETE /api/transactions/[id]` → refresh → toast.

#### 5.2.4 Reuse Existing Components

Before building anything new, check if these components survive from the deleted Transactions page:
- `TransactionForm.tsx` or similar — may exist in `components/transactions/`
- Form validation logic (sell invariant error display)
- If the components exist but were orphaned when the page was deleted, reuse them. If they were deleted along with the page, rebuild.

**Important:** The transaction form must reuse the existing `POST /api/transactions`, `PUT /api/transactions/[id]`, and `DELETE /api/transactions/[id]` API routes. No API changes needed — these endpoints are already complete.

### 5.3 Tests (4-5)

1. Add Transaction form renders on Holding Detail page
2. Submit creates transaction via POST and refreshes data
3. Edit pre-populates form with existing transaction data
4. Sell validation error displays inline when invariant violated
5. Delete transaction shows confirmation and removes on confirm

---

## 6. Phase 1 — Add Transaction Entry Point from Portfolio Page (20 min)

### 6.1 Context

The Holding Detail transaction form (Phase 0) covers existing instruments. But for **new instruments** (instruments the user just added), the flow is:

1. User adds instrument via search on Portfolio page
2. Instrument appears in table with 0 shares
3. User needs to navigate to Holding Detail to add their first transaction

This is acceptable, but we can improve it with a small UX addition.

### 6.2 Implementation

1. **"Add Transaction" action in Portfolio table:** Add a small "+" icon or "Add Txn" action on each row (alongside the existing delete trash icon). Click navigates to `/holdings/[symbol]` with a query parameter `?addTransaction=true`.
2. **Holding Detail reads the query param:** If `addTransaction=true` is present, auto-open the Add Transaction form on page load. Scroll to it if needed.
3. **Alternative (simpler):** If the above feels over-engineered, just add a tooltip on the Portfolio table that says "Click row to view details and add transactions." The row click already navigates to Holding Detail.

**Recommendation:** Go with the simpler alternative unless there's time. The row click → Holding Detail → Add Transaction flow is intuitive enough.

### 6.3 Tests (1-2)

1. Portfolio table row click navigates to Holding Detail
2. (If implemented) `?addTransaction=true` param auto-opens form

---

## 7. Phase 2 — Advisor 83-Instrument Tuning (25 min)

### 7.1 Problem

The advisor's `getPortfolioSnapshot` tool returns all instruments in the portfolio. At 83 instruments, this produces a large tool response that may consume significant context window space, leaving less room for the conversation and the LLM's reasoning.

### 7.2 Implementation

#### 7.2.1 Add `getTopHoldings` Tool

**File:** `packages/advisor/src/tools/tool-definitions.ts` (or equivalent)

New tool definition:
```typescript
{
  name: 'getTopHoldings',
  description: 'Get the top N holdings by allocation percentage. Use this when asked about largest positions, concentration, or for a portfolio overview without needing every instrument.',
  parameters: {
    type: 'object',
    properties: {
      count: { type: 'number', description: 'Number of holdings to return (default 10, max 20)' },
      sortBy: { type: 'string', enum: ['allocation', 'value', 'pnl', 'dayChange'], description: 'Sort criterion (default: allocation)' }
    }
  }
}
```

#### 7.2.2 Implement Tool Executor

**File:** `packages/advisor/src/tools/tool-executors.ts` (or equivalent)

The executor calls the existing `GET /api/portfolio/holdings` endpoint (which already supports sorting) and truncates to `count` results. Returns the same shape as `getPortfolioSnapshot` but smaller.

#### 7.2.3 Update System Prompt

Add guidance to the system prompt:
- Use `getTopHoldings` for overview questions, concentration analysis, and "what are my biggest positions" queries.
- Use `getPortfolioSnapshot` only when the user asks about the **full** portfolio or a specific instrument not in the top N.
- This keeps most advisor responses fast and within comfortable context window limits.

#### 7.2.4 Add Portfolio Summary to Snapshot

Enhance `getPortfolioSnapshot` response to include a summary block at the top:
```
Total holdings: 83
Total value: $XXX,XXX.XX
Top 5 by allocation: VTI (18.2%), QQQ (12.1%), ...
Stale quotes: 3 of 83
```

This lets the advisor reference high-level portfolio facts without processing all 83 rows.

### 7.3 Tests (4-5)

1. `getTopHoldings` returns correct count of holdings
2. `getTopHoldings` sorts by allocation (default)
3. `getTopHoldings` sorts by value when specified
4. `getTopHoldings` caps at max 20
5. `getPortfolioSnapshot` includes summary block

---

## 8. Phase 3 — Visual UAT Punch List (30 min reserved)

### 8.1 Context

Visual UAT has been deferred since S14. The human stakeholder should do a browser walkthrough before or during S17. This phase reserves engineering capacity to fix whatever that walkthrough surfaces.

### 8.2 Likely Issues (Based on Scale Mismatch Analysis)

Based on the 83-instrument scale and dark theme, these are the most probable visual issues:

1. **Table column overflow on narrow viewports** — Instrument names truncating or wrapping ungracefully
2. **Pagination controls alignment** — New in S16, may need visual polish
3. **Sort chevron visibility** — Small icons on dark backgrounds can be hard to see
4. **Chart markers overlapping** — If multiple BUY/SELL transactions are on adjacent days
5. **Confirmation modal z-index** — Delete modals may render behind other elements
6. **Toast positioning** — With the new Portfolio table at full height, toasts may overlap content
7. **Empty state after last instrument deleted** — The delete flow should show a proper empty state, not a broken page

### 8.3 Process

1. Human stakeholder opens the app in a browser and walks through all pages
2. Notes issues with screenshots or descriptions
3. Engineering team triages: fix now (< 5 min each) vs. document for later
4. Target: fix 4-6 visual issues in this phase

### 8.4 Tests

No new unit tests expected from visual fixes. These are CSS/layout adjustments.

---

## 9. Phase 4 — Holiday Calendar (Stretch — 20 min)

### 9.1 Context

KL-1 documents this limitation: polling on market holidays wastes API calls. The system already uses a weekday check (`MarketCalendar`), but doesn't know about NYSE holidays.

### 9.2 Implementation (If Time Permits)

1. **Add a static holiday list** to `packages/market-data/src/calendar/`:
   - NYSE observed holidays for 2025 and 2026
   - Simple array of `YYYY-MM-DD` strings
   - Update annually (manual, documented process)

2. **Wire into MarketCalendar.isMarketOpen():**
   - Current: returns true if weekday + within market hours
   - Updated: returns true if weekday + not holiday + within market hours

3. **Wire into scheduler:**
   - Scheduler calls `isMarketOpen()` before polling. If market is closed (holiday), skip the poll cycle.

4. **Half-day handling:** Not included. Half-days (day after Thanksgiving, Christmas Eve) still poll normally. The wasted API calls on ~3 half-days per year are negligible.

### 9.3 Tests (3)

1. `isMarketOpen` returns false on known holidays (e.g., 2026-01-01, 2026-07-04)
2. `isMarketOpen` returns true on regular weekdays
3. Holiday list covers all NYSE observed holidays for 2025-2026

---

## 10. Architecture Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| AD-S17-1 | Transaction CRUD moves to Holding Detail page | Transactions page deleted in S16. Holding Detail already shows per-instrument transactions. Natural home for Add/Edit/Delete. |
| AD-S17-2 | `getTopHoldings` advisor tool | 83 instruments in a single tool response consumes excessive context window. Targeted queries reduce token usage and improve response quality. |
| AD-S17-3 | Portfolio summary block in advisor snapshot | Gives the advisor high-level portfolio facts without requiring it to process all 83 rows. Reduces hallucination risk for aggregate questions. |
| AD-S17-4 | Static holiday list (if implemented) | Simplest correct implementation. ~10 holidays/year. Annual manual update is acceptable for a single-user local app. |
| AD-S17-5 | Reuse existing transaction form components | Don't rebuild what was built in S7. If the components were orphaned (not deleted) when the Transactions page was removed, salvage them. |

---

## 11. Risk Assessment

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| R-S17-1 | S16 scope cuts require more S17 time than planned | Medium | §4 conditional scope plan. Chart markers are explicitly skippable. |
| R-S17-2 | Transaction form components were deleted with Transactions page | Medium | Check git history. Worst case: rebuild from S7 patterns (~20 min). |
| R-S17-3 | Visual UAT surfaces more than 6 issues | Low | Triage ruthlessly. Fix layout/overflow. Defer cosmetic polish. |
| R-S17-4 | Advisor tool addition breaks existing tool loop | Low | Tool definitions are additive. Existing tests cover the tool loop. New tests cover the new tool. |

---

## 12. Test Budget

| Phase | New Tests | Scope |
|-------|-----------|-------|
| Phase 0 (Transaction CRUD) | 4-5 | Form render, submit, edit, validation, delete |
| Phase 1 (Portfolio entry point) | 1-2 | Navigation, param handling |
| Phase 2 (Advisor tuning) | 4-5 | New tool executor, sorting, summary |
| Phase 3 (Visual UAT) | 0 | CSS/layout only |
| Phase 4 (Holiday calendar) | 3 | Calendar logic |
| **Total** | **12-15** (+ any S16 completion) | |

**Post-S17 target:** 663-674 tests (assuming S16 delivered ~651-659)

---

## 13. Quality Gates

```bash
# After each phase:
pnpm tsc --noEmit          # 0 errors
pnpm test                   # All existing + new tests pass

# Before session sign-off:
pnpm tsc --noEmit && pnpm test
# Expected: ~670+ total tests
```

---

## 14. Exit Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| EC-1 | User can add a transaction from Holding Detail page | Manual: navigate to a holding, click Add Transaction, fill form, submit, verify transaction appears |
| EC-2 | User can edit a transaction from Holding Detail page | Manual: click edit on existing transaction, modify, submit, verify changes |
| EC-3 | User can delete a transaction from Holding Detail page | Manual: click delete, confirm, verify removal + PnL recalculation |
| EC-4 | Portfolio table provides path to transaction management | Click row → Holding Detail → transaction CRUD is accessible |
| EC-5 | Advisor handles "what are my top holdings?" efficiently | Advisor uses `getTopHoldings` tool, response is fast, no context overflow |
| EC-6 | All S16 scope cuts are either completed or documented as post-production | S16 report reviewed, gaps closed or explicitly deferred |
| EC-7 | Visual UAT findings addressed (if walkthrough occurred) | Punch list items triaged, blocking issues fixed |
| EC-8 | All quality gates pass | `tsc --noEmit` = 0 errors, `pnpm test` = all pass |

---

## 15. Scope Cut Order (If Running Long)

```
1. Never cut:  Transaction CRUD on Holding Detail (P0 — production blocker)
2. Cut first:  Holiday calendar (stretch)
3. Cut early:  Visual UAT fixes (defer to async)
4. Cut middle: Advisor tuning (works today, just less optimal)
5. Cut late:   Portfolio page Add Transaction entry point
6. Never cut:  S16 scope cut completion (if any were cut)
```

---

## 16. Team Shape

**Solo session.** Rationale:

- Phase 0 (transaction CRUD) requires understanding the full data flow from UI → API → analytics → snapshot rebuild. A single engineer with full codebase context is more efficient than splitting this.
- Phase 2 (advisor) touches the tool loop, system prompt, and executor layer — cross-cutting concerns that don't parallelize well.
- Phase 3 (visual UAT) is inherently sequential (human reports issue → engineer fixes).
- Total estimated time: ~2.5 hours. Comfortable for a solo session.

---

## 17. Post-Session

```bash
git add -A
git commit -m "Session 17: Transaction CRUD on Holding Detail, advisor tuning, production hardening"
git push origin main
```

Write `SESSION-17-REPORT.md` covering:
- What changed (files, components, architecture decisions)
- Test summary (count, new test files)
- S16 scope cut resolution
- Visual UAT findings and fixes
- Manual verification checklist results
- Updated KNOWN-LIMITATIONS.md (close KL-1 if holiday calendar shipped)
- Production readiness assessment

Update `HANDOFF.md` to reflect production-ready state.

---

## 18. Post-S17 State (Expected)

After S17, STALKER should be:

- **Functionally complete:** All CRUD flows accessible from the UI. No orphaned capabilities.
- **Operationally stable:** Quote pipeline running at 83-instrument scale, advisor tuned for large portfolios.
- **Visually verified:** Major layout issues caught and fixed through browser UAT.
- **Test-covered:** ~670+ tests, zero TypeScript errors, CI green.

### Remaining Known Limitations (Post-S17)

| ID | Limitation | Acceptable? |
|----|-----------|-------------|
| KL-2 | Advisor context window not managed | Yes — user can start new thread. Edge case. |
| KL-3 | No summary generation for long threads | Yes — manual thread clearing is adequate. |
| KL-4 | Bulk paste date conversion uses noon UTC | Yes — matches single-transaction pattern. |
| KL-5 | Single provider for historical bars | Yes — Tiingo is stable. Existing bars cached. |
| KL-6 | Rate limiter is in-process only | Yes — single user, negligible real-world impact. |

None of these are production blockers. The system is ready for daily use.

---

## 19. Dependencies

| Dependency | Source | Status |
|-----------|--------|--------|
| Session 16 report | Engineering team | Required before S17 starts |
| Visual UAT walkthrough notes | Human stakeholder | Requested but not blocking — Phase 3 can be skipped |
| Existing transaction form components | Codebase (may be orphaned from S16) | Check before building |
