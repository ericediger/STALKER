# S14 Assessment & S15 Recommendations

**Date:** 2026-02-25
**Author:** Systems Architect
**Input:** SESSION-14-REPORT.md, STALKER_MASTER-PLAN.md v4.0, SPEC v4.0, Phase II Addendum, UX/UI Plan

---

## 1. Session 14 Assessment

### What Went Right

S14 was a clean, well-prioritized session. The three issues from S13 were correctly triaged by severity (data integrity > performance > cosmetic), and all three were resolved decisively.

**BatchPriceLookup is excellent engineering.** The 150x speedup (minutes → 4 seconds) by eliminating 20,000 individual DB queries in favor of a single bulk load + in-memory binary search is textbook. The O(1) exact lookup via Map with O(log n) carry-forward via binary search is the right data structure choice. Memory footprint (~1MB) is trivial. This was the correct architectural response and it should be permanent infrastructure, not session-specific.

**Dedup design is conservative in the right way.** Exact match on `(instrumentId, type, quantity, price, tradeAt)` avoids false positives. The decision to warn (not block) on single-transaction duplicates is good UX — the user may legitimately execute the same trade twice (DCA on schedule). Using `Decimal.eq()` rather than string comparison (AD-S14-2) catches the "50" vs "50.00" edge case correctly.

**Instrument name resolution script is the right pattern.** Making it a manual script (AD-S14-4) rather than startup logic is correct given FMP's 250/day budget. The Tiingo metadata fallback (2 instruments resolved that FMP missed) shows good defensive thinking.

### What Needs Attention

**1. Quote Starvation Is the #1 Production Blocker**

This is the most critical issue in the system right now, and the S14 report underplays it.

Current state: 3 of 83 instruments have live quotes. The scheduler auto-adjusts to ~130-minute intervals (~3 full polls/day). At this rate, it takes **a full trading day** just to populate every instrument once. During that initial population window, the dashboard shows almost entirely stale data — which means the user's first production experience after loading real data will be a wall of amber staleness indicators.

The root cause: the provider chain for real-time quotes is `FMP → Alpha Vantage → cache`. FMP has 250 calls/day. AV has 25/day. That's 275 total quote calls/day for 83 instruments = ~3.3 polls per instrument per day. **The system was designed for 15–20 instruments (Spec §1.2, UX Plan §1.2) but is now running 83.**

The fix is already in the architecture but not wired: **Tiingo IEX** (`/iex/{symbol}`) is listed as "backup quotes" in the provider matrix (Addendum §1) but is **not in the quote fallback chain** (which only lists FMP → AV → cache). Tiingo IEX has two properties that change the budget math entirely:

- **Batch support:** `/iex/?tickers=AAPL,MSFT,GOOGL,...` fetches multiple symbols in a single API call
- **Budget:** 1,000 calls/day, 50/hr — but with batch, 1 call = all 83 instruments

With Tiingo IEX batch as the primary quote source for polling, 83 instruments can be polled every 30 minutes during market hours using ~13 calls/day (one per poll cycle), leaving FMP's 250/day for on-demand search and single-symbol quote refreshes. This changes the scheduler from "barely functional at 83 instruments" to "comfortable with headroom."

**2. Staleness UX Breaks at Scale**

The UX plan (§3.1) was designed for a scenario where "a few instruments" might be stale. The staleness banner example says: "⚠ Prices as of 2:35 PM ET — **3 instruments stale** > 2 hrs." The data health footer shows "15 instruments · Polling 30m · 183/250 FMP calls."

Reality: 80 of 83 instruments are stale. Every row in the holdings table has an amber dot. The staleness banner is not "a few instruments are stale" — it's "almost nothing is fresh." The footer shows "83 instruments · Polling ~130m · 0/250 FMP calls."

This isn't a bug — it's a UX pattern that doesn't scale to the actual data. The staleness system needs a mode for "most data is stale" vs. "a few outliers are stale."

**3. Holdings Table at 83 Rows**

The UX plan specs a holdings table designed for 15–20 rows. At 83 rows, the table extends well below the fold. The dashboard's hero metric + chart + summary cards + 83-row table pushes the staleness banner and data health footer far below the visible viewport.

The holdings table needs either: (a) a search/filter bar, (b) a configurable page size with "show top N by allocation" default, or (c) a virtual scroll. Option (b) is recommended — show top 20 holdings on the dashboard by default with a "View all 83 →" link to the dedicated Holdings page.

**4. Visual UAT Is Still Zero**

11/11 UAT criteria pass at API level, but zero visual verification has occurred with real data. Claude Code can't run a browser, so this is fundamentally a human task. However, the coding session can anticipate and pre-fix the most likely visual issues based on the 83-instrument scale mismatch.

---

## 2. Risk Assessment

| # | Risk | Severity | Notes |
|---|------|----------|-------|
| **R-15-1** | Quote starvation degrades first production experience | **Critical** | 80/83 stale. Scheduler barely functional at 83 instruments on FMP budget. |
| **R-15-2** | Staleness UX overwhelming at scale | **High** | Amber dots on every row, banner text misleading. |
| **R-15-3** | Holdings table unusable on dashboard at 83 rows | **Medium** | Below-fold content, no search/filter. |
| **R-15-4** | Visual bugs unknown until browser testing | **Medium** | API-level testing doesn't catch layout, overflow, chart rendering issues. |
| **R-15-5** | Scheduler never E2E tested at 83-instrument scale with live APIs | **Medium** | Budget adjustment logic verified but full poll cycle untested. |

---

## 3. Session 15 Recommendation

**Title:** Quote Pipeline Unblock + Scale UX Fixes

**Thesis:** The system is functionally correct (11/11 UAT, 602 tests) but operationally broken for 83 instruments because the quote pipeline can't keep up and the UI wasn't designed for this scale. S15 fixes both, making the system actually usable for production before the human does visual browser UAT.

### Priority Order

```
P0: Tiingo IEX batch quotes (unblocks everything)
P1: Scheduler rewiring to Tiingo-primary polling
P2: Dashboard holdings table truncation (top-N default)
P3: Staleness UX adaptation for majority-stale state
P4: Pre-visual-UAT hardening (overflow, truncation, edge cases)
```

### Explicit Non-Goals

- Holiday/half-day calendar (nice-to-have, not blocking production)
- Advisor context window management (advisor works, long threads are post-production)
- Responsive tablet/mobile (user is on desktop)
- Overlay/compare chart (post-MVP, documented deferral)

### Estimated Scope

- ~6 files changed, ~2 files new
- ~8–12 new tests
- Target: 615+ tests
- Team shape: Lead + 1 teammate (quote pipeline is focused scope)

---

## 4. Architecture Decision Proposals for S15

| # | Proposal | Rationale |
|---|----------|-----------|
| AD-S15-1 | Tiingo IEX batch as primary quote source for scheduler polling | 83 instruments in 1 API call. Shifts FMP to on-demand/search only. Eliminates quote starvation. |
| AD-S15-2 | Dashboard holdings table shows top 20 by allocation, with "View all" link | Keeps dashboard scannable. Full list on dedicated Holdings page. |
| AD-S15-3 | Staleness banner adapts text based on stale ratio | < 20% stale: "N instruments stale." ≥ 80% stale: "Prices updating — N of M instruments refreshed so far." |
| AD-S15-4 | Provider chain for quotes becomes: Tiingo IEX (batch) → FMP (single) → AV (single) → cache | Tiingo batch is cheapest per-instrument. FMP and AV remain as single-symbol fallbacks. |

---

## 5. Pre-Session Checklist for Product Owner

Before S15 kicks off, the product owner should:

1. **Confirm Tiingo IEX is acceptable as primary quote source.** Tiingo IEX provides 15-minute delayed quotes (same as FMP free tier). No real-time data without paid tier. This is acceptable for the "checks daily or weekly" user profile.
2. **Confirm dashboard truncation to top-20 holdings.** The full list moves to the Holdings page. Dashboard becomes a summary view.
3. **Confirm staleness banner text adaptation.** The "prices updating" language during initial population is less alarming than "80 instruments stale."
4. **Run the app in a browser and note any visual issues.** Even a 5-minute walkthrough would generate a punch list for the session to address alongside the quote pipeline work.
