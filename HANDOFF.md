# HANDOFF.md — STALKER Current State

**Last Updated:** 2026-02-21 (Post-Session 1)
**Last Session:** Session 1 — Foundation + Analytics Core

---

## Current State

The project is initialized with a working monorepo, database, shared types, and core analytics engine. All code compiles, all tests pass.

### What Exists

**Infrastructure:**
- pnpm workspace monorepo with 7 packages (5 in `packages/`, 1 app, 1 root)
- TypeScript 5.9.3 with strict mode, zero errors
- Prisma 6.19.2 with SQLite — all 7 tables defined and database created
- Vitest 3.2.4 — 71 tests passing across 5 test files
- Next.js 15.5.12 App Router with placeholder API routes for all endpoints
- `.env.example` template with all environment variables

**Packages implemented:**
- `@stalker/shared` — Types, Decimal.js utilities, ULID generation, constants (exchange timezone map)
- `@stalker/analytics` — FIFO lot engine, PnL computation, sell validation invariant
- `@stalker/market-data` — MarketCalendar (isTradingDay, getSessionTimes, isMarketOpen, getPrior/NextTradingDay)

**Packages scaffolded (empty shells):**
- `@stalker/advisor` — placeholder only
- `@stalker/scheduler` — placeholder only

**API route placeholders (17 files, no implementations yet):**
- `api/instruments/`, `api/transactions/`, `api/portfolio/`, `api/market/`, `api/advisor/`

### What Does Not Exist Yet

- Market data providers (FMP, Stooq, Alpha Vantage implementations)
- Rate limiter
- Portfolio value series builder / snapshot rebuild
- API route implementations
- Any UI components or pages
- Scheduler process
- LLM advisor
- Reference portfolio test fixture
- CI pipeline

---

## Metrics

| Metric | Value |
|--------|-------|
| Test count (backend) | 71 |
| Test count (frontend) | 0 |
| TypeScript errors | 0 |
| Packages created | 5 of 5 (3 implemented, 2 shells) |
| API endpoints | 0 of ~18 (17 placeholder files) |
| UI pages | 0 of 6 |
| Prisma tables | 7 of 7 |

---

## What's Next

**Session 2: Market Data Service**

Scope: Provider interface implementations (FMP, Stooq, Alpha Vantage), rate limiter, scheduler polling loop, provider fallback.

Session plan: `SESSION-2-PLAN.md` (not yet created)

---

## Blocking Issues

None.

---

## Service Health

N/A — no services running yet. Database created at `apps/web/data/portfolio.db`.
