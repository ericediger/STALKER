# HANDOFF.md — STALKER Current State

**Last Updated:** 2026-02-24 (Post-Session 12)
**Last Session:** Session 12 — API Wiring + Pipeline Soak

---

## Current State

Session 12 closed the integration gap between Session 11's provider layer and the API routes. All three remaining stubs (search, refresh, instrument backfill) are now wired to live providers via a MarketDataService singleton. Verified with live API calls: FMP search returns real results, manual refresh updates LatestQuote, and instrument creation triggers automatic Tiingo historical backfill (~500 daily bars per instrument). 72 new tests added covering rate limiter per-hour buckets, Tiingo rate limit regression, decimal precision round-trips, fallback chain behavior, backfill data quality, symbol mapping, and MarketDataService integration.

### What Exists

**Infrastructure:**
- pnpm workspace monorepo with 7 packages (5 in `packages/`, 1 app, 1 root)
- TypeScript 5.9.3 with strict mode, zero errors
- Prisma 6.19.2 with SQLite — all 7 tables defined, database seeded with 28 instruments
- Vitest 3.2.4 — **598 tests** passing across **50 test files**
- Next.js 15.5.12 App Router with all API routes + all UI pages (including advisor)
- Tailwind CSS 4.2 with PostCSS — dark financial theme via CSS `@theme` directives
- Zod v4 for input validation
- TradingView Lightweight Charts v5 for portfolio area chart + candlestick charts
- `.env.example` template with all environment variables
- `concurrently` wired: `pnpm dev` launches both Next.js and scheduler
- Seed script at `apps/web/prisma/seed.ts` (28 instruments, 30 transactions, 8300+ price bars)
- **GitHub Actions CI:** `.github/workflows/ci.yml` — type-check, test, build on push/PR to main
- **Performance benchmark:** `data/test/benchmark-rebuild.ts` — 20 instruments, 215 transactions, 147ms rebuild
- **`prefers-reduced-motion`** CSS support gating all animations

**Packages implemented:**
- `@stalker/shared` — Types (incl. `ProviderLimits.requestsPerHour`), Decimal.js utilities, ULID generation, constants
- `@stalker/analytics` — Complete:
  - FIFO lot engine, PnL computation, sell validation invariant
  - PriceLookup / SnapshotStore / CalendarFns interfaces
  - buildPortfolioValueSeries, rebuildSnapshotsFrom, queryPortfolioWindow
- `@stalker/market-data` — Complete:
  - MarketCalendar, 3 active providers (FMP, Tiingo, Alpha Vantage), rate limiter (per-min + per-hour + per-day), fallback chain, cache
  - MarketDataService with singleton factory (`apps/web/src/lib/market-data-service.ts`)
  - Stooq deprecated (file kept for reference, not in active chain)
- `@stalker/scheduler` — Complete:
  - Config loader (with Tiingo env vars), budget check, poller, graceful shutdown

**Session 12 API Wiring (NEW):**
- **`/api/market/search`** — Live FMP search via `MarketDataService.searchSymbols()`. Returns real results from `/stable/search-symbol`.
- **`/api/market/refresh`** — Iterates all instruments, calls `MarketDataService.getQuote()` per instrument, auto-upserts LatestQuote. Returns `{ refreshed, failed, rateLimited }`.
- **Instrument backfill** — `POST /api/instruments` now triggers Tiingo historical backfill automatically. Fetches ~2 years of daily bars via `MarketDataService.getHistory()`, bulk inserts into PriceBar, sets `firstBarDate`. Fire-and-forget pattern (response returns immediately, backfill runs async).
- **MarketDataService singleton** — `getMarketDataService()` factory at `apps/web/src/lib/market-data-service.ts`. One instance, all providers initialized from env vars, Prisma client for LatestQuote caching.
- **providerSymbolMap updated** — Instrument creation now maps `tiingo` (not `stooq`). Tiingo uses hyphens (BRK-B), FMP uses dots (BRK.B).

**API Layer (Sessions 4–12):**
- **Instrument CRUD:** POST/GET/GET[id]/DELETE with exchange→timezone mapping, providerSymbolMap, cascade delete, **automatic Tiingo backfill on creation**
- **Transaction CRUD:** POST/GET/GET[id]/PUT/DELETE with sell validation via `validateTransactionSet()`
- **Bulk transactions:** POST /api/transactions/bulk — tab-separated batch with all-or-none sell validation (AD-S10c)
- **Portfolio endpoints:** snapshot (read-only, AD-S10b), rebuild (explicit POST), timeseries, holdings (allocation %), holdings/[symbol] (lot detail)
- **Market endpoints:** quote (cached), history (price bars), **search (live FMP)**, **refresh (live multi-provider)**, status (health summary)
- **Prisma interface implementations:** PrismaPriceLookup (carry-forward), PrismaSnapshotStore (Decimal serialization, accepts tx client)
- **Shared utilities:** errors.ts (apiError factory), Zod validators, prisma singleton, **market-data-service singleton**

**Reference Portfolio Fixtures** (`data/test/`):
- `reference-portfolio.json` — 6 instruments, 25 transactions, 56 trading days of mock prices
- `expected-outputs.json` — Hand-computed expected values at 6 checkpoint dates
- 24 fixture-based validation tests + 3 cross-validation wrapper tests (749 sub-checks)
- `provider-smoke-results.md` — Phase 0 smoke test findings with exact response shapes
- `smoke-responses/` — Raw API response JSON files from live providers
- **`soak-instruments.json`** — 15 real instruments for pipeline soak testing
- **Backfill quality, symbol mapping, MarketDataService integration tests** (47 tests)

### What Does Not Exist Yet

- Full E2E smoke test with 15 real instruments added (verified with single CRWD instrument — 501 bars)
- Holiday/half-day market calendar
- Advisor context window management
- Responsive refinements for tablet/mobile

### Known Limitations

See `KNOWN-LIMITATIONS.md` for the current list (KL-1 through KL-6). Notable:
- KL-5: Single provider dependency for historical bars (Tiingo only, no fallback)
- KL-6: Rate limiter is in-process only (scheduler and Next.js have separate state)

---

## Metrics

| Metric | Value |
|--------|-------|
| Test count (total) | 598 |
| Test files | 50 |
| TypeScript errors | 0 |
| Packages created | 5 of 5 (all implemented) |
| API endpoints | 22 (all implemented — no stubs remaining) |
| UI components | 48 |
| Data hooks | 12 |
| Utility modules | 8 |
| UI pages | 6 of 6 (all data-wired including advisor) |
| Prisma tables | 7 of 7 |
| Market data providers | 3 active (FMP, Tiingo, AV) + 1 deprecated (Stooq) |
| Scheduler | Complete (wired to Tiingo) |
| Analytics engine | Complete |
| Advisor engine | Complete |
| Reference portfolio | Complete + cross-validation in CI |
| Benchmark | 147ms (20 instruments, 215 transactions) |
| Seed data | 28 instruments, 30 transactions, 8300+ price bars |

---

## Architecture Decisions (Session 12)

| # | Decision | Rationale |
|---|----------|-----------|
| AD-S12a | `getMarketDataService()` singleton factory | One instance, all providers, initialized from env vars. Avoids constructing providers on every request. |
| AD-S12b | Synchronous backfill within instrument creation request | Single user, <500 bars for 2 years, sub-5s typical. Fire-and-forget pattern — response returns immediately, backfill completes async. |
| AD-S12c | providerSymbolMap uses `tiingo` key (replaced `stooq`) | Tiingo is the active history provider. Symbol mapping: dots→hyphens (BRK.B→BRK-B). |

---

## Post-MVP Priorities

1. ~~Bulk transaction paste input~~ — Completed (Session 10)
2. ~~Provider integration testing~~ — Completed (Session 11)
3. ~~Wire stubs to live providers~~ — Completed (Session 12)
4. **Holiday/half-day market calendar** — Reduce wasted API calls on market holidays
5. **Advisor context window management** — Token counting, summary generation for long threads
6. ~~CI pipeline~~ — Completed (Session 10)
7. **Responsive refinements** — Tablet/mobile layout adjustments
8. ~~Performance profiling~~ — Benchmark established (Session 10)

---

## Blocking Issues

None.

---

## Service Health

Both processes start via `pnpm dev`:
- Next.js dev server (web)
- Scheduler process (requires `FMP_API_KEY` and `TIINGO_API_KEY` in `.env.local`)

Database at `apps/web/data/portfolio.db`.
Seed with `cd apps/web && npx prisma db seed`.

Environment variables required in `apps/web/.env.local`:
- `FMP_API_KEY` — Financial Modeling Prep (search + quotes)
- `ALPHA_VANTAGE_API_KEY` — Alpha Vantage (backup quotes)
- `TIINGO_API_KEY` — Tiingo (historical bars)
- `TIINGO_RPH=50` — Tiingo requests per hour
- `TIINGO_RPD=1000` — Tiingo requests per day
