# HANDOFF.md — STALKER Current State

**Last Updated:** 2026-02-21 (Post-Session 3)
**Last Session:** Session 3 — Analytics Completion + PnL Validation Fixtures

---

## Current State

The project has a complete analytics engine with portfolio value series builder, snapshot rebuild, window queries, and a comprehensive reference portfolio test fixture. The computational heart of the product is built and validated.

### What Exists

**Infrastructure:**
- pnpm workspace monorepo with 7 packages (5 in `packages/`, 1 app, 1 root)
- TypeScript 5.9.3 with strict mode, zero errors
- Prisma 6.19.2 with SQLite — all 7 tables defined and database created
- Vitest 3.2.4 — **218 tests** passing across **19 test files**
- Next.js 15.5.12 App Router with placeholder API routes for all endpoints
- `.env.example` template with all environment variables
- `concurrently` wired: `pnpm dev` launches both Next.js and scheduler

**Packages implemented:**
- `@stalker/shared` — Types, Decimal.js utilities, ULID generation, constants (exchange timezone map)
- `@stalker/analytics` — Complete:
  - FIFO lot engine, PnL computation, sell validation invariant (Session 1)
  - `PriceLookup` interface — abstracts price bar queries (exact date, carry-forward, first bar date)
  - `SnapshotStore` interface — abstracts snapshot CRUD (delete, write, read by range/date)
  - `MockPriceLookup` and `MockSnapshotStore` — in-memory implementations for testing
  - `HoldingSnapshotEntry` — extends HoldingSnapshot with `isEstimated` and `costBasisOnly` flags
  - `buildPortfolioValueSeries()` — iterates trading days, FIFO lot replay with carry-forward optimization
  - `rebuildSnapshotsFrom()` — rebuild trigger for transaction CRUD (Session 4 entry point)
  - `queryPortfolioWindow()` — flexible window queries with `asOf` point-in-time filtering
  - `CalendarFns` interface — minimal calendar contract to avoid hard dependency on market-data
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

**Reference Portfolio Fixtures** (`data/test/`):
- `reference-portfolio.json` — 6 instruments, 25 transactions, 56 trading days of mock prices
- `expected-outputs.json` — Hand-computed expected values at 6 checkpoint dates
- `computation-notes.md` — Full manual calculation documentation
- `packages/analytics/__tests__/reference-portfolio.test.ts` — 24 fixture-based validation tests

**Packages scaffolded (empty shells):**
- `@stalker/advisor` — placeholder only

**API route placeholders (17 files, no implementations yet):**
- `api/instruments/`, `api/transactions/`, `api/portfolio/`, `api/market/`, `api/advisor/`

### What Does Not Exist Yet

- API route implementations (Session 4)
- Prisma-backed `PriceLookup` and `SnapshotStore` implementations (Session 4)
- Historical price backfill logic (Session 4 — instrument creation triggers backfill)
- Any UI components or pages (Sessions 5-6)
- LLM advisor (Session 7)
- CI pipeline

---

## Metrics

| Metric | Value |
|--------|-------|
| Test count (backend) | 218 |
| Test count (frontend) | 0 |
| TypeScript errors | 0 |
| Packages created | 5 of 5 (4 implemented, 1 shell) |
| API endpoints | 0 of ~18 (17 placeholder files) |
| UI pages | 0 of 6 |
| Prisma tables | 7 of 7 |
| Market data providers | 3 of 3 |
| Scheduler | Complete |
| Analytics engine | Complete (value series, rebuild, window queries) |
| Reference portfolio | Complete (6 instruments, 25 txs, 6 checkpoints, 24 tests) |

---

## What's Next

**Session 4: API Layer (Epic 3)**

Scope: All Next.js App Router API endpoints. Key integration work:
1. Implement Prisma-backed `PriceLookup` — `getClosePriceOrCarryForward()` uses `WHERE date <= ? ORDER BY date DESC LIMIT 1`
2. Implement Prisma-backed `SnapshotStore` — standard Prisma CRUD against `PortfolioValueSnapshot`
3. Transaction CRUD endpoints call `rebuildSnapshotsFrom()` after every write
4. Instrument creation triggers historical price backfill via market data providers
5. Portfolio analytics endpoints read from `SnapshotStore`

Session plan: `SESSION-4-PLAN.md` (not yet created)

---

## Blocking Issues

None.

---

## Session 4 Integration Notes

**Rebuild trigger wiring (critical):**
```typescript
import { rebuildSnapshotsFrom } from '@stalker/analytics';
import { getNextTradingDay, isTradingDay } from '@stalker/market-data';

// After transaction insert/edit/delete:
await rebuildSnapshotsFrom({
  affectedDate: formatDate(transaction.tradeAt),
  transactions: await prisma.transaction.findMany(),
  instruments: await prisma.instrument.findMany(),
  priceLookup: prismaPriceLookup,
  snapshotStore: prismaSnapshotStore,
  calendar: { getNextTradingDay, isTradingDay },
});
```

**Environment note:** Next.js has its own env loading — use `.env.local` in `apps/web/`. Do NOT use the scheduler's `dotenv` approach in API routes.

---

## Service Health

Both processes start via `pnpm dev`:
- Next.js dev server (web)
- Scheduler process (requires `FMP_API_KEY` in `.env.local`)

Database at `apps/web/data/portfolio.db`.
