# SESSION-9-PLAN.md — Full-Stack Validation + Polish + MVP Signoff

**Session:** 9 of 9
**Epics:** 8 (cross-validation completion) + 9 (polish)
**Mode:** Lead Phase 0 (blocking), then parallel teammates
**Estimated Complexity:** Medium
**Depends on:** Sessions 1–8 (all complete)
**Blocks:** MVP signoff — this is the final session

---

## 1. Session Objective

Close the MVP. This session has one job: verify that every number is correct, every page works end-to-end, and the advisor produces useful responses against real data. Everything else is polish that increases quality but does not gate shipment.

**Ordering principle:** Validate first, fix what's broken, polish what's correct, document what remains. Nothing is polished until it's verified correct.

---

## 2. Entry Conditions

All of the following must be true before this session begins:

- [x] Sessions 1–8 complete (469 tests, 39 files, `pnpm build` clean, `tsc --noEmit` clean)
- [x] Reference portfolio fixtures exist (`data/test/reference-portfolio.json`, `data/test/expected-outputs.json`)
- [x] Fixture-based unit tests pass in `packages/analytics/`
- [x] All 4 advisor tools implemented and tested (getPortfolioSnapshot, getHolding, getTransactions, getQuotes)
- [x] Advisor chat panel, thread management, suggested prompts, and setup state all built
- [x] Enriched seed data available (28 instruments, 30 transactions, 8300+ price bars, 3 stale quotes — AD-S6d)
- [ ] `ANTHROPIC_API_KEY` added to `.env.local` ← **Must be confirmed at session start**

---

## 3. Phase Structure

This session uses a **Lead-first gate** followed by parallel teammates. Phase 0 is blocking — its results determine whether Phase 1–2 can proceed or whether the session must pivot to fix correctness issues.

```
Phase 0: Lead — Live LLM Verification + Smoke Test (BLOCKING GATE)
    │
    ├── If advisor responses acceptable → proceed to Phase 1–2
    │
    └── If advisor responses poor → Lead iterates system prompt before releasing teammates
         (teammates start on Phase 2 items that don't depend on advisor)

Phase 1: Teammate 1 (validation-engineer) — PnL Cross-Validation + Regression
Phase 2: Teammate 2 (polish-engineer) — Accessibility + Bulk Paste + Documentation

Phase 3: Lead — Integration, MVP Signoff Checklist
```

---

## 4. Phase 0: Live LLM Verification + Full-Stack Smoke Test (Lead — BLOCKING)

This is the highest-risk item in Session 9. The system prompt was verified structurally in Session 8, but has never been tested against a real LLM with real portfolio data. If the advisor produces poor responses, the system prompt must be iterated before the advisor can pass MVP acceptance criterion 8.

### Task 0.1: Confirm Environment

1. Verify `ANTHROPIC_API_KEY` is present and valid in `.env.local`
2. Verify `LLM_MODEL` is set (default: `claude-sonnet-4-5-20250514`)
3. Run `pnpm dev` — confirm Next.js and scheduler both start
4. Confirm seed data loads: dashboard shows instruments, holdings, chart

### Task 0.2: Live Advisor Verification — 5 Intent Categories

Run each of the five intent categories from Spec §7.5 against the live advisor endpoint with the enriched seed data. Use both curl and the UI panel.

**Test method:** For each query, evaluate:
- Did the advisor call the correct tool(s)?
- Did the response synthesize data (not just echo raw tool output)?
- Is the response "non-trivial" per Spec §7.5 — does it surface an insight not directly visible on a single dashboard view?
- Did the advisor respect scope boundaries (no recommendations, no predictions)?
- If relevant data was stale, did the advisor disclose it?

| # | Intent Category | Test Query | Expected Tools | Pass Criteria |
|---|----------------|------------|----------------|---------------|
| 1 | Cross-holding synthesis | "Which positions are dragging my portfolio down over the last 90 days?" | `getPortfolioSnapshot` (window=3M), `getQuotes` | Names specific underperformers, quantifies drag in $ or %, compares to portfolio average |
| 2 | Tax-aware reasoning | "If I sold my oldest VTI lots, what would the realized gain be?" | `getHolding` (symbol=VTI) | Identifies specific lots by date and cost basis, computes gain using FIFO lot data, shows the math |
| 3 | Performance attribution | "How much of my portfolio gain this year came from my top holding versus everything else?" | `getPortfolioSnapshot`, `getHolding` | Attributes percentage of total gain to specific holdings, provides breakdown |
| 4 | Concentration awareness | "Am I overexposed to any single holding based on my current allocations?" | `getPortfolioSnapshot` | Identifies holdings above a reasonable threshold (e.g., >20%), quantifies exposure as % |
| 5 | Staleness / data quality | "Are any of my holdings showing stale prices?" | `getQuotes` | Checks `asOf` timestamps, discloses any prices older than 2 hours, names affected symbols |

**Record results in `data/test/advisor-live-verification.md`:**
- Query sent
- Tools called (from tool call indicators or API logs)
- Summary of response quality (1–2 sentences)
- Pass/Fail
- If Fail: specific deficiency and system prompt iteration needed

### Task 0.3: System Prompt Iteration (if needed)

If any intent category fails:
1. Identify the deficiency (wrong tool called, shallow response, scope violation, missing staleness check)
2. Edit `packages/advisor/src/system-prompt.ts` with targeted additions
3. Re-test only the failed category
4. Repeat until all 5 pass
5. Run `pnpm test` to confirm no regressions (system prompt export test in `exports.test.ts`)

**Time budget:** Up to 90 minutes for the full Phase 0 cycle. If all 5 pass on first attempt, Phase 0 completes in ~30 minutes.

### Task 0.4: Tool Loop Empty String Fix

From Session 8 review: the tool loop returns empty string (not fallback message) when max iterations are exhausted and the LLM response content is `""`. Fix:

**File:** `packages/advisor/src/tool-loop.ts`

**Change:** Replace `??` with `||` for the final response content, or add explicit empty-string coalescing:

```typescript
// Before (from S8):
const finalContent = lastResponse.content ?? '';

// After:
const finalContent = lastResponse.content || 'I wasn\'t able to complete the analysis. Please try rephrasing your question.';
```

**Update test:** `packages/advisor/__tests__/tool-loop.test.ts` — the "max iterations" test case should now assert the fallback message.

### Task 0.5: Full-Stack Smoke Test

Walk through the complete user journey once, manually:

```
1. pnpm dev → dashboard loads with seed data
2. Dashboard: verify hero metric, chart renders, holdings table populated, day change shows
3. Holdings: click a holding → holding detail page loads
4. Holding Detail: position summary, candlestick chart, lots table, transaction history all render
5. Transactions: table shows, add transaction form works, sell validation error displays correctly
6. Advisor: open panel → suggested prompts appear → click one → response arrives → tool call indicator shows → thread persists
7. Advisor: create new thread → send message → switch between threads
8. Advisor: close panel → reopen → thread state preserved
9. Empty states: if possible, test with fresh database (no seed data) — all pages show empty states
10. Data health footer: values match GET /api/market/status
```

**Record any issues found** in `data/test/smoke-test-results.md` with severity (blocking/non-blocking).

---

## 5. Phase 1: PnL Cross-Validation + Regression (Teammate 1 — `validation-engineer`)

**Starts after:** Phase 0 completes (or immediately if Lead determines advisor issues won't affect validation work).

**Goal:** Execute the MVP signoff gate defined in Spec §13.1 — load the reference portfolio through the full stack and verify every displayed value matches expected outputs to the cent.

### Task 1.1: API-Level Cross-Validation

Load the reference portfolio (`data/test/reference-portfolio.json`) through the API layer and compare results against `data/test/expected-outputs.json`.

**Script:** Create `data/test/cross-validate.ts` — a standalone TypeScript script that:

1. Resets the database (or uses a fresh SQLite file)
2. Creates instruments via `POST /api/instruments` (using mock/seeded price bars from the fixture)
3. Creates transactions via `POST /api/transactions` in the order specified by the fixture
4. Calls `GET /api/portfolio/snapshot` and compares against expected portfolio totals
5. Calls `GET /api/portfolio/holdings/[symbol]` for each instrument and compares:
   - Lot count, lot openedAt dates, lot remaining quantities, lot cost basis
   - Per-instrument realized PnL, unrealized PnL
6. Calls `GET /api/portfolio/timeseries` for checkpoint dates and compares portfolio value at each checkpoint
7. Outputs a pass/fail report with any discrepancies shown to the cent

**Assertion precision:** All comparisons use string equality on Decimal-formatted values (no float comparison). A discrepancy of even `$0.01` is a failure.

**Edge cases from the fixture that must pass:**
- Multiple buy lots at different prices → correct FIFO ordering
- Partial sell → correct lot consumption, correct realized PnL
- Full position close → all lots consumed, correct total realized PnL
- Backdated transaction → snapshot rebuild from affected date produces correct values
- Missing price bar date → carry-forward close price used, snapshot marked as estimated

### Task 1.2: Regression Test Sweep

Run the full test suite and verify:

```bash
pnpm test          # All 469+ tests pass
pnpm build         # Clean exit
pnpm tsc --noEmit  # Zero errors
```

If any tests fail, investigate and fix. New tests added in this session should not break existing tests.

### Task 1.3: Numeric Display Audit

Spot-check 10 values across dashboard, holdings, and holding detail pages against the API responses:

1. Portfolio total value (dashboard hero metric)
2. Day change amount and percentage
3. Three holdings' unrealized PnL values
4. Two holdings' allocation percentages
5. One lot's cost basis on holding detail
6. One lot's unrealized PnL on holding detail
7. Realized PnL on portfolio summary card

For each: compare the displayed string to the API response value. Verify:
- Correct `$XX,XXX.XX` formatting
- Correct `+`/`−` sign (using U+2212, not hyphen)
- Correct gain/loss color applied
- `tabular-nums` alignment in table columns (visual check)

**Record in:** `data/test/numeric-display-audit.md`

### Deliverables (Teammate 1)

| Deliverable | File |
|-------------|------|
| Cross-validation script | `data/test/cross-validate.ts` |
| Cross-validation results | `data/test/cross-validation-results.md` |
| Numeric display audit | `data/test/numeric-display-audit.md` |
| Any bugfixes | Tracked in commit message |

---

## 6. Phase 2: Accessibility + Bulk Paste + Documentation (Teammate 2 — `polish-engineer`)

**Starts after:** Phase 0 completes (or in parallel if items don't depend on advisor).

**Goal:** Close the accessibility gaps, build the bulk paste feature (Next priority), and document known limitations.

### Task 2.1: Focus Trap — Advisor Panel (BLOCKING for MVP criterion D10)

The advisor panel (`AdvisorPanel.tsx`) lacks a focus trap. Tab key can escape the panel while the backdrop is visible. This is a UX bug for a `role="dialog"` element.

**Implementation:**

Option A (preferred — no new dependency): Build a `useFocusTrap` hook:

```typescript
// apps/web/src/lib/hooks/useFocusTrap.ts
function useFocusTrap(containerRef: RefObject<HTMLElement>, isActive: boolean) {
  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;
    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(container.querySelectorAll(focusableSelector));
      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    container.addEventListener('keydown', handleKeyDown);
    // Focus first focusable element on open
    const firstFocusable = container.querySelector(focusableSelector) as HTMLElement;
    firstFocusable?.focus();

    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [isActive, containerRef]);
}
```

Option B (if time is short): `npm install focus-trap-react` and wrap the panel content.

**Wire into `AdvisorPanel.tsx`:**
- Add ref to the panel container
- Activate trap when `open` is true
- On close, return focus to the FAB button

**Test:** `apps/web/__tests__/components/advisor/focus-trap.test.ts` — verify Tab cycles within panel, Shift+Tab wraps backward, focus returns to FAB on close.

### Task 2.2: Keyboard Navigation Audit

Walk through every interactive element with keyboard only (no mouse):

| Page | Check | Expected |
|------|-------|----------|
| Dashboard | Tab through nav tabs, window selector pills, holdings table rows | All focusable, focus ring visible |
| Holdings | Tab through filter dropdowns, table rows, "Add Instrument" button | All focusable |
| Holding Detail | Tab through date range picker, lots table, transaction edit/delete buttons | All focusable |
| Transactions | Tab through filter bar, transaction form fields, submit button | Tab order matches visual order |
| Advisor Panel | Tab through header buttons, message input, send button, thread list | Focus trapped within panel |
| Modals (delete confirmation) | Tab through Cancel and Confirm buttons | Focus trapped, Escape closes |

**Fix any issues found.** Common fixes:
- Add `tabIndex={0}` to clickable elements that aren't buttons
- Add `role="button"` + `onKeyDown` handler for Enter/Space on custom clickable elements
- Ensure focus ring uses `ring-2 ring-[#60A5FA] ring-offset-2 ring-offset-[#0F1A24]` (per UX Plan §8.1)

### Task 2.3: ARIA Audit

Verify the following ARIA attributes are present and correct:

| Element | Required ARIA |
|---------|---------------|
| Advisor panel | `role="dialog"`, `aria-label="Portfolio Advisor"`, `aria-modal="true"` |
| Delete confirmation modal | `role="alertdialog"`, `aria-label`, `aria-describedby` pointing to consequence text |
| Toast notifications | `aria-live="polite"`, `role="status"` |
| Holdings table | Proper `<table>`, `<thead>`, `<th scope="col">`, `<tbody>` markup |
| Staleness icons | `aria-label` with timestamp (e.g., "Price stale — last updated 2 hours ago") |
| Chart containers | `aria-label` with trend description |
| Loading spinners | `aria-label="Loading"`, `role="status"` |
| Navigation tabs | `role="tablist"`, `role="tab"`, `aria-selected` |

### Task 2.4: Bulk Transaction Paste Input (Next Priority — Spec §9.3.1)

**Scope:** This is "Next priority" per the spec — post-core-MVP, pre-polish. Build if time allows after Tasks 2.1–2.3. If time is short, this is the first item cut.

**Backend:** `POST /api/transactions/bulk/route.ts`

```typescript
// Request body
interface BulkTransactionRequest {
  rows: Array<{
    symbol: string;
    type: 'BUY' | 'SELL';
    quantity: string;     // Decimal as string
    price: string;        // Decimal as string
    date: string;         // YYYY-MM-DD
    fees?: string;        // Decimal as string, optional
    notes?: string;       // optional
  }>;
}

// Response
interface BulkTransactionResponse {
  imported: number;
  errors: Array<{
    row: number;
    message: string;
  }>;
}
```

**Validation per row:**
- Symbol must match an existing instrument (or return error for that row)
- Type must be BUY or SELL
- Quantity and price must be valid positive decimals
- Date must be valid YYYY-MM-DD
- Sell validation invariant checked across the entire batch + existing transactions

**On success:** Single snapshot rebuild from the earliest `tradeAt` in the batch.

**Frontend:** `apps/web/src/components/transactions/BulkPasteInput.tsx`

- Collapsible section under "Bulk Import" disclosure heading
- Multi-line textarea with placeholder showing expected format
- "Parse" button → client-side parse into preview table
- Preview table: same styling as transaction table, error rows highlighted with `loss-bg`/`loss-fg`
- "Import N Transactions" confirmation button (disabled if zero valid rows)
- On success: toast + page refresh

**Parser logic** (client-side):
```typescript
function parseBulkInput(text: string): ParsedRow[] {
  return text.trim().split('\n').map((line, index) => {
    const fields = line.split('\t');
    // Expect: symbol, type, quantity, price, date [, fees [, notes]]
    if (fields.length < 5) return { row: index, error: 'Insufficient fields' };
    const [symbol, type, quantity, price, date, fees, notes] = fields.map(f => f.trim());
    // Validate each field, return { row, data } or { row, error }
  });
}
```

**Tests:**
- `apps/web/__tests__/api/transactions/bulk.test.ts` — API validation, batch insert, error handling
- `apps/web/__tests__/components/transactions/bulk-paste.test.ts` — parser logic

### Task 2.5: Documentation — Known Limitations

Create `KNOWN-LIMITATIONS.md` at project root documenting every known MVP gap:

| ID | Limitation | Impact | Mitigation | Spec Reference |
|----|-----------|--------|------------|----------------|
| W-3 | Snapshot rebuild runs outside Prisma transaction | Race: user could see stale snapshot during rebuild | Self-corrects on next page load; sub-second rebuild makes window tiny | S8 Report |
| W-4 | GET snapshot writes to DB on cold start | Side-effecting GET violates HTTP semantics | Acceptable for single-user local app; fix by moving rebuild to startup or first mutation | S8 Report |
| W-5 | Anthropic tool_result message translation | Tool results sent as user-role messages with content blocks | Works correctly with Anthropic API; would need adapter if switching to OpenAI | S8 Report |
| W-8 | Decimal → display formatting in tool executors | Tool outputs use `formatNum()` which truncates to 2 decimal places | Sufficient for dollar values; share quantities may lose sub-cent precision in advisor responses | S8 Report |
| — | No holiday/half-day market calendar | Polling on holidays wastes API calls | No incorrect data produced; staleness indicator covers | Spec §2.4, SD-5 |
| — | No focus trap on delete confirmation modals | Tab can escape modal (if not fixed in T2.1) | Escape and backdrop click work correctly | UX Plan §8.1 |
| — | No `prefers-reduced-motion` support | Animations play regardless of user preference | Non-blocking; decorative animations only | UX Plan §8.4 |
| — | Advisor context window not managed | Long threads may exceed token limit | Transparent error from LLM; user can start new thread | Spec §7.3, §11.3 |
| — | No summary generation for long threads | summaryText column exists but is never populated | Manual thread clearing is the workaround | Spec §7.3 |

### Task 2.6: Update HANDOFF.md

Update the project handoff document with:
- Session 9 completion status
- Final test count and progression
- Any architecture decisions made during Session 9
- Pointer to `KNOWN-LIMITATIONS.md`
- Post-MVP roadmap priorities (from Spec §13 "not in MVP" list)

### Deliverables (Teammate 2)

| Deliverable | File |
|-------------|------|
| Focus trap hook | `apps/web/src/lib/hooks/useFocusTrap.ts` |
| Focus trap integration | Modified `AdvisorPanel.tsx` |
| Focus trap test | `apps/web/__tests__/components/advisor/focus-trap.test.ts` |
| ARIA fixes | Various component files |
| Bulk paste API route | `apps/web/src/app/api/transactions/bulk/route.ts` |
| Bulk paste component | `apps/web/src/components/transactions/BulkPasteInput.tsx` |
| Bulk paste tests | `apps/web/__tests__/api/transactions/bulk.test.ts` |
| Known limitations | `KNOWN-LIMITATIONS.md` |
| Updated handoff | `HANDOFF.md` |

---

## 7. Phase 3: Integration + MVP Signoff (Lead)

**Starts after:** Phase 1 and Phase 2 complete.

### Task 3.1: Integration Pass

1. Pull all teammate work
2. Run full test suite: `pnpm test`
3. Run build: `pnpm build`
4. Run type check: `pnpm tsc --noEmit`
5. Fix any integration issues (merge conflicts, test failures, type errors)

### Task 3.2: MVP Acceptance Criteria Signoff

Walk through every criterion from Spec §13 and UX Plan §11.1 with a pass/fail determination:

| # | Spec §13 Criterion | Signoff |
|---|---------------------|---------|
| 1 | Add instruments by ticker search with backfill and timezone | ☐ Pass / ☐ Fail |
| 2 | Record BUY/SELL with backdating, sell validation with clear errors | ☐ Pass / ☐ Fail |
| 3 | Dashboard: total value, day change (MarketCalendar), window selector | ☐ Pass / ☐ Fail |
| 4 | Holdings table: price, qty, value, unrealized PnL, allocation %, staleness | ☐ Pass / ☐ Fail |
| 5 | Single instrument candlestick chart with date range | ☐ Pass / ☐ Fail |
| 6 | Realized vs unrealized PnL, portfolio and per-holding, correct precision | ☐ Pass / ☐ Fail |
| 7 | Lot detail: FIFO lots with cost basis and unrealized PnL | ☐ Pass / ☐ Fail |
| 8 | Advisor: 5 intent categories, read-only tools, cached data | ☐ Pass / ☐ Fail |
| 9 | Quote staleness: timestamps, warnings when stale/unavailable | ☐ Pass / ☐ Fail |
| 10 | Data health footer: instrument count, polling, budget, freshness | ☐ Pass / ☐ Fail |
| 11 | Meaningful empty states on every page with CTAs | ☐ Pass / ☐ Fail |

| # | UX Plan §11.1 Design Criterion | Signoff |
|---|-------------------------------|---------|
| D1 | Add instrument in under 30 seconds | ☐ Pass / ☐ Fail |
| D2 | Transaction with backdating, validation error | ☐ Pass / ☐ Fail |
| D3 | Dashboard comprehension: identify value, change, best/worst in 10s | ☐ Pass / ☐ Fail |
| D4 | Staleness visibility: identify stale instrument in 5s | ☐ Pass / ☐ Fail |
| D5 | Lot detail accuracy matches reference portfolio fixture | ☐ Pass / ☐ Fail |
| D6 | Advisor first interaction: suggested prompts → non-trivial response | ☐ Pass / ☐ Fail |
| D7 | Empty states render on every page with zero data | ☐ Pass / ☐ Fail |
| D8 | Data health footer values match API | ☐ Pass / ☐ Fail |
| D9 | Numeric formatting consistent, no float artifacts | ☐ Pass / ☐ Fail |
| D10 | Keyboard navigation: all elements focusable, modals trap, Escape works | ☐ Pass / ☐ Fail |

**PnL Signoff Gate (Spec §13.1):**
- ☐ Automated fixture tests pass (from `packages/analytics/`)
- ☐ Full-stack cross-validation results all pass (from Task 1.1)
- ☐ Numeric display audit shows no discrepancies (from Task 1.3)

### Task 3.3: Final Signoff Report

Create `SESSION-9-REPORT.md` with:
- All work completed
- Final test count and progression
- MVP acceptance criteria signoff table (filled in)
- PnL cross-validation results summary
- Advisor live verification results summary
- Known limitations reference
- Post-MVP priorities

### Task 3.4: Update Project Documents

- `CLAUDE.md` — any new architecture decisions
- `AGENTS.md` — final package inventory
- `HANDOFF.md` — final state
- `STALKER_MASTER-PLAN.md` — update Session 9 status, close risk register items

---

## 8. Scope Prioritization

If time pressure forces cuts, apply in this order (cut from the bottom):

```
MUST (MVP signoff gates — cannot ship without):
  1. Phase 0: Live LLM verification of 5 intent categories
  2. Phase 0: Full-stack smoke test
  3. Phase 0: Tool loop empty string fix
  4. Phase 1: PnL cross-validation (Spec §13.1 signoff gate)
  5. Phase 1: Regression test sweep
  6. Phase 3: MVP acceptance criteria signoff

SHOULD (significant quality improvement):
  7. Phase 2: Focus trap on advisor panel (D10 criterion)
  8. Phase 2: ARIA audit and fixes
  9. Phase 1: Numeric display audit
  10. Phase 2: Known limitations documentation
  11. Phase 2: HANDOFF.md update

COULD (Next priority — valuable but not MVP):
  12. Phase 2: Bulk transaction paste input
  13. Phase 2: Keyboard navigation audit (beyond focus trap)

WON'T (explicitly deferred):
  - CI pipeline setup (no infrastructure available in this session model)
  - Responsive refinements for tablet/mobile
  - prefers-reduced-motion support
  - Advisor context window management / summary generation
  - Performance profiling
```

---

## 9. Filesystem Scope (Non-Overlapping)

| Teammate | Owns (creates/modifies) | Reads Only |
|----------|------------------------|------------|
| Lead (Phase 0) | `packages/advisor/src/system-prompt.ts`, `packages/advisor/src/tool-loop.ts`, `packages/advisor/__tests__/`, `data/test/advisor-live-verification.md`, `data/test/smoke-test-results.md` | Everything else |
| Teammate 1 (`validation-engineer`) | `data/test/cross-validate.ts`, `data/test/cross-validation-results.md`, `data/test/numeric-display-audit.md` | `packages/analytics/`, `apps/web/src/app/api/` |
| Teammate 2 (`polish-engineer`) | `apps/web/src/lib/hooks/useFocusTrap.ts`, `apps/web/src/components/advisor/AdvisorPanel.tsx` (focus trap wire), `apps/web/src/app/api/transactions/bulk/`, `apps/web/src/components/transactions/BulkPasteInput.tsx`, `KNOWN-LIMITATIONS.md`, `HANDOFF.md` | UX Plan, Spec |
| Lead (Phase 3) | `SESSION-9-REPORT.md`, `CLAUDE.md`, `AGENTS.md`, `STALKER_MASTER-PLAN.md` | All teammate deliverables |

No filesystem overlap between teammates. Lead owns integration and project-level documents.

---

## 10. Exit Criteria

Session 9 is complete when:

1. ✅ All automated tests pass (`pnpm test`)
2. ✅ Build is clean (`pnpm build` exits 0)
3. ✅ TypeScript is clean (`tsc --noEmit` exits 0)
4. ✅ Live LLM verification: all 5 intent categories pass (documented)
5. ✅ Full-stack smoke test: complete user journey works end-to-end
6. ✅ PnL cross-validation: all fixture values match to the cent
7. ✅ MVP acceptance criteria: all 11 spec criteria and 10 UX criteria signed off
8. ✅ Focus trap implemented on advisor panel
9. ✅ Known limitations documented
10. ✅ Project documents updated (CLAUDE.md, AGENTS.md, HANDOFF.md, MASTER-PLAN.md)

**MVP is shipped when all 10 exit criteria are met.**

---

## 11. Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| System prompt produces poor advisor responses | Medium | High | Phase 0 is blocking. Budget 90 min for iteration. Prompt is modular — sections can be tuned independently. |
| PnL cross-validation reveals calculation bugs | Low | Critical | Analytics engine has 218+ passing tests from S3. If a bug is found, it's caught by the signoff gate — better now than post-ship. Fix in Phase 1, re-run all tests. |
| ANTHROPIC_API_KEY not available | Low | High | Advisor gracefully degrades to setup instructions. All non-advisor MVP criteria can still be signed off. Document as known limitation. |
| Bulk paste runs over time budget | Medium | Low | Explicitly listed as first scope cut. Not an MVP acceptance criterion. |
| Focus trap implementation causes unexpected side effects | Low | Medium | Test with keyboard-only navigation. Existing Escape + backdrop close still work as fallback. |
