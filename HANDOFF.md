# HANDOFF.md — STALKER Current State

**Last Updated:** 2026-02-26 (Post-Session 15)
**Last Session:** Session 15 — Quote Pipeline Unblock + Scale UX Fixes

---

## Current State

Session 15 resolved the critical quote starvation problem: with 83 instruments and FMP's 250 calls/day limit, only ~3 instruments could get live quotes per day. Now the scheduler uses Tiingo IEX batch as the primary quote source — one API call fetches all 83 instruments. Dashboard UX adapted for 83-instrument scale with top-20 truncation and adaptive staleness banners.

### What Exists

**Infrastructure:**
- pnpm workspace monorepo with 7 packages (5 in `packages/`, 1 app, 1 root)
- TypeScript 5.9.3 with strict mode, zero errors
- Prisma 6.19.2 with SQLite — all 7 tables defined
- Vitest 3.2.4 — **631 tests** passing across **54 test files**
- Next.js 15.5.12 App Router with all API routes + all UI pages (including advisor)
- Tailwind CSS 4.2 with PostCSS — dark financial theme via CSS `@theme` directives
- Zod v4 for input validation
- TradingView Lightweight Charts v5 for portfolio area chart + candlestick charts
- `.env.example` template with all environment variables
- `concurrently` wired: `pnpm dev` launches both Next.js and scheduler
- **GitHub Actions CI:** `.github/workflows/ci.yml` — type-check, test, build on push/PR to main
- **`prefers-reduced-motion`** CSS support gating all animations

**Packages implemented:**
- `@stalker/shared` — Types (incl. `ProviderLimits.requestsPerHour`), Decimal.js utilities, ULID generation, constants
- `@stalker/analytics` — Complete:
  - FIFO lot engine, PnL computation, sell validation invariant
  - PriceLookup / SnapshotStore / CalendarFns interfaces
  - buildPortfolioValueSeries, rebuildSnapshotsFrom, queryPortfolioWindow
- `@stalker/market-data` — Complete:
  - MarketCalendar, 3 active providers (FMP, Tiingo, Alpha Vantage), rate limiter (per-min + per-hour + per-day), fallback chain, cache
  - **Tiingo IEX batch quotes** (`getBatchQuotes()`) — fetches all instruments in one call
  - **`pollAllQuotes()`** on MarketDataService — Tiingo batch → FMP single → AV single fallback chain
  - MarketDataService with singleton factory (`apps/web/src/lib/market-data-service.ts`)
  - Stooq deprecated (file kept for reference, not in active chain)
- `@stalker/scheduler` — Complete:
  - Config loader (with Tiingo env vars), budget check, poller with **batch polling** via `pollAllQuotes()`, graceful shutdown
  - Quote provider chain: Tiingo IEX (batch) → FMP (single) → AV (single)
  - 30-minute poll interval (no longer auto-extended for large portfolios since batch = 1 call)

**Session 15 Changes (NEW):**
- **Tiingo IEX batch quotes** — `TiingoProvider.getBatchQuotes(symbols)` fetches all instruments via `GET /iex/?tickers=...`. Chunks into groups of 50. Handles partial results, empty responses, HTTP 200 text errors.
- **`MarketDataService.pollAllQuotes()`** — Single entry point for polling all instruments. Tiingo batch primary, FMP/AV single-symbol fallback for gaps. Returns `PollResult` summary.
- **Scheduler batch polling** — Poller prefers `pollAllQuotes()` over per-instrument `getQuote()`. Falls back gracefully if batch fails. Budget calculation uses 1 call/cycle (not N).
- **Dashboard top-20 truncation** — Shows top 20 holdings by allocation with "Showing top 20 of N holdings · View all holdings →" link.
- **Adaptive staleness banner** — 0%: hidden, 1–30%: amber standard, 31–79%: amber with counts, ≥80%: blue "Prices updating" informational style.
- **Multi-provider market status** — `/api/market/status` returns Tiingo (hourly/daily) and FMP (daily) budget. DataHealthFooter shows both.

**API Layer (Sessions 4–15):**
- **Instrument CRUD:** POST/GET/GET[id]/DELETE with exchange→timezone mapping, providerSymbolMap, cascade delete, automatic Tiingo backfill on creation
- **Transaction CRUD:** POST/GET/GET[id]/PUT/DELETE with sell validation via `validateTransactionSet()`
- **Bulk transactions:** POST /api/transactions/bulk — dedup guard, auto-creates missing instruments, sequential backfills, fire-and-forget snapshot rebuild
- **Portfolio endpoints:** snapshot (read-only), rebuild (explicit POST, 60s timeout), timeseries, holdings (allocation %), holdings/[symbol] (lot detail)
- **Market endpoints:** quote (cached), history (price bars), search (live FMP), refresh (live multi-provider), status (multi-provider health summary)

**Real Portfolio State:**
- 83 instruments (all with proper names)
- 87 transactions
- ~40,881 price bars
- 826 portfolio value snapshots

### What Does Not Exist Yet

- Holiday/half-day market calendar
- Advisor context window management
- Responsive refinements for tablet/mobile
- UAT acceptance criteria sweep (Phases 3-4 from Session 14 plan — deferred)

### Known Limitations

See `KNOWN-LIMITATIONS.md` for the current list (KL-1 through KL-6).
- ~~KL-7~~ — RESOLVED: Snapshot rebuild now ~4s (was minutes). BatchPriceLookup optimization.
- ~~KL-8~~ — RESOLVED: All instruments have proper names via resolution script + Tiingo fallback.
- ~~KL-9~~ — RESOLVED: Bulk import dedup guard prevents duplicate transactions.
- ~~KL-10~~ — RESOLVED: Quote starvation. Tiingo batch quotes fetch all 83 instruments in 1 API call.

---

## Metrics

| Metric | Value |
|--------|-------|
| Test count (total) | 631 |
| Test files | 54 |
| TypeScript errors | 0 |
| Packages created | 5 of 5 (all implemented) |
| API endpoints | 22 (all implemented — no stubs remaining) |
| UI components | 48 |
| Data hooks | 12 |
| Utility modules | 11 |
| UI pages | 6 of 6 (all data-wired including advisor) |
| Prisma tables | 7 of 7 |
| Market data providers | 3 active (FMP, Tiingo, AV) + 1 deprecated (Stooq) |
| Real portfolio | 83 instruments, 87 transactions, 40K+ bars |
| Snapshot rebuild | ~4s for 83 instruments (benchmarked) |

---

## Architecture Decisions (Session 15)

| # | Decision | Rationale |
|---|----------|-----------|
| AD-S15-1 | Tiingo IEX batch as primary quote source for scheduler | 1 API call = all instruments. Eliminates quote starvation. FMP reserved for search + single-symbol fallback. |
| AD-S15-2 | Dashboard shows top 20 holdings by allocation | Dashboard is a summary view. Full list on Holdings page. 83 rows below the fold defeats the "health at a glance" design goal. |
| AD-S15-3 | Staleness banner adapts based on stale ratio | "80 instruments stale" reads as system failure. "Prices updating — 3 of 83 refreshed" reads as progress. |
| AD-S15-4 | Quote provider chain: Tiingo batch → FMP single → AV single → cache | Cheapest per-instrument call first. FMP and AV as fallbacks for instruments Tiingo misses (e.g., mutual funds not on IEX). |

---

## Post-MVP Priorities

1. ~~Bulk transaction paste input~~ — Completed (Session 10)
2. ~~Provider integration testing~~ — Completed (Session 11)
3. ~~Wire stubs to live providers~~ — Completed (Session 12)
4. ~~UAT with real portfolio~~ — Completed (Session 13)
5. ~~Bulk import idempotency~~ — Completed (Session 14)
6. ~~Instrument name resolution~~ — Completed (Session 14)
7. ~~Quote pipeline unblock~~ — Completed (Session 15)
8. **UAT acceptance criteria sweep** — Verify all 11 criteria + 5 advisor intents against real portfolio
9. **Holiday/half-day market calendar** — Reduce wasted API calls on market holidays
10. **Advisor context window management** — Token counting, summary generation for long threads
11. **Responsive refinements** — Tablet/mobile layout adjustments

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
- `FMP_API_KEY` — Financial Modeling Prep (search + single-symbol fallback quotes)
- `ALPHA_VANTAGE_API_KEY` — Alpha Vantage (backup quotes)
- `TIINGO_API_KEY` — Tiingo (batch quotes + historical bars)
- `TIINGO_RPH=50` — Tiingo requests per hour
- `TIINGO_RPD=1000` — Tiingo requests per day
