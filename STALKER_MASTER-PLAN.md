# STALKER Master Plan — Engineering Roadmap

**Project:** Stock & Portfolio Tracker + LLM Advisor (Codename: STALKER)
**Version:** 3.0
**Date:** 2026-02-24
**Author:** Engineering Lead
**Inputs:** SPEC v4.0, Product Brief v3.1, UX/UI Design Plan v1.0, Bookworm Style Guide, SESSION-9-REPORT.md, Architecture Review
**Status:** MVP Shipped — Session 10 Ready (Post-MVP Hardening)

### Changelog

| Version | Date | Changes |
|---------|------|---------|
| 3.0 | 2026-02-24 | MVP shipped. Updated all epics/sessions to final status (S1–S9 complete). Added Epic 10 + Session 10 (hardening, bulk paste, CI). Added architecture decisions AD-S7 through AD-S9b. Resolved risks R-1/R-4/R-5/R-8/R-9. Added new risks R-10/R-11. Added lessons L-7/L-8. Updated "Not in Roadmap" section. Added final metrics. |
| 2.0 | 2026-02-22 | Updated status tracker (S1–S6 complete), resolved risks R-3/R-7, added architecture decisions from execution (AD-S1 through AD-S6), added Session 7 plan/kickoff references, added lessons learned section |
| 1.0 | 2026-02-21 | Initial roadmap. 9 sessions across 10 epics. |

---

## 1. Strategic Context

STALKER is a local-first, event-sourced portfolio tracker with an LLM-powered advisor. The system runs entirely on a Mac dev machine: SQLite database, Next.js App Router, standalone scheduler process, and free-tier market data providers.

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

The MVP shipped at the end of Session 9 with 469 tests, 21/21 acceptance criteria, and 749/749 PnL cross-validation checks. All 6 UI pages, 19 API endpoints (+ 2 stubs awaiting live API keys), 45 UI components, 7 Prisma tables, 3 market data providers, and the LLM advisor with 5 verified intent categories are in place.

Session 10 hardens the foundation before the system goes live with real API keys and real money tracking. It addresses two correctness risks identified during architecture review (W-3: concurrent write safety, W-4: GET side effects), ships the top-priority post-MVP feature (Bulk Transaction Paste), and establishes the CI pipeline.

---

## 2. Epic Breakdown

### Epic 0: Project Scaffolding & Data Foundation ✅

**Goal:** Establish the monorepo, database schema, shared packages, and core utilities that every other epic depends on.

**Deliverables:**
- pnpm workspace monorepo structure matching Spec 3.3
- Prisma schema for all seven tables (Instrument, Transaction, PriceBar, LatestQuote, PortfolioValueSnapshot, AdvisorThread, AdvisorMessage)
- `packages/shared/` — TypeScript types, Decimal utility functions, ULID generation, constants
- `packages/market-data/src/calendar/` — MarketCalendar module (weekday check, IANA timezone, session times)
- `tsconfig.base.json` with strict mode
- `CLAUDE.md`, `AGENTS.md`, `HANDOFF.md` — initial versions
- Basic CI: `tsc --noEmit`, Vitest config
- `.env.local` template

**Status:** ✅ Complete (Session 1)
**Depends on:** Nothing
**Blocks:** All other epics

---

### Epic 1: Market Data Service ✅

**Goal:** Build the provider-agnostic market data layer with rate limiting, fallback, and caching.

**Deliverables:**
- `MarketDataProvider` interface (Spec 6.1)
- FMP provider implementation (symbol search, quotes, daily history)
- Stooq provider implementation (historical daily bars via CSV)
- Alpha Vantage provider implementation (backup quotes)
- Token bucket rate limiter per provider (Spec 6.4)
- Provider fallback chain (Spec 6.5)
- `LatestQuote` cache management
- Provider symbol mapping (instrument `providerSymbolMap`)
- Unit tests for each provider (mocked HTTP), rate limiter, fallback logic

**Status:** ✅ Complete (Session 2)
**Depends on:** Epic 0 (shared types, Prisma schema)
**Blocks:** Epic 3 (API layer needs market data), Epic 4 (Scheduler)

---

### Epic 2: Analytics Engine ✅

**Goal:** Implement the event-sourced analytics core — FIFO lot accounting, PnL computation, and portfolio value series.

**Deliverables:**
- FIFO lot accounting algorithm (Spec 5.2) — all Decimal arithmetic
- Realized PnL computation per sell (Spec 5.2)
- Unrealized PnL computation per lot (Spec 5.3)
- Portfolio value series builder (Spec 5.4) — iterates trading dates, replays transactions
- Snapshot rebuild logic (delete from affected date forward, recompute)
- Missing price handling with carry-forward (Spec 5.5)
- Sell validation invariant enforcement (Spec 4.2, Transaction section)
- Flexible window query support (Spec 5.6)
- Unit tests with manually computed expected values

**Status:** ✅ Complete (Sessions 1 + 3)
**Depends on:** Epic 0 (shared types, Decimal utils, MarketCalendar)
**Blocks:** Epic 3 (API), Epic 7 (Advisor tools), Epic 8 (PnL Validation)

---

### Epic 3: API Layer ✅

**Goal:** Build all Next.js App Router API endpoints for instruments, transactions, portfolio analytics, and market data.

**Deliverables:**
- Instrument CRUD: POST/GET/GET[id]/DELETE (Spec 8.1)
- Transaction CRUD: POST/GET/PUT[id]/DELETE[id] with sell validation (Spec 8.2)
- Portfolio analytics: snapshot, timeseries, holdings, holdings/[symbol] (Spec 8.3)
- Market data: quote, history, search, refresh, status (Spec 8.4)
- Instrument creation triggers historical backfill
- Transaction writes trigger snapshot rebuild from affected date
- Error handling per Spec 11.1 and 11.2
- Request/response types matching spec contracts
- Integration tests for key flows

**Status:** ✅ Complete (Session 4)
**Depends on:** Epic 0, Epic 1 (market data), Epic 2 (analytics)
**Blocks:** Epic 6 (UI needs API), Epic 7 (Advisor API route)

---

### Epic 4: Scheduler ✅

**Goal:** Build the standalone Node polling process for quote updates and post-close snapshot rebuilds.

**Deliverables:**
- Standalone Node process in `packages/scheduler/`
- Flat polling loop — all instruments at equal interval (Spec 6.3)
- Budget check at startup with logging (Spec 6.3)
- Market hours awareness via MarketCalendar
- Post-close fetch (15 min after session close)
- Weekend/off-hours idle
- `concurrently` setup in root `pnpm dev` script
- Integration test (mocked providers, verify polling behavior)

**Status:** ✅ Complete (Session 2)
**Depends on:** Epic 0 (MarketCalendar), Epic 1 (market data service)
**Blocks:** Nothing (scheduler runs independently)

---

### Epic 5: UI Foundation ✅

**Goal:** Establish the design system, base components, layout shell, and empty states.

**Deliverables:**
- Tailwind config with full STALKER token system (colors, typography, spacing from UX Plan Section 4)
- Google Fonts setup: Crimson Pro (headings), DM Sans (body), JetBrains Mono (numeric tables)
- Numeric formatting utilities (Decimal string → display format, currency, percentage)
- Base components: Button, Input, Select, Table, Badge, Tooltip, Toast, Modal, Pill Toggle
- Page shell: Navigation tab bar, Data Health Footer, Advisor FAB
- Empty states for all five pages (Spec 9.6, UX Plan)
- Responsive foundation (breakpoints per UX Plan Section 9)

**Status:** ✅ Complete (Session 5)
**Depends on:** Epic 0 (project structure)
**Blocks:** Epic 6 (core pages need components)

---

### Epic 6: UI Core Pages ✅

**Goal:** Build the four main pages: Dashboard, Holding Detail, Transactions, and Charts.

**Sub-epics:**

#### Epic 6A: Dashboard + Holdings ✅
- Hero metric block (total value, day change with MarketCalendar)
- Portfolio area chart (TradingView Lightweight Charts)
- Window selector (1D/1W/1M/3M/1Y/ALL)
- Summary cards (total gain/loss, realized PnL, unrealized PnL)
- Holdings table with sorting, staleness indicators
- Staleness banner (conditional)
- Data health footer wired to `/api/market/status`
- Holdings page (enhanced table with filters, totals row, add instrument button)

**Status:** ✅ Complete (Session 6)

#### Epic 6B: Holding Detail + Transactions + Charts ✅
- Holding detail page: position summary, candlestick chart, lots table, transaction history
- Transaction page: table with sort/filter, add/edit form, validation error display
- Add instrument flow (symbol search → create → backfill → toast)
- Charts page: single-instrument viewer with symbol selector
- Delete confirmation modals

**Status:** ✅ Complete (Session 7)

**Depends on:** Epic 3 (API), Epic 5 (UI foundation)
**Blocks:** Epic 7 (advisor UI)

---

### Epic 7: LLM Advisor ✅

**Goal:** Build the advisor backend (LLM adapter, tools, execution loop) and frontend (chat panel, thread management).

**Deliverables:**
- LLM adapter interface + Anthropic implementation (Spec 7.2)
- Four MVP tool definitions (getPortfolioSnapshot, getHolding, getTransactions, getQuotes)
- Tool execution loop with max 5 iterations (Spec 7.4)
- System prompt covering five intent categories (Spec 7.5)
- Example conversations document (`data/test/advisor-examples.md`)
- Advisor API routes: chat, threads CRUD (Spec 8.5)
- Conversation persistence in AdvisorThread/AdvisorMessage
- Advisor chat panel UI: slide-out panel, message display, tool call indicators, thread list
- Suggested prompts on first interaction
- Setup state when API key is missing

**Status:** ✅ Complete (Session 8)
**Depends on:** Epic 2 (analytics for tools), Epic 3 (API), Epic 5 (UI components)
**Blocks:** Nothing

---

### Epic 8: PnL Validation & Testing ✅

**Goal:** Build the reference portfolio fixture and automated validation tests to guarantee calculation correctness.

**Deliverables:**
- Reference portfolio: 5+ instruments, 20–30 transactions (Spec 13.1)
- Expected outputs computed independently (lot states, realized PnL per sell, unrealized PnL, portfolio value at checkpoint dates)
- `data/test/reference-portfolio.json` + `data/test/expected-outputs.json`
- Fixture-based unit tests in `packages/analytics/` asserting to the cent
- Full-stack cross-validation: three independent paths (749/749 checks)
- Live LLM verification: 5/5 advisor intent categories verified
- Full-stack smoke test: 22/22 API endpoints verified

**Status:** ✅ Complete (fixtures in Session 3; cross-validation + signoff in Session 9)
**Depends on:** Epic 2 (analytics engine)
**Blocks:** MVP signoff ✅

---

### Epic 9: MVP Polish ✅

**Goal:** Accessibility, documentation, and quality-of-life improvements for MVP signoff.

**Deliverables:**
- Focus trap hook (`useFocusTrap.ts`) wired into AdvisorPanel
- ARIA fixes: Toast (`aria-live`), DeleteConfirmation (`aria-describedby`), UnpricedWarning (`role="alert"`), Loading spinner (`role="status"`)
- `KNOWN-LIMITATIONS.md` documenting 8 MVP gaps with severity ratings
- Numeric display audit: 23 files, zero violations
- Anthropic adapter: updated to Claude Sonnet 4.6, adaptive thinking, 16K max tokens
- Tool loop: `||` over `??` for empty string fallback (AD-S9b)

**Status:** ✅ Complete (Session 9)
**Depends on:** All core epics complete
**Blocks:** Nothing

**Note:** Bulk Transaction Paste (originally scoped for Epic 9) was deferred to Epic 10 to prioritize MVP validation and signoff. This was the correct call — validation discipline caught two correctness risks (W-3, W-4) that would have been worse to fix after live data existed.

---

### Epic 10: Post-MVP Hardening + Bulk Paste + CI → Session 10

**Goal:** Fix correctness risks under concurrent writes, ship Bulk Transaction Paste, establish CI pipeline, close remaining accessibility and documentation gaps.

**Deliverables:**
- Snapshot rebuild wrapped in Prisma `$transaction` (W-3 resolution)
- `GET /api/portfolio/snapshot` made read-only; `POST /api/portfolio/rebuild` created (W-4 resolution)
- Snapshot rebuild benchmark (200 transactions, 20 instruments)
- Intentional-decision code comments for AD-S9b, AD-S6c, W-5
- Bulk Transaction Paste: parser, batch sell validation, `POST /api/transactions/bulk` endpoint, paste UI with preview and error highlighting (Spec §9.3.1)
- GitHub Actions CI: type-check, test, build gates
- Cross-validation script integrated into Vitest test suite (749 checks in CI)
- `prefers-reduced-motion` support for animated components
- W-8 Decimal formatting fix in advisor tool executors
- Documentation updates: KNOWN-LIMITATIONS.md, HANDOFF.md, master plan

**Status:** 🟡 Planned (Session 10) — SESSION-10-PLAN.md + SESSION-10-KICKOFF.md ready
**Depends on:** Session 9 (MVP) ✅
**Blocks:** Live API key wiring (symbol search, quote refresh, historical backfill stubs)

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
                                                        └──→ Session 10 (Hardening + Bulk Paste + CI) ← NEXT
```

### Session Overview

| Session | Epic(s) | Scope | Team Shape | Est. Complexity | Status |
|---------|---------|-------|------------|-----------------|--------|
| 1 | 0 + 2 (partial) | Monorepo, Prisma, shared utils, MarketCalendar, FIFO lot engine | Lead + 2 teammates (parallel) | High | ✅ |
| 2 | 1 + 4 | All market data providers, rate limiter, fallback, scheduler | Lead + 2 teammates (parallel) | High | ✅ |
| 3 | 2 (completion) + 8 (partial) | Portfolio value series, snapshot rebuild, reference portfolio fixtures, PnL tests | Lead + 2 teammates (sequenced) | High | ✅ |
| 4 | 3 | All API endpoints, instrument creation flow, transaction validation flow | Lead + 2 teammates (parallel) | High | ✅ |
| 5 | 5 | Tailwind config, design tokens, base components, layout shell, empty states | Lead + 2 teammates (parallel) | Medium | ✅ |
| 6 | 6A | Dashboard page, holdings page, TradingView charts, data health footer | Lead + 2 teammates (parallel) | High | ✅ |
| 7 | 6B | Holding detail, transactions page, add/edit forms, charts page | Lead + 2 teammates (parallel) | High | ✅ |
| 8 | 7 | LLM adapter, tools, system prompt, chat panel UI, thread management | Lead + 2 teammates (sequenced) | High | ✅ |
| 9 | 8 (completion) + 9 | Full-stack cross-validation, LLM verification, accessibility, MVP signoff | Lead Phase 0 + parallel teammates | Medium | ✅ |
| **10** | **10** | **Correctness fixes, bulk paste, CI, accessibility polish** | **Lead Phase 0 + parallel teammates** | **Medium** | **🟡 Planned** |

### Session Details

#### Session 1: Foundation + Analytics Core ✅
**Epics:** 0 (full) + 2 (FIFO engine, sell validation, unrealized PnL)

Build the entire project foundation and the analytics core that everything else depends on. The monorepo structure, database schema, shared utilities, and the FIFO lot accounting engine are all session-1 scope. This is the highest-risk session — if the data model or lot engine is wrong, everything downstream is wrong.

**Teammate split:**
- **Teammate 1 (`scaffolding-engineer`):** Monorepo setup, Prisma schema, tsconfig, Vitest config, pnpm workspace, `.env.local` template, CLAUDE.md/AGENTS.md/HANDOFF.md
- **Teammate 2 (`analytics-engineer`):** `packages/shared/` (types, Decimal utils, ULID), `packages/analytics/` (FIFO lots, realized PnL, unrealized PnL, sell validation), MarketCalendar module, unit tests

**Parallel:** Yes — teammates work independently. Scaffolding engineer sets up structure; analytics engineer builds into `packages/` directories.

**Result:** 71 tests. Foundation solid. No scope cuts.

---

#### Session 2: Market Data Service + Scheduler ✅
**Epics:** 1 (full) + 4 (full)

Build all three market data providers, the rate limiter, fallback chain, and the standalone scheduler. This session has external API dependencies — providers must be tested against mocked responses, not live APIs.

**Teammate split:**
- **Teammate 1 (`market-data-engineer`):** Provider interface, FMP implementation, Stooq implementation, Alpha Vantage implementation, rate limiter, fallback logic, LatestQuote cache, tests
- **Teammate 2 (`scheduler-engineer`):** Standalone polling process, budget check, market hours logic, post-close fetch, concurrently setup, integration test

**Parallel:** Yes — scheduler engineer can stub the market data service interface while market-data-engineer builds it.

**Result:** 162 tests (+91). All providers implemented. No scope cuts.

---

#### Session 3: Analytics Completion + PnL Validation Fixtures ✅
**Epics:** 2 (remainder) + 8 (partial)

Complete the portfolio value series builder, snapshot rebuild logic, and build the reference portfolio with independently computed expected outputs.

**Teammate split:**
- **Teammate 1 (`analytics-completion`):** Portfolio value series builder (Spec 5.4), snapshot rebuild on transaction write, missing price carry-forward, flexible window queries, tests
- **Teammate 2 (`validation-engineer`):** Reference portfolio design (5+ instruments, 20–30 transactions), expected outputs (lot state, realized PnL, unrealized PnL, portfolio value at checkpoints), fixture files, fixture-based automated tests

**Sequenced:** Teammate 1 completes the portfolio value series → Lead verifies → Teammate 2 builds fixtures and tests against it.

**Result:** 218 tests (+56). Reference portfolio fixtures in place. No scope cuts.

---

#### Session 4: API Layer ✅
**Epic:** 3 (full)

Build all Next.js App Router API endpoints. Every endpoint must validate inputs, enforce the sell invariant on writes, trigger appropriate rebuilds, and return properly shaped responses.

**Teammate split:**
- **Teammate 1 (`api-crud-engineer`):** Instrument CRUD, Transaction CRUD (with sell validation + snapshot rebuild trigger), error responses
- **Teammate 2 (`api-analytics-engineer`):** Portfolio analytics endpoints (snapshot, timeseries, holdings, holdings/[symbol]), Market data endpoints (quote, history, search, refresh, status)

**Parallel:** Yes — CRUD and analytics endpoints are independent.

**Result:** 275 tests (+57). All endpoints implemented. No scope cuts.

---

#### Session 5: UI Foundation ✅
**Epic:** 5 (full)

Build the complete design system and component library. This session is design-heavy — the UX Plan and Style Guide are the primary references.

**Teammate split:**
- **Teammate 1 (`design-system-engineer`):** Tailwind config (tokens, colors, typography, spacing), Google Fonts, numeric formatting utils, responsive breakpoints
- **Teammate 2 (`component-engineer`):** Base components (Button, Input, Select, Table, Badge, Tooltip, Toast, Modal, PillToggle), page shell (nav tabs, footer, FAB), empty states for all pages

**Parallel:** Yes — design system and components can be built simultaneously (component engineer uses token variables).

**Result:** 324 tests (+49). Full component library. No scope cuts. R-7 (tabular-nums) verified working.

---

#### Session 6: Dashboard + Holdings UI ✅
**Epic:** 6A

Build the two most important pages. The dashboard is the product's front door — it must communicate portfolio health in under two seconds.

**Teammate split:**
- **Teammate 1 (`dashboard-engineer`):** Hero metric, portfolio area chart (TradingView), window selector, summary cards, data health footer
- **Teammate 2 (`holdings-engineer`):** Dashboard holdings table, staleness banner, standalone holdings page (enhanced table, filters, totals, add instrument button)

**Parallel:** Yes — dashboard above-the-fold and holdings table are independent components.

**Result:** 363 tests (+39). 17/17 blocking criteria met. Zero scope cuts. R-3 (TradingView theming) verified — dark theme, custom colors, crosshair all work with v5 API. Enriched seed data: 28 instruments, 30 transactions, 8300+ price bars.

**Notable:** TradingView v5 API change caught during lead integration — `addSeries(AreaSeries, opts)` replaces removed `addAreaSeries()`. Fixed in integration pass.

---

#### Session 7: Detail + Transactions + Charts UI ✅
**Epic:** 6B

Build the remaining core pages. The transaction form's validation UX is critical — users must understand immediately why a sell was rejected.

**Teammate split:**
- **Teammate 1 (`detail-engineer`):** Holding detail page (position summary, candlestick chart, lots table, transaction history, unpriced warning), charts page, shared `useChart` hook extraction
- **Teammate 2 (`transactions-engineer`):** Transactions page (table, filters, add/edit form with validation, delete confirmation), add instrument flow (search modal), sell validation error display

**Parallel:** Yes — holding detail and transactions page are independent.

**Result:** All 6 UI pages complete. SellValidationError component built with structured error body (AD-S4). `useChart` hook extracted for reuse (AD-S7). R-8 and R-9 resolved.

---

#### Session 8: LLM Advisor ✅
**Epic:** 7 (full)

Build the advisor from system prompt to chat panel. The system prompt is the single biggest lever on advisor usefulness — it must be written and tested before the UI.

**Teammate split:**
- **Teammate 1 (`advisor-backend`):** LLM adapter (Anthropic), tool definitions, tool execution loop, system prompt, advisor API routes, conversation persistence
- **Teammate 2 (`advisor-frontend`):** Chat panel UI, message display, tool call indicators (collapsible), thread list/management, suggested prompts, setup state

**Sequenced:** Backend builds adapter + tools + system prompt → Lead verifies tool execution against example queries → Frontend builds UI wiring to API.

**Result:** Advisor functional with all 4 MVP tools. System prompt, chat panel, thread management complete. R-5 resolution deferred to live verification in S9.

---

#### Session 9: Validation + Polish + MVP Signoff ✅
**Epics:** 8 (completion) + 9 (polish)

Final validation and polish. Full-stack cross-validation is the MVP signoff gate.

**Mode:** Lead Phase 0 (blocking gate for live LLM verification), then parallel teammates (validation + polish), then lead integration for signoff.

**Phase 0 (Lead):**
- Tool loop fix: `??` → `||` for empty string fallback (AD-S9b)
- Anthropic adapter: model updated to Claude Sonnet 4.6, adaptive thinking enabled (AD-S9a), max_tokens to 16K
- Live LLM verification: 5/5 intent categories pass on first attempt
- Full-stack smoke test: 22/22 API endpoints verified

**Teammate split:**
- **Teammate 1 (`validation-engineer`):** Cross-validation script (749/749 checks via 3 independent paths), regression sweep (469/469 tests), numeric display audit (23 files, 0 violations)
- **Teammate 2 (`polish-engineer`):** Focus trap hook, ARIA fixes (Toast, DeleteConfirmation, UnpricedWarning, loading spinner), `KNOWN-LIMITATIONS.md`

**Result:** 469 tests (+34 from S8). 21/21 MVP acceptance criteria signed off (11 Spec §13 + 10 UX Plan §11.1). 749/749 cross-validation checks. MVP shipped.

**Notable:** validation-engineer teammate stalled; lead completed cross-validation and numeric audit directly. useFocusTrap.ts build failure under strict mode caught and fixed during integration (non-null assertions after length guard).

---

#### Session 10: Hardening + Bulk Paste + CI ← NEXT
**Epic:** 10

Harden the foundation before wiring live API keys. Fix two correctness risks (W-3 concurrent writes, W-4 GET side effects), ship Bulk Transaction Paste, establish CI.

**Mode:** Lead Phase 0 (blocking correctness fixes), then parallel teammates (bulk paste + hardening), then lead integration.

**Phase 0 (Lead — blocking gate):**
- W-3: Wrap snapshot rebuild in Prisma `$transaction`
- W-4: Remove write side effect from `GET /api/portfolio/snapshot`; create `POST /api/portfolio/rebuild`
- Snapshot rebuild benchmark: 200 transactions, 20 instruments, < 5s target
- Code comment hardening: intentional-decision comments in 4 files

**Teammate split:**
- **Teammate 1 (`bulk-paste-engineer`):** Bulk paste parser, batch sell validation, `POST /api/transactions/bulk` endpoint (with dry-run mode), Bulk paste UI (textarea → parse → preview → import → toast)
- **Teammate 2 (`hardening-engineer`):** GitHub Actions CI (type-check, test, build), cross-validation Vitest wrapper, `useReducedMotion` hook, W-8 decimal formatting fix, documentation updates

**Parallel:** Yes — bulk paste and hardening have non-overlapping filesystem scopes.

**Plan documents:** `SESSION-10-PLAN.md` + `SESSION-10-KICKOFF.md`

**Key decisions (planned):**
- AD-S10a: Snapshot rebuild in Prisma `$transaction` (concurrent write safety)
- AD-S10b: `POST /api/portfolio/rebuild` replaces GET side effect (HTTP semantics)
- AD-S10c: Bulk paste is atomic — all rows or none (user clarity)
- AD-S10d: Bulk endpoint dry-run pattern (parse-then-confirm flow)

---

## 4. Strategic Decisions

All decisions are **final unless explicitly revisited** in a planning session.

| # | Decision | Rationale | Alternatives Considered |
|---|----------|-----------|------------------------|
| SD-1 | Event-sourced core with rebuildable caches | Correctness guarantee. Transactions + PriceBars are truth. Snapshots are disposable. | Mutable position records (rejected: backdated trades would corrupt state) |
| SD-2 | SQLite + Prisma for data layer | Zero-config local. Prisma makes Postgres migration trivial later. | Postgres from day 1 (rejected: over-engineering for single user) |
| SD-3 | Decimal.js for all financial math | Exact decimal representation. No float drift. SQLite stores as TEXT — intentional. | Native Number (rejected: float drift in financial math is unacceptable) |
| SD-4 | Flat polling, no priority tiers | Single user, not day-trading. Complexity of tiered polling unjustified. ~150 LOC saved. | 3-tier priority system (rejected per Spec v4.0 amendments) |
| SD-5 | Weekday-only market calendar for MVP | Polling on a holiday wastes a few API calls but produces no incorrect data. Staleness indicator covers it. | Full holiday calendar (rejected: complexity for no user benefit in MVP) |
| SD-6 | TradingView Lightweight Charts | MIT license, purpose-built for financial data, tiny bundle. | Chart.js (rejected: not financial-specific), D3 (rejected: too low-level) |
| SD-7 | Standalone scheduler process | Next.js request-scoped execution model doesn't support long-lived polling. | API route with cron (rejected: unreliable timing, cold starts) |
| SD-8 | Advisor reads cached data only (MVP) | Small, predictable tool surface. No side effects from chat. | Advisor triggers live fetches (rejected: scope creep, rate limit risk) |
| SD-9 | FIFO lot accounting only | Industry standard for retail. Matches brokerage statements. | Specific identification (rejected: post-MVP), LIFO (rejected: uncommon) |
| SD-10 | Overlay chart deferred to post-MVP | UI-only work when added later. Daily bars pipeline already in place. Saves ~1 session. | Build in MVP (rejected per Product Brief Rec. 5) |
| SD-11 | Bookworm design system adaptation | Existing dark-theme foundation with proven components. Financial domain mapping well-defined. | Build from scratch (rejected: unnecessary when Bookworm provides 80% of what's needed) |

---

## 5. Architecture Decisions from Execution

Decisions made during sessions that refine or extend the strategic decisions above. These are binding going forward.

| # | Session | Decision | Rationale |
|---|---------|----------|-----------|
| AD-S1 | S1 | Prisma Decimal stored as TEXT in SQLite — application-code comparison only, no SQL numeric comparisons | SQLite has no native DECIMAL type. TEXT preserves exact representation. Queries that need numeric comparison use Decimal.js in application code. |
| AD-S4 | S4 | Sell validation returns HTTP 422 with structured error body: `{ error, details: { instrumentSymbol, firstNegativeDate, deficitQuantity } }` | Structured error enables the UI to render a specific, actionable error message rather than a generic rejection. |
| AD-S6a | S6 | Client-side `fetch` + `useState`/`useEffect`, no SWR or global state manager | Minimal dependencies. Single user, no cache invalidation needed. <20 instruments means no global state coordination required. |
| AD-S6b | S6 | TradingView v5 with `useRef` lifecycle pattern | Imperative chart API requires ref-based create/dispose. ResizeObserver for responsive width. |
| AD-S6c | S6 | `Number()` exception only in `chart-utils.ts` and `chart-candlestick-utils.ts` | TradingView requires native numbers. All other display code uses Decimal string → formatter pipeline. This exception is documented and contained. |
| AD-S6d | S6 | Enriched seed: 28 instruments, 30 transactions, 8300+ price bars, 3 intentionally stale quotes | Realistic data environment for UI development. Stale quotes exercise staleness UX paths. Carried forward for all future sessions. |
| AD-S7 | S7 | Extract shared `useChart` hook from Session 6 area chart for reuse with candlestick chart | Prevents two divergent chart lifecycles. Hook handles create/dispose/resize; series type is a parameter. |
| AD-S9a | S9 | Adaptive thinking for advisor — `thinking: { type: 'adaptive' }` with max_tokens 16000 | Lets Claude decide when to use extended thinking. Requires max_tokens >= 16000 to accommodate thinking blocks. |
| AD-S9b | S9 | `\|\|` over `??` for string coalescion in tool loop | Intentional. Empty strings from LLM should trigger the fallback message, not be rendered as blank. |
| AD-S10a | S10 (planned) | Snapshot rebuild in Prisma `$transaction` | Prevents partial snapshots under concurrent writes (scheduler + user). SQLite serialization is connection-level; Prisma's pool means this isn't guaranteed without an explicit transaction. |
| AD-S10b | S10 (planned) | `POST /api/portfolio/rebuild` replaces GET side effect | HTTP semantic correctness. GETs must be safe and idempotent. Write operations use POST. |
| AD-S10c | S10 (planned) | Bulk paste is atomic — all rows or none | Partial imports create confusing state. If row 15 of 20 fails validation, none are inserted. User fixes errors and retries the full batch. |
| AD-S10d | S10 (planned) | Bulk endpoint dry-run pattern | `dryRun: true` lets the UI show a preview without committing. Matches the Spec §9.3.1 parse-then-confirm flow. |

---

## 6. Checklist Matrix Usage

The `TEAM-CHECKLIST.md` contains four checklists: Frontend, Backend, QA, and UX/UI. Each session applies the relevant subset:

| Session | Checklists Applied | Focus Areas |
|---------|-------------------|-------------|
| 1 (Foundation) ✅ | Backend: General, Code Quality, CI/CD | Type safety, test coverage, build pipeline |
| 2 (Market Data) ✅ | Backend: General, Code Quality, Performance, Security | Rate limiter correctness, API key handling, error paths |
| 3 (Analytics + Fixtures) ✅ | Backend: Code Quality, Performance | Decimal precision, edge cases, test coverage thresholds |
| 4 (API) ✅ | Backend: API & Contracts, Security, Performance | Schema validation, error codes, auth-free security, input sanitization |
| 5 (UI Foundation) ✅ | Frontend: General, Component Quality, UI/UX, Performance | Design system compliance, accessibility, bundle size |
| 6 (Dashboard) ✅ | Frontend: All sections, UX/UI: Visual Design, Interaction Design | Chart theming, responsive layout, numeric formatting, staleness UX |
| 7 (Detail + Transactions) ✅ | Frontend: All sections, UX/UI: All sections | Form validation UX, accessibility, keyboard navigation |
| 8 (Advisor) ✅ | Backend + Frontend: All sections | LLM error handling, streaming UX, tool call visibility |
| 9 (Validation + Signoff) ✅ | QA: All sections, UX/UI: Post-Release Review | Regression, cross-validation, PnL accuracy, accessibility audit |
| **10 (Hardening)** | **Backend: API & Contracts, Performance, Security. Frontend: Component Quality, Accessibility. QA: Regression.** | **Transaction boundary correctness, HTTP semantics, bulk input validation, CI gates, a11y** |

---

## 7. Risk Register

| # | Risk | Likelihood | Impact | Status |
|---|------|-----------|--------|--------|
| R-1 | FIFO lot math has edge cases | Medium | Critical | ✅ **Resolved (S9).** 749/749 cross-validation checks across 3 independent paths. Reference portfolio verified. |
| R-2 | Free-tier API limits change | Medium | Medium | **Open.** Limits are env-configurable (Spec 6.2). Budget check at startup. Staleness indicator covers gaps. No issues observed through S9. |
| R-3 | TradingView chart theming too limited | Low | Low | ✅ **Resolved (S6).** Dark theme, custom colors, crosshair all work with v5 API. No custom tooltip overlay needed. v5 API change (`addSeries` pattern) caught and fixed during integration. |
| R-4 | Prisma Decimal + SQLite TEXT causes comparison issues | Medium | Medium | ✅ **Resolved (S9).** AD-S1 discipline held through 9 sessions. No SQL numeric comparisons on Decimal columns. Zero issues. |
| R-5 | Advisor system prompt quality | Medium | High | ✅ **Resolved (S9).** 5/5 intent categories passed on first attempt against live Claude Sonnet 4.6. No system prompt iteration needed. |
| R-6 | Snapshot rebuild performance at scale | Low | Low | **Open → S10 benchmark.** Sub-second replay observed with 28 instruments / 30 transactions. Formal benchmark with 200 transactions / 20 instruments planned for Session 10. |
| R-7 | DM Sans tabular-nums not working via Google Fonts | Low | Medium | ✅ **Resolved (S5/S6).** `font-mono` applied to numeric table columns. Holdings table alignment confirmed correct across all numeric columns. |
| R-8 | Sell validation error UX unclear to user | Medium | High | ✅ **Resolved (S7).** SellValidationError component built with structured error body (AD-S4). Clear display of instrument, date, and deficit quantity. |
| R-9 | Multi-fetch waterfall on holding detail page | Medium | Low | ✅ **Resolved (S7).** `Promise.all` pattern for concurrent fetches implemented. |
| R-10 | Concurrent writes during snapshot rebuild | Medium | High | **New (S10).** Scheduler + user actions can trigger simultaneous rebuilds. Mitigated by AD-S10a (Prisma `$transaction`). Targeted for Session 10 Phase 0. |
| R-11 | Bulk paste edge cases (encoding, Windows line endings) | Medium | Low | **New (S10).** Mitigated: parser normalizes `\r\n` → `\n`, splits on `\t`, trims whitespace. Test suite covers mixed delimiters. |

---

## 8. Lessons Learned

Patterns that have proven effective across Sessions 1–9 and should be continued:

| # | Lesson | Evidence |
|---|--------|----------|
| L-1 | **Lead integration pass catches real bugs.** | S6: TradingView v5 API change, HoldingsTable wiring, snapshot test fragility. S9: useFocusTrap.ts strict mode failure. All caught during lead integration, not by teammates. |
| L-2 | **Enriched seed data pays for itself immediately.** | S6: 28 instruments + 3 stale quotes gave realistic data for every UI component. Carried forward as AD-S6d. Used through S9 without modification. |
| L-3 | **Zero scope cuts through 9 sessions.** | The session planning process is sizing work correctly. Bulk paste was a planned deferral (Spec "Next Priority"), not a scope cut. |
| L-4 | **Test progression is healthy and consistent.** | S1: 71 → S2: 162 → S3: 218 → S4: 275 → S5: 324 → S6: 363 → S9: 469. ~30–90 new tests per session. No regressions. |
| L-5 | **`Number()` exception discipline is holding.** | AD-S6c: Only `chart-utils.ts` and `chart-candlestick-utils.ts` use `Number()` for TradingView. Numeric display audit in S9 confirmed zero violations across 23 files. |
| L-6 | **Parallel teammate mode works when filesystem scopes don't overlap.** | 7 of 9 completed sessions used parallel mode with zero merge conflicts. Continue enforcing non-overlapping filesystem scopes. |
| L-7 | **Architecture review before live data catches systemic risks.** | S10: W-3 (concurrent write risk) and W-4 (GET side effect) identified during post-S9 architecture review, before any real data could be corrupted. Fixing post-corruption would have been significantly harder. |
| L-8 | **Cross-validation scripts must be in CI, not just standalone.** | S9's 749-check script was standalone (`data/test/cross-validate.ts`). If not wrapped in Vitest, regressions could slip past `pnpm test`. S10 integrates it into the test suite. |

---

## 9. Not in Roadmap

Ideas captured but explicitly deferred past Session 10:

- Dividends, splits, corporate actions
- Intraday price history
- Full CSV import/export with column mapping
- Multi-currency / FX conversion
- Multi-user, auth, cloud deployment
- Alerts, watchlists, notifications
- Manual price overrides for delisted instruments
- Full holiday/half-day market calendar
- Advisor web search and on-demand refresh tools
- Advisor hypothetical calculations ("what if I bought X on date Y")
- Advisor context window management / summary generation for long threads
- Overlay/compare chart (Spec §9.4)
- Mobile-native app
- Brokerage API integrations
- Responsive tablet/mobile layout refinements (beyond S10 reduced-motion)

---

## 10. Session Status Tracker

| Session | Status | Date | Tests | Notes |
|---------|--------|------|-------|-------|
| 1 | ✅ Complete | 2026-02-21 | 71 | Foundation + FIFO engine. No scope cuts. |
| 2 | ✅ Complete | 2026-02-21 | 162 (+91) | Market data providers + scheduler. No scope cuts. |
| 3 | ✅ Complete | 2026-02-21 | 218 (+56) | Analytics completion + PnL fixtures. No scope cuts. |
| 4 | ✅ Complete | 2026-02-22 | 275 (+57) | Full API layer. No scope cuts. |
| 5 | ✅ Complete | 2026-02-22 | 324 (+49) | UI foundation + components. No scope cuts. |
| 6 | ✅ Complete | 2026-02-22 | 363 (+39) | Dashboard + holdings. 17/17 blocking. Zero scope cuts. |
| 7 | ✅ Complete | 2026-02-23 | — | Detail + transactions + charts. All 6 UI pages complete. |
| 8 | ✅ Complete | 2026-02-23 | — | LLM Advisor. Backend sequenced → frontend. |
| 9 | ✅ Complete | 2026-02-24 | 469 | Full-stack validation. 749/749 cross-validation. 21/21 MVP criteria. **MVP SHIPPED.** |
| **10** | **🟡 Planned** | — | **Target: 510+** | **Hardening + Bulk Paste + CI. SESSION-10-PLAN.md + SESSION-10-KICKOFF.md ready.** |

### Test Progression

```
S1:  ████████ 71
S2:  ████████████████ 162
S3:  ██████████████████████ 218
S4:  ████████████████████████████ 275
S5:  █████████████████████████████████ 324
S6:  ████████████████████████████████████ 363
S9:  █████████████████████████████████████████████ 469
S10: ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 510+ (target)
```

### Final Metrics (Post-Session 9)

| Metric | Value |
|--------|-------|
| Test count | 469 |
| Test files | 39 |
| TypeScript errors | 0 |
| Packages | 5 of 5 |
| API endpoints | 19 implemented + 2 stubs |
| UI components | 45 |
| Data hooks | 11 |
| UI pages | 6 of 6 |
| Prisma tables | 7 of 7 |
| Market data providers | 3 of 3 |
| Seed data | 28 instruments, 30 transactions, 8300+ price bars |
| MVP acceptance criteria | 21/21 |
| PnL cross-validation | 749/749 |
| Sessions completed | 9 of 9 (MVP) |

### Remaining Path

```
Session 10 (Hardening + Bulk Paste + CI) ← NEXT
    └──→ Wire live API keys (symbol search, quote refresh, historical backfill)
              └──→ Production use with real portfolio data
```

One session remains before the system is ready for live API keys and real money tracking.
