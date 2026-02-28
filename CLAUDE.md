# CLAUDE.md — STALKER Architecture & Agent Rules

**Project:** STALKER — Stock & Portfolio Tracker + LLM Advisor
**Last Updated:** 2026-02-28 (Post-Session 20 — Hardening & Project Close-Out)
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
│   ├── advisor/                 # LLM adapter, tool definitions, context window
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

### Reference Portfolio Fixtures

Location: `data/test/`
- `reference-portfolio.json` — 6 instruments, 25 transactions, ~56 trading days of mock prices
- `expected-outputs.json` — Hand-computed expected values at 6 checkpoint dates
- Tests: `packages/analytics/__tests__/reference-portfolio.test.ts` (24 tests)

---

## API Endpoint Map

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/instruments` | Create instrument (triggers historical backfill) |
| GET | `/api/instruments` | List all instruments |
| GET | `/api/instruments/[id]` | Get instrument by ID |
| DELETE | `/api/instruments/[id]` | Cascade delete instrument |
| POST | `/api/transactions` | Create transaction (sell validated) |
| GET | `/api/transactions` | List transactions (filterable) |
| GET | `/api/transactions/[id]` | Get transaction by ID |
| PUT | `/api/transactions/[id]` | Update transaction (re-validated) |
| DELETE | `/api/transactions/[id]` | Delete transaction (re-validated) |
| POST | `/api/transactions/bulk` | Bulk insert from paste input |
| GET | `/api/portfolio/snapshot` | Portfolio state with window (read-only) |
| POST | `/api/portfolio/rebuild` | Trigger snapshot rebuild |
| GET | `/api/portfolio/timeseries` | Value series for charting |
| GET | `/api/portfolio/holdings` | All holdings + allocation % |
| GET | `/api/portfolio/holdings/[symbol]` | Position detail with lots |
| GET | `/api/market/quote` | Latest cached quote |
| GET | `/api/market/history` | Price bar history |
| GET | `/api/market/search` | Symbol search (live FMP) |
| POST | `/api/market/refresh` | Manual quote refresh (live multi-provider) |
| GET | `/api/market/status` | Data health summary |
| POST | `/api/advisor/chat` | Send message, tool loop, return responses |
| GET | `/api/advisor/threads` | List threads with message count |
| GET | `/api/advisor/threads/[id]` | Thread detail with messages + `hasSummary` |
| DELETE | `/api/advisor/threads/[id]` | Delete thread + messages |

### Error Response Shape

All error responses follow:
```json
{ "error": "ERROR_CODE", "message": "Human-readable message", "details": { ... } }
```
Codes: `VALIDATION_ERROR` (400), `NOT_FOUND` (404), `CONFLICT` (409), `SELL_VALIDATION_FAILED` (422), `INTERNAL_ERROR` (500).

### Shared API Utilities

| File | Purpose |
|------|---------|
| `apps/web/src/lib/prisma.ts` | Singleton PrismaClient |
| `apps/web/src/lib/errors.ts` | `apiError()` factory for consistent error responses |
| `apps/web/src/lib/validators/instrumentInput.ts` | Zod v4 schema for instrument creation |
| `apps/web/src/lib/validators/transactionInput.ts` | Zod v4 schema for transaction creation/update |
| `apps/web/src/lib/prisma-price-lookup.ts` | PriceLookup implementation (carry-forward queries) |
| `apps/web/src/lib/prisma-snapshot-store.ts` | SnapshotStore implementation (Decimal serialization) |

---

## UI Architecture (Sessions 5–7)

### Design System

Tailwind v4 with CSS-based `@theme` directives in `globals.css` (no `tailwind.config.ts`). Font variables use `--font-*-ref` pattern. Fonts bundled locally via `next/font/local` (no Google Fonts CDN).

Token classes: `bg-bg-primary/secondary/tertiary`, `text-text-primary/secondary/tertiary`, `border-border-primary`, `bg-accent-positive/negative/warning/info`. Typography: `font-heading` (Crimson Pro), `font-body` (DM Sans), `font-mono` (JetBrains Mono).

### Key UI Files

| Area | Location | Key Components |
|------|----------|---------------|
| Base UI | `src/components/ui/` | Button, Input, Select, Card, Badge, Table, Tooltip, Toast, Modal, PillToggle, Skeleton, ValueChange |
| Layout | `src/components/layout/` | Shell, NavTabs, DataHealthFooter, AdvisorFAB |
| Dashboard | `src/components/dashboard/` | HeroMetric, SummaryCards, PortfolioChart, WindowSelector |
| Holdings | `src/components/holdings/` | HoldingsTable, TotalsRow, StalenessIndicator, StalenessBanner |
| Holding Detail | `src/components/holding-detail/` | PositionSummary, CandlestickChart, LotsTable, HoldingTransactions |
| Transactions | `src/components/transactions/` | TransactionForm, TransactionFormModal, TransactionsTable, DeleteConfirmation, SellValidationError |
| Instruments | `src/components/instruments/` | AddInstrumentModal, SymbolSearchInput |
| Advisor | `src/components/advisor/` | AdvisorPanel, AdvisorHeader, AdvisorMessages, AdvisorInput, SuggestedPrompts, ToolCallIndicator, ThreadList |
| Empty States | `src/components/empty-states/` | DashboardEmpty, HoldingsEmpty, TransactionsEmpty, AdvisorEmpty |

All component paths relative to `apps/web/`.

### Data Fetching Hooks (`apps/web/src/lib/hooks/`)

Pattern: `useState` + `useEffect` with cancellation flag. No SWR (AD-1).

| Hook | Key Details |
|------|------------|
| `usePortfolioSnapshot` | Accepts `window: WindowOption`. Detects `needsRebuild` and auto-triggers. |
| `usePortfolioTimeseries` | Date-ordered series for area chart |
| `useHoldings` | Skips loading skeleton on refetch (preserves pagination state) |
| `useHoldingDetail` | Retries once on HTTP 500 (500ms delay) |
| `useMarketHistory` | Price bars for candlestick chart |
| `useTransactions` | Filterable by `instrumentId` |
| `useInstruments` | All instruments for form selects |
| `useMarketStatus` | Data health for footer |
| `useAdvisor` | Thread management, message sending, `hasSummary` state |
| `useChart` | TradingView chart lifecycle (create → resize → dispose) |

### Formatting (`apps/web/src/lib/format.ts`)

All functions accept **string** inputs (Decimal serialization). Use `Decimal.js` internally — never `parseFloat`. Functions: `formatCurrency`, `formatPercent`, `formatQuantity`, `formatCompact`, `formatDate`, `formatRelativeTime`. Invalid inputs return `"—"`.

### TradingView Lightweight Charts v5

**v5 API:** Use `chart.addSeries(AreaSeries, options)` — NOT `chart.addAreaSeries()` (removed in v5).

**Decimal exception (AD-4, AD-S6c):** TradingView requires `number` values. `chart-utils.ts` and `chart-candlestick-utils.ts` are the **only** approved `Number()` locations for financial values.

### Sell Validation Error Shape

```json
{
  "error": "SELL_VALIDATION_FAILED",
  "message": "Transaction would create negative position",
  "details": {
    "instrumentSymbol": "AAPL",
    "firstViolationDate": "2026-01-01T00:00:00.000Z",
    "deficitQuantity": "99929"
  }
}
```

---

## Advisor Backend (`packages/advisor/`)

### File Inventory

| File | Purpose |
|------|---------|
| `llm-adapter.ts` | Provider-agnostic interface: `LLMAdapter`, `Message`, `ToolCall`, `ToolDefinition`, `LLMResponse` |
| `anthropic-adapter.ts` | Anthropic Claude implementation. Handles `tool_use`/`tool_result` translation. Non-streaming. Model: `claude-sonnet-4-6`. Adaptive thinking enabled. Max tokens: 16,000. |
| `tools/get-top-holdings.ts` | Top N holdings by metric (allocation/value/pnl) with portfolio summary |
| `tools/get-portfolio-snapshot.ts` | Portfolio overview with summary header |
| `tools/get-holding.ts` | Single position detail with FIFO lots |
| `tools/get-transactions.ts` | Filtered transaction list |
| `tools/get-quotes.ts` | Quote freshness check |
| `tools/index.ts` | Barrel export + `allToolDefinitions` array (5 tools) |
| `tool-loop.ts` | Tool execution loop: LLM call → tool execution → loop (max 5 iterations) |
| `system-prompt.ts` | System prompt covering all 5 intent categories |
| `token-estimator.ts` | Conservative token estimation: 3.5 chars/token text, 3.0 structured JSON |
| `context-budget.ts` | Budget constants: 200K model window, 174.7K for messages after reserves |
| `context-window.ts` | `windowMessages()` — trims oldest turns when over budget. `groupIntoTurns()`. Never orphans tool calls. |
| `summary-generator.ts` | `generateSummary()` — LLM rolling summaries. `formatSummaryPreamble()` — context markers. |
| `index.ts` | Package barrel export |

### Chat Route Internals

`POST /api/advisor/chat` (`apps/web/src/app/api/advisor/chat/route.ts`):
1. Loads **all** messages (no limit)
2. Windows via `windowMessages()` to fit context budget
3. Prepends summary preamble if `thread.summaryText` exists
4. Sends windowed messages to tool loop
5. Fire-and-forget summary generation when messages are trimmed

`buildToolExecutors()` creates Prisma-backed executors. All Decimal values formatted as `$X,XXX.XX` via `formatNum()` (uses `Decimal.toFixed(2)` — no `parseFloat`). Single message conversion pipeline (AD-S20-2): `parsePrismaMessage()` → `WindowableMessage` → `windowableToMessage()` → `Message`. Token calibration logging in development mode (AD-S20-3).

### Thread Detail Response

`GET /api/advisor/threads/[id]` returns `hasSummary: boolean` (from `summaryText !== null`). Raw `summaryText` not exposed to frontend.

### Advisor Hook (`apps/web/src/lib/hooks/useAdvisor.ts`)

```typescript
const {
  threads, activeThreadId, messages, isLoading, error, isSetupRequired, hasSummary,
  sendMessage, loadThreads, loadThread, newThread, deleteThread,
} = useAdvisor();
```

`isSetupRequired`: Set when API returns `LLM_NOT_CONFIGURED` (503).

---

## Key Architecture Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| AD-S10a | Snapshot rebuild in `prisma.$transaction()` | Atomic delete + reinsert. 30s timeout. |
| AD-S10b | `GET /api/portfolio/snapshot` is read-only | Rebuild via `POST /api/portfolio/rebuild` or transaction CRUD. |
| AD-S10c | Bulk insert: all-or-none if sell validation fails | Prevents confusing partial imports. |
| AD-S10d | Cross-validation in CI via Vitest wrapper | 749-check regression guard runs via `pnpm test`. |
| AD-S18-1 | Backfill lookback: 10 years | Tiingo provides 30+ years free. Covers any reasonable history. |
| AD-S19-1 | Token estimation via character-ratio heuristic | Conservative overestimation is the safe failure mode. |
| AD-S19-2 | Turn-boundary trimming only | Prevents orphaned tool results or context-free responses. |
| AD-S19-3 | Summary triggered by windowing signal | Decouples "when" from "how". |
| AD-S19-4 | Summary: same adapter, minimal prompt, no tools | ~1,800 tokens per summary. |
| AD-S19-5 | Summary is fire-and-forget | User gets answer immediately. Failure degrades gracefully. |
| AD-S19-6 | `summaryText` not exposed to frontend | Internal to LLM context. Users see indicator only. |
| AD-S20-1 | Rolling summary trigger fires on every trim | Original `!summaryText` guard made merge path unreachable. |
| AD-S20-2 | Single message conversion pipeline | `parsePrismaMessage → windowableToMessage`. Eliminated dual converter. |
| AD-S20-3 | Token calibration logging in dev mode only | Zero production overhead. Validates char/token heuristic. |

---

## Bulk Paste Feature

| Component | Purpose |
|-----------|---------|
| `bulk-parser.ts` | Tab/multi-space parser with per-row validation |
| `POST /api/transactions/bulk` | Zod schema, symbol resolution, sell validation, $transaction insert, snapshot rebuild |
| `BulkPreviewTable.tsx` | Preview with green/red row indicators |
| `BulkPastePanel.tsx` | Collapsible textarea with parse/confirm flow |
| `useBulkImport.ts` | Hook for API call with loading/error/result state |

---

## CI & Infrastructure

| Item | Detail |
|------|--------|
| `.github/workflows/ci.yml` | Push/PR to main: tsc, test, build. pnpm 10, Node 20, `--frozen-lockfile`. |
| `data/test/cross-validate.test.ts` | 3 Vitest tests wrapping 749 cross-validation checks |
| `prefers-reduced-motion` | CSS media query gating all animations |
| Seed data | 28 instruments, ~8300 bars, 30 transactions, 28 quotes (3 stale) |

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
