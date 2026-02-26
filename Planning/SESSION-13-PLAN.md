# SESSION-13-PLAN.md — User Acceptance Testing with Real Portfolio Data

**Session:** 13 of 13
**Epic:** 12 (UAT)
**Mode:** Lead + Business Stakeholder (Manual)
**Depends on:** Session 12 ✅
**Blocks:** Production use
**Duration context:** Final session. After signoff, system is trusted with real money tracking.

---

## 1. Session Objective

Validate that STALKER functions correctly end-to-end with live market data providers and real portfolio data. This session has no code deliverables. The deliverable is a signed-off system or a defect list that blocks signoff.

**Entry state:** 598 tests passing, 0 TypeScript errors, 0 API stubs, 3 live providers wired (FMP, Tiingo, Alpha Vantage), 21/21 MVP acceptance criteria met against seed data, 749/749 PnL cross-validation checks passing.

**Exit state:** All validation checks in this document pass, or a prioritized defect list exists with a remediation plan.

---

## 2. Why This Session is Different

Sessions 1–12 were engineering sessions — code was written, tests were added, teammates were launched in parallel. Session 13 is a **manual validation session** with two participants:

- **Lead (Engineering):** Runs the system, monitors logs, diagnoses issues, applies hotfixes if needed.
- **Business Stakeholder:** Operates the UI as a real user, enters real portfolio data, verifies numbers against brokerage statements, exercises the advisor.

There are no parallel teammates. All work is sequential and collaborative. The lead runs the dev server and scheduler; the stakeholder drives the browser.

---

## 3. Pre-Session Setup

### 3.1 Environment Verification

Before any UAT work begins, verify the environment is clean and operational.

```bash
# S-1: Clean install
pnpm install

# S-2: Type check
pnpm tsc --noEmit
# Expected: 0 errors

# S-3: Full test suite
pnpm test
# Expected: 598+ tests, 0 failures

# S-4: Fresh database
rm -f data/portfolio.db
pnpm db:push
pnpm db:generate

# S-5: Verify .env.local has all required keys
# Required: FMP_API_KEY, TIINGO_API_KEY, ALPHA_VANTAGE_API_KEY
# Required: LLM_PROVIDER, ANTHROPIC_API_KEY (or OPENAI_API_KEY)
# Required: DATABASE_URL, POLL_INTERVAL_MARKET_HOURS, POST_CLOSE_DELAY
```

### 3.2 API Budget Check

Before starting, verify provider budgets are sufficient for the session.

| Provider | Daily Limit | Estimated Session Usage | Check |
|----------|------------|------------------------|-------|
| FMP | 250/day | ~80 (search + quotes for 15 instruments × multiple refreshes) | `FMP_RPD=250` in .env |
| Tiingo | 1,000/day, 50/hr | ~30 (15 instrument backfills + spot checks) | `TIINGO_RPD=1000`, `TIINGO_RPH=50` in .env |
| Alpha Vantage | 25/day | ~5 (fallback only) | `AV_RPD=25` in .env |
| LLM (Anthropic) | Per-token billing | ~10 advisor conversations | API key valid |

**Budget tracking:** The lead maintains a running tally of API calls consumed during the session, logged from terminal output. If any provider approaches 80% of daily budget, pause and assess remaining work.

### 3.3 Start Services

```bash
# Terminal 1: Next.js dev server
pnpm dev

# Terminal 2: Scheduler (start later — see Phase 4)
# pnpm scheduler
```

**Note:** Do NOT start the scheduler until Phase 4. Phases 0–3 use manual refresh only to conserve API budget and maintain control over when quotes are fetched.

---

## 4. Session Phases

### Phase 0: S12 Carry-Forward — 15-Instrument Soak (30 min)

**Context:** Session 12 verified single-instrument backfill (CRWD, 501 bars) but did not run the full 15-instrument soak to conserve API budget. This phase closes that gap.

**Objective:** Add all 15 instruments from `data/test/soak-instruments.json` via the UI and verify backfill quality for each.

**Procedure:**
1. Open the dashboard at `http://localhost:3000`
2. Verify the empty state renders correctly (Spec 9.6, UX Plan 3.1): centered prompt, "Add Instrument" button, no chart skeleton, no zero-value cards
3. For each instrument in `soak-instruments.json`:
   a. Click "Add Instrument"
   b. Search for the ticker symbol
   c. Verify search results appear from FMP (symbol, name, exchange, type)
   d. Select the correct result
   e. Verify toast: "[SYMBOL] added. Backfilling price history..."
   f. Wait 5–10 seconds for backfill to complete
   g. Navigate to the holding detail page for this instrument
   h. Verify the candlestick chart renders with historical data
4. After all 15 are added, verify the data health footer shows correct instrument count

**Validation checklist:**

| # | Check | Expected | Result |
|---|-------|----------|--------|
| P0-1 | All 15 instruments added without error | 15/15 created | |
| P0-2 | Each instrument has price history (chart renders) | Candlestick bars visible for all 15 | |
| P0-3 | `firstBarDate` set for all instruments | No null firstBarDate | |
| P0-4 | BRK-B symbol mapping works (dot→hyphen) | BRK-B backfill succeeds, chart renders | |
| P0-5 | Data health footer shows "15 instruments" | Count matches | |
| P0-6 | No backfill failures in terminal logs | 0 errors | |
| P0-7 | Tiingo API budget consumed < 50/hr limit | ≤ 20 calls (15 backfills + overhead) | |

**Symbol mapping edge cases to watch:**
- BRK-B (Berkshire Hathaway Class B): FMP uses `BRK-B`, Tiingo uses `BRK-B` — verify mapping
- Any instruments with dots in the symbol (e.g., BRK.B in some provider formats)

**If backfill fails for any instrument:**
- Check terminal output for the specific error (Tiingo rate limit? Symbol not found? Network error?)
- Record the failure in the defect log
- Proceed with remaining instruments — a single backfill failure should not block the session

---

### Phase 1: Browser E2E Smoke (45 min)

**Context:** Session 12 deferred the full browser walkthrough. This phase is the first time a real user exercises the complete UI flow end-to-end.

**Objective:** Walk through every user flow described in the UX plan and verify each page renders correctly with live data.

#### 1A: Dashboard Verification (15 min)

With 15 instruments and no transactions, verify dashboard behavior:

| # | Check | Expected | Spec/UX Ref |
|---|-------|----------|-------------|
| P1-1 | Dashboard renders without errors | No console errors, no blank screen | 9.1 |
| P1-2 | Portfolio value shows $0.00 (no transactions) | Hero metric displays zero | UX 3.1 |
| P1-3 | Holdings table shows 15 instruments | All 15 listed with symbol, name | 9.1 |
| P1-4 | Prices column shows live or cached prices | Non-zero values from FMP/cache | 9.1 |
| P1-5 | Market value shows $0.00 per holding (no shares) | Qty=0, Value=$0.00 | 9.1 |
| P1-6 | Window selector (1D/1W/1M/3M/1Y/ALL) clicks work | Chart updates, no errors | UX 5.3 |
| P1-7 | Data health footer shows instrument count + polling status | "15 instruments · Polling 30m" | 9.1, UX 3.1 |
| P1-8 | Staleness banner appears if quotes are stale | Amber banner if any quote > 1hr during market hours | UX 3.1 |

#### 1B: Transaction Entry (15 min)

Add test transactions for 3 instruments (not the real portfolio — that's Phase 2):

| Action | Instrument | Type | Qty | Price | Date | Expected |
|--------|-----------|------|-----|-------|------|----------|
| Add | VTI | BUY | 100 | $230.00 | 2025-06-15 | Success, dashboard updates |
| Add | VTI | BUY | 50 | $245.00 | 2025-09-01 | Success, 2 lots visible |
| Add | QQQ | BUY | 30 | $470.00 | 2025-07-01 | Success |
| Add | AAPL | BUY | 20 | $200.00 | 2025-08-01 | Success |
| Add | VTI | SELL | 30 | $250.00 | 2025-11-15 | Success, FIFO lot consumption |
| Try | VTI | SELL | 200 | $260.00 | 2025-12-01 | **Rejection** — negative position |

| # | Check | Expected | Spec/UX Ref |
|---|-------|----------|-------------|
| P1-9 | Transaction form validates all fields | Submit disabled until valid | UX 5.2 |
| P1-10 | Backdated transactions accepted | 2025 dates work | 9.3 |
| P1-11 | Dashboard updates after each transaction | Value, PnL recalculated | 9.1 |
| P1-12 | Negative position rejected with clear error | Error shows date, deficit qty | 11.2, UX 7.2 |
| P1-13 | Holdings table shows updated quantities | VTI: 120 shares after sell | 9.1 |
| P1-14 | Portfolio chart renders with data points | Area chart shows value over time | UX 3.1 |

#### 1C: Holding Detail Verification (10 min)

Navigate to VTI holding detail (the instrument with multiple lots and a partial sell):

| # | Check | Expected | Spec/UX Ref |
|---|-------|----------|-------------|
| P1-15 | Position summary shows correct totals | Shares: 120, correct avg cost | 9.2, UX 3.3 |
| P1-16 | Lots table shows FIFO order | Lot 1: opened 2025-06-15, Lot 2: opened 2025-09-01 | 5.2, UX 3.3 |
| P1-17 | Lot 1 shows partial consumption | Remaining qty: 70 (100 bought - 30 sold) | 5.2 |
| P1-18 | Realized PnL for the sell is correct | (250 - 230) × 30 = $600.00 | 5.2 |
| P1-19 | Unrealized PnL uses live/cached price | Calculated from current quote | 5.3 |
| P1-20 | Candlestick chart renders for VTI | Daily candles visible | 9.2, UX 3.3 |
| P1-21 | Transaction history shows all 3 VTI transactions | Sorted by date desc | 9.2, UX 3.3 |
| P1-22 | Edit and delete controls work | Pencil/trash icons on hover | UX 5.2 |

#### 1D: Transaction Page + Charts Page (5 min)

| # | Check | Expected | Spec/UX Ref |
|---|-------|----------|-------------|
| P1-23 | Transactions page lists all transactions | Sortable, filterable | 9.3 |
| P1-24 | Filters work (by instrument, by type) | Results narrow correctly | UX 5.5 |
| P1-25 | Charts page renders with instrument selector | Can switch between instruments | UX 3.5 |

---

### Phase 2: Real Portfolio Data Entry (60 min)

**Context:** This is the core UAT activity. The business stakeholder enters their actual holdings and historical transactions.

**Objective:** Load real portfolio data and verify STALKER's calculations match the brokerage statement.

#### 2A: Preparation

1. **Clear test data:** Delete all instruments and transactions from Phase 1 (or start with a fresh database: `rm data/portfolio.db && pnpm db:push`)
2. **Prepare brokerage reference:** Business stakeholder has a brokerage statement or CSV with:
   - List of current holdings (symbol, quantity, cost basis)
   - Historical transactions (date, type, quantity, price, fees)
   - Current portfolio value as of statement date
   - Per-holding unrealized PnL
3. **Document the reference snapshot:** Record the brokerage's stated values at a specific point in time for comparison

#### 2B: Data Entry

Enter instruments and transactions via the UI. For each instrument:
1. Add instrument via search
2. Wait for backfill to complete
3. Enter all historical transactions (oldest first for natural FIFO ordering)
4. Verify lot structure matches expectations after each sell

**If bulk paste is faster:** Use the bulk transaction paste feature (shipped in S10) for instruments with many historical trades. Navigate to Transactions page → Bulk Import → paste tab-separated rows.

#### 2C: Cross-Validation (Spec §13.1 — Signoff Gate)

**This is the MVP signoff gate.** Every displayed value must match expected outputs.

| # | Validation | Source of Truth | Tolerance | Result |
|---|-----------|-----------------|-----------|--------|
| P2-1 | Total portfolio value | Brokerage statement | ±0.5% (quote timing) | |
| P2-2 | Per-holding cost basis | Transaction input data | **Exact** ($0.00 tolerance) | |
| P2-3 | Per-holding quantity | Transaction input data | **Exact** (0 tolerance) | |
| P2-4 | Realized PnL (per holding) | Manual/spreadsheet calc | **Exact** ($0.00 tolerance) | |
| P2-5 | Unrealized PnL direction | Brokerage statement | Same sign (+/-) | |
| P2-6 | Unrealized PnL magnitude | Brokerage statement | ±1% (quote timing + Tiingo adjusted prices) | |
| P2-7 | Lot count per holding | Transaction history | **Exact** | |
| P2-8 | Lot remaining quantities | FIFO computation | **Exact** | |
| P2-9 | Allocation percentages sum to ~100% | Arithmetic | ±0.1% (rounding) | |
| P2-10 | Day change uses prior trading day | MarketCalendar | Correct reference day | |

**Tiingo adjusted price consideration (from Phase II Addendum §5):**
- Tiingo returns adjusted prices (`adjClose`) that account for splits and dividends
- This may differ slightly from unadjusted prices shown by a brokerage
- Small per-share price discrepancies (< $0.05) in historical data are a data source difference, not a STALKER bug
- Cost basis and realized PnL should match exactly (computed from user-entered transaction prices, not provider prices)
- Unrealized PnL may differ slightly due to current quote timing

**If a discrepancy is found:**
1. Record the specific value, expected value, and source in the defect log
2. Determine if the discrepancy is a **data source difference** (Tiingo adjusted prices, quote timing) or a **computation bug** (FIFO logic, Decimal precision, snapshot rebuild)
3. Data source differences are documented as known limitations; computation bugs block signoff

---

### Phase 3: Advisor Validation (30 min)

**Context:** The advisor was tested against seed data in S8/S9. This phase validates it against real portfolio data with all five intent categories from Spec §7.5.

**Objective:** Every intent category produces a useful, non-trivial response using the four MVP tools.

#### 3A: Pre-check

| # | Check | Expected |
|---|-------|----------|
| P3-1 | LLM API key is configured | `LLM_PROVIDER` and corresponding key set in .env.local |
| P3-2 | Advisor FAB appears on dashboard | 56x56px circle, bottom-right |
| P3-3 | No holdings state handled | If tested before data entry: "Add some holdings first" message |
| P3-4 | Suggested prompts appear | 3 clickable prompt cards when holdings exist but no active thread |

#### 3B: Intent Category Validation

Test each intent category against the real portfolio:

| # | Intent | Test Query | Tool(s) Expected | Pass Criteria |
|---|--------|-----------|-----------------|---------------|
| P3-5 | Cross-holding synthesis | "Which positions are dragging my portfolio down this quarter?" | `getPortfolioSnapshot` | Identifies worst performers with specific $ amounts |
| P3-6 | Tax-aware reasoning | "If I sold my oldest lots of [SYMBOL], what would the realized gain be?" | `getHolding` | Computes FIFO-based gain with per-lot breakdown |
| P3-7 | Performance attribution | "How much of my portfolio gain came from [TOP_HOLDING] versus everything else?" | `getPortfolioSnapshot`, `getHolding` | Provides specific % attribution |
| P3-8 | Concentration awareness | "Am I overexposed to any single holding?" | `getPortfolioSnapshot` | Identifies concentration with allocation % |
| P3-9 | Staleness/data quality | "Are any of my holdings showing stale prices?" | `getQuotes` | Reports `asOf` timestamps, flags stale quotes |

#### 3C: Advisor UX Checks

| # | Check | Expected | UX Ref |
|---|-------|----------|--------|
| P3-10 | Tool call indicators appear | "📊 Looking up portfolio..." during tool calls | UX 3.6 |
| P3-11 | Tool call detail is collapsible | Clicking expands raw tool call/result | UX 3.6 |
| P3-12 | Thread management works | Can create new thread, switch between threads | UX 3.6 |
| P3-13 | Thread titles auto-generated | Title from first user message, truncated to 60 chars | UX 3.6 |
| P3-14 | Advisor doesn't give financial advice | No "you should buy/sell" recommendations | 7.5 |

---

### Phase 4: Scheduler Polling Verification (30 min — during market hours only)

**Context:** Session 12 deferred scheduler verification. This phase validates the full polling lifecycle.

**Timing:** This phase MUST run during US market hours (9:30 AM – 4:00 PM ET, Monday–Friday). If the session falls outside market hours, this phase is deferred to the first available market-hours window, and a note is added to the session report.

**Objective:** Verify the scheduler correctly polls quotes during market hours and idles outside them.

#### 4A: Start Scheduler

```bash
# Terminal 2:
pnpm scheduler
```

**Observe startup log for:**
- Polling plan: "[N] instruments every [interval] during market hours"
- Budget estimate: "Estimated daily calls: X/250 (FMP). Budget OK."
- Market hours detection: "Market is [open/closed]"

#### 4B: Polling Cycle Observation

| # | Check | Expected |
|---|-------|----------|
| P4-1 | Scheduler logs polling activity | Quote fetch logs appear every 30 min (or configured interval) |
| P4-2 | Quotes update in the UI | Refresh dashboard — prices should be more recent |
| P4-3 | Staleness indicators clear after poll | Amber dots disappear on refreshed instruments |
| P4-4 | Data health footer updates | "All quotes updated within last X min" |
| P4-5 | Rate limiter active | Scheduler respects FMP 5 RPM — polls in batches, not all at once |
| P4-6 | Tiingo NOT polled during regular cycle | Tiingo calls only on backfill, not during polling |
| P4-7 | Budget tracking correct | API budget usage in footer matches terminal logs |

#### 4C: Manual Refresh Interaction

While scheduler is running:
1. Click "Refresh Quotes" in the UI
2. Verify spinner appears
3. Verify toast shows results: "Quotes refreshed. X/Y updated."
4. Verify scheduler and manual refresh don't conflict (no double-fetching or rate limit errors)

| # | Check | Expected |
|---|-------|----------|
| P4-8 | Manual refresh works alongside scheduler | No conflicts, rate limits respected |
| P4-9 | Dashboard reflects updated prices after manual refresh | Values update without page reload |

---

### Phase 5: Remaining MVP Acceptance Criteria Sweep (15 min)

Cross-reference all 21 MVP acceptance criteria (Spec §13) against observed behavior. Many are already covered by Phases 0–4 — this phase catches anything missed.

| Criterion # | Description | Covered By | Verified |
|------------|-------------|------------|----------|
| 1 | Add instruments by searching, with backfill and exchange TZ | Phase 0 | |
| 2 | Record BUY/SELL with backdating, negative position validation | Phase 1B | |
| 3 | Dashboard: total value, day change, window selector | Phase 1A | |
| 4 | Holdings table: price, qty, value, PnL, allocation, staleness | Phase 1A | |
| 5 | Single instrument chart with daily candles and date picker | Phase 1C | |
| 6 | Realized vs unrealized PnL at portfolio and holding level | Phase 2C | |
| 7 | Lot detail with FIFO, individual cost basis and PnL | Phase 1C, Phase 2C | |
| 8 | Advisor: 5 intent categories with read-only tools | Phase 3B | |
| 9 | Quote staleness timestamps and warnings | Phase 1A, Phase 4 | |
| 10 | Data health footer: count, polling, budget, freshness | Phase 0, Phase 4 | |
| 11 | Empty states on every page with clear CTAs | Phase 0 (start) | |

**Explicit empty state check (if not already verified in Phase 0):**

| Page | Empty State | Verified |
|------|------------|----------|
| Dashboard | "Add your first holding..." + button | |
| Holdings | Same as dashboard | |
| Transactions | "No transactions yet..." | |
| Advisor (no holdings) | "Add some holdings first..." | |
| Advisor (holdings, no thread) | Suggested prompts | |

---

### Phase 6: Defect Triage + Budget Review + Signoff (15 min)

#### 6A: Defect Triage

Classify all issues found during the session:

| Severity | Definition | Action |
|----------|-----------|--------|
| **Blocker** | PnL calculation error, data corruption, crash | **Blocks signoff.** Fix required before production use. |
| **Critical** | Feature doesn't work as specified but no data corruption | **Blocks signoff.** Hotfix in-session if < 30 min, otherwise schedule remediation. |
| **Major** | UX friction, cosmetic issue affecting comprehension | **Does not block signoff.** Document for future fix. |
| **Minor** | Visual polish, nice-to-have | **Does not block signoff.** Document. |

#### 6B: API Budget Review

| Provider | Calls Used | Daily Limit | % Consumed |
|----------|-----------|-------------|------------|
| FMP | | 250 | |
| Tiingo | | 1,000 | |
| Alpha Vantage | | 25 | |

#### 6C: Signoff Decision

**Signoff is granted when ALL of the following are true:**
1. All Phase 2C cross-validation checks pass (or discrepancies are documented as data source differences, not computation bugs)
2. All 5 advisor intent categories produce useful responses
3. No Blocker or Critical defects remain open
4. All 21 MVP acceptance criteria are verified
5. The automated test suite (598+ tests) still passes after any hotfixes

**Signoff is blocked when ANY of the following are true:**
1. A PnL computation discrepancy cannot be explained by data source differences
2. A critical user flow is broken (add instrument, add transaction, view dashboard)
3. The advisor fails to respond for any intent category
4. Data corruption is observed (snapshots don't match transaction replay)

---

## 5. Hotfix Protocol

If defects are found during UAT that are small enough to fix in-session:

1. **Lead diagnoses the issue** in the codebase
2. **Fix is applied** in the minimal scope needed
3. **Run `pnpm tsc --noEmit`** — must pass
4. **Run `pnpm test`** — must pass (598+ tests, 0 failures)
5. **Re-verify the specific failing check** in the relevant phase
6. **Commit with message:** `Session 13: Hotfix — [brief description]`
7. **Log the fix** in the session report under "Hotfixes Applied"

**Hotfix scope limit:** If a fix requires more than 30 minutes of engineering work, it is logged as a defect and deferred to a remediation session. UAT continues with the defect noted.

---

## 6. Known Limitations to Document

Regardless of whether issues are found, the session report should document these known limitations for production use:

| # | Limitation | Impact | Source |
|---|-----------|--------|--------|
| KL-UAT-1 | No holiday/half-day calendar | Scheduler polls on holidays, wasting a few API calls. No incorrect data. | Spec §2.4 |
| KL-UAT-2 | Tiingo adjusted prices may differ from brokerage unadjusted | Small historical price discrepancies (< $0.05/share) possible | Addendum §5 |
| KL-UAT-3 | Fire-and-forget backfill has no retry/status UI | If backfill fails, no UI indication — check terminal logs | AD-S12b |
| KL-UAT-4 | Manual refresh rate-limited to ~5 instruments per call | FMP 5 RPM limit. Multiple clicks needed for 15+ instruments. | S12 V-2 |
| KL-UAT-5 | `skipDuplicates` unsupported on SQLite | Backfill assumes fresh instruments. Re-backfill would need delete-then-insert. | S12 issue |
| KL-UAT-6 | Scheduler not tested for restart recovery | If scheduler crashes mid-poll, no automatic restart mechanism | Deferred |

---

## 7. Session Deliverables

| Deliverable | Format | Owner |
|------------|--------|-------|
| SESSION-13-REPORT.md | Markdown | Lead |
| Defect log (if any) | Section in report | Lead |
| Signoff decision (PASS/FAIL) | Section in report | Lead + Stakeholder |
| Updated STALKER_MASTER-PLAN.md | Markdown | Lead |
| Updated HANDOFF.md | Markdown | Lead |
| Known limitations document | Section in report | Lead |
| API budget summary | Section in report | Lead |

---

## 8. Exit Criteria

### Must Pass (Blocks Signoff)

| # | Criterion |
|---|-----------|
| E-1 | All 15 soak instruments added with successful backfill |
| E-2 | Full browser E2E walkthrough completed without blocking errors |
| E-3 | Real portfolio data entered and cross-validated against brokerage statement |
| E-4 | Cost basis and realized PnL match brokerage to $0.00 tolerance |
| E-5 | All 5 advisor intent categories produce useful responses |
| E-6 | All 21 MVP acceptance criteria verified |
| E-7 | Test suite passes after any hotfixes (598+, 0 failures) |
| E-8 | No open Blocker or Critical defects |

### Should Pass (Does Not Block Signoff)

| # | Criterion |
|---|-----------|
| S-1 | Scheduler polling cycle observed during market hours |
| S-2 | Manual refresh + scheduler coexist without conflicts |
| S-3 | Unrealized PnL within ±1% of brokerage (quote timing variance) |
| S-4 | All empty states render correctly |
| S-5 | Keyboard navigation works for all interactive elements |

### Deferred (Documented Only)

| # | Item |
|---|------|
| D-1 | Backfill status/retry UI |
| D-2 | Scheduler restart recovery |
| D-3 | Holiday/half-day calendar |
| D-4 | Full accessibility audit |

---

## 9. Session Report Template

The Session 13 report should follow this structure:

```markdown
# Session 13 Report — User Acceptance Testing

## Signoff Decision: [PASS / FAIL / CONDITIONAL PASS]

## Phase Results
### Phase 0: 15-Instrument Soak — [PASS/FAIL]
### Phase 1: Browser E2E Smoke — [PASS/FAIL]
### Phase 2: Cross-Validation — [PASS/FAIL]
### Phase 3: Advisor Validation — [PASS/FAIL]
### Phase 4: Scheduler Verification — [PASS/FAIL/DEFERRED]
### Phase 5: Acceptance Criteria Sweep — [PASS/FAIL]

## Defect Log
| # | Severity | Description | Phase | Resolution |

## Hotfixes Applied
| # | Description | Files Changed | Tests Affected |

## Cross-Validation Detail
[Detailed comparison of STALKER values vs brokerage values]

## API Budget Summary
| Provider | Calls Used | Limit | % |

## Known Limitations for Production
[Final list]

## Metrics
| Metric | Value |
```
