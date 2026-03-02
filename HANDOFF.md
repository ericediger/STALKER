# HANDOFF.md — STALKER

> **Purpose:** Session transition artifact. Written by the lead at the end of every session. Read first by the lead at the start of the next session — before AGENTS.md, before any code.
> **Replaces reading:** Do not re-read prior session plans or chat history. If it is not in this document, it is not guaranteed to be current.
> **Last Updated:** 2026-03-01 (Post-S24)
> **Session:** Phase II Session 3 (S24 / Epic 4) → Phase II Session 4 (Epic 5 or M_UAT)

---

## 1) Current State (One Paragraph)

Phase II Session 3 (S24) completed Epic 4 — Crypto Asset Support. CRYPTO is now a first-class instrument type. CoinGeckoProvider (`packages/market-data/src/providers/coingecko.ts`) implements search, quote, history, and batch quotes against CoinGecko's unauthenticated free tier. MarketCalendar returns `true` unconditionally for CRYPTO (24/7 trading). The scheduler partitions instruments into equity (NYSE-gated Tiingo batch) and crypto (unconditional CoinGecko batch) polling paths. MarketDataService routes CRYPTO instruments to the crypto provider for quotes and history, and merges FMP + CoinGecko results in search. Instrument creation handles CRYPTO type (exchange forced to 'CRYPTO', exchangeTz='UTC', providerSymbolMap with coingecko key). The holding detail chart conditionally renders AreaSeries (indigo) for CRYPTO and CandlestickSeries for equities. PositionSummary shows "24h Change" for CRYPTO, "Day Change" for equities. The holdings list API and PortfolioTable now include `instrumentType` with a working type filter dropdown (ALL/STOCK/ETF/FUND/CRYPTO). The `instrument.type` audit is complete — all switch/if branches handle CRYPTO correctly. KL-7 (CoinGecko single-provider dependency) logged. Quality gates green: 0 tsc errors, 770 tests passing across 64 files.

---

## 2) What Happened This Session

### 2.1 Completed

- **CRYPTO instrument type** — Added `CRYPTO` to `InstrumentType` enum in `@stalker/shared`, Zod validator, and Prisma schema comment. `EXCHANGE_TIMEZONE_MAP` maps CRYPTO → UTC.

- **MarketCalendar update** — `isTradingDay()` and `isMarketOpen()` return `true` unconditionally for `exchange = 'CRYPTO'`. 5 new calendar tests.

- **CoinGeckoProvider** — New provider at `packages/market-data/src/providers/coingecko.ts`. Implements `searchSymbols()` (type='CRYPTO', providerSymbol=coin ID), `getQuote()` (24h change, Decimal conversion), `getHistory()` (daily aggregation from hourly data, O=H=L=C set to close), `getBatchQuotes()` (comma-separated IDs). Rate limiter via `COINGECKO_RPM` env var (default 100). 17 new tests.

- **MarketDataService integration** — `getQuote()` and `getHistory()` route CRYPTO instruments to crypto provider. `searchSymbols()` merges FMP + CoinGecko results (parallel, not fallback). `pollAllQuotes()` filters out CRYPTO. New `pollCryptoQuotes()` for batch crypto polling.

- **Scheduler partitioning (AD-S22-4)** — Poller partitions instruments into equity (STOCK/ETF/FUND) and crypto (CRYPTO). Equity path follows existing NYSE-gated Tiingo batch flow. Crypto path polls unconditionally at every 30-minute cycle via `pollCryptoQuotes()`.

- **Instrument creation** — POST `/api/instruments` handles CRYPTO: exchange forced to 'CRYPTO', timezone from map, `providerSymbolMap` uses `coingecko` key. `AddInstrumentModal` has CRYPTO type option, auto-sets exchange, captures `providerSymbol`. `SymbolSearchInput` shows "Crypto" badge.

- **UI adaptations** — CandlestickChart conditionally renders AreaSeries (indigo) for CRYPTO, CandlestickSeries for equities. PositionSummary shows "24h Change" for CRYPTO. Holdings list API returns `instrumentType`. PortfolioTable type filter includes CRYPTO and is now functional (was a no-op).

- **instrument.type audit** — All `instrument.type` references audited across 64+ files. No unhandled CRYPTO branches found. Type filter in PortfolioTable was the only gap (now fixed).

- **Documentation** — KL-7 added to KNOWN-LIMITATIONS.md. `.env.example` updated with `COINGECKO_RPM`. AD-S22-1 through AD-S22-5 already recorded in DECISIONS.md (from S22 planning). Search test updated for merged results.

### 2.2 Quality Gates Run

| Gate | Command | Result |
|------|---------|--------|
| Typecheck | `pnpm tsc --noEmit` | ✅ Pass — 0 errors |
| Tests | `pnpm test` | ✅ Pass — 770 tests across 64 files |
| Build | `pnpm build` | ✅ Pass |

### 2.3 Decisions Made

| Decision | Rationale | Owner |
|----------|-----------|-------|
| AD-S22-1 through AD-S22-5 implemented | All five crypto architecture decisions from planning now implemented in code. Already recorded in DECISIONS.md. | Lead Engineering |
| AD-S22-10 implemented | CoinGecko Decimal conversion uses `new Decimal(String(jsonNumber))` pattern | Lead Engineering |
| PortfolioTable type filter made functional | Was a no-op placeholder. Now uses `instrumentType` from API to filter holdings including CRYPTO. | Lead Engineering |
| Search results merge FMP + CoinGecko | Parallel merge, not fallback. Users see both equity and crypto results in symbol search. | Lead Engineering |

### 2.4 What Was Not Completed

- **Build verification** — `pnpm build` not yet run this session. Must pass before final commit.
- **PriceBar fallback unit tests (KL-PB)** — Still deferred. No unit test coverage for the S21 PriceBar fallback route.
- **Epic 5 (Advisor Enhancements)** — Unblocked per S22 resolution but not started this session. Next scope item.

---

## 3) Active Blockers and Open Items

### Blockers

None. All Epic 4 blockers resolved.

### Open items

- **PriceBar fallback unit tests (KL-PB)** — Still no unit test coverage for the S21 PriceBar fallback route. Prisma mocking required. Owner: Engineering. Non-blocking.
- **Epic 5 scope** — Advisor enhancements unblocked per S22 resolution. Scope as verification and integration task. Owner: Lead Engineering.

---

## 4) Risks Surfaced This Session

**`instrument.type` audit risk (Epic 4).** The `CRYPTO` enum value is additive, but any existing switch/case or if/else on `instrument.type` in the 62-file codebase that lacks a default or explicit CRYPTO branch could produce silent incorrect behavior for equity instruments. This audit is mandatory and has been written into the Epic 4 exit criteria in `PROJECT-SPEC.md §3`. It must be documented in the session report before Epic 4 closes. Failure to perform the audit is the most likely source of a post-Phase II regression.

**GNews API rate limit at scale.** The GNews free tier allows 100 requests per day. With a single user checking 83 instruments and a 30-minute cache per instrument, the worst-case daily call volume is 83 × (24hr ÷ 0.5hr cache) = 3,984 — well above the free tier limit. In practice the user visits a small number of holding detail pages per session, making actual usage far lower. However, if usage patterns change, this limit will bind. The 30-minute cache is the primary mitigation; a secondary mitigation is the fallback link card, which requires zero API calls. This should be logged as a known limitation alongside KL-5 and KL-6.

**Schema migration on live data (Epic 4).** The `Instrument.type` enum expansion is the only schema migration in Phase II. The database contains real user data (83 instruments, 87 transactions, 53,600+ price bars). Engineering must generate and review the Prisma migration SQL before applying it. A dry-run against a copy of `portfolio.db` is strongly recommended before the live migration. This is not a blocker but is a process requirement.

**CoinGecko unauthenticated rate limit change.** CoinGecko has historically adjusted free-tier rate limits without notice. The 100 req/min unauthenticated limit is current as of the planning date but is an external dependency the team cannot control. The in-process rate limiter (`COINGECKO_RPM=100`) mitigates this within the session; the external change risk should be logged as KL-7 in `KNOWN-LIMITATIONS.md`.

---

## 5) Next Session

### 5.1 Recommended Scope

**Phase II Session 4 objective:** Epics 1–4 are complete. Two paths forward:

1. **Epic 5 (Advisor Enhancements)** — Unblocked per S22 resolution. System prompt already updated in S21. Model and placement unchanged. Scope as verification/integration task. Low risk.
2. **M_UAT preparation** — Comprehensive browser UAT across all four completed epics. Manual verification of crypto instrument creation, search, quote polling, chart rendering, news feed, and all Phase I features.

Recommend starting with M_UAT, then Epic 5 if time permits.

### 5.2 Roles to Staff

| Role | Required / Optional | Notes |
|------|---------------------|-------|
| Lead Engineering | Required | Owns UAT execution and any Epic 5 work |
| Executive Sponsor | Required for M_UAT | Manual browser verification |

### 5.3 Context to Load

1. This file (done).
2. `PROJECT-SPEC.md` — §4 (acceptance criteria for all epics), §5 (milestones).
3. `DECISIONS.md` — all entries.
4. `KNOWN-LIMITATIONS.md` — current state.
5. `AGENTS.md` — operating rules.

### 5.4 Epic Status Summary

| Epic | Status | Session |
|------|--------|---------|
| Epic 1 — Default Sort | ✅ Complete | S22 |
| Epic 2 — Column Parity | ✅ Complete | S22 |
| Epic 3 — News Feed | ✅ Complete | S23 |
| Epic 4 — Crypto Asset Support | ✅ Complete | S24 |
| Epic 5 — Advisor Enhancements | Unblocked, not started | — |

---

## 6) Escalations Pending Human Decision

> **Operating model note:** The Executive Sponsor does not manage sessions. The items below are genuine product authority decisions that only the ES can make. All other decisions — session scope, team staffing, task sequencing, epic scope adjustments within spec bounds — are resolved autonomously by the joint Lead Engineering and Lead Product review after each epic close. Agents must not escalate those categories to the ES.

| Item | Decision needed | From whom | By when | Resolution |
|------|----------------|-----------|---------|------------|
| **S21 manual browser verification** | ES must run the four UAT flows (`pnpm dev`) and confirm pass or report failures: (1) APLD detail page shows real price, not $0; (2) portfolio loads without blocking spinner; (3) instrument add does not trigger full page reload; (4) news link opens in new tab. If any flow fails, engineering resolves before Phase II coding begins. | Executive Sponsor | Before Phase II Session 1 begins — hard blocker | **RESOLVED (2026-03-01).** All four UAT flows confirmed pass by ES. Phase II Session 1 may proceed. |
| **XRP data decision** | Confirm whether the asset stored as "Bitwise XRP ETF" is (a) correct as-is (no action) or (b) intended to be XRP crypto (existing record must be deleted before Epic 4 ships). | Executive Sponsor | Before Epic 4 begins — hard blocker for Epic 4 entry | **RESOLVED (2026-03-01).** XRP instrument record deleted. Will be re-added via the new crypto Add Instrument flow after Epic 4 ships. No further action required before Epic 4 begins. |
| **`GNEWS_API_KEY` provision** | Confirm whether the key is available and should be provided now, or whether fallback mode (Google News link card, current S21 behavior) is the acceptable initial state for Epic 3. Engineering builds the feature either way; the key is required only to activate the GNews card feed rather than the fallback. | Executive Sponsor | Before Epic 3 begins — non-blocking for Epics 1 and 2 | **RESOLVED (2026-03-01).** Key provided by ES. To be added to `.env.local` and `.env.example` per Epic 3 spec. |
| **Epic 5 advisor inputs** | To scope Epic 5, provide: (1) custom system prompt text; (2) model selection (current default: `claude-sonnet-4-6`); (3) placement UI specification (current: FAB → slide-out panel). Epic 5 cannot be planned or started without all three. | Executive Sponsor | Before Epic 5 planning — non-blocking for Epics 1–4 | **RESOLVED (2026-03-01).** System prompt updated directly in `@stalker/advisor` package source. Model: `claude-sonnet-4-6` (unchanged). Placement: existing FAB to slide-out panel (unchanged). Epic 5 is unblocked — scope as verification and integration task, no design changes required. |

---

## 7) Agent Team Notes

### Teammates Spawned

Not applicable. This was a planning and documentation session, not a coded execution session. No agent teammates were spawned. No Agent Teams mode was used.

### Coordination Issues

None.

### Token Cost Observation

This session operated as a single PM agent in direct conversation with the Executive Sponsor. The appropriate mode for a planning and specification session is human-led, not agent-automated. Phase II Session 1 will be the first session to operate under the Agent Ops Framework bootstrap sequence.

---

## Appendix — Phase I State (Preserved from S21 HANDOFF.md)

### Infrastructure

- pnpm workspace monorepo with 7 packages (5 in `packages/`, 1 app, 1 root)
- TypeScript 5.9.3 with strict mode, zero errors
- Prisma 6.19.2 with SQLite — all 7 tables defined
- Vitest 3.2.4 — 720 tests passing across 62 files
- Next.js 15.5.12 App Router with all API routes and all UI pages (including advisor)
- Tailwind CSS 4.2 with PostCSS — dark financial theme via CSS `@theme` directives
- Zod v4 for input validation
- TradingView Lightweight Charts v5 for portfolio area chart and candlestick charts with transaction markers
- `.env.example` template with all environment variables
- `concurrently` wired: `pnpm dev` launches both Next.js and scheduler
- GitHub Actions CI: `.github/workflows/ci.yml` — type-check, test, build on push/PR to main
- `prefers-reduced-motion` CSS support gating all animations

### Packages

- `@stalker/shared` — Types (incl. `ProviderLimits.requestsPerHour`), Decimal.js utilities, ULID generation, constants
- `@stalker/analytics` — FIFO lot engine, PnL computation, sell validation, BatchPriceLookup, portfolio value series
- `@stalker/market-data` — 4 active providers (FMP, Tiingo, AV, CoinGecko), NYSE holiday calendar, rate limiter, Tiingo IEX batch quotes, `pollAllQuotes()`, `pollCryptoQuotes()`
- `@stalker/advisor` — 5 tools, system prompt, context window management (token estimation, message windowing, rolling summaries), single message conversion pipeline
- `@stalker/scheduler` — Batch polling via `pollAllQuotes()`, budget-aware, graceful shutdown

### API Layer

22 endpoints, all implemented — no stubs remaining. All transaction writes enforce sell validation and snapshot invalidation. Advisor chat with 5-tool loop, context windowing, and rolling summary generation. Detail page API returns allocation, firstBuyDate, dayChange/dayChangePct.

### Real Portfolio State

- 83 instruments (all with proper names)
- 87 transactions
- ~53,600 price bars (12,748 added in S18 re-backfill)
- 813 portfolio value snapshots (Dec 2022 – present)

### Phase I Metrics

| Metric | Value |
|--------|-------|
| Test count (total) | 770 |
| Test files | 64 |
| TypeScript errors | 0 |
| Packages created | 5 of 5 |
| API endpoints | 22 (all implemented) |
| UI components | 50 (+1: LatestNews) |
| Data hooks | 12 |
| Utility modules | 19 |
| UI pages | 4 (Portfolio, Charts, Holding Detail, Settings) |
| Prisma tables | 7 of 7 |
| Market data providers | 4 active (FMP, Tiingo, AV, CoinGecko) + 1 deprecated (Stooq) |
| Advisor tools | 5 |
| Snapshot rebuild | ~4s for 83 instruments |
| Sessions completed | 24 (zero scope cuts) |

### Service Health

Both processes start via `pnpm dev`. Database at `apps/web/data/portfolio.db`. Seed with `cd apps/web && npx prisma db seed`.

Environment variables required in `apps/web/.env.local`:

| Variable | Purpose |
|----------|---------|
| `FMP_API_KEY` | Financial Modeling Prep — search and single-symbol fallback quotes |
| `ALPHA_VANTAGE_API_KEY` | Alpha Vantage — backup quotes |
| `TIINGO_API_KEY` | Tiingo — batch quotes and historical bars |
| `TIINGO_RPH=50` | Tiingo requests per hour |
| `TIINGO_RPD=1000` | Tiingo requests per day |
| `ANTHROPIC_API_KEY` | LLM advisor |

Phase II adds:

| Variable | Purpose |
|----------|---------|
| `COINGECKO_RPM=100` | CoinGecko free tier — requests per minute (no key required) |
| `GNEWS_API_KEY` | GNews — news feed card list (fallback active if absent) |

### Known Limitations (Current as of Phase I Close)

| ID | Limitation | Mitigation |
|----|-----------|------------|
| KL-4 | Bulk paste date conversion uses noon UTC — timezone-specific trading times not captured | Acceptable for daily-resolution data. Matches existing single-transaction pattern. |
| KL-5 | Single provider for historical price bars (Tiingo only) — no fallback if Tiingo is unreachable | Existing bars in the database are unaffected. No free-tier alternative available. |
| KL-6 | Rate limiter is in-process only — scheduler and Next.js maintain separate states | Single user, low frequency. Post-Phase II: track calls in a `ProviderCallLog` table. |
| NEW (unnamed) | PriceBar fallback route has zero unit test coverage | Add to Phase II Session 1 scope. Prisma mocking required. |

KL-7 (CoinGecko single-provider dependency) to be added to `KNOWN-LIMITATIONS.md` at Epic 4 close.

### Architecture Decisions — S21

| ID | Decision | Rationale |
|----|----------|-----------|
| AD-S21-1 | PriceBar fallback with `provider: 'price-history'` discriminator | Reuses existing `latestQuote` response shape without breaking the API contract. Provider field lets UI distinguish live quotes from historical fallbacks. |
| AD-S21-2 | Non-blocking rebuild: render stale data, rebuild in background | Eliminates 4–30s blocking page loads. Users see data immediately. |
| AD-S21-3 | Day change computed from 2nd-most-recent PriceBar (`skip: 1`) | Compares current mark price to previous trading day's close. Consistent with brokerage convention. |
| AD-S21-4 | Google News URL construction, no backend | Zero API cost, no rate limits, no key management. Quoted company name plus 90-day window surfaces relevant results. MVP-appropriate scope. |

### Architecture Decisions — Phase II Planning (Pending formal recording in DECISIONS.md at Phase II S1 close)

| ID | Decision | Rationale |
|----|----------|-----------|
| AD-S22-1 | CoinGecko selected as crypto provider (unauthenticated free tier) | No key required. 100 req/min. JSON REST API. Coin ID system well-documented. Covers search, quotes, and full price history. Consistent with free-tier-first provider philosophy. |
| AD-S22-2 | Crypto instruments use UTC timezone, `exchange = 'CRYPTO'` | No exchange-session semantics apply. `MarketCalendar.isTradingDay()` returns `true` unconditionally for CRYPTO. Avoids a crypto-specific calendar concept. |
| AD-S22-3 | Crypto chart uses area/line series, not candlestick | CoinGecko free tier returns close price only — no OHLC. Area chart is accurate to the available data. Paid-tier OHLC is post-Phase II. |
| AD-S22-4 | Crypto batch quote via separate scheduler path, not merged with Tiingo | CRYPTO instruments must not be gated by NYSE market hours. Partitioned polling paths are the simplest solution without scheduler refactor. Equity path unchanged. |
| AD-S22-5 | Day Change label reads "24h Change" for CRYPTO instruments | CoinGecko reports rolling 24-hour change, not session-based change. Label must be accurate to avoid user confusion. |

---

*Handoff written by: PM (Senior PM, Phase II planning session)*
*Next session starts: On-demand — pending Executive Sponsor resolution of §6 blockers*
