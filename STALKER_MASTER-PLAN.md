# STALKER Master Plan — Engineering Roadmap

**Project:** Stock & Portfolio Tracker + LLM Advisor (Codename: STALKER)
**Version:** 5.0
**Date:** 2026-02-28
**Author:** Engineering Lead
**Status:** Complete — Production Ready

### Changelog

| Version | Date | Changes |
|---------|------|---------|
| 5.0 | 2026-02-28 | S12–S20 complete. All post-MVP priorities delivered (13/14, 1 accepted deferral). Zero functional limitations. 720 tests, 62 files. Project close-out. AD-S12a through AD-S20-3. All open risks closed or accepted. Lessons L-11 through L-20. |
| 4.0 | 2026-02-24 | S10 + S11 complete. Phase II epics/sessions added (S11–S13). Provider architecture updated (Stooq → Tiingo, FMP v3 → stable). Addendum folded into master plan. AD-S10a through AD-P2-11. |
| 3.0 | 2026-02-24 | MVP shipped. S1–S9 complete. Epic 10 + Session 10 added. AD-S7 through AD-S9b. Final MVP metrics. |
| 2.0 | 2026-02-22 | S1–S6 complete. AD-S1 through AD-S6. Lessons learned section added. |
| 1.0 | 2026-02-21 | Initial roadmap. 9 sessions across 10 epics. |

---

## 1. Strategic Context

STALKER is a local-first, event-sourced portfolio tracker with an LLM-powered advisor. The system runs entirely on a Mac dev machine: SQLite database, Next.js App Router, standalone scheduler process, and market data providers (FMP, Tiingo, Alpha Vantage).

The architecture has three load-bearing invariants:

1. **Event-sourced core:** Transactions + PriceBars are the sole source of truth. Everything else is a rebuildable cache.
2. **Decimal precision everywhere:** No `number` type touches money or quantity in business logic. All financial arithmetic uses `Decimal.js`.
3. **Sell validation invariant:** At every point in chronological order, per instrument, `cumulative_buy_qty >= cumulative_sell_qty`. This is enforced on every write.

### Priority Order (Global)

```
Correctness (PnL math) > Core CRUD > Market Data > Dashboard UI > Advisor > Polish
```

### Target User Profile

A technically literate individual tracking 83 ETFs/stocks. Not day-trading. Checks portfolio daily or weekly. Has historical trades imported via bulk paste. Low tolerance for incorrect numbers, high tolerance for information density. Running on a Mac at desktop resolution.

### Current State Summary

The project is **complete** after 20 sessions with zero scope cuts. The MVP shipped at Session 9 (749/749 PnL cross-validation). Sessions 10–13 hardened the foundation, integrated live providers, and loaded a real 83-instrument portfolio. Sessions 14–17 resolved data integrity, quote pipeline, UX scale, and production hardening issues. Sessions 18–19 addressed visual polish and advisor context window management. Session 20 fixed a rolling summary trigger bug, added missing test coverage, consolidated message converters, and brought all documentation current.

**Production portfolio:** 83 instruments, 87 transactions, ~53,600 price bars, 813 snapshots (Dec 2022 – present). All functional limitations resolved. Three operational trade-offs accepted (KL-4/5/6). 720 tests passing across 62 files.

---

## 2. Epic Breakdown

### Epic 0: Project Scaffolding & Data Foundation ✅

**Status:** ✅ Complete (Session 1)
**Depends on:** Nothing | **Blocks:** All other epics

---

### Epic 1: Market Data Service ✅

**Status:** ✅ Complete (Session 2, updated S11, S15)
**Notes:** S2 built original providers. S11 migrated FMP to `/stable/`, replaced Stooq with Tiingo. S15 added Tiingo IEX batch quotes.
**Depends on:** Epic 0 | **Blocks:** Epic 3, Epic 4

---

### Epic 2: Analytics Engine ✅

**Status:** ✅ Complete (Sessions 1 + 3)
**Depends on:** Epic 0 | **Blocks:** Epic 3, Epic 7, Epic 8

---

### Epic 3: API Layer ✅

**Status:** ✅ Complete (Session 4, wired live S12)
**Notes:** API stubs wired to live providers in S12. Zero stubs remaining.
**Depends on:** Epic 0, 1, 2 | **Blocks:** Epic 6, Epic 7

---

### Epic 4: Scheduler ✅

**Status:** ✅ Complete (Session 2, updated S11, S15)
**Notes:** S15 rewired to Tiingo batch polling (1 API call = all instruments).
**Depends on:** Epic 0, 1 | **Blocks:** Nothing

---

### Epic 5: UI Foundation ✅

**Status:** ✅ Complete (Session 5)
**Depends on:** Epic 0 | **Blocks:** Epic 6

---

### Epic 6: UI Core Pages ✅

**Sub-epics:**
- Epic 6A: Dashboard + Holdings ✅ (Session 6, consolidated S16)
- Epic 6B: Holding Detail + Transactions + Charts ✅ (Session 7, enhanced S17)

**Depends on:** Epic 3, 5 | **Blocks:** Epic 7

---

### Epic 7: LLM Advisor ✅

**Status:** ✅ Complete (Session 8, enhanced S17, S19, S20)
**Notes:** S17 added `getTopHoldings` tool. S19 added context window management. S20 fixed rolling summary trigger.
**Depends on:** Epic 2, 3, 5 | **Blocks:** Nothing

---

### Epic 8: PnL Validation & Testing ✅

**Status:** ✅ Complete (Session 3 fixtures; Session 9 cross-validation + signoff)
**Depends on:** Epic 2 | **Blocks:** MVP signoff ✅

---

### Epic 9: MVP Polish ✅

**Status:** ✅ Complete (Session 9)
**Depends on:** All core epics | **Blocks:** Nothing

---

### Epic 10: Post-MVP Hardening + Bulk Paste + CI ✅

**Status:** ✅ Complete (Session 10)
**Depends on:** Session 9 | **Blocks:** Phase II

---

### Epic 11: Provider Integration + Live API Wiring ✅

**Status:** ✅ Complete (S11 + S12)
**Notes:** S11 provider migration. S12 wired all API stubs, E2E verification, 15-instrument pipeline soak, 72 new tests.
**Depends on:** Epic 10 | **Blocks:** Epic 12

---

### Epic 12: User Acceptance Testing ✅

**Status:** ✅ Complete (Session 13)
**Notes:** Loaded real portfolio: 83 instruments, 87 transactions. 12+ UX hotfixes. Auto-create instruments.
**Depends on:** Epic 11 | **Blocks:** Production use

---

### Post-Phase II: Production Hardening (S14–S20)

| Session | Scope | Status |
|---------|-------|--------|
| S14 | Data integrity (dedup), rebuild performance (4s), name resolution | ✅ |
| S15 | Tiingo batch quotes, scheduler rewire, dashboard scale UX | ✅ |
| S16 | UX consolidation: 5→3 tabs, portfolio table, chart markers, delete instrument | ✅ |
| S17 | Transaction UX closure, advisor getTopHoldings, NYSE holidays | ✅ |
| S18 | Visual UAT: 10yr backfill, re-backfill script, Avg Cost column, UX fixes | ✅ |
| S19 | Advisor context window: token estimation, windowing, rolling summaries | ✅ |
| S20 | Hardening: rolling summary fix, test gap, converter consolidation, docs close-out | ✅ |

---

## 3. Session Plan

### Dependency Chain (Complete)

```
Session 1 (Scaffolding + Data + Calendar + Analytics Core) ✅
    ├──→ Session 2 (Market Data Service + Scheduler) ✅
    └──→ Session 3 (Analytics Completion + PnL Fixtures) ✅
              └──→ Session 4 (API Layer) ✅
                        ├──→ Session 5 (UI Foundation + Empty States) ✅
                        │         └──→ Session 6 (Dashboard + Holdings UI) ✅
                        │                   └──→ Session 7 (Detail + Transactions + Charts UI) ✅
                        └──→ Session 8 (LLM Advisor Backend + Frontend) ✅
                                          └──→ Session 9 (Full-Stack Validation + MVP Signoff) ✅
                                                        └──→ Session 10 (Hardening + Bulk Paste + CI) ✅
                                                                      └──→ Session 11 (Provider Integration) ✅
                                                                                    └──→ Session 12 (API Wiring + Pipeline Soak) ✅
                                                                                                  └──→ Session 13 (UAT with Real Portfolio) ✅
                                                                                                                └──→ Sessions 14–20 (Production Hardening) ✅
```

### Session Overview

| Session | Scope | Team Shape | Tests | Status |
|---------|-------|------------|-------|--------|
| 1 | Monorepo, Prisma, shared utils, MarketCalendar, FIFO lot engine | Lead + 2 parallel | 71 | ✅ |
| 2 | Market data providers, rate limiter, fallback, scheduler | Lead + 2 parallel | 162 | ✅ |
| 3 | Portfolio value series, snapshot rebuild, reference fixtures | Lead + 2 sequenced | 218 | ✅ |
| 4 | All API endpoints, instrument creation, transaction validation | Lead + 2 parallel | 275 | ✅ |
| 5 | Tailwind config, design tokens, base components, layout shell | Lead + 2 parallel | 324 | ✅ |
| 6 | Dashboard, holdings, TradingView charts, data health footer | Lead + 2 parallel | 363 | ✅ |
| 7 | Holding detail, transactions, add/edit forms, charts page | Lead + 2 parallel | ~407 | ✅ |
| 8 | LLM adapter, tools, system prompt, chat panel UI, threads | Lead + 2 sequenced | ~435 | ✅ |
| 9 | Full-stack cross-validation, accessibility, **MVP signoff** | Lead Phase 0 + parallel | 469 | ✅ |
| 10 | Correctness fixes, bulk paste, CI, accessibility polish | Lead Phase 0 + parallel | ~510 | ✅ |
| 11 | FMP stable migration, Tiingo provider, provider chain rewiring | Solo (reactive) | 526 | ✅ |
| 12 | Wire API stubs, E2E verification, pipeline soak, 72 new tests | Lead Phase 0 + parallel | 598 | ✅ |
| 13 | UAT with real portfolio (83 instruments), 12+ UX hotfixes | Lead + browser UAT | 598 | ✅ |
| 14 | Data integrity (dedup), rebuild perf (4s), name resolution | Solo | 602 | ✅ |
| 15 | Tiingo batch quotes, scheduler rewire, dashboard scale UX | Solo | 631 | ✅ |
| 16 | UX consolidation: 5→3 tabs, portfolio table, chart markers | Lead + 1 parallel | 659 | ✅ |
| 17 | Transaction UX, advisor getTopHoldings, NYSE holidays. **Production ready.** | Solo | 677 | ✅ |
| 18 | Visual UAT: 10yr backfill, re-backfill, Avg Cost, UX fixes | Solo | 683 | ✅ |
| 19 | Advisor context window: token estimation, windowing, summaries | Solo | 718 | ✅ |
| 20 | Hardening: rolling summary fix, test gap, converter consolidation, docs | Solo | 720 | ✅ |

---

## 4. Strategic Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| SD-1 | Event-sourced core with rebuildable caches | Correctness guarantee. Transactions + PriceBars are truth. |
| SD-2 | SQLite + Prisma for data layer | Zero-config local. Prisma makes Postgres migration trivial. |
| SD-3 | Decimal.js for all financial math | Exact decimal representation. No float drift. SQLite stores as TEXT. |
| SD-4 | Providers: FMP + Tiingo + Alpha Vantage | FMP for search/quotes, Tiingo for history + batch quotes, AV as backup. |
| SD-5 | NYSE holiday calendar + weekday check | Holiday-aware scheduling for US exchanges. Updated S17. |
| SD-6 | TradingView Lightweight Charts | MIT license, purpose-built for financial data, tiny bundle. |
| SD-7 | Standalone scheduler process | Next.js request-scoped execution doesn't support long-lived polling. |
| SD-8 | Advisor reads cached data only | Small, predictable tool surface. No side effects from chat. |
| SD-9 | FIFO lot accounting only | Industry standard for retail. Matches brokerage statements. |
| SD-10 | Overlay chart deferred | UI-only work. Daily bars pipeline in place. |
| SD-11 | Bookworm design system adaptation | Dark-theme foundation with proven components. |

---

## 5. Architecture Decisions from Execution

### MVP Phase (S1–S9)

| # | Session | Decision | Rationale |
|---|---------|----------|-----------|
| AD-S1 | S1 | Prisma Decimal stored as TEXT in SQLite | SQLite has no native DECIMAL type. TEXT preserves exact representation. |
| AD-S4 | S4 | Sell validation returns HTTP 422 with structured error body | Structured error enables actionable UI error messages. |
| AD-S6a | S6 | Client-side `fetch` + `useState`/`useEffect`, no SWR | Minimal dependencies. Single user, no cache invalidation needed. |
| AD-S6b | S6 | TradingView v5 with `useRef` lifecycle pattern | Imperative chart API requires ref-based create/dispose. |
| AD-S6c | S6 | `Number()` exception only in chart-utils files | TradingView requires native numbers. All other code uses Decimal pipeline. |
| AD-S6d | S6 | Enriched seed: 28 instruments, 30 transactions, 8300+ bars | Realistic data environment for UI development. |
| AD-S7 | S7 | Extract shared `useChart` hook | Prevents two divergent chart lifecycles. |
| AD-S9a | S9 | Adaptive thinking for advisor | Lets Claude decide when to use extended thinking. |
| AD-S9b | S9 | `\|\|` over `??` for string coalescion in tool loop | Empty strings from LLM should trigger the fallback. |

### Post-MVP Hardening (S10)

| # | Session | Decision | Rationale |
|---|---------|----------|-----------|
| AD-S10a | S10 | Snapshot rebuild in Prisma `$transaction` | Prevents partial snapshots under concurrent writes. |
| AD-S10b | S10 | `POST /api/portfolio/rebuild` replaces GET side effect | HTTP semantic correctness. |
| AD-S10c | S10 | Bulk paste is atomic — all rows or none | Partial imports create confusing state. |
| AD-S10d | S10 | Bulk endpoint dry-run pattern | UI preview without committing. |

### Phase II — Provider Integration (S11–S12)

| # | Session | Decision | Rationale |
|---|---------|----------|-----------|
| AD-P2-6 | S11 | Tiingo replaces Stooq as daily bars provider | Proper REST API, documented limits, 30+ years free data. |
| AD-P2-7 | S11 | FMP reduced to search + quotes only | Free tier no longer includes historical data. |
| AD-P2-8 | S11 | FMP migrated to `/stable/` endpoints | Entire v3 namespace discontinued. |
| AD-P2-9 | S11 | Use Tiingo adjusted prices | Accounts for splits and dividends. |
| AD-P2-10 | S11 | JSON number → Decimal via String intermediary | Prevents float contamination. |
| AD-P2-11 | S11 | Tiingo rate limiter uses per-hour bucket | Tiingo's primary limit is 50/hr. |
| AD-S12a | S12 | `getMarketDataService()` singleton factory | Avoids reconstructing providers on every request. |
| AD-S12b | S12 | Fire-and-forget backfill in instrument creation | Response returns immediately, backfill runs async. |
| AD-S12c | S12 | providerSymbolMap uses `tiingo` key | Symbol mapping: dots→hyphens (BRK.B→BRK-B). |

### UAT + Data Integrity (S13–S14)

| # | Session | Decision | Rationale |
|---|---------|----------|-----------|
| AD-S13a | S13 | Auto-create instruments on transaction add | `findOrCreateInstrument()` checks exists, tries FMP search, creates with defaults. |
| AD-S13b | S13 | SQLite contention fix for bulk import | Skip backfill on create, queue backfills sequentially after response. |
| AD-S13c | S13 | Prisma timeout 30s → 600s for large portfolios | 83-instrument rebuild requires extended timeout. |
| AD-S14-1 | S14 | Dedup by exact match on (instrumentId, type, qty, price, tradeAt) | Conservative. Two trades at different prices on same day are distinct. |
| AD-S14-2 | S14 | Decimal.eq() for quantity/price comparison | String comparison fails if Prisma returns "50.00" vs "50". |
| AD-S14-3 | S14 | BatchPriceLookup: single query, in-memory Map, binary search | O(1) lookup. 150x speedup. Rebuild: 4s (was minutes). |
| AD-S14-4 | S14 | Instrument name resolution as one-time script | FMP calls expensive. One-time resolution, not on every startup. |

### Scale UX + Production Hardening (S15–S18)

| # | Session | Decision | Rationale |
|---|---------|----------|-----------|
| AD-S15-1 | S15 | Tiingo IEX batch as primary quote source | 1 API call = all instruments. Eliminates quote starvation. |
| AD-S15-2 | S15 | Dashboard shows top 20 holdings | 83 rows defeats "health at a glance" goal. |
| AD-S15-3 | S15 | Adaptive staleness banner | "80 stale" reads as failure; "Prices updating" reads as progress. |
| AD-S15-4 | S15 | Quote chain: Tiingo batch → FMP single → AV single | Cheapest first. FMP/AV for instruments Tiingo misses. |
| AD-S16-1 | S16 | 3-tab navigation (Portfolio, Charts, Settings) | Redundant data across 5 tabs. Single view more intuitive at scale. |
| AD-S16-2 | S16 | First BUY date as purchase date | Tax awareness — short vs long-term holding period. |
| AD-S16-3 | S16 | Chart markers on per-instrument charts only | Portfolio area chart too noisy with 83 instruments. |
| AD-S16-4 | S16 | TradingView v5 `createSeriesMarkers()` plugin | `series.setMarkers()` deprecated in v5. |
| AD-S16-5 | S16 | Client-side pagination (20/page) | Simple, sufficient for ~83 instruments. |
| AD-S16-6 | S16 | `parseFloat()` exception in chart-marker-utils.ts | Third TradingView Number() exception. |
| AD-S17-1 | S17 | Transaction CRUD on Holding Detail page | Transactions page deleted in S16. Detail shows per-instrument transactions. |
| AD-S17-2 | S17 | `getTopHoldings` advisor tool | Top-N reduces token usage vs full 83-instrument dump. |
| AD-S17-3 | S17 | Portfolio summary in advisor snapshot | High-level facts without forcing LLM to parse all rows. |
| AD-S17-4 | S17 | Static NYSE holiday list (2025-2026) | Annual manual update acceptable for single-user app. |
| AD-S17-5 | S17 | Reuse existing transaction components | Added `defaultInstrumentId` prop for holding-scoped usage. |
| AD-S18-1 | S18 | Backfill lookback: 10 years | Tiingo provides 30+ years free. Covers any reasonable history. |
| AD-S18-2 | S18 | Holding detail refetch retries once on 500 | Transient SQLite contention. Single retry with 500ms delay. |
| AD-S18-3 | S18 | Avg Cost = costBasis / totalQuantity | Standard brokerage column. Guards divide-by-zero. |
| AD-S18-4 | S18 | Re-backfill is one-time script | Existing instruments needed gap fill. Future instruments get 10yr automatically. |
| AD-S18-5 | S18 | useHoldings skips loading skeleton on refetch | Prevents PortfolioTable unmount destroying pagination/scroll. |

### Advisor Context Window + Close-Out (S19–S20)

| # | Session | Decision | Rationale |
|---|---------|----------|-----------|
| AD-S19-1 | S19 | Token estimation via character-ratio heuristic (3.0–3.5) | Conservative overestimation is safe. No external dependency. |
| AD-S19-2 | S19 | Message windowing trims at turn boundaries | Prevents orphaned tool results or context-free responses. |
| AD-S19-3 | S19 | Summary triggered by shouldGenerateSummary signal | Decouples "when" from "how". |
| AD-S19-4 | S19 | Summary: same adapter, minimal prompt, no tools | ~1,800 tokens per summary. Reuses infrastructure. |
| AD-S19-5 | S19 | Summary is fire-and-forget, non-blocking | User gets answer immediately. Failure degrades gracefully. |
| AD-S19-6 | S19 | summaryText not exposed to frontend | Internal to LLM context. Users see indicator only. |
| AD-S20-1 | S20 | Rolling summary fires on every trim, not just first | Original `!summaryText` guard made merge path unreachable. |
| AD-S20-2 | S20 | Single message conversion pipeline | `parsePrismaMessage → windowableToMessage`. Eliminated dual converter. |
| AD-S20-3 | S20 | Token calibration logging in dev mode only | Zero production overhead. Validates char/token heuristic. |

---

## 6. Provider Architecture (Binding — Updated S15)

### Provider Matrix

| Provider | Role | Endpoints | Free Tier Limits | API Key |
|----------|------|-----------|-----------------|---------|
| **FMP** | Symbol search, single-symbol fallback quotes | `/stable/search-symbol`, `/stable/quote` | 250 req/day | `FMP_API_KEY` |
| **Tiingo** | Historical daily bars, **batch quotes (primary)** | `/tiingo/daily/{sym}/prices`, `/iex/?tickers=...` | 1,000/day, 50/hr, 500 sym/mo | `TIINGO_API_KEY` |
| **Alpha Vantage** | Backup quotes only | `GLOBAL_QUOTE` | 25 req/day | `ALPHA_VANTAGE_API_KEY` |

### Provider Chain (Updated S15)

```
Symbol Search:    FMP only (Tiingo and AV have no search)
Batch Quotes:     Tiingo IEX batch (all instruments in 1 call) → FMP single → AV single
Historical Bars:  Tiingo only (FMP can't, AV free tier too limited)
```

### Stooq Disposition

Code preserved at `packages/market-data/src/providers/stooq.ts` with deprecation comment. Removed from all active chains.

---

## 7. Risk Register

### Closed Risks

| # | Risk | Resolution |
|---|------|------------|
| R-1 | FIFO lot math edge cases | ✅ S9: 749/749 cross-validation. |
| R-3 | TradingView theming too limited | ✅ S6: v5 API works with custom dark theme. |
| R-4 | Prisma Decimal + SQLite TEXT issues | ✅ S9: AD-S1 discipline held through 20 sessions. |
| R-5 | Advisor system prompt quality | ✅ S9: 5/5 intent categories passed. |
| R-7 | DM Sans tabular-nums | ✅ S5/S6: `font-mono` applied. |
| R-8 | Sell validation error UX | ✅ S7: SellValidationError component. |
| R-9 | Multi-fetch waterfall | ✅ S7: `Promise.all`. |
| R-10 | Concurrent snapshot rebuild writes | ✅ S10: AD-S10a, Prisma `$transaction`. |
| R-II-1 | FMP response shape | ✅ S11: Migrated to `/stable/`. |
| R-II-2 | Stooq unreliable | ✅ S11: Replaced by Tiingo. |
| R-II-3 | Rate limiter in-flight requests | ✅ S12: Live API testing confirmed acceptable. |
| R-II-8 | Decimal precision loss | ✅ S12: E2E validated. |
| R-II-9 | Tiingo 500-symbol/month | ✅ S13: 83 instruments well under 500. |
| R-II-11 | FMP search missing `type` | ✅ S11: `type` optional with default. |
| R-II-12 | Tiingo HTTP 200 text error | ✅ S12: Regression test added. |
| R-6 | Snapshot rebuild at scale | ✅ S14: BatchPriceLookup → ~4s for 83 instruments. |

### Accepted Risks (Operational Trade-offs)

| # | Risk | Status | Notes |
|---|------|--------|-------|
| R-2 | Free-tier API limits change | Accepted | Limits are env-configurable. |
| R-11 | Bulk paste encoding edge cases | Accepted | Parser normalizes. |
| R-II-10 | FMP stable field name changes | Accepted | Mock fixtures catch changes. |
| R-II-13 | Single-provider dependency | Accepted | FMP for search, Tiingo for history. No cost-effective redundancy. |

---

## 8. Lessons Learned

| # | Lesson | Evidence |
|---|--------|----------|
| L-1 | **Lead integration pass catches real bugs.** | S6, S9, S10, S13. |
| L-2 | **Enriched seed data pays for itself immediately.** | Used through S20 without modification. |
| L-3 | **Zero scope cuts through 20 sessions.** | Not a single planned deliverable was dropped. |
| L-4 | **Test progression is healthy and consistent.** | 71 → 720, 10× growth. |
| L-5 | **`Number()` exception discipline is holding.** | 3 approved exceptions (chart-utils, chart-candlestick-utils, chart-marker-utils). |
| L-6 | **Parallel teammate mode works with filesystem scopes.** | Zero merge conflicts across all multi-agent sessions. |
| L-7 | **Architecture review before live data catches systemic risks.** | W-3/W-4 caught before data corruption. |
| L-8 | **Cross-validation scripts must be in CI.** | 749 checks run on every push. |
| L-9 | **Smoke-test live APIs before building against mocks.** | S11 caught dead endpoints. Should have been done before S4. |
| L-10 | **Provider interfaces absorb external API breakage.** | Tiingo slotted into Stooq's shape with zero upstream changes. |
| L-11 | **SQLite write contention is real with concurrent backfills.** | S13: Two-phase approach (create, then queue backfills). |
| L-12 | **BatchPriceLookup pattern: preload once, binary search many.** | S14: 150× speedup. O(1) exact, O(log n) carry-forward. |
| L-13 | **Batch API calls eliminate provider budget pressure.** | S15: Tiingo IEX batch = 1 call for all instruments vs 83 individual calls. |
| L-14 | **UX must adapt to data scale.** | S15/S16: Dashboard top-20, 3-tab consolidation, pagination. |
| L-15 | **Reuse existing components with props, don't rebuild.** | S17: `defaultInstrumentId` prop gave full transaction CRUD on Holding Detail. |
| L-16 | **Rolling summary trigger must not guard on existing summary.** | S20: `!summaryText` made merge path unreachable. |
| L-17 | **Dual converters are a maintenance trap.** | S20: Consolidated to single pipeline before they diverged. |

---

## 9. Not in Roadmap

Ideas explicitly deferred — discretionary if user needs evolve:

- Dividends, splits, corporate actions
- Intraday price history
- Full CSV import/export with column mapping
- Multi-currency / FX conversion
- Multi-user, auth, cloud deployment
- Alerts, watchlists, notifications
- Manual price overrides for delisted instruments
- ~~Full holiday/half-day market calendar~~ — NYSE holidays implemented (S17). Half-days not tracked.
- Advisor web search and on-demand refresh tools
- Advisor hypothetical calculations
- ~~Advisor context window management / summary generation~~ — Implemented (S19–S20)
- Overlay/compare chart (Spec §9.4)
- Mobile-native app
- Brokerage API integrations
- Responsive tablet/mobile layout refinements (accepted deferral — user is on desktop)

---

## 10. Session Status Tracker

| Session | Status | Date | Tests | Notes |
|---------|--------|------|-------|-------|
| 1 | ✅ | 2026-02-21 | 71 | Foundation + FIFO engine. |
| 2 | ✅ | 2026-02-21 | 162 (+91) | Market data providers + scheduler. |
| 3 | ✅ | 2026-02-21 | 218 (+56) | Analytics completion + PnL fixtures. |
| 4 | ✅ | 2026-02-22 | 275 (+57) | Full API layer. |
| 5 | ✅ | 2026-02-22 | 324 (+49) | UI foundation + components. |
| 6 | ✅ | 2026-02-22 | 363 (+39) | Dashboard + holdings. |
| 7 | ✅ | 2026-02-23 | ~407 (+44) | Detail + transactions + charts. |
| 8 | ✅ | 2026-02-23 | ~435 (+28) | LLM Advisor backend → frontend. |
| 9 | ✅ | 2026-02-24 | 469 (+34) | Full-stack validation. **MVP shipped.** |
| 10 | ✅ | 2026-02-24 | ~510 (+41) | Hardening + Bulk Paste + CI. |
| 11 | ✅ | 2026-02-24 | 526 (+16) | Provider integration. Stooq → Tiingo. |
| 12 | ✅ | 2026-02-24 | 598 (+72) | API wiring + E2E + pipeline soak. |
| 13 | ✅ | 2026-02-25 | 598 (+0) | UAT with 83-instrument real portfolio. |
| 14 | ✅ | 2026-02-25 | 602 (+4) | Data integrity, rebuild perf (4s). |
| 15 | ✅ | 2026-02-26 | 631 (+29) | Tiingo batch quotes, scale UX. |
| 16 | ✅ | 2026-02-26 | 659 (+28) | UX consolidation: 5→3 tabs. |
| 17 | ✅ | 2026-02-26 | 677 (+18) | Production ready. NYSE holidays. |
| 18 | ✅ | 2026-02-26 | 683 (+6) | Visual UAT. 10yr backfill. |
| 19 | ✅ | 2026-02-27 | 718 (+35) | Context window management. |
| 20 | ✅ | 2026-02-28 | 720 (+2) | Close-out. Rolling summary fix. |

### Test Progression

```
S1:  ████ 71
S2:  ████████ 162
S3:  ███████████ 218
S4:  ██████████████ 275
S5:  ████████████████ 324
S6:  ██████████████████ 363
S7:  ████████████████████ ~407
S8:  █████████████████████ ~435
S9:  ███████████████████████ 469
S10: █████████████████████████ ~510
S11: ██████████████████████████ 526
S12: █████████████████████████████ 598
S13: █████████████████████████████ 598
S14: ██████████████████████████████ 602
S15: ███████████████████████████████ 631
S16: █████████████████████████████████ 659
S17: ██████████████████████████████████ 677
S18: ██████████████████████████████████ 683
S19: ████████████████████████████████████ 718
S20: ████████████████████████████████████ 720
```

### Final Metrics (Post-Session 20)

| Metric | Value |
|--------|-------|
| Test count | 720 |
| Test files | 62 |
| TypeScript errors | 0 |
| Packages | 5 of 5 |
| API endpoints | 22 (all implemented) |
| UI components | 49 |
| Data hooks | 12 |
| Utility modules | 19 |
| UI pages | 4 (Portfolio, Charts, Holding Detail, Settings) |
| Prisma tables | 7 of 7 |
| Market data providers | 3 active (FMP, Tiingo, AV) + 1 deprecated (Stooq) |
| Advisor tools | 5 (getTopHoldings, getPortfolioSnapshot, getHolding, getTransactions, getQuotes) |
| Real portfolio | 83 instruments, 87 transactions, ~53,600 bars, 813 snapshots |
| Snapshot rebuild | ~4s for 83 instruments |
| MVP acceptance criteria | 21/21 |
| PnL cross-validation | 749/749 |
| Sessions completed | 20 of 20 |
| Scope cuts | 0 |

### Project Status

```
Production use — active. All planned work complete.
Only discretionary enhancements remain (responsive layout, overlay charts).
```

---

## 11. Post-MVP Priorities

| # | Priority | Status |
|---|----------|--------|
| 1 | Bulk transaction paste | ✅ S10 |
| 2 | Provider integration testing | ✅ S11 |
| 3 | Wire stubs to live providers | ✅ S12 |
| 4 | UAT with real portfolio | ✅ S13 |
| 5 | Bulk import idempotency | ✅ S14 |
| 6 | Instrument name resolution | ✅ S14 |
| 7 | Quote pipeline unblock | ✅ S15 |
| 8 | UX consolidation | ✅ S16 |
| 9 | Transaction UX gap closure | ✅ S17 |
| 10 | Holiday market calendar | ✅ S17 |
| 11 | Advisor 83-instrument tuning | ✅ S17 |
| 12 | Visual UAT fixes | ✅ S18 |
| 13 | Advisor context window management | ✅ S19–S20 |
| 14 | Responsive refinements | Deferred (user on desktop) |

---

## 12. Environment Configuration (Binding)

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
