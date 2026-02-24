# STALKER Phase II — Addendum (Post-Phase 0)

**Date:** 2026-02-24
**Author:** Systems Architect
**Supersedes:** Relevant sections of STALKER_PHASE-II_PRE-MVP.md, STALKER_MASTER-PLAN.md, SPEC_v4.md
**Status:** Binding — all sessions S11+ must read this document

---

## 0. Why This Addendum Exists

Phase 0 (manual smoke testing of live APIs) revealed that core assumptions in the spec and planning documents are wrong. Rather than rewrite three documents, this addendum captures every change in one place. **If this document contradicts the Phase II plan, Master Plan, or Spec, this document wins.**

---

## 1. Provider Architecture Change

### What Changed

| Document | Assumption | Reality |
|---|---|---|
| SPEC v4.0 §6.2 | FMP provides quotes + search + **history** | FMP free tier **no longer provides history** (premium-only since stable API migration) |
| SPEC v4.0 §6.2 | Stooq provides historical daily bars via CSV | Stooq has no formal API, CAPTCHA risk, IP rate limiting — **replaced by Tiingo** |
| SPEC v4.0 §6.2 | FMP endpoint: `/api/v3/...` | `/api/v3/` is **dead** for post-Aug-2025 accounts. Replaced by `/stable/...` |
| Master Plan SD-4 | Three providers: FMP, Stooq, Alpha Vantage | Three providers: **FMP, Tiingo, Alpha Vantage** |
| Phase II Plan §S11 | Fix response shape mismatches for existing providers | **Rewrite FMP URLs entirely** + **build new Tiingo provider** |

### New Provider Matrix (Binding)

| Provider | Role | Endpoints | Free Tier Limits | API Key Env Var |
|---|---|---|---|---|
| **FMP** | Symbol search, real-time quotes | `/stable/search-symbol`, `/stable/quote` | 250 req/day | `FMP_API_KEY` |
| **Tiingo** | Historical daily bars, backup quotes | `/tiingo/daily/{sym}/prices`, `/iex/{sym}` | 1,000 req/day, 50/hr, 500 symbols/mo | `TIINGO_API_KEY` |
| **Alpha Vantage** | Backup quotes only | `GLOBAL_QUOTE` | 25 req/day | `ALPHA_VANTAGE_API_KEY` |

### Provider Chain (Binding)

```
Symbol Search:    FMP only (Tiingo and AV have no search)
Real-time Quotes: FMP → Alpha Vantage → cached LatestQuote
Historical Bars:  Tiingo only (FMP can't, AV free tier too limited)
```

### Stooq Disposition

Stooq code (`packages/market-data/src/providers/stooq.ts`) is **deprecated** as of Session 11. Not deleted — kept as reference. Removed from all active provider chains. All Stooq mock tests remain but are marked as legacy.

---

## 2. Architecture Decisions (Phase II)

These supplement the decisions in STALKER_MASTER-PLAN.md §4 and STALKER_PHASE-II_PRE-MVP.md §5.

| # | Decision | Rationale |
|---|---|---|
| AD-P2-6 | Tiingo replaces Stooq as historical daily bars provider | Proper REST API, JSON responses, documented rate limits, 30+ years free data, no CAPTCHA risk |
| AD-P2-7 | FMP role reduced to search + quotes only | Free tier no longer includes `/stable/historical-price-eod/full`. No architecture impact — `MarketDataProvider` interface is function-level granular. |
| AD-P2-8 | FMP migrated from `/api/v3/` to `/stable/` endpoints | Entire v3 namespace discontinued for new accounts after Aug 31, 2025. Not a gradual deprecation — hard cutoff. |
| AD-P2-9 | Use Tiingo adjusted prices (`adjClose`, `adjOpen`, etc.) | Adjusted prices account for splits and dividends. Matches what Stooq provided and what users expect for historical portfolio value computation. |
| AD-P2-10 | JSON number → Decimal via String intermediary | `new Decimal(String(jsonNumber))` not `new Decimal(jsonNumber)`. Both FMP and Tiingo return prices as JSON numbers. Direct number-to-Decimal risks float contamination. |
| AD-P2-11 | Tiingo rate limiter uses per-hour bucket (new) | Tiingo's primary rate limit is 50/hr (not per-minute like FMP). Rate limiter gains per-hour bucket type. |

---

## 3. Risk Register Updates

### Closed Risks

| # | Risk | Status | Resolution |
|---|---|---|---|
| R-II-1 | FMP free tier response shape differs from documentation | ✅ **Closed — worse than expected** | Not just shape changes — entire endpoint namespace dead. Caught in Phase 0. Fixed in S11. |
| R-II-2 | Stooq CSV format varies by symbol or date range | ✅ **Closed — Stooq eliminated** | Replaced by Tiingo. No CSV parsing needed. |

### Updated Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-II-3 | Rate limiter doesn't account for in-flight requests | Medium | High | S11 Phase 1B tests this. Now also must test per-hour bucket for Tiingo. |
| R-II-8 | Decimal precision loss in a path not covered by tests | Medium | Critical | Both FMP and Tiingo return prices as JSON numbers (not strings). S11 adds String intermediary conversion. |

### New Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-II-9 | Tiingo 500-symbol/month limit hit during development + testing | Low | Medium | 15 instruments + testing well under 500. Track unique symbols queried. Reset is monthly. |
| R-II-10 | FMP stable API changes field names again | Low | Medium | Mock fixtures now reflect real responses. Any future change caught by failing tests. |
| R-II-11 | FMP search missing `type` field breaks instrument creation | High | High | S11 makes `type` optional with default `"STOCK"`. |
| R-II-12 | Tiingo HTTP 200 with text error body crashes provider | High | Medium | S11 provider implementation uses try/catch on JSON.parse. |

---

## 4. Impact on Session 12 (Pipeline Soak)

Session 12's plan (STALKER_PHASE-II_PRE-MVP.md §Session 12) is mostly unchanged but needs these adjustments:

### Backfill Source

| Phase II Plan Says | Actual |
|---|---|
| Backfill triggers against Stooq | Backfill triggers against **Tiingo** |

When S12 adds 15 instruments and verifies backfill, the bars come from Tiingo, not Stooq. Verify:
- Tiingo returns bars for all 15 test instruments (including BRK-B with hyphen symbol mapping)
- Bar count and date range match expectations (compare against Yahoo Finance chart range)
- `firstBarDate` is set correctly from Tiingo metadata endpoint

### Polling Budget

| Phase II Plan Assumes | Actual |
|---|---|
| FMP: 250 req/day for quotes + history | FMP: 250 req/day for **quotes only** |
| Stooq: unlimited (no key) | Tiingo: 1,000 req/day, **50/hr** |

The scheduler's budget calculation must account for Tiingo's per-hour limit. With 15 instruments polled every 30 minutes during 6.5 market hours:
- Quote polls: 15 × 13 = 195 FMP calls/day (fits in 250)
- History is only fetched on backfill (one-time), not during polling

The 50/hr Tiingo limit is not a factor for polling (quotes come from FMP, not Tiingo). It only matters during initial backfill — 15 instruments = 15 Tiingo calls, well under 50/hr.

### Monitoring Additions

S12 monitoring protocol should add:
- **Tiingo budget tracking:** Verify Tiingo calls are only on backfill, not during polling
- **FMP stable API behavior:** First full-day test of the new endpoints under sustained use

---

## 5. Impact on Session 13 (UAT)

Session 13's plan is unchanged in structure. The cross-validation methodology (compare STALKER values to brokerage statement) is provider-independent. However:

### Data Quality Consideration

Tiingo adjusted prices (`adjClose`) may differ slightly from what a brokerage shows for historical prices, because:
- Tiingo adjusts for dividends — some brokerages show unadjusted close
- Adjustment calculations may differ by a fraction of a cent
- This is NOT a STALKER bug — it's a data source difference

If S13 cross-validation shows small per-share price discrepancies (< $0.05) in historical PnL, investigate whether it's a Tiingo adjustment issue before treating it as a bug.

### Lot Cost Basis

Cost basis is computed from **transaction prices** (what the user entered), not from provider prices. Provider prices only affect market value and unrealized PnL. So:
- **Cost basis and realized PnL should match brokerage exactly** (same inputs)
- **Unrealized PnL may differ slightly** if current quote timing differs from brokerage snapshot

---

## 6. Impact on SPEC v4.0

If the Spec is updated to v5.0, these sections need changes:

| Section | Change |
|---|---|
| §6.2 Provider Implementations | Replace Stooq row with Tiingo. Update FMP description (search + quotes only, no history). Add Tiingo limits. |
| §6.2 Provider limits table | Add `TIINGO_RPH=50`, `TIINGO_RPD=1000`. Remove Stooq (no key needed). |
| §6.3 Polling Strategy | Note that quote polling uses FMP only. History uses Tiingo on backfill only. |
| §12 Configuration | Add `TIINGO_API_KEY`. Replace `# Stooq needs no key` comment. |
| §4.2 Instrument.providerSymbolMap | Example should include `"tiingo": "BRK-B"` alongside `"fmp": "BRK.B"`. |

These are documentation updates only — no code impact beyond what Session 11 already covers.

---

## 7. Impact on Master Plan

If the Master Plan is updated to v3.0, these sections need changes:

| Section | Change |
|---|---|
| §4 Strategic Decisions | SD-4 updated: "Flat polling" still correct, but provider list is now FMP + Tiingo + AV. |
| §5 Architecture Decisions | Add AD-P2-6 through AD-P2-11 (from this addendum). |
| §7 Risk Register | Close R-II-1, R-II-2. Add R-II-9 through R-II-12. |
| Epic 1 description | Note that Session 2's Stooq implementation is deprecated; Tiingo replaces it in S11. |

---

## 8. Environment Configuration (Binding)

The canonical `.env.local` for Phase II and beyond:

```env
# Database
DATABASE_URL=file:../data/portfolio.db

# Market Data Providers
FMP_API_KEY=your_fmp_key_here
ALPHA_VANTAGE_API_KEY=your_av_key_here
TIINGO_API_KEY=your_tiingo_key_here

# Market Data Provider Limits
FMP_RPM=5
FMP_RPD=250
AV_RPM=5
AV_RPD=25
TIINGO_RPH=50
TIINGO_RPD=1000

# LLM Provider
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_anthropic_key_here
LLM_MODEL=claude-sonnet-4-6

# Scheduler
POLL_INTERVAL_MARKET_HOURS=1800
POST_CLOSE_DELAY=900
```

---

## 9. Document Reading Order for Future Sessions

Any session from S11 onward should read documents in this order:

1. `CLAUDE.md` — Architecture + coding rules
2. `AGENTS.md` — Package inventory
3. **This addendum** (`STALKER_PHASE-II_ADDENDUM.md`) — Overrides stale provider info in all other docs
4. `STALKER_PHASE-II_PRE-MVP.md` — Phase II plan (read with addendum overrides in mind)
5. Session-specific plan and kickoff
6. `data/test/provider-smoke-results.md` — Real API response shapes (for S11)
