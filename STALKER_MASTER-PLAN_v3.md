# STALKER Master Plan — Engineering Roadmap

**Project:** Stock & Portfolio Tracker + LLM Advisor (Codename: STALKER)
**Version:** 3.0
**Date:** 2026-02-23
**Author:** Engineering Lead
**Inputs:** SPEC v4.0, Product Brief v3.1, UX/UI Design Plan v1.0, Bookworm Style Guide, DEEP_REVIEW_REPORT.md
**Status:** Session 8 Ready — Sessions 1–7 Complete

### Changelog

| Version | Date | Changes |
|---------|------|---------|
| 3.0 | 2026-02-23 | Session 7 marked complete (407 tests). Incorporated SWAT code review findings: added H-1 through H-5 hardening tasks to Session 8 Phase 0, added S9-CR-1 through S9-CR-3 to Session 9 scope, added architecture decisions AD-S7a/b/c, added risks R-10 through R-12, updated lessons learned L-7/L-8, updated "Not in Roadmap" with rejected review findings (R-007/R-010), updated Session 8 plan with Phase 0 hardening + sequenced advisor work, updated Session 9 priority stack. |
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

---

## 2. Epic Breakdown

### Epic 0: Project Scaffolding & Data Foundation ✅

**Goal:** Establish the monorepo, database schema, shared packages, and core utilities that every other epic depends on.

**Deliverables:**
- pnpm workspace monorepo structure matching Spec 3.3
- Prisma schema for all six tables (Instrument, Transaction, PriceBar, LatestQuote, PortfolioValueSnapshot, AdvisorThread, AdvisorMessage)
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

**Status:** ✅ Complete (Session 4) — **Note:** SWAT review (2026-02-23) identified that snapshot rebuild is not wired on mutation routes despite Session 4 implementing the endpoints. Remediation in Session 8 Phase 0 (see §3, SESSION-8-HARDENING-ADDENDUM.md, task H-1).
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

**Status:** ✅ Complete (Session 5) — **Note:** Font loading will be migrated from `next/font/google` to `next/font/local` in Session 8 Phase 0 (H-5) to eliminate build-time network dependency.
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
- Shared `useChart` hook extracted from Session 6 area chart

**Status:** ✅ Complete (Session 7)

**Depends on:** Epic 3 (API), Epic 5 (UI foundation)
**Blocks:** Epic 7 (advisor UI)

**Scope deferred from Epic 6B:**
- Transaction filters (instrument, type, date range) → Session 9
- Symbol search via live API (stubbed; manual entry fallback) → Session 9

---

### Epic 7: LLM Advisor

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

**Status:** 🟡 Session 8 (Phase 0 hardening + Phases 1–3 advisor)
**Depends on:** Epic 2 (analytics for tools), Epic 3 (API), Epic 5 (UI components)
**Blocks:** Nothing

---

### Epic 8: PnL Validation & Testing

**Goal:** Build the reference portfolio fixture and automated validation tests to guarantee calculation correctness.

**Deliverables:**
- Reference portfolio: 5+ instruments, 20–30 transactions (Spec 13.1)
- Expected outputs computed independently (lot states, realized PnL per sell, unrealized PnL, portfolio value at checkpoints)
- `data/test/reference-portfolio.json` + `data/test/expected-outputs.json`
- Fixture-based unit tests in `packages/analytics/` asserting to the cent
- Full-stack cross-validation plan (API + UI manual verification)

**Status:** Partially complete (fixtures built in Session 3; full-stack cross-validation in Session 9)
**Depends on:** Epic 2 (analytics engine)
**Blocks:** MVP signoff

---

### Epic 9: Polish & Next Priority Features

**Goal:** Post-core polish, bulk paste, and quality-of-life improvements.

**Deliverables:**
- Bulk transaction paste input (Spec 9.3.1) + `POST /api/transactions/bulk`
- Charts page refinement
- Responsive refinements for tablet
- Accessibility audit (keyboard navigation, ARIA, contrast)
- Performance optimization (memoization, code splitting, lazy loading)
- Cross-browser testing
- Known issues and tech debt documentation

**Status:** Not started (Session 9)
**Depends on:** All core epics complete
**Blocks:** Nothing (this is the final phase)

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
                        │                             └──→ Session 8 (Hardening + LLM Advisor) ← NEXT
                        └──→ Session 8 (also depends on API layer for advisor tools)
                                          └──→ Session 9 (Full-Stack Validation + Polish)
```

### Session Overview

| Session | Epic(s) | Scope | Team Shape | Est. Complexity | Status |
|---------|---------|-------|------------|-----------------|--------|
| 1 | 0 + 2 (partial) | Monorepo, Prisma, shared utils, MarketCalendar, FIFO lot engine | Lead + 2 teammates (parallel) | High | ✅ |
| 2 | 1 + 4 | All market data providers, rate limiter, fallback, scheduler | Lead + 2 teammates (parallel) | High | ✅ |
| 3 | 2 (completion) + 8 | Portfolio value series, snapshot rebuild, reference portfolio fixtures, PnL tests | Lead + 2 teammates (sequenced) | High | ✅ |
| 4 | 3 | All API endpoints, instrument creation flow, transaction validation flow | Lead + 2 teammates (parallel) | High | ✅ |
| 5 | 5 | Tailwind config, design tokens, base components, layout shell, empty states | Lead + 2 teammates (parallel) | Medium | ✅ |
| 6 | 6A | Dashboard page, holdings page, TradingView charts, data health footer | Lead + 2 teammates (parallel) | High | ✅ |
| 7 | 6B | Holding detail, transactions page, add/edit forms, charts page | Lead + 2 teammates (parallel) | High | ✅ |
| 8 | **Hardening** + 7 | **Phase 0: Code review remediation (H-1 through H-5).** Phases 1–3: LLM adapter, tools, system prompt, chat panel UI, thread management | Lead (Phase 0) + sequenced teammates | High | 🟡 Planned |
| 9 | 8 (validation) + 9 + **CR items** | Full-stack cross-validation, bulk paste, **Zod date validation, status endpoint fixes, route smoke tests**, accessibility, polish | Lead + 2 teammates (parallel) | Medium–High | Not started |

### Session Details

#### Session 1: Foundation + Analytics Core ✅
**Epics:** 0 (full) + 2 (FIFO engine, sell validation, unrealized PnL)

**Result:** 71 tests. Foundation solid. No scope cuts.

---

#### Session 2: Market Data Service + Scheduler ✅
**Epics:** 1 (full) + 4 (full)

**Result:** 162 tests (+91). All providers implemented. No scope cuts.

---

#### Session 3: Analytics Completion + PnL Validation Fixtures ✅
**Epics:** 2 (remainder) + 8

**Result:** 218 tests (+56). Reference portfolio fixtures in place. No scope cuts.

---

#### Session 4: API Layer ✅
**Epic:** 3 (full)

**Result:** 275 tests (+57). All endpoints implemented. No scope cuts.

**Post-session finding:** SWAT review identified snapshot rebuild not wired on mutation routes. Remediation scheduled for Session 8 Phase 0 (H-1).

---

#### Session 5: UI Foundation ✅
**Epic:** 5 (full)

**Result:** 324 tests (+49). Full component library. No scope cuts. R-7 (tabular-nums) verified working.

---

#### Session 6: Dashboard + Holdings UI ✅
**Epic:** 6A

**Result:** 363 tests (+39). 17/17 blocking criteria met. Zero scope cuts. R-3 (TradingView theming) resolved. Enriched seed data: 28 instruments, 30 transactions, 8300+ price bars.

---

#### Session 7: Detail + Transactions + Charts UI ✅
**Epic:** 6B

Build the remaining core pages. The transaction form's validation UX is critical — users must understand immediately why a sell was rejected.

**Teammate split:**
- **Teammate 1 (`detail-engineer`):** Holding detail page (position summary, candlestick chart, lots table, transaction history, unpriced warning), charts page, shared `useChart` hook extraction
- **Teammate 2 (`transactions-engineer`):** Transactions page (table, add/edit form with validation, delete confirmation), add instrument flow (search modal), sell validation error display

**Parallel:** Yes — holding detail and transactions page are independent.

**Result:** 407 tests (+44). 21/21 blocking criteria met (1 partial: symbol search stubbed). Two scope cuts: transaction filters deferred to S9, symbol search API stubbed with manual entry fallback.

**Issues found and resolved:**
- Sell validation field name mismatch (`firstViolationDate` not `firstNegativeDate`) — caught in pre-flight
- `GET /api/transactions` required `instrumentId` — fixed to make optional, added `symbol`/`instrumentName` to response
- `ToastProvider` missing — `useToast()` caused Next.js build failure during static prerendering, fixed by wrapping Shell

**Notable:** `parseFloat` → `Decimal.js` fix in `ValueChange` component maintained AD-S6c discipline (no `Number()` leaks outside chart utils).

---

#### Session 8: Hardening + LLM Advisor ← NEXT
**Epics:** Code review hardening + 7 (full)

This session has two distinct phases: code review remediation (Lead solo), then the advisor build (sequenced teammates).

**Phase 0: Hardening (Lead only, ~3 hours)**

Five remediation tasks from the SWAT code review. Full details in `SESSION-8-HARDENING-ADDENDUM.md`.

| Task | Source | Summary |
|------|--------|---------|
| H-5 | R-005 | Migrate Google Fonts to `next/font/local` — unblocks `pnpm build` |
| H-3 | R-003 | Fix search route response shape (`{ results: [] }` not `[]`) |
| H-4 | R-004 | Add `AbortController` timeout (10s) to all provider fetch calls |
| H-1 | R-002 | Wire `rebuildSnapshotsFrom()` on all transaction/instrument mutation routes |
| H-2 | R-001 | Make GET snapshot route read-only (no delete/rebuild on reads) |

Phase 0 gate: `pnpm build` exits 0, `tsc --noEmit` 0 errors, all 407+ tests pass, 10–15 new hardening tests pass.

**Phase 1: Advisor Backend (Teammate 1: `advisor-backend`)**
- LLM adapter interface + Anthropic implementation
- Four tool definitions (getPortfolioSnapshot, getHolding, getTransactions, getQuotes)
- Tool execution loop (max 5 iterations)
- System prompt (5 intent categories)
- Advisor API routes (chat, threads CRUD)
- Conversation persistence

**Phase 2: Lead Verification**
- Run system prompt against 5 example queries via Anthropic API directly
- Verify tool calls fire correctly, responses are non-trivial
- Sign off before frontend work begins

**Phase 3: Advisor Frontend (Teammate 2: `advisor-frontend`)**
- Chat panel UI (slide-out from FAB)
- Message display, tool call indicators (collapsible)
- Thread list/management
- Suggested prompts
- Setup state when API key missing

**Sequencing:** Phase 0 (Lead) → Phase 1 (backend teammate) → Phase 2 (Lead verification) → Phase 3 (frontend teammate). Not parallel — prompt quality must be verified before UI work.

**Key decisions for Session 8:**
- Non-streaming for MVP (simple loading state, not SSE). Add streaming post-MVP.
- Context window: send last 50 messages. No summary generation for MVP.
- `"use client"` boundaries needed for advisor panel state — document pattern in CLAUDE.md (lesson from S7 ToastProvider issue).

---

#### Session 9: Validation + Polish + Code Review Remediation
**Epics:** 8 (cross-validation) + 9 (polish) + deferred code review items

This session carries the most diverse scope of any session. Apply priority stack strictly:

```
Cross-validation (MVP signoff gate)
  > Bulk paste input
  > Code review items (S9-CR-1, S9-CR-2, S9-CR-3)
  > Symbol search wiring (if API keys available)
  > Transaction filters
  > Accessibility audit
  > Responsive refinements
```

**Teammate split:**
- **Teammate 1 (`validation-engineer`):** Full-stack cross-validation (load reference portfolio via API, verify every displayed value matches fixtures), regression test suite completion, route-level smoke tests (S9-CR-3)
- **Teammate 2 (`polish-engineer`):** Bulk transaction paste input, Zod date validation (S9-CR-1), status endpoint fixes (S9-CR-2), transaction filters (if time), accessibility audit

**Parallel:** Yes — validation and polish are independent.

**Scope cut priority (if needed):**
1. ~~Cross-validation~~ (never cut — MVP signoff gate)
2. ~~Bulk paste~~ (product priority "Next")
3. ~~Code review items~~ (correctness/reliability)
4. Symbol search wiring (nice-to-have if API keys exist)
5. Transaction filters (table works without them)
6. Accessibility audit (defer to post-MVP if pressed)
7. Responsive refinements (desktop-first, mobile is secondary per UX Plan §1.2)

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
| SD-12 | No auth/security middleware for MVP | Spec §1.1 explicitly states "No auth, no cloud dependency." Next.js dev binds to localhost by default. Adding auth guardrails has no user benefit for a local-first single-user app. | Deployment guard flag (rejected per SWAT review R-007 triage: post-MVP concern, not MVP scope) |
| SD-13 | Placeholder routes retained until implemented | Advisor, bulk, and search routes are on the S8/S9 roadmap. Removing them creates busywork that the next session reverses. | Remove stubs (rejected per SWAT review R-010 triage: these are planned code, not dead code) |

---

## 5. Architecture Decisions from Execution

Decisions made during sessions that refine or extend the strategic decisions above. These are binding going forward.

| # | Session | Decision | Rationale |
|---|---------|----------|-----------|
| AD-S1 | S1 | Prisma Decimal stored as TEXT in SQLite — application-code comparison only, no SQL numeric comparisons | SQLite has no native DECIMAL type. TEXT preserves exact representation. Queries that need numeric comparison use Decimal.js in application code. |
| AD-S4 | S4 | Sell validation returns HTTP 422 with structured error body: `{ error, details: { instrumentSymbol, firstViolationDate, deficitQuantity } }` | Structured error enables the UI to render a specific, actionable error message rather than a generic rejection. Note: field name is `firstViolationDate` (not `firstNegativeDate` as in early plans). |
| AD-S6a | S6 | Client-side `fetch` + `useState`/`useEffect`, no SWR or global state manager | Minimal dependencies. Single user, no cache invalidation needed. <20 instruments means no global state coordination required. |
| AD-S6b | S6 | TradingView v5 with `useRef` lifecycle pattern | Imperative chart API requires ref-based create/dispose. ResizeObserver for responsive width. |
| AD-S6c | S6 | `Number()` exception only in `chart-utils.ts` and `chart-candlestick-utils.ts` | TradingView requires native numbers. All other display code uses Decimal string → formatter pipeline. This exception is documented and contained. |
| AD-S6d | S6 | Enriched seed: 28 instruments, 30 transactions, 8300+ price bars, 3 intentionally stale quotes | Realistic data environment for UI development. Stale quotes exercise staleness UX paths. Carried forward for all future sessions. |
| AD-S7a | S7 | Extract shared `useChart` hook from Session 6 area chart for reuse with candlestick chart | Prevents two divergent chart lifecycles. Hook handles create/dispose/resize; series type is a parameter. Confirmed working in Session 7 integration. |
| AD-S7b | S7 | `parseFloat` replaced with `Decimal.js` in `ValueChange` component for sign detection | Maintains AD-S6c discipline. No `Number()`/`parseFloat` outside chart utility files. |
| AD-S7c | S7 | `ToastProvider` wraps `Shell` at layout level for app-wide toast support | `useToast()` in transaction components caused Next.js build failure during static prerendering. Client context providers must wrap at the layout level. **Pattern note for Session 8:** Advisor panel will need similar `"use client"` boundary treatment. |

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
| 7 (Detail + Transactions) ✅ | Frontend: All sections, UX/UI: All sections | Form validation UX, sell validation error display, keyboard nav |
| 8 (Hardening + Advisor) | Backend: API & Contracts (Phase 0), Backend + Frontend: All sections (Phases 1–3) | Snapshot rebuild correctness, LLM error handling, streaming UX, tool call visibility |
| 9 (Validation + Polish) | QA: All sections, UX/UI: Post-Release Review | Regression, cross-validation, PnL accuracy, accessibility audit |

---

## 7. Risk Register

| # | Risk | Likelihood | Impact | Status |
|---|------|-----------|--------|--------|
| R-1 | FIFO lot math has edge cases | Medium | Critical | **Open.** Reference portfolio fixture (S3) catches regressions. Full-stack cross-validation in S9 is the final gate. |
| R-2 | Free-tier API limits change | Medium | Medium | **Open.** Limits are env-configurable (Spec 6.2). Budget check at startup. Staleness indicator covers gaps. No issues observed through S7. |
| R-3 | TradingView chart theming too limited | Low | Low | ✅ **Resolved (S6).** Dark theme, custom colors, crosshair all work with v5 API. |
| R-4 | Prisma Decimal + SQLite TEXT causes comparison issues | Medium | Medium | **Open.** AD-S1 enforces application-code comparison only. No issues observed through S7. |
| R-5 | Advisor system prompt quality | Medium | High | **Open.** Write and test prompt against 5 intent categories before building UI. Targeted for Session 8 Phase 2. |
| R-6 | Snapshot rebuild performance at scale | Low | Low | **Open.** Single user, <100 instruments. Sub-second replay expected. No issues observed through S7 with 28 instruments. |
| R-7 | DM Sans tabular-nums not working via Google Fonts | Low | Medium | ✅ **Resolved (S5/S6).** `font-mono` applied to numeric table columns. |
| R-8 | Sell validation error UX unclear to user | Medium | High | ✅ **Resolved (S7).** SellValidationError component implemented. Structured error body (AD-S4) renders clear messages with date, deficit, and suggested fix. Field name mismatch caught in pre-flight. |
| R-9 | Multi-fetch waterfall on holding detail page | Medium | Low | ✅ **Resolved (S7).** `Promise.all` pattern used. |
| R-10 | Snapshot cache stale after mutations | **Confirmed** | **High** | **Remediating in S8 Phase 0 (H-1, H-2).** SWAT review confirmed mutation routes skip snapshot rebuild, violating Spec §4.2 and §8.2. GET route compensates via destructive rebuild, masking the bug. Fix: wire rebuild on mutations, make GET read-only. |
| R-11 | Provider fetch hangs block scheduler cycle | Medium | Medium | **Remediating in S8 Phase 0 (H-4).** No `AbortController` timeout on provider fetches. A hanging upstream stalls the sequential polling loop. Fix: 10s timeout wrapper. |
| R-12 | Search route response shape mismatch crashes add-instrument flow | **Confirmed** | Medium | **Remediating in S8 Phase 0 (H-3).** Route returns `[]`, UI expects `{ results: [] }`. Runtime TypeError on search input. Fix: standardize to `{ results: [] }` + defensive parsing. |

---

## 8. Lessons Learned

Patterns that have proven effective across Sessions 1–7 and should be continued:

| # | Lesson | Evidence |
|---|--------|----------|
| L-1 | **Lead integration pass catches real bugs.** | S6: TradingView v5 API change, HoldingsTable wiring, snapshot test fragility. S7: ToastProvider missing, parseFloat leak in ValueChange. |
| L-2 | **Enriched seed data pays for itself immediately.** | S6: 28 instruments + 3 stale quotes gave realistic data for every UI component. Carried forward as AD-S6d. |
| L-3 | **Zero scope cuts through 6 sessions, minimal cuts in S7.** | Session planning process is sizing work correctly. S7 had 2 minor deferrals (filters, search API) — both recoverable in S9. |
| L-4 | **Test progression is healthy and consistent.** | S1: 71 → S2: 162 → S3: 218 → S4: 275 → S5: 324 → S6: 363 → S7: 407. ~40–90 new tests per session. No regressions. |
| L-5 | **`Number()` exception discipline is holding.** | AD-S6c/AD-S7b: Only chart utility files use `Number()`. `parseFloat` leak in ValueChange caught and fixed in S7 integration. |
| L-6 | **Parallel teammate mode works when filesystem scopes don't overlap.** | 6 of 7 completed sessions used parallel mode with zero merge conflicts. Continue enforcing non-overlapping filesystem scopes. |
| L-7 | **Pre-flight API contract verification prevents teammate rework.** | S7: Caught two API mismatches (field name `firstViolationDate`, `instrumentId` required) in pre-flight. Budget 10 minutes of pre-flight time in every remaining session. |
| L-8 | **External code review catches bugs that the team's mental model hides.** | SWAT review found R-10 (snapshot rebuild not wired on mutations) which the team missed for 4 sessions because the GET-side rebuild masked the symptom. Regular external review cadence is worth the cost. |

---

## 9. Not in Roadmap

Ideas captured but explicitly deferred past MVP and Next:

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
- Summary generation for long advisor threads
- Mobile-native app
- Brokerage API integrations
- Auth/security middleware or deployment guard flags (SWAT R-007 — local-only app, no user benefit; see SD-12)
- Placeholder route cleanup/feature flags (SWAT R-010 — routes are planned for S8/S9, not dead code; see SD-13)
- Incremental snapshot engine with dirty-range queue (SWAT R-001 ideal fix — over-engineering for single-user MVP)
- Provider circuit breaker / bounded concurrency / retry with jitter (SWAT R-004 ideal fix — post-MVP reliability hardening)
- Formal OpenAPI/Zod schema contract enforcement (SWAT R-009 ideal fix — post-MVP API maturity)
- Duplicate transaction serializer refactor (SWAT R-006 note — low-risk DRY cleanup, do when natural)

---

## 10. Session Status Tracker

| Session | Status | Date | Tests | Notes |
|---------|--------|------|-------|-------|
| 1 | ✅ Complete | 2026-02-21 | 71 | Foundation + FIFO engine. No scope cuts. |
| 2 | ✅ Complete | 2026-02-21 | 162 (+91) | Market data providers + scheduler. No scope cuts. |
| 3 | ✅ Complete | 2026-02-21 | 218 (+56) | Analytics completion + PnL fixtures. No scope cuts. |
| 4 | ✅ Complete | 2026-02-22 | 275 (+57) | Full API layer. No scope cuts. Snapshot rebuild gap identified post-session. |
| 5 | ✅ Complete | 2026-02-22 | 324 (+49) | UI foundation + components. No scope cuts. |
| 6 | ✅ Complete | 2026-02-22 | 363 (+39) | Dashboard + holdings. 17/17 blocking. Zero scope cuts. |
| 7 | ✅ Complete | 2026-02-23 | 407 (+44) | Detail + transactions + charts. 21/21 blocking (1 partial). Two minor deferrals. |
| 8 | 🟡 **Planned** | — | Target: 460+ | Phase 0: hardening (H-1–H-5, ~15 new tests). Phases 1–3: advisor (~40 new tests). |
| 9 | Not started | — | Target: 500+ | Full-stack cross-validation + polish + CR items. MVP signoff gate. |

### Test Progression

```
S1: ████████ 71
S2: ████████████████ 162
S3: ██████████████████████ 218
S4: ████████████████████████████ 275
S5: █████████████████████████████████ 324
S6: ████████████████████████████████████ 363
S7: ████████████████████████████████████████ 407
S8: ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 460+ (target)
```

### Remaining Critical Path

```
Session 8 (Hardening + LLM Advisor) ← NEXT
    └──→ Session 9 (Validation + Polish + CR Items + MVP Signoff)
```

Two sessions remain. One confirmed bug (R-10) being remediated in next session. No structural blockers. No scope debt carried forward beyond documented deferrals.
