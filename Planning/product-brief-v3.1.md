# Product Brief: Stock & Portfolio Tracker + LLM Advisor

**Version:** 3.1 (Amendments incorporated)
**Date:** 2026-02-20
**Author:** Product Management
**Audience:** Engineering Lead
**Status:** Review requested
**Spec references:** SPEC_v3.md, AMENDMENTS_v3_1.md

---

## Executive Summary

The v3.1 spec is well engineered and correctly scoped. The amendments—flat polling, weekday-only calendar, symbol-keyed JSON, dropping `valuationMode`—are the right calls. They remove roughly 150 lines of code and one to two build sessions without degrading the user experience.

This brief outlines six product-level recommendations that close gaps in the spec before build begins. Each recommendation is sized, scoped, and sequenced. The target user is a single individual tracking multiple ETFs on a Mac, not day trading, using free-tier data providers with no LLM cost sensitivity.

---

## Prioritization Summary

| # | Recommendation | Priority | Effort | Spec Impact |
|---|----------------|----------|--------|-------------|
| 1 | Sharpen the LLM advisor value proposition | Now | 0.5 sessions | System prompt + example convos added to spec |
| 2 | Define empty states and first-run experience | Now | 0.5 sessions | New section in spec (Section 9.6) |
| 3 | Surface data health in the UI | Now | 0.25 sessions | Minor addition to Section 9.1 |
| 4 | Add bulk transaction paste input | Next | 1 session | New acceptance criterion |
| 5 | Defer the overlay/compare chart | Now (cut) | Saves 1 session | Move criterion 6 to post-MVP |
| 6 | Define PnL validation strategy | Now | 0.25 sessions | New section in spec (Section 13.1) |

---

## Recommendation 1: Sharpen the LLM Advisor Value Proposition

### Problem

The advisor is the most differentiated feature in the product, but the spec treats it as a technical integration (adapter, tool loop, persistence) rather than a product surface. Four read-only tools against cached data will produce a chatbot that answers questions the user can already answer by looking at the dashboard. The advisor needs to deliver synthesis the UI cannot.

### User Context

A single user tracking multiple ETFs. They do not need real-time trade signals. They need an analytical partner that helps them understand portfolio-level patterns, tax implications of potential actions, and whether their positions are performing as expected over longer time horizons.

### Recommendation

**Action:** Write 5 to 10 example advisor conversations before build begins. Use those conversations to pressure-test tool sufficiency and to draft the system prompt.

The example conversations should cover the following intent categories:

1. **Cross-holding synthesis:** "Which positions are dragging my portfolio down over the last 90 days?"
2. **Tax-aware reasoning:** "If I sold my VTI lots opened before June, what would the realized gain be?"
3. **Performance attribution:** "How much of my portfolio gain this year came from QQQ versus everything else?"
4. **Concentration awareness:** "Am I overexposed to any single sector based on my current allocations?"
5. **Staleness and data quality:** "Are any of my holdings showing stale prices?"

### Scope

- **In scope:** System prompt, example conversations document, tool sufficiency validation.
- **Out of scope:** New tools, web search, hypothetical calculations (all remain post-MVP).
- **Non-goal:** The advisor does not need to be "smart" in MVP. It needs to be useful for the five intent categories above. If it handles those well, the foundation is solid.

### Success Criteria

| Metric | Baseline | Target |
|--------|----------|--------|
| Example conversations that work with 4 tools | N/A | 5 of 5 intent categories addressed |
| System prompt exists and is tested | No prompt defined | Prompt tested against all 5 examples |
| User can get a non-trivial insight from first conversation | N/A | Advisor surfaces something not visible on dashboard |

### Risks

The four tools may not be sufficient for tax-aware reasoning (requires lot-level cost basis in the response). Mitigation: the `getHolding` tool already returns lots, so this should work. Validate during the example conversation exercise.

System prompt quality is the single biggest lever on advisor usefulness. Mitigation: iterate on the prompt with real queries before wiring up the UI.

### Spec Change

Add a new subsection 7.5 (Advisor System Prompt and Example Conversations) to the spec. This subsection should contain the system prompt and a reference to the example conversations document. The system prompt should instruct the LLM to synthesize across holdings, reason about lots and cost basis, and flag data staleness. It should not instruct the LLM to give financial advice or make trade recommendations.

---

## Recommendation 2: Define Empty States and First-Run Experience

### Problem

The spec defines no behavior for the first launch. The user will see an empty dashboard, an empty holdings table, and an advisor with no portfolio context. For a local-first app with no onboarding flow, the cold-start experience determines whether the user gets value in the first session or abandons the tool.

### User Context

A developer setting up a personal portfolio tracker. They will likely have brokerage statements or a spreadsheet with historical trades. Their first action should be obvious from the moment the app loads.

### Recommendation

**Action:** Define empty states for every page and add a lightweight first-run flow.

| Page | Empty State Behavior |
|------|---------------------|
| Dashboard | Show a centered prompt: "Add your first holding to start tracking your portfolio." with a prominent "Add Instrument" button. No chart skeleton, no zero-value cards. |
| Holdings | Same prompt as dashboard. Single call-to-action. |
| Transactions | "No transactions yet. Add an instrument first, then record your trades." |
| Advisor | If no holdings exist: "Add some holdings first so the advisor has something to work with." If holdings exist but no thread: "Ask me anything about your portfolio." with 3 suggested prompts drawn from the example conversations. |
| Single Holding | Should not be reachable if no holdings exist. If reached via direct URL, redirect to dashboard. |

### Success Criteria

- Every page has a defined empty state (no blank screens, no loading spinners on empty data).
- A new user can go from first launch to seeing portfolio value in under 3 minutes.
- The advisor shows suggested prompts that match the example conversations from Recommendation 1.

### Spec Change

Add Section 9.6 (Empty States and First-Run Experience) with the table above. Add a note to Section 13 (MVP Acceptance Criteria) that empty states are acceptance-testable: each page must render correctly with zero data.

---

## Recommendation 3: Surface Data Health in the UI

### Problem

The scheduler already computes a budget check at startup and logs it to the console. But the user never sees the console. If FMP changes their free tier, or the user adds enough instruments to exceed the daily budget, the only symptom is stale quotes with no explanation. The staleness indicator per instrument is necessary but insufficient; the user needs a system-level view of data health.

### User Context

A user tracking 15 to 20 ETFs on FMP's 250 requests-per-day free tier. They are not monitoring terminal output. They need to know at a glance whether the system is operating within its data budget.

### Recommendation

**Action:** Add a data health indicator to the dashboard footer or a settings/status page.

The indicator should display three things:

1. **Instrument count and polling status** (e.g., "15 instruments, polling every 30 min during market hours")
2. **API budget usage** (e.g., "183 / 250 daily calls used")
3. **Overall freshness** (e.g., "All quotes updated within last 35 min" or "3 quotes stale > 2 hours")

### Scope

- **In scope:** Read-only status display using data the scheduler already computes. One API endpoint (`GET /api/market/status`) that returns budget and freshness data.
- **Out of scope:** User-configurable polling settings, provider switching UI, alert thresholds.

### Success Criteria

| Metric | Baseline | Target |
|--------|----------|--------|
| User can see API budget usage | Console log only | Visible in UI |
| User can identify systemic staleness | Per-instrument badge only | System-level summary visible |

### Spec Change

Add a data health indicator to Section 9.1 (Portfolio Dashboard). Add `GET /api/market/status` to Section 8.4 (Market Data endpoints). The scheduler should persist its last budget calculation and poll results to a lightweight status record (or expose via an in-memory endpoint if the scheduler is running as a separate process).

---

## Recommendation 4: Add Bulk Transaction Paste Input

### Problem

The MVP acceptance criteria require manual entry for every transaction. A user with 15 to 20 ETF positions and even modest trading history might have 50 to 100 historical transactions. Entering these one at a time through a form is a 30- to 60-minute task that will feel tedious and error-prone. This is the highest-friction point in the entire product.

### User Context

A user migrating from a brokerage statement or personal spreadsheet. They can easily copy tabular data from Excel or Google Sheets. They cannot easily produce a well-formed CSV with the exact schema the app expects.

### Recommendation

**Priority:** Next (post-core-MVP, pre-polish). Full CSV import remains deferred.

**Action:** Add a multi-line paste input to the transaction page that accepts tab-separated rows.

Expected format: one transaction per line, tab-separated fields in the order: symbol, type (BUY/SELL), quantity, price, date (YYYY-MM-DD). Fees and notes are optional trailing fields. The UI previews parsed rows, highlights validation errors (unknown symbol, negative position), and lets the user confirm before committing.

### Scope

- **In scope:** Paste input, preview table with error highlighting, batch validation, batch insert with snapshot rebuild.
- **Out of scope:** CSV file upload, column mapping UI, brokerage-specific format parsing.

### Success Criteria

| Metric | Baseline | Target |
|--------|----------|--------|
| Time to enter 20 historical transactions | 20-30 min (manual form) | Under 3 min (paste + confirm) |
| Error rate on bulk entry | N/A | Preview catches 100% of validation errors before commit |

### Spec Change

Add to Section 9.3 (Transactions Page) as a "Bulk paste" subsection. Add a corresponding `POST /api/transactions/bulk` endpoint to Section 8.2. Acceptance criteria: add a new criterion 11 ("Import 20+ transactions via paste in under 3 minutes with preview and validation"). Mark this as a Next priority, not required for initial MVP acceptance.

---

## Recommendation 5: Defer the Overlay/Compare Chart

### Problem

MVP acceptance criterion 6 requires a multi-instrument overlay chart with three normalization modes (raw price, normalize to 100, percentage change). This is a browsing feature, not a tracking feature. It adds real build complexity (multi-select component, normalization logic, multi-line chart configuration) but is unlikely to be the reason anyone uses a portfolio tracker. The core value proposition is accurate PnL tracking with backdated trades, not instrument comparison.

### User Context

A user tracking multiple ETFs. They want to know how their portfolio is doing, not how VTI compares to QQQ on a normalized basis. If they want that comparison, TradingView, Yahoo Finance, and Google Finance all do it better with real-time data.

### Recommendation

**Action:** Move acceptance criterion 6 (overlay/compare chart) from MVP to Next.

The single-instrument candlestick chart (criterion 5) provides sufficient charting for MVP. This frees approximately one build session that can be redirected toward higher-value work: the advisor system prompt, empty states, or data health indicator.

### What We Gain by Cutting

- One fewer UI component to build and test (multi-select, normalization toggle, multi-line chart).
- Simpler charting integration in Phase 1 (one chart type, not two).
- Approximately one build session freed for higher-priority work.

### What We Lose

A nice-to-have visualization. No core tracking functionality is affected. The data pipeline (daily bars per instrument) is already in place for the single-instrument chart, so adding the overlay later requires only UI work, no backend changes.

### Spec Change

Move Section 9.4 (Compare / Overlay Chart) to a "Post-MVP" subsection. Remove acceptance criterion 6 from Section 13. Add a note that daily bars are already stored per instrument, so the overlay chart can be added with UI-only work in a future phase.

---

## Recommendation 6: Define a PnL Validation Strategy

### Problem

The spec defines the lot accounting algorithm (FIFO), the precision rules (Decimal.js, no floats), and the snapshot rebuild strategy. What it does not define is how to verify that the calculations are correct. For a portfolio tracker, correctness is the product. If the PnL numbers are wrong, nothing else matters.

### User Context

A single user who will compare the app's numbers against brokerage statements or a personal spreadsheet. If the numbers don't match, trust is broken immediately and permanently.

### Recommendation

**Action:** Define a reference portfolio and expected outputs as a validation fixture.

The validation strategy has three components:

1. **Reference portfolio:** A small, manually constructed set of transactions (5 to 8 instruments, 20 to 30 transactions including backdated ones) with known expected outputs for lots, realized PnL, unrealized PnL, and portfolio value at specific dates.
2. **Fixture-based tests:** Automated tests in the analytics package that replay the reference portfolio and assert expected values to the cent. These run in CI and catch regressions.
3. **Cross-validation checkpoint:** Before the UI is considered complete, run the reference portfolio through the full stack (API + UI) and manually verify that displayed values match expected outputs.

### Reference Portfolio Requirements

- At least one instrument with multiple buy lots at different prices.
- At least one partial sell (exercises FIFO lot consumption).
- At least one full position close (exercises realized PnL).
- At least one backdated transaction (exercises snapshot rebuild).
- At least one date with a missing price bar (exercises carry-forward logic).
- Expected outputs computed independently (spreadsheet or manual calculation).

### Success Criteria

| Metric | Baseline | Target |
|--------|----------|--------|
| Reference portfolio defined | No validation fixture | Fixture with 5+ instruments, 20+ transactions |
| Automated tests passing | No PnL-specific tests | All expected values match to the cent |
| Full-stack cross-validation | Not defined | Manual check completed before MVP signoff |

### Spec Change

Add Section 13.1 (PnL Validation Strategy) describing the reference portfolio approach. The reference portfolio fixture file should live in the repo (e.g., `data/test/reference-portfolio.json`) alongside expected outputs. Add a note that MVP signoff requires the cross-validation checkpoint to pass.

---

## Summary of Spec Changes

| Spec Section | Change Type | Description |
|-------------|-------------|-------------|
| 7.5 (new) | Addition | Advisor system prompt, example conversations, intent categories |
| 9.6 (new) | Addition | Empty states and first-run experience definitions |
| 9.1 | Addition | Data health indicator on dashboard |
| 8.4 | Addition | `GET /api/market/status` endpoint |
| 9.3 | Addition (Next) | Bulk transaction paste input |
| 8.2 | Addition (Next) | `POST /api/transactions/bulk` endpoint |
| 9.4 | Deferral | Compare/overlay chart moved to post-MVP |
| 13, criterion 6 | Removal | Overlay chart removed from MVP acceptance criteria |
| 13.1 (new) | Addition | PnL validation strategy and reference portfolio |

---

## Requested Next Steps

1. Engineering lead reviews this brief and flags feasibility concerns or effort disagreements.
2. Product writes the 5 example advisor conversations (Recommendation 1). Target: 1 day.
3. Engineering and product align on the reference portfolio fixture (Recommendation 6). Target: joint session, 1 hour.
4. Spec is updated with agreed changes and re-versioned as v3.2.
5. Build begins per the go-forward plan, with recommendations 1, 2, 3, 5, and 6 incorporated into Phase 0 or 1 as applicable.

---

**Net effect of all recommendations:** One session saved from the overlay chart deferral, approximately 1.5 sessions added for new work (advisor prompt, empty states, data health, validation fixtures). Net change to timeline is roughly 0.5 sessions added, with significantly higher product quality and correctness confidence at MVP.
