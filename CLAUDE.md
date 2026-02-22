# CLAUDE.md — STALKER Architecture & Agent Rules

**Project:** STALKER — Stock & Portfolio Tracker + LLM Advisor
**Last Updated:** 2026-02-22 (Post-Session 4)
**Local repo path:** ~/Desktop/_LOCAL APP DEVELOPMENT/STOCKER
**GitHub:** https://github.com/ericediger/STALKER

> **Note:** The codename and GitHub repo are **STALKER**; the local working directory is **STOCKER**. These refer to the same project.

---

## Architecture Overview

STALKER is a local-first, single-user portfolio tracker. No auth, no cloud, no multi-tenancy. It runs entirely on a Mac dev machine.

### Process Model

Two processes, launched together via `pnpm dev` using `concurrently`:

| Process | What It Does | Lifecycle |
|---------|-------------|-----------|
| `next dev` | UI + API routes (Next.js App Router) | Request-scoped |
| `scheduler` | Flat quote polling, post-close snapshots | Long-lived Node process |

The scheduler is a standalone script in `packages/scheduler/`. It does NOT run inside Next.js API routes.

### Service Topology

```
UI (Next.js/React) → API Layer (App Router) → Analytics Engine + Market Data Service → SQLite (Prisma)
                                                                                         ↑
                                                     Scheduler (standalone Node process) ──┘
```

### Data Architecture: Event-Sourced Core

**Three sources of truth — never derived, never auto-deleted:**
- `Instrument` — What we track
- `Transaction` — What the user did (BUY/SELL)
- `PriceBar` — Historical market prices

**Two materialized caches — fully rebuildable, carry `rebuiltAt`:**
- `LatestQuote` — Most recent price per instrument per provider
- `PortfolioValueSnapshot` — Daily portfolio value, lots, PnL

**Application state (not derived from transactions):**
- `AdvisorThread`, `AdvisorMessage` — LLM chat history

> **The Derived Data Rule:** Any table that is not Instrument, Transaction, or PriceBar is a materialized cache. It must be fully reproducible from those three sources. If a cache row conflicts with a fresh computation, the fresh computation wins and the cache is overwritten.

### Monorepo Structure

```
/
├── apps/web/                    # Next.js App Router application
│   ├── src/app/                 # Pages + API routes
│   ├── src/components/          # React components
│   ├── src/lib/                 # App-specific utilities
│   └── prisma/schema.prisma     # Database schema
├── packages/
│   ├── shared/                  # Types, Decimal utils, ULID, constants
│   ├── analytics/               # FIFO lots, PnL, portfolio value series
│   ├── market-data/             # Provider interface, implementations, calendar
│   ├── advisor/                 # LLM adapter, tool definitions
│   └── scheduler/               # Polling orchestration
├── data/test/                   # Reference portfolio fixtures
├── Session Reports/             # Date-prefixed session reports
├── CLAUDE.md                    # This file
├── AGENTS.md                    # Tech stack, design decisions
├── HANDOFF.md                   # Current state (updated every session)
└── STALKER_MASTER-PLAN.md       # Roadmap, sessions, strategic decisions
```

### Package Dependency Direction

```
shared ← analytics ← market-data ← advisor
                 ↑          ↑
                 └── apps/web (API routes import from all packages)
                            ↑
                     scheduler (imports market-data)
```

No circular dependencies. `shared` depends on nothing. Everything else can depend on `shared`.

---

## Coding Rules

### Rule 1: Decimal Precision (NON-NEGOTIABLE)

- **No `number` type for money or quantity in business logic.** All financial arithmetic uses `Decimal.js` via `@stalker/shared` utilities.
- **No `parseFloat()`, no `Math.round()`, no arithmetic operators (`+`, `-`, `*`, `/`) on financial values.**
- Prisma Decimal columns are stored as TEXT in SQLite. This is correct and intentional — it preserves exact decimal representation.
- JSON API responses serialize decimals as strings. The UI converts to display format only at render time.
- Test assertions on Decimal values use `.toString()` comparison, not numeric equality.

```typescript
// ✅ CORRECT
import { toDecimal, mul, sub } from '@stalker/shared';
const pnl = sub(mul(markPrice, qty), costBasis);

// ❌ WRONG — never do this
const pnl = (markPrice * qty) - costBasis;
```

### Rule 2: Timestamp Storage

| Data | Storage | Rule |
|------|---------|------|
| `Transaction.tradeAt` | UTC ISO-8601 DateTime | User enters local; app converts to UTC via instrument's `exchangeTz` |
| `PriceBar.date` (daily) | DATE (YYYY-MM-DD) | Exchange trading date, NOT a UTC date |
| `PriceBar.time` (intraday) | UTC ISO-8601 DateTime | Bar open time in UTC |
| `PortfolioValueSnapshot.date` | DATE (YYYY-MM-DD) | Exchange trading date |
| All `createdAt`/`updatedAt` | UTC ISO-8601 DateTime | |

Timezone math uses `date-fns-tz` with IANA timezone strings. No manual offset math. No hardcoded UTC offsets.

### Rule 3: TypeScript Strict Mode

- `strict: true` in `tsconfig.base.json`
- No `any` types — use `unknown` and narrow
- No `@ts-ignore` or `@ts-expect-error`
- No implicit returns in functions with return types
- All function parameters and return types explicitly typed

### Rule 4: Event-Sourced Writes

Every transaction write (create, edit, delete) must:
1. Validate the sell invariant (cumulative buys ≥ cumulative sells at every timeline point)
2. On success: delete `PortfolioValueSnapshot` rows from the earliest affected `tradeAt` forward
3. Trigger snapshot rebuild for the affected date range

### Rule 5: IDs

- ULID for all entity primary keys (Instrument, Transaction, AdvisorThread, AdvisorMessage)
- Auto-increment INTEGER for PriceBar and LatestQuote (high-volume tables where sort order is not semantic)
- Import ULID generation from `@stalker/shared`

### Rule 6: Imports and Exports

- Named exports only (no `export default` except for Next.js page/layout/route files)
- Workspace packages use `@stalker/` prefix: `@stalker/shared`, `@stalker/analytics`, `@stalker/market-data`, `@stalker/advisor`
- Each package has an `index.ts` barrel file
- No relative imports across package boundaries

### Rule 7: Error Handling

- API routes return appropriate HTTP status codes (400 for validation, 404 for not found, 500 for internal)
- Sell validation errors include: offending transaction, first date position goes negative, deficit quantity
- Market data failures return cached data with staleness metadata — never throw to the user
- All errors are structured objects, not string messages

### Rule 8: Testing

- Framework: Vitest
- Tests live in `__tests__/` directories within each package
- Financial tests assert Decimal values via `.toString()` comparison (note: Prisma Decimal may use scientific notation e.g. `1e-8` — use `.equals()` for Prisma Decimal round-trip assertions)
- Mock external APIs (HTTP responses), never call live providers in tests
- Target: comprehensive coverage of lot engine, PnL, validation, calendar, and all API endpoints

---

## Environment Files

Two `.env` files exist in `apps/web/` with distinct purposes:

| File | Purpose | Used By |
|------|---------|---------|
| `apps/web/.env` | Prisma `DATABASE_URL` | Prisma CLI (`prisma db push`, `prisma generate`) |
| `apps/web/.env.local` | Next.js app config, API keys, all runtime env vars | Next.js dev server, overrides `.env` values |

The scheduler (`packages/scheduler/`) loads its own env vars using `dotenv`, pointing to the appropriate `.env.local` file. This separation exists because Prisma needs `DATABASE_URL` even when `env.local` isn't present (e.g., during `prisma generate` in CI).

---

## Known Limitations

### Rate Limiter Is In-Process Only (AD-2)

The scheduler and Next.js are separate Node processes. Each maintains its own rate limiter state. This means a manual refresh (via Next.js API route) immediately after a scheduler poll could exceed the provider's actual rate limit. For MVP, this is acceptable: single user, manual refresh is rare, providers have some tolerance. Post-MVP mitigation: track call counts in a SQLite table (`ProviderCallLog`) that both processes read.

### Provider Test Fixtures

Market data provider tests use fixture files (`packages/market-data/__tests__/fixtures/`) captured from real API responses. If provider response formats change, update the fixture files rather than modifying parsing logic first. Each fixture file matches a specific API endpoint response shape.

---

## Analytics Package Interface Pattern (Session 3 → Wired in Session 4)

The analytics package (`packages/analytics/`) uses dependency-injected interfaces to stay decoupled from Prisma and market-data. Session 4 provided the Prisma-backed implementations.

### Key Interfaces

| Interface | Defined In | Implementation |
|-----------|-----------|----------------|
| `PriceLookup` | `packages/analytics/src/interfaces.ts` | `apps/web/src/lib/prisma-price-lookup.ts` |
| `SnapshotStore` | `packages/analytics/src/interfaces.ts` | `apps/web/src/lib/prisma-snapshot-store.ts` |
| `CalendarFns` | `packages/analytics/src/value-series.ts` | `{ getNextTradingDay, isTradingDay }` from `@stalker/market-data` |

### Prisma-to-Shared Type Conversion

Prisma models return Prisma's own types. Analytics expects `@stalker/shared` types. Conversion pattern:
```typescript
import { toDecimal } from '@stalker/shared';
import type { Instrument, Transaction, InstrumentType, TransactionType } from '@stalker/shared';

// Prisma Decimal → decimal.js Decimal
const qty = toDecimal(prismaTx.quantity.toString());

// Prisma instrument → shared Instrument (parse providerSymbolMap JSON)
const instrument: Instrument = {
  ...prismaInst,
  type: prismaInst.type as InstrumentType,
  providerSymbolMap: JSON.parse(prismaInst.providerSymbolMap),
};
```

### Rebuild Trigger for Transaction CRUD

After any transaction insert/edit/delete, API routes should call:
```typescript
import { rebuildSnapshotsFrom } from '@stalker/analytics';
import { PrismaPriceLookup } from '@/lib/prisma-price-lookup';
import { PrismaSnapshotStore } from '@/lib/prisma-snapshot-store';
import { getNextTradingDay, isTradingDay } from '@stalker/market-data';

await rebuildSnapshotsFrom({
  affectedDate,
  transactions,
  instruments,
  priceLookup: new PrismaPriceLookup(prisma),
  snapshotStore: new PrismaSnapshotStore(prisma),
  calendar: { getNextTradingDay, isTradingDay },
});
```

**Note (Session 4):** Snapshot rebuild is currently stubbed in transaction CRUD endpoints. The implementations exist but the wiring is deferred — ready to activate when needed. Transaction endpoints still validate sell invariants correctly.

### Reference Portfolio Fixtures

Location: `data/test/`
- `reference-portfolio.json` — 6 instruments, 25 transactions, ~56 trading days of mock prices
- `expected-outputs.json` — Hand-computed expected values at 6 checkpoint dates
- `computation-notes.md` — Documents all manual calculations
- Tests: `packages/analytics/__tests__/reference-portfolio.test.ts` (24 tests)

Purpose: Regression guard for the analytics engine. Covers FIFO multi-lot sells, full position close, re-entry, backdated transactions, and carry-forward pricing.

---

## API Endpoint Patterns (Session 4)

### Endpoint Map

| Method | Route | Purpose | Status |
|--------|-------|---------|--------|
| POST | `/api/instruments` | Create instrument | Implemented |
| GET | `/api/instruments` | List all instruments | Implemented |
| GET | `/api/instruments/[id]` | Get instrument by ID | Implemented |
| DELETE | `/api/instruments/[id]` | Cascade delete instrument | Implemented |
| POST | `/api/transactions` | Create transaction (sell validated) | Implemented |
| GET | `/api/transactions` | List transactions (filterable) | Implemented |
| GET | `/api/transactions/[id]` | Get transaction by ID | Implemented |
| PUT | `/api/transactions/[id]` | Update transaction (re-validated) | Implemented |
| DELETE | `/api/transactions/[id]` | Delete transaction (re-validated) | Implemented |
| GET | `/api/portfolio/snapshot` | Portfolio state with window | Implemented |
| GET | `/api/portfolio/timeseries` | Value series for charting | Implemented |
| GET | `/api/portfolio/holdings` | All holdings + allocation % | Implemented |
| GET | `/api/portfolio/holdings/[symbol]` | Position detail with lots | Implemented |
| GET | `/api/market/quote` | Latest cached quote | Implemented |
| GET | `/api/market/history` | Price bar history | Implemented |
| GET | `/api/market/search` | Symbol search | Stub (needs API keys) |
| POST | `/api/market/refresh` | Manual quote refresh | Stub (needs API keys) |
| GET | `/api/market/status` | Data health summary | Implemented |

### Shared Utilities

| File | Purpose |
|------|---------|
| `apps/web/src/lib/prisma.ts` | Singleton PrismaClient |
| `apps/web/src/lib/errors.ts` | `apiError()` factory for consistent error responses |
| `apps/web/src/lib/validators/instrumentInput.ts` | Zod v4 schema for instrument creation |
| `apps/web/src/lib/validators/transactionInput.ts` | Zod v4 schema for transaction creation/update |
| `apps/web/src/lib/prisma-price-lookup.ts` | PriceLookup implementation (carry-forward queries) |
| `apps/web/src/lib/prisma-snapshot-store.ts` | SnapshotStore implementation (Decimal serialization) |
| `apps/web/src/lib/market-data-client.ts` | Market calendar wrapper |

### Error Response Shape

All error responses follow:
```json
{ "error": "ERROR_CODE", "message": "Human-readable message", "details": { ... } }
```
Codes: `VALIDATION_ERROR` (400), `NOT_FOUND` (404), `CONFLICT` (409), `SELL_VALIDATION_FAILED` (422), `INTERNAL_ERROR` (500).

### Session 5 Integration Notes

- All API endpoints are functional. UI pages can `fetch()` them directly.
- Portfolio snapshot endpoint supports `window` param (1D/1W/1M/3M/1Y/ALL) for dashboard.
- Holdings endpoint returns allocation % — ready for pie chart.
- Timeseries endpoint returns date-ordered series — ready for area chart.
- Holdings/[symbol] returns per-lot detail — ready for position detail view.
- Decimal values are strings in all responses — UI must parse at render time.
- Instrument creation auto-maps exchange→exchangeTz and builds providerSymbolMap.
- `providerSymbolMap` is returned as a parsed object (not JSON string) in instrument responses.

---

## Agent Protocols

### Session Start

Every agent (lead and teammates) reads in order:
1. `CLAUDE.md` (this file)
2. `AGENTS.md`
3. `HANDOFF.md`
4. The session's `SESSION-{N}-PLAN.md`

### Teammate Behavior

- **Commit and continue** without waiting for lead approval between tasks. Lead reviews at the end.
- **Stay in filesystem scope.** Each teammate's plan specifies which directories they own. Do not touch other teammates' directories.
- **Run `tsc --noEmit` after every major change,** not just at the end.
- **Skip MCP memory-keeper bootstrap** — not needed for teammate agents.

### Quality Gates (Run After Every Major Change)

```bash
# TypeScript check
pnpm tsc --noEmit

# Test suite
pnpm test

# These must pass before committing
```

### Commit Messages

Use the format: `Session {N}: {brief description of what changed}`

Example: `Session 1: Prisma schema — all 7 tables with indexes and relationships`

### End of Session

Lead follows this sequence exactly:
1. Run quality gates one final time
2. Verify all exit criteria from the session plan
3. Verify all teammates committed (check `git log`)
4. Update `HANDOFF.md`
5. Update `CLAUDE.md` and `AGENTS.md` if architecture or rules changed
6. Commit with descriptive message
7. Push to origin
8. Generate session report
