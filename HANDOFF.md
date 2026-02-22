# HANDOFF.md — STALKER Current State

**Last Updated:** 2026-02-22 (Post-Session 4)
**Last Session:** Session 4 — API Layer

---

## Current State

The project has a complete backend: analytics engine, market data providers, scheduler, and now all API endpoints wired to Prisma and the analytics engine. The UI (Sessions 5-7) can now call real HTTP endpoints.

### What Exists

**Infrastructure:**
- pnpm workspace monorepo with 7 packages (5 in `packages/`, 1 app, 1 root)
- TypeScript 5.9.3 with strict mode, zero errors
- Prisma 6.19.2 with SQLite — all 7 tables defined, database created and seeded
- Vitest 3.2.4 — **275 tests** passing across **24 test files**
- Next.js 15.5.12 App Router with all API routes implemented
- Zod v4 for input validation
- `.env.example` template with all environment variables
- `concurrently` wired: `pnpm dev` launches both Next.js and scheduler
- Seed script at `apps/web/prisma/seed.ts` (1 instrument, 1 transaction, 1 price bar)

**Packages implemented:**
- `@stalker/shared` — Types, Decimal.js utilities, ULID generation, constants (exchange timezone map)
- `@stalker/analytics` — Complete:
  - FIFO lot engine, PnL computation, sell validation invariant
  - PriceLookup / SnapshotStore / CalendarFns interfaces
  - buildPortfolioValueSeries, rebuildSnapshotsFrom, queryPortfolioWindow
- `@stalker/market-data` — Complete:
  - MarketCalendar, 3 providers (FMP, Stooq, Alpha Vantage), rate limiter, fallback chain, cache
- `@stalker/scheduler` — Complete:
  - Config loader, budget check, poller, graceful shutdown

**API Layer (Session 4 — all implemented):**
- **Instrument CRUD:** POST/GET/GET[id]/DELETE with exchange→timezone mapping, providerSymbolMap, cascade delete
- **Transaction CRUD:** POST/GET/GET[id]/PUT/DELETE with sell validation via `validateTransactionSet()`
- **Portfolio endpoints:** snapshot (window-based), timeseries (date range), holdings (allocation %), holdings/[symbol] (lot detail)
- **Market endpoints:** quote (cached), history (price bars), search (stub), refresh (stub), status (health summary)
- **Prisma interface implementations:** PrismaPriceLookup (carry-forward), PrismaSnapshotStore (Decimal serialization)
- **Shared utilities:** errors.ts (apiError factory), Zod validators, prisma singleton

**Reference Portfolio Fixtures** (`data/test/`):
- `reference-portfolio.json` — 6 instruments, 25 transactions, 56 trading days of mock prices
- `expected-outputs.json` — Hand-computed expected values at 6 checkpoint dates
- 24 fixture-based validation tests

**Packages scaffolded (empty shells):**
- `@stalker/advisor` — placeholder only

### What Does Not Exist Yet

- Any UI components or pages (Sessions 5-6)
- Charting (TradingView Lightweight Charts) — Session 5
- LLM advisor (Session 8)
- Historical price backfill in instrument creation (stubbed — needs live API keys)
- Manual quote refresh (stubbed — needs live API keys)
- Symbol search proxy (stubbed — needs live API keys)
- Snapshot rebuild wiring in transaction endpoints (PrismaPriceLookup/SnapshotStore exist but aren't called from CRUD yet)
- CI pipeline

### Known Stubs (Ready to Wire)

| Stub | Location | What's Needed |
|------|----------|---------------|
| Snapshot rebuild after tx CRUD | `apps/web/src/app/api/transactions/` | Call `rebuildSnapshotsFrom()` with PrismaPriceLookup + PrismaSnapshotStore |
| Historical backfill on instrument create | `apps/web/src/app/api/instruments/route.ts` | Call market data service `getHistory()`, write PriceBars, set firstBarDate |
| Symbol search | `apps/web/src/app/api/market/search/route.ts` | Wire to MarketDataService.searchSymbols() |
| Manual quote refresh | `apps/web/src/app/api/market/refresh/route.ts` | Wire to MarketDataService.getQuote() per instrument |

---

## Metrics

| Metric | Value |
|--------|-------|
| Test count (total) | 275 |
| Test files | 24 |
| TypeScript errors | 0 |
| Packages created | 5 of 5 (4 implemented, 1 shell) |
| API endpoints | 16 of ~18 implemented (2 stubs: search, refresh) |
| UI pages | 0 of 6 |
| Prisma tables | 7 of 7 |
| Market data providers | 3 of 3 |
| Scheduler | Complete |
| Analytics engine | Complete |
| Reference portfolio | Complete |

---

## What's Next

**Session 5: Dashboard + Portfolio UI (Epic 4)**

Scope: Build the main dashboard and portfolio views using the API endpoints from Session 4.

Key integration points:
- Dashboard fetches `GET /api/portfolio/snapshot?window=1M` for summary
- Portfolio value chart uses `GET /api/portfolio/timeseries` for area chart data
- Holdings table uses `GET /api/portfolio/holdings` for position list with allocation %
- Position detail uses `GET /api/portfolio/holdings/[symbol]` for lot-level view
- All API responses use string-serialized Decimals — UI must parse at render time
- TradingView Lightweight Charts for portfolio value area chart

---

## Blocking Issues

None.

---

## Service Health

Both processes start via `pnpm dev`:
- Next.js dev server (web)
- Scheduler process (requires `FMP_API_KEY` in `.env.local`)

Database at `apps/web/data/portfolio.db`.
Seed with `cd apps/web && npx prisma db seed`.
