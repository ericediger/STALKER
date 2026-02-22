# HANDOFF.md — STALKER Current State

**Last Updated:** 2026-02-21 (Post-Session 2)
**Last Session:** Session 2 — Market Data Service + Scheduler

---

## Current State

The project has a complete market data layer with three provider implementations, rate limiting, fallback chain, and a standalone scheduler process that polls for quotes during market hours.

### What Exists

**Infrastructure:**
- pnpm workspace monorepo with 7 packages (5 in `packages/`, 1 app, 1 root)
- TypeScript 5.9.3 with strict mode, zero errors
- Prisma 6.19.2 with SQLite — all 7 tables defined and database created
- Vitest 3.2.4 — 162 tests passing across 14 test files
- Next.js 15.5.12 App Router with placeholder API routes for all endpoints
- `.env.example` template with all environment variables
- `concurrently` wired: `pnpm dev` launches both Next.js and scheduler

**Packages implemented:**
- `@stalker/shared` — Types, Decimal.js utilities, ULID generation, constants (exchange timezone map)
- `@stalker/analytics` — FIFO lot engine, PnL computation, sell validation invariant
- `@stalker/market-data` — Complete:
  - MarketCalendar (isTradingDay, getSessionTimes, isMarketOpen, getPrior/NextTradingDay)
  - MarketDataProvider interface, ProviderError classification
  - FMP Provider (search, quote, history)
  - Stooq Provider (history via CSV parsing)
  - Alpha Vantage Provider (quote, search, history with soft rate-limit detection)
  - Token bucket rate limiter (per-minute sliding window + per-day counter)
  - MarketDataService fallback chain (FMP → cache → AV for quotes, Stooq → FMP for history)
  - LatestQuote cache (upsert, freshness check)
  - Symbol mapping utility
- `@stalker/scheduler` — Complete:
  - Config loader with dotenv, fail-fast validation
  - Budget check (estimates daily API calls, extends interval if over budget)
  - Poller class (setTimeout-based, market-open detection, post-close fetch, graceful shutdown)
  - Entry point wired to real MarketDataService

**Packages scaffolded (empty shells):**
- `@stalker/advisor` — placeholder only

**API route placeholders (17 files, no implementations yet):**
- `api/instruments/`, `api/transactions/`, `api/portfolio/`, `api/market/`, `api/advisor/`

### What Does Not Exist Yet

- Portfolio value series builder / snapshot rebuild
- API route implementations
- Any UI components or pages
- LLM advisor
- Reference portfolio test fixture
- CI pipeline
- Historical price backfill logic

---

## Metrics

| Metric | Value |
|--------|-------|
| Test count (backend) | 162 |
| Test count (frontend) | 0 |
| TypeScript errors | 0 |
| Packages created | 5 of 5 (4 implemented, 1 shell) |
| API endpoints | 0 of ~18 (17 placeholder files) |
| UI pages | 0 of 6 |
| Prisma tables | 7 of 7 |
| Market data providers | 3 of 3 |
| Scheduler | Complete (config, budget, polling, shutdown) |

---

## What's Next

**Session 3: Analytics Completion**

Scope: Portfolio value series builder, snapshot rebuild, historical price backfill, reference portfolio fixture.

Session plan: `SESSION-3-PLAN.md` (not yet created)

---

## Blocking Issues

None.

---

## Service Health

Both processes start via `pnpm dev`:
- Next.js dev server (web)
- Scheduler process (requires `FMP_API_KEY` in `.env.local`)

Database at `apps/web/data/portfolio.db`.
