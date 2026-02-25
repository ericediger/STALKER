# STALKER Master Plan — Engineering Roadmap

**Project:** Stock & Portfolio Tracker + LLM Advisor (Codename: STALKER)
**Version:** 4.0
**Date:** 2026-02-24
**Author:** Engineering Lead
**Inputs:** SPEC v4.0, Product Brief v3.1, UX/UI Design Plan v1.0, Bookworm Style Guide, Phase II Addendum, SESSION-10-REPORT.md, SESSION-11-REPORT.md
**Status:** Phase II In Progress — Session 12 Ready (API Wiring + Pipeline Soak)

### Changelog

| Version | Date | Changes |
|---------|------|---------|
| 4.0 | 2026-02-24 | S10 + S11 complete. Phase II epics/sessions added (S11–S13). Provider architecture updated (Stooq → Tiingo, FMP v3 → stable). Addendum (STALKER_PHASE-II_ADDENDUM.md) folded into master plan. AD-S10a through AD-P2-11. Risks R-10/R-11 closed, R-II-9 through R-II-12 added. Lessons L-9/L-10. Updated metrics (526 tests, 43 files). |
| 3.0 | 2026-02-24 | MVP shipped. S1–S9 complete. Epic 10 + Session 10 added. AD-S7 through AD-S9b. Resolved R-1/R-4/R-5/R-8/R-9. New R-10/R-11. Lessons L-7/L-8. Final MVP metrics. |
| 2.0 | 2026-02-22 | S1–S6 complete. AD-S1 through AD-S6. Resolved R-3/R-7. Lessons learned section added. |
| 1.0 | 2026-02-21 | Initial roadmap. 9 sessions across 10 epics. |

---

## 1. Strategic Context

STALKER is a local-first, event-sourced portfolio tracker with an LLM-powered advisor. The system runs entirely on a Mac dev machine: SQLite database, Next.js App Router, standalone scheduler process, and market data providers (FMP, Tiingo, Alpha Vantage).

The architecture has three load-bearing invariants that every session must respect:

1. **Event-sourced core:** Transactions + PriceBars are the sole source of truth. Everything else is a rebuildable cache.
2. **Decimal precision everywhere:** No `number` type touches money or quantity in business logic. All financial arithmetic uses `Decimal.js`.
3. **Sell validation invariant:** At every point in chronological order, per instrument, `cumulative_buy_qty >= cumulative_sell_qty`. This is enforced on every write.

### Priority Order (Global)

When scope pressure hits in any session, apply this priority:

```
Correctness (PnL math) > Core CRUD > Market Data > Dashboard UI > Advisor > Polish
```

### Target User Profile

A technically literate individual tracking 15–20 ETFs/stocks. Not day-trading. Checks portfolio daily or weekly. Has historical trades in a spreadsheet. Low tolerance for incorrect numbers, high tolerance for information density. Running on a Mac at desktop resolution.

### Current State Summary

The MVP shipped at the end of Session 9 with 21/21 acceptance criteria and 749/749 PnL cross-validation checks. Session 10 hardened the foundation (concurrent write safety, HTTP semantics, bulk paste, CI). Session 11 was a reactive session that rewired the entire market data provider layer after Phase 0 smoke tests revealed FMP's API had migrated and Stooq was unreliable.

Session 12 wires the API route stubs to live providers, runs E2E verification with real API keys, and soaks the pipeline with 15 real instruments to validate backfill, polling, and data quality before real portfolio data enters the system.

---

## 2. Epic Breakdown

### Epic 0: Project Scaffolding & Data Foundation ✅

**Goal:** Establish the monorepo, database schema, shared packages, and core utilities that every other epic depends on.

**Status:** ✅ Complete (Session 1)
**Depends on:** Nothing
**Blocks:** All other epics

---

### Epic 1: Market Data Service ✅ (Updated S11)

**Goal:** Build the provider-agnostic market data layer with rate limiting, fallback, and caching.

**Deliverables:**
- `MarketDataProvider` interface (Spec 6.1)
- FMP provider implementation (symbol search, quotes via `/stable/` API)
- ~~Stooq provider implementation~~ → **Tiingo provider implementation** (historical daily bars, backup quotes)
- Alpha Vantage provider implementation (backup quotes)
- Token bucket rate limiter per provider (per-minute, per-day, **per-hour** for Tiingo)
- Provider fallback chain (Spec 6.5)
- `LatestQuote` cache management
- Provider symbol mapping (instrument `providerSymbolMap`)

**Status:** ✅ Complete (Session 2, updated Session 11)
**Notes:** Session 2 built original providers (FMP v3, Stooq, AV). Session 11 migrated FMP to `/stable/`, replaced Stooq with Tiingo, added per-hour rate limiter bucket. Stooq code deprecated but preserved.
**Depends on:** Epic 0
**Blocks:** Epic 3, Epic 4

---

### Epic 2: Analytics Engine ✅

**Goal:** Implement the event-sourced analytics core — FIFO lot accounting, PnL computation, and portfolio value series.

**Status:** ✅ Complete (Sessions 1 + 3)
**Depends on:** Epic 0
**Blocks:** Epic 3, Epic 7, Epic 8

---

### Epic 3: API Layer ✅

**Goal:** Build all Next.js App Router API endpoints for instruments, transactions, portfolio analytics, and market data.

**Status:** ✅ Complete (Session 4)
**Notes:** Market data search and refresh routes were initially stubs returning mock data. Stubs remain as of S11; wiring to live providers is Session 12 scope.
**Depends on:** Epic 0, Epic 1, Epic 2
**Blocks:** Epic 6, Epic 7

---

### Epic 4: Scheduler ✅

**Goal:** Build the standalone Node polling process for quote updates and post-close snapshot rebuilds.

**Status:** ✅ Complete (Session 2, updated Session 11)
**Notes:** Session 11 updated scheduler to use TiingoProvider instead of StooqProvider.
**Depends on:** Epic 0, Epic 1
**Blocks:** Nothing

---

### Epic 5: UI Foundation ✅

**Status:** ✅ Complete (Session 5)
**Depends on:** Epic 0
**Blocks:** Epic 6

---

### Epic 6: UI Core Pages ✅

**Sub-epics:**
- Epic 6A: Dashboard + Holdings ✅ (Session 6)
- Epic 6B: Holding Detail + Transactions + Charts ✅ (Session 7)

**Depends on:** Epic 3, Epic 5
**Blocks:** Epic 7

---

### Epic 7: LLM Advisor ✅

**Status:** ✅ Complete (Session 8)
**Depends on:** Epic 2, Epic 3, Epic 5
**Blocks:** Nothing

---

### Epic 8: PnL Validation & Testing ✅

**Status:** ✅ Complete (fixtures in Session 3; cross-validation + signoff in Session 9)
**Depends on:** Epic 2
**Blocks:** MVP signoff ✅

---

### Epic 9: MVP Polish ✅

**Status:** ✅ Complete (Session 9)
**Notes:** Bulk Transaction Paste deferred to Epic 10 (correct call — validation discipline caught W-3/W-4).
**Depends on:** All core epics
**Blocks:** Nothing

---

### Epic 10: Post-MVP Hardening + Bulk Paste + CI ✅

**Goal:** Fix correctness risks under concurrent writes, ship Bulk Transaction Paste, establish CI pipeline.

**Deliverables:**
- Snapshot rebuild in Prisma `$transaction` (W-3 resolution) ✅
- `GET /api/portfolio/snapshot` made read-only; `POST /api/portfolio/rebuild` created (W-4 resolution) ✅
- Snapshot rebuild benchmark (200 transactions, 20 instruments — 147ms) ✅
- Bulk Transaction Paste: parser, batch sell validation, `POST /api/transactions/bulk`, paste UI ✅
- GitHub Actions CI: type-check, test, build gates ✅
- Cross-validation script integrated into Vitest test suite ✅
- `prefers-reduced-motion` support ✅
- W-8 Decimal formatting fix in advisor tool executors ✅

**Status:** ✅ Complete (Session 10)
**Depends on:** Session 9 ✅
**Blocks:** Phase II

---

### Epic 11: Provider Integration + Live API Wiring → Sessions 11–12

**Goal:** Migrate to working market data providers, wire API route stubs to live services, validate end-to-end with real data.

**Deliverables:**
- FMP `/stable/` migration (search + quotes) ✅ (S11)
- Tiingo provider (historical bars, backup quotes) ✅ (S11)
- Rate limiter per-hour bucket ✅ (S11)
- Provider chain rewiring ✅ (S11)
- Stooq deprecation ✅ (S11)
- Wire API route stubs to live MarketDataService 🟡 (S12)
- E2E verification with real API keys 🟡 (S12)
- Pipeline soak: 15 instruments, backfill verification, polling monitoring 🟡 (S12)
- Tiingo HTTP 200 rate limit regression test 🟡 (S12)

**Status:** 🟡 In Progress (S11 complete, S12 planned)
**Depends on:** Epic 10 ✅
**Blocks:** Epic 12 (UAT)

---

### Epic 12: User Acceptance Testing → Session 13

**Goal:** Load real portfolio data, cross-validate against brokerage statements, verify all user flows end-to-end.

**Status:** 🔵 Planned
**Depends on:** Epic 11
**Blocks:** Production use

---

## 3. Session Plan

### Dependency Chain

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
                                                                                    └──→ Session 12 (API Wiring + Pipeline Soak) ← NEXT
                                                                                                  └──→ Session 13 (UAT with Real Portfolio)
```

### Session Overview

| Session | Epic(s) | Scope | Team Shape | Status |
|---------|---------|-------|------------|--------|
| 1 | 0 + 2 (partial) | Monorepo, Prisma, shared utils, MarketCalendar, FIFO lot engine | Lead + 2 parallel | ✅ |
| 2 | 1 + 4 | Market data providers, rate limiter, fallback, scheduler | Lead + 2 parallel | ✅ |
| 3 | 2 (completion) + 8 (partial) | Portfolio value series, snapshot rebuild, reference fixtures | Lead + 2 sequenced | ✅ |
| 4 | 3 | All API endpoints, instrument creation, transaction validation | Lead + 2 parallel | ✅ |
| 5 | 5 | Tailwind config, design tokens, base components, layout shell | Lead + 2 parallel | ✅ |
| 6 | 6A | Dashboard, holdings, TradingView charts, data health footer | Lead + 2 parallel | ✅ |
| 7 | 6B | Holding detail, transactions, add/edit forms, charts page | Lead + 2 parallel | ✅ |
| 8 | 7 | LLM adapter, tools, system prompt, chat panel UI, threads | Lead + 2 sequenced | ✅ |
| 9 | 8 (completion) + 9 | Full-stack cross-validation, accessibility, MVP signoff | Lead Phase 0 + parallel | ✅ |
| 10 | 10 | Correctness fixes, bulk paste, CI, accessibility polish | Lead Phase 0 + parallel | ✅ |
| 11 | 11 (partial) | FMP stable migration, Tiingo provider, provider chain rewiring | Solo (reactive) | ✅ |
| **12** | **11 (completion)** | **Wire API stubs, E2E verification, pipeline soak, regression tests** | **Lead Phase 0 + parallel** | **🟡 Planned** |
| 13 | 12 | UAT with real portfolio, brokerage cross-validation | Lead + manual | 🔵 Planned |

---

## 4. Strategic Decisions

All decisions are **final unless explicitly revisited** in a planning session.

| # | Decision | Rationale |
|---|----------|-----------|
| SD-1 | Event-sourced core with rebuildable caches | Correctness guarantee. Transactions + PriceBars are truth. Snapshots are disposable. |
| SD-2 | SQLite + Prisma for data layer | Zero-config local. Prisma makes Postgres migration trivial later. |
| SD-3 | Decimal.js for all financial math | Exact decimal representation. No float drift. SQLite stores as TEXT. |
| SD-4 | Flat polling, no priority tiers. Providers: **FMP + Tiingo + Alpha Vantage** | Single user, not day-trading. FMP for search/quotes, Tiingo for history, AV as backup. *(Updated S11: was FMP + Stooq + AV)* |
| SD-5 | Weekday-only market calendar for MVP | Polling on a holiday wastes a few API calls but produces no incorrect data. |
| SD-6 | TradingView Lightweight Charts | MIT license, purpose-built for financial data, tiny bundle. |
| SD-7 | Standalone scheduler process | Next.js request-scoped execution doesn't support long-lived polling. |
| SD-8 | Advisor reads cached data only (MVP) | Small, predictable tool surface. No side effects from chat. |
| SD-9 | FIFO lot accounting only | Industry standard for retail. Matches brokerage statements. |
| SD-10 | Overlay chart deferred to post-MVP | UI-only work when added later. Daily bars pipeline already in place. |
| SD-11 | Bookworm design system adaptation | Existing dark-theme foundation with proven components. |

---

## 5. Architecture Decisions from Execution

Decisions made during sessions that refine or extend the strategic decisions above. These are binding going forward.

### MVP Phase (S1–S9)

| # | Session | Decision | Rationale |
|---|---------|----------|-----------|
| AD-S1 | S1 | Prisma Decimal stored as TEXT in SQLite — application-code comparison only | SQLite has no native DECIMAL type. TEXT preserves exact representation. |
| AD-S4 | S4 | Sell validation returns HTTP 422 with structured error body | Structured error enables actionable UI error messages. |
| AD-S6a | S6 | Client-side `fetch` + `useState`/`useEffect`, no SWR | Minimal dependencies. Single user, no cache invalidation needed. |
| AD-S6b | S6 | TradingView v5 with `useRef` lifecycle pattern | Imperative chart API requires ref-based create/dispose. |
| AD-S6c | S6 | `Number()` exception only in `chart-utils.ts` and `chart-candlestick-utils.ts` | TradingView requires native numbers. All other display code uses Decimal pipeline. |
| AD-S6d | S6 | Enriched seed: 28 instruments, 30 transactions, 8300+ price bars | Realistic data environment for UI development. |
| AD-S7 | S7 | Extract shared `useChart` hook for reuse | Prevents two divergent chart lifecycles. |
| AD-S9a | S9 | Adaptive thinking for advisor — `thinking: { type: 'adaptive' }` | Lets Claude decide when to use extended thinking. |
| AD-S9b | S9 | `\|\|` over `??` for string coalescion in tool loop | Empty strings from LLM should trigger the fallback. |

### Post-MVP Hardening (S10)

| # | Session | Decision | Rationale |
|---|---------|----------|-----------|
| AD-S10a | S10 | Snapshot rebuild in Prisma `$transaction` | Prevents partial snapshots under concurrent writes. |
| AD-S10b | S10 | `POST /api/portfolio/rebuild` replaces GET side effect | HTTP semantic correctness. GETs must be safe and idempotent. |
| AD-S10c | S10 | Bulk paste is atomic — all rows or none | Partial imports create confusing state. |
| AD-S10d | S10 | Bulk endpoint dry-run pattern | `dryRun: true` lets UI show preview without committing. |

### Phase II — Provider Integration (S11)

| # | Session | Decision | Rationale |
|---|---------|----------|-----------|
| AD-P2-6 | S11 | Tiingo replaces Stooq as historical daily bars provider | Proper REST API, JSON responses, documented rate limits, 30+ years free data. |
| AD-P2-7 | S11 | FMP role reduced to search + quotes only | Free tier no longer includes historical data. |
| AD-P2-8 | S11 | FMP migrated from `/api/v3/` to `/stable/` endpoints | Entire v3 namespace discontinued for post-Aug-2025 accounts. |
| AD-P2-9 | S11 | Use Tiingo adjusted prices (`adjClose`, `adjOpen`, etc.) | Adjusted prices account for splits and dividends. |
| AD-P2-10 | S11 | JSON number → Decimal via String intermediary | `new Decimal(String(jsonNumber))` prevents float contamination. |
| AD-P2-11 | S11 | Tiingo rate limiter uses per-hour bucket | Tiingo's primary limit is 50/hr (not per-minute like FMP). |

---

## 6. Provider Architecture (Binding — Updated S11)

### Provider Matrix

| Provider | Role | Endpoints | Free Tier Limits | API Key Env Var |
|----------|------|-----------|-----------------|-----------------|
| **FMP** | Symbol search, real-time quotes | `/stable/search-symbol`, `/stable/quote` | 250 req/day | `FMP_API_KEY` |
| **Tiingo** | Historical daily bars, backup quotes | `/tiingo/daily/{sym}/prices`, `/iex/{sym}` | 1,000 req/day, 50/hr, 500 symbols/mo | `TIINGO_API_KEY` |
| **Alpha Vantage** | Backup quotes only | `GLOBAL_QUOTE` | 25 req/day | `ALPHA_VANTAGE_API_KEY` |

### Provider Chain

```
Symbol Search:    FMP only (Tiingo and AV have no search)
Real-time Quotes: FMP → cache → Alpha Vantage
Historical Bars:  Tiingo only (FMP can't, AV free tier too limited)
```

### Stooq Disposition

Code preserved at `packages/market-data/src/providers/stooq.ts` with deprecation comment. Removed from all active chains. Tests marked as legacy.

---

## 7. Checklist Matrix Usage

| Session | Checklists Applied | Focus Areas |
|---------|-------------------|-------------|
| 1–9 | See v3.0 | (unchanged) |
| 10 | Backend: API & Contracts, Performance, Security. Frontend: Component Quality, Accessibility. QA: Regression. | Transaction boundary correctness, HTTP semantics, bulk input validation, CI gates, a11y |
| 11 | Backend: Code Quality, Performance, Security | Provider migration, rate limiter correctness, decimal precision audit |
| **12** | **Backend: API & Contracts, Performance. QA: Regression, Integration.** | **API stub wiring, E2E flows, backfill verification, polling budget** |
| 13 | QA: All sections. UX/UI: Post-Release Review. | Real data validation, brokerage cross-check, user flow verification |

---

## 8. Risk Register

### Closed Risks

| # | Risk | Resolution |
|---|------|------------|
| R-1 | FIFO lot math edge cases | ✅ S9: 749/749 cross-validation. |
| R-3 | TradingView theming too limited | ✅ S6: v5 API works with custom dark theme. |
| R-4 | Prisma Decimal + SQLite TEXT comparison issues | ✅ S9: AD-S1 discipline held through 11 sessions. |
| R-5 | Advisor system prompt quality | ✅ S9: 5/5 intent categories passed on first attempt. |
| R-7 | DM Sans tabular-nums not working | ✅ S5/S6: `font-mono` applied, alignment confirmed. |
| R-8 | Sell validation error UX unclear | ✅ S7: SellValidationError component with structured error body. |
| R-9 | Multi-fetch waterfall on holding detail | ✅ S7: `Promise.all` for concurrent fetches. |
| R-10 | Concurrent writes during snapshot rebuild | ✅ S10: AD-S10a, Prisma `$transaction`. |
| R-II-1 | FMP free tier response shape differs | ✅ S11: Entire endpoint namespace dead. Migrated to `/stable/`. |
| R-II-2 | Stooq CSV format varies | ✅ S11: Stooq eliminated. Replaced by Tiingo. |

### Open Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R-2 | Free-tier API limits change | Medium | Medium | Limits are env-configurable. Budget check at startup. |
| R-6 | Snapshot rebuild performance at scale | Low | Low | Benchmark: 147ms for 20 instruments / 215 transactions. |
| R-11 | Bulk paste edge cases (encoding, line endings) | Medium | Low | Parser normalizes `\r\n`, splits on `\t`, trims whitespace. |
| R-II-3 | Rate limiter doesn't account for in-flight requests | Medium | High | S12 tests this with live APIs under sustained use. |
| R-II-8 | Decimal precision loss in untested path | Medium | Critical | String intermediary conversion (AD-P2-10). S12 E2E validates. |
| R-II-9 | Tiingo 500-symbol/month limit hit | Low | Medium | 15 instruments well under 500. Track unique symbols. |
| R-II-10 | FMP stable API changes field names again | Low | Medium | Mock fixtures reflect real responses. Changes caught by tests. |
| R-II-11 | FMP search missing `type` field | High | High | S11 makes `type` optional with default `"STOCK"`. |
| R-II-12 | Tiingo HTTP 200 with text error body | High | Medium | Text-first JSON parsing with try/catch. **Needs regression test (S12).** |
| **R-II-13** | **Single-provider dependency for search and history** | **Medium** | **High** | **FMP is sole search provider. Tiingo is sole history provider. No fallback for either. Paid provider under evaluation for redundancy.** |

---

## 9. Lessons Learned

| # | Lesson | Evidence |
|---|--------|----------|
| L-1 | **Lead integration pass catches real bugs.** | S6: TradingView v5 API change. S9: useFocusTrap strict mode failure. S10: various. |
| L-2 | **Enriched seed data pays for itself immediately.** | Used through S11 without modification. |
| L-3 | **Zero scope cuts through 11 sessions.** | Bulk paste was a planned deferral, not a scope cut. S11 was a reactive session that delivered full scope. |
| L-4 | **Test progression is healthy and consistent.** | S1: 71 → S9: 469 → S10: ~510 → S11: 526. |
| L-5 | **`Number()` exception discipline is holding.** | S9 audit confirmed zero violations across 23 files. S11 added no new exceptions. |
| L-6 | **Parallel teammate mode works when filesystem scopes don't overlap.** | 8 of 10 completed sessions used parallel mode with zero merge conflicts. |
| L-7 | **Architecture review before live data catches systemic risks.** | W-3/W-4 caught before real data could be corrupted. |
| L-8 | **Cross-validation scripts must be in CI.** | S10 integrated the 749-check script into Vitest. |
| L-9 | **Smoke-test live APIs before building against mocked fixtures.** | S11: Phase 0 smoke tests caught dead endpoints, renamed fields, premium-only features. All Session 2 mocks were wrong. This should have been done before S4. |
| L-10 | **Provider interfaces absorb external API breakage.** | The `MarketDataProvider` interface meant Tiingo slotted into the exact shape Stooq occupied. Zero changes to analytics, API routes, or UI. This is the ROI of interface-driven design. |

---

## 10. Not in Roadmap

Ideas captured but explicitly deferred past Session 13:

- Dividends, splits, corporate actions
- Intraday price history
- Full CSV import/export with column mapping
- Multi-currency / FX conversion
- Multi-user, auth, cloud deployment
- Alerts, watchlists, notifications
- Manual price overrides for delisted instruments
- Full holiday/half-day market calendar
- Advisor web search and on-demand refresh tools
- Advisor hypothetical calculations
- Advisor context window management / summary generation
- Overlay/compare chart (Spec §9.4)
- Mobile-native app
- Brokerage API integrations
- Responsive tablet/mobile layout refinements
- Paid market data provider for redundancy (under evaluation)

---

## 11. Session Status Tracker

| Session | Status | Date | Tests | Notes |
|---------|--------|------|-------|-------|
| 1 | ✅ Complete | 2026-02-21 | 71 | Foundation + FIFO engine. |
| 2 | ✅ Complete | 2026-02-21 | 162 (+91) | Market data providers + scheduler. |
| 3 | ✅ Complete | 2026-02-21 | 218 (+56) | Analytics completion + PnL fixtures. |
| 4 | ✅ Complete | 2026-02-22 | 275 (+57) | Full API layer. |
| 5 | ✅ Complete | 2026-02-22 | 324 (+49) | UI foundation + components. |
| 6 | ✅ Complete | 2026-02-22 | 363 (+39) | Dashboard + holdings. |
| 7 | ✅ Complete | 2026-02-23 | ~407 | Detail + transactions + charts. All 6 UI pages. |
| 8 | ✅ Complete | 2026-02-23 | ~435 | LLM Advisor. Backend → frontend. |
| 9 | ✅ Complete | 2026-02-24 | 469 | Full-stack validation. 749/749 cross-validation. **MVP SHIPPED.** |
| 10 | ✅ Complete | 2026-02-24 | ~510 | Hardening + Bulk Paste + CI. W-3/W-4 fixed. |
| 11 | ✅ Complete | 2026-02-24 | 526 (+~16) | Provider integration. FMP stable, Tiingo, Stooq deprecated. |
| **12** | **🟡 Planned** | — | **Target: 560+** | **API wiring + E2E + pipeline soak. SESSION-12-PLAN.md ready.** |
| 13 | 🔵 Planned | — | — | UAT with real portfolio data. |

### Test Progression

```
S1:  ████████ 71
S2:  ████████████████ 162
S3:  ██████████████████████ 218
S4:  ████████████████████████████ 275
S5:  █████████████████████████████████ 324
S6:  ████████████████████████████████████ 363
S9:  █████████████████████████████████████████████ 469
S11: ████████████████████████████████████████████████████ 526
S12: ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 560+ (target)
```

### Current Metrics (Post-Session 11)

| Metric | Value |
|--------|-------|
| Test count | 526 |
| Test files | 43 |
| TypeScript errors | 0 |
| Packages | 5 of 5 |
| API endpoints | 19 implemented + 2 stubs |
| UI components | 45 |
| Data hooks | 11 |
| UI pages | 6 of 6 |
| Prisma tables | 7 of 7 |
| Market data providers | 3 active (FMP, Tiingo, AV) + 1 deprecated (Stooq) |
| Seed data | 28 instruments, 30 transactions, 8300+ price bars |
| MVP acceptance criteria | 21/21 |
| PnL cross-validation | 749/749 |
| Sessions completed | 11 of 13 |

### Remaining Path

```
Session 12 (API Wiring + Pipeline Soak) ← NEXT
    └──→ Session 13 (UAT with Real Portfolio)
              └──→ Production use with real money tracking
```

Two sessions remain before the system is ready for production use with real portfolio data.

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
