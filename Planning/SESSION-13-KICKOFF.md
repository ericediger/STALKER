# SESSION-13-KICKOFF.md — User Acceptance Testing with Real Portfolio Data

**Paste this into Claude Code to start Session 13.**

---

## Context

You are the **Lead Engineer** for STALKER Session 13 — the final session. This is **User Acceptance Testing**, not a code session. Your role is to run the system, monitor for issues, diagnose problems, and apply hotfixes if needed. The business stakeholder will operate the browser.

## Document Reading Order

Read these documents in this exact order before starting:

1. `CLAUDE.md` — Architecture + coding rules
2. `AGENTS.md` — Package inventory, tech stack
3. `STALKER_PHASE-II_ADDENDUM.md` — **Critical**: Overrides stale provider info. Tiingo replaces Stooq, FMP uses `/stable/` API.
4. `HANDOFF.md` — Current state (post-Session 12)
5. `SESSION-13-PLAN.md` — This session's validation spec (the source of truth for what must pass)
6. `SESSION-12-REPORT.md` — Outstanding items that carry into this session

## Session Mode

**No parallel teammates.** This is a Lead + Business Stakeholder manual session. All work is sequential.

## What This Session Does NOT Do

- No new features
- No new tests (unless a hotfix requires one)
- No refactoring
- No package upgrades
- No architecture changes

If any of these are needed, they are logged as defects for a future session.

---

## Pre-Flight (Lead)

Run these checks before starting UAT. All must pass.

```bash
# PF-1: Clean install
pnpm install

# PF-2: Type check
pnpm tsc --noEmit
# Expected: 0 errors

# PF-3: Full test suite
pnpm test
# Expected: 598+ tests, 0 failures

# PF-4: Fresh database (CAUTION: deletes all data)
rm -f data/portfolio.db
pnpm db:push
```

### Verify Environment

```bash
# PF-5: Check all required env vars are set
cat .env.local | grep -E "FMP_API_KEY|TIINGO_API_KEY|ALPHA_VANTAGE_API_KEY|LLM_PROVIDER|ANTHROPIC_API_KEY|DATABASE_URL"
# All should show non-empty values
```

### Start Dev Server

```bash
# PF-6: Start Next.js only (NOT the scheduler yet)
pnpm dev
# Wait for "Ready" message
# Verify: http://localhost:3000 loads the dashboard with empty state
```

**Do NOT start the scheduler until Phase 4.** Phases 0–3 use manual refresh to conserve API budget and maintain control.

---

## Phase 0: S12 Carry-Forward — 15-Instrument Soak

**Time budget: 30 minutes**

The full 15-instrument soak was deferred from Session 12. Run it now.

### Instruments to Add

Load the list from `data/test/soak-instruments.json`. Add each instrument via the UI: click "Add Instrument" → search → select → verify backfill toast.

### Monitor

Watch the terminal for:
- Tiingo backfill requests and bar counts
- Any errors or rate limit messages
- `firstBarDate` being set per instrument

### Verify

After all 15 are added:
1. Data health footer shows "15 instruments"
2. Each instrument has a candlestick chart with historical data (spot-check at least 5)
3. BRK-B specifically — verify the dot-to-hyphen symbol mapping worked
4. Terminal shows no backfill errors

### Log API Usage

Record Tiingo calls consumed: _____ / 50 per hour, _____ / 1,000 per day

### Gate

**All 15 instruments must have price data before proceeding to Phase 1.** If any fail, diagnose from terminal logs. If it's a symbol mapping issue, log as defect; if it's a rate limit, wait and retry.

---

## Phase 1: Browser E2E Smoke

**Time budget: 45 minutes**

The business stakeholder drives the browser. The lead monitors the terminal.

### 1A: Dashboard (15 min)

With 15 instruments and 0 transactions:
- Verify empty-state prompt rendered correctly before instruments were added (if you took a screenshot, check it)
- Hero metric shows $0.00
- Holdings table lists all 15 instruments with current prices
- Window selector clicks work (1D/1W/1M/3M/1Y/ALL)
- Data health footer is accurate

### 1B: Transaction Entry (15 min)

Enter these test transactions (these are temporary — will be cleared before real data):

```
VTI   BUY   100   230.00   2025-06-15
VTI   BUY    50   245.00   2025-09-01
QQQ   BUY    30   470.00   2025-07-01
AAPL  BUY    20   200.00   2025-08-01
VTI   SELL   30   250.00   2025-11-15
```

After each transaction, verify the dashboard updates.

**Negative position test:** Try to add `VTI SELL 200 @ $260.00 on 2025-12-01`. This MUST be rejected with a clear error showing the date and deficit quantity.

### 1C: Holding Detail (10 min)

Navigate to VTI's holding detail page:
- Position summary: 120 shares, correct avg cost
- Lots table: Lot 1 (opened 2025-06-15, remaining 70), Lot 2 (opened 2025-09-01, remaining 50)
- Realized PnL from the sell: $600.00 = (250 - 230) × 30
- Candlestick chart renders
- Transaction history shows all 3 VTI transactions

### 1D: Transactions + Charts Pages (5 min)

- Transactions page lists all 5 transactions
- Filters work (by instrument, by type)
- Charts page renders with instrument selector

### Gate

**All Phase 1 checks must pass before proceeding.** If a blocking issue is found, apply a hotfix (max 30 min). If the fix exceeds 30 min, log as defect and proceed to Phase 2 with the limitation noted.

---

## Phase 2: Real Portfolio Data Entry

**Time budget: 60 minutes**

### Clear Test Data

```bash
# Option A: Delete through UI (instrument by instrument)
# Option B: Fresh database
rm -f data/portfolio.db
pnpm db:push
# Restart dev server
```

After clearing, re-add the real portfolio instruments (the ones the stakeholder actually owns).

### Enter Real Data

The business stakeholder enters their actual holdings and transaction history. Use either:
- **Individual transaction form** for small portfolios (< 20 transactions)
- **Bulk paste** for larger portfolios: Transactions page → Bulk Import → paste tab-separated rows

### Cross-Validate

Compare STALKER's displayed values against the brokerage statement:

| Check | STALKER Shows | Brokerage Shows | Match? | Notes |
|-------|--------------|-----------------|--------|-------|
| Total portfolio value | | | | ±0.5% OK (quote timing) |
| [Holding 1] cost basis | | | | Must be exact |
| [Holding 1] quantity | | | | Must be exact |
| [Holding 1] realized PnL | | | | Must be exact |
| [Holding 1] unrealized PnL | | | | ±1% OK |
| [Holding 2] cost basis | | | | Must be exact |
| ... | | | | |

**Cost basis and realized PnL must match exactly.** These are computed from user-entered transaction prices.

**Unrealized PnL and total portfolio value may differ slightly** due to:
- Quote timing (FMP vs brokerage real-time)
- Tiingo adjusted prices for historical data
- These differences are documented, not bugs

### Gate

**Cross-validation must pass before signoff.** Any exact-match failure (cost basis, realized PnL, quantities, lot counts) that cannot be explained is a **Blocker**.

---

## Phase 3: Advisor Validation

**Time budget: 30 minutes**

### Pre-check

1. Verify the advisor FAB appears on the dashboard (bottom-right)
2. Open the advisor panel
3. Verify suggested prompts appear (3 cards)

### Test All 5 Intent Categories

Run each query against the real portfolio:

1. **Cross-holding synthesis:** "Which positions are dragging my portfolio down this quarter?"
   - Expected: Uses `getPortfolioSnapshot`, identifies specific holdings with $ amounts

2. **Tax-aware reasoning:** "If I sold my oldest lots of [your largest holding], what would the realized gain be?"
   - Expected: Uses `getHolding`, shows per-lot FIFO breakdown

3. **Performance attribution:** "How much of my portfolio gain came from [top holding] versus everything else?"
   - Expected: Uses multiple tools, provides specific % attribution

4. **Concentration awareness:** "Am I overexposed to any single holding?"
   - Expected: Uses `getPortfolioSnapshot`, flags holdings above 20-25% allocation

5. **Staleness/data quality:** "Are any of my holdings showing stale prices?"
   - Expected: Uses `getQuotes`, reports `asOf` timestamps

### Verify

- Each response is non-trivial (surfaces insights not directly visible on dashboard)
- Tool call indicators appear and are collapsible
- The advisor does NOT give financial advice ("you should buy/sell")
- Thread management works (create new, switch between threads)

### Gate

**All 5 intent categories must produce useful responses.** A response that fails to use the correct tools or returns generic/empty content is a **Critical** defect.

---

## Phase 4: Scheduler Polling Verification

**Time budget: 30 minutes — MARKET HOURS ONLY**

**Skip this phase if outside US market hours (9:30 AM – 4:00 PM ET, Mon–Fri).** Log as "Deferred — outside market hours" in the session report.

### Start Scheduler

```bash
# Terminal 2:
pnpm scheduler
```

### Observe

1. Watch startup log for budget calculation
2. Wait for one complete polling cycle (~30 min)
3. Verify quotes update in the browser (refresh the page)
4. Verify data health footer updates
5. Test manual refresh while scheduler is running — verify no conflicts

### Stop Scheduler

```bash
# Ctrl+C in Terminal 2
```

---

## Phase 5: Acceptance Criteria Sweep

**Time budget: 15 minutes**

Walk through all 21 MVP acceptance criteria (Spec §13). Most are already covered by Phases 0–4. Check off each one explicitly.

---

## Phase 6: Signoff

### Collect Results

1. Compile defect log (if any) with severity classifications
2. Record API budget consumed per provider
3. Record final test count (should still be 598+)

### Signoff Decision

**PASS** requires ALL of the following:
- All 15 soak instruments backfilled successfully
- Browser E2E walkthrough completed
- Cross-validation passed (cost basis + realized PnL exact match)
- All 5 advisor intents produced useful responses
- All 21 MVP acceptance criteria verified
- No open Blocker or Critical defects
- Test suite still passes

**CONDITIONAL PASS** if:
- Scheduler verification deferred (outside market hours)
- Minor/Major defects logged but not blocking

**FAIL** if:
- PnL computation error (not explained by data source differences)
- Critical user flow broken
- Data corruption observed

### Post-Session

```bash
# Final quality check
pnpm tsc --noEmit
pnpm test

# Update docs
# - HANDOFF.md (final state)
# - STALKER_MASTER-PLAN.md (S13 status, final metrics)

# Commit
git add -A
git commit -m "Session 13: UAT complete — [PASS/FAIL/CONDITIONAL]"
git push origin main
```

### Generate Report

Write `SESSION-13-REPORT.md` following the template in `SESSION-13-PLAN.md` §9. Include:
- Signoff decision with rationale
- Phase-by-phase results
- Defect log (if any)
- Hotfixes applied (if any)
- Cross-validation detail table
- API budget summary
- Known limitations for production use
- Final metrics

---

## Scope Cut Order

This session has no scope cuts — everything in the plan is required for signoff. However, if time pressure forces prioritization:

1. **Never skip:** Phase 2 (cross-validation) — this is the signoff gate
2. **Never skip:** Phase 3 (advisor validation) — MVP criterion #8
3. **Can defer:** Phase 4 (scheduler) — only if outside market hours
4. **Can abbreviate:** Phase 0 (soak) — test 8 instruments instead of 15 if API budget is tight
5. **Can abbreviate:** Phase 1 (E2E) — reduce to dashboard + transaction entry only

---

## Emergency Hotfix Rules

If you need to fix code during UAT:
1. Fix must be minimal — no refactoring
2. `pnpm tsc --noEmit` must pass after fix
3. `pnpm test` must pass after fix (598+ tests)
4. Re-verify the specific check that failed
5. Commit: `Session 13: Hotfix — [description]`
6. Log in session report

If a fix requires > 30 minutes, stop. Log it as a defect. Continue UAT with the limitation noted.
