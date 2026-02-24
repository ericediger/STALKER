# CLAUDE.md — STALKER Architecture & Agent Rules

**Project:** STALKER — Stock & Portfolio Tracker + LLM Advisor
**Last Updated:** 2026-02-24 (Post-Session 9 — MVP Complete)
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

## UI Component Catalog (Session 5)

### Design System

| File | Purpose |
|------|---------|
| `apps/web/src/app/globals.css` | Tailwind v4 `@theme` config: colors, fonts, spacing. Dark financial theme. |
| `apps/web/src/app/layout.tsx` | Root layout with Google Fonts (Crimson Pro, DM Sans, JetBrains Mono) |
| `apps/web/src/lib/cn.ts` | `cn()` utility — `clsx` + `tailwind-merge` |
| `apps/web/src/lib/format.ts` | Numeric formatting: currency, percent, quantity, compact, date, relative time |
| `apps/web/postcss.config.mjs` | PostCSS config for Tailwind v4 |

**Tailwind v4 Note:** No `tailwind.config.ts`. Theme is CSS-based via `@theme` directives in `globals.css`. Font variables use `--font-*-ref` pattern to avoid self-referential CSS variables (next/font sets `--font-heading-ref`, theme maps it to `--font-heading`).

### Token Classes

Colors: `bg-bg-primary`, `bg-bg-secondary`, `bg-bg-tertiary`, `text-text-primary`, `text-text-secondary`, `text-text-tertiary`, `border-border-primary`, `bg-accent-primary` (gold), `bg-accent-positive` (green), `bg-accent-negative` (red), `bg-accent-warning` (amber), `bg-accent-info` (blue).

Typography: `font-heading` (Crimson Pro), `font-body` (DM Sans), `font-mono` (JetBrains Mono).

Spacing: `p-card` (1rem), `p-section` (1.5rem), `px-page` (2rem).

### Base UI Components (`apps/web/src/components/ui/`)

| Component | Key Props | Notes |
|-----------|-----------|-------|
| `Button` | `variant`: primary/secondary/ghost/danger, `size`: sm/md/lg, `loading`, `disabled` | Focus ring, spinner |
| `Input` | `label`, `error`, `hint` + standard HTML input props | Dark bg, error styling |
| `Select` | `label`, `options`, `error`, `placeholder` | Native select, styled like Input |
| `Card` | `title?`, `children`, `className` | `bg-bg-secondary` container |
| `Badge` | `variant`: positive/negative/warning/info/neutral, `size`: sm/md | Pill-shaped |
| `Table` | `columns`, `data`, `onSort`, `emptyMessage` | Numeric cols right-aligned in font-mono |
| `Tooltip` | `content`, `side`, `children` | CSS-only hover tooltip |
| `Toast` | `ToastProvider` + `useToast()` hook | Context-based, auto-dismiss, slide animation |
| `Modal` | `open`, `onClose`, `title`, `children` | Backdrop, Escape key, focus trap |
| `PillToggle` | `options`, `value`, `onChange` | Horizontal pill selector |
| `Skeleton` | `width?`, `height?` | Pulse animation placeholder |
| `ValueChange` | `value`, `format`: currency/percent | Green/red with arrows |

### Layout Components (`apps/web/src/components/layout/`)

| Component | Purpose |
|-----------|---------|
| `Shell` | Wraps NavTabs + content + DataHealthFooter + AdvisorFAB + AdvisorPanel. Manages advisor open/close state. |
| `NavTabs` | 4 tabs: Dashboard, Holdings, Transactions, Charts. Active state via `usePathname()` |
| `DataHealthFooter` | Fixed bottom bar wired to `GET /api/market/status` — instrument count, polling, budget, freshness |
| `AdvisorFAB` | Fixed circular button bottom-right. Accepts `onClick` prop to open advisor panel. |

### Empty States (`apps/web/src/components/empty-states/`)

| Component | Content |
|-----------|---------|
| `DashboardEmpty` | "Add your first holding" + primary CTA |
| `HoldingsEmpty` | Same as Dashboard |
| `TransactionsEmpty` | Informational text only |
| `AdvisorEmpty` | Conditional: `hasHoldings` → suggested prompts, else "add holdings first" |

### Page Routes (`apps/web/src/app/(pages)/`)

Route group `(pages)` uses Shell layout. Pages: `/` (Dashboard — data-wired), `/holdings` (Holdings — data-wired), `/transactions` (TransactionsEmpty), `/charts` (placeholder).

### Formatting Utilities (`apps/web/src/lib/format.ts`)

All functions accept **string** inputs (Decimal serialization from API). Use `Decimal.js` internally — never `parseFloat`.

| Function | Signature | Example |
|----------|-----------|---------|
| `formatCurrency` | `(value: string, opts?: { showSign? }) => string` | `"12345.67"` → `"$12,345.67"` |
| `formatPercent` | `(value: string, opts?: { showSign?, decimals? }) => string` | `"5.678"` → `"5.68%"` |
| `formatQuantity` | `(value: string) => string` | `"1234"` → `"1,234"` |
| `formatCompact` | `(value: string) => string` | `"1234567.89"` → `"$1.2M"` |
| `formatDate` | `(isoString: string) => string` | `"2026-02-18T16:00:00Z"` → `"Feb 18, 2026"` |
| `formatRelativeTime` | `(isoString: string) => string` | Recent → `"5 min ago"` |

Invalid inputs return `"—"` (em dash). Zero never shows as negative.

---

## Session 6 — Dashboard + Holdings UI

### Dashboard Components (`apps/web/src/components/dashboard/`)

| Component | Props | Notes |
|-----------|-------|-------|
| `HeroMetric` | `snapshot: PortfolioSnapshot \| null`, `isLoading` | Crimson Pro 4xl total value, ValueChange for day change |
| `SummaryCards` | `snapshot`, `isLoading` | 3 cards: Total Gain/Loss (uses `add()` from shared), Unrealized PnL, Realized PnL |
| `PortfolioChart` | `timeseries: TimeseriesPoint[]`, `isLoading` | TradingView Lightweight Charts v5 area chart |
| `WindowSelector` | `value: WindowOption`, `onChange` | Wraps PillToggle with 1D/1W/1M/3M/1Y/ALL options |

### Holdings Components (`apps/web/src/components/holdings/`)

| Component | Props | Notes |
|-----------|-------|-------|
| `HoldingsTable` | `holdings`, `compact?`, `onSort?`, `sortColumn?`, `sortDirection?`, `staleInstruments?`, `onRowClick?` | `compact` mode for dashboard (no sort/staleness). `onRowClick` navigates to holding detail. |
| `TotalsRow` | `holdings: Holding[]` | Footer with total value + total unrealized PnL |
| `StalenessIndicator` | `lastUpdated: string` | Amber Badge with Tooltip showing full date |
| `StalenessBanner` | `staleInstruments: StaleInstrument[]` | Conditional amber warning banner |

### Data Fetching Hooks (`apps/web/src/lib/hooks/`)

Pattern: `useState` + `useEffect` with cancellation flag. No SWR (AD-1).

| Hook | Params | Returns |
|------|--------|---------|
| `usePortfolioSnapshot` | `window: WindowOption` | `{ data: PortfolioSnapshot \| null, isLoading, error }` |
| `usePortfolioTimeseries` | `window: WindowOption` | `{ data: TimeseriesPoint[], isLoading, error }` |
| `useHoldings` | none | `{ data: Holding[] \| null, isLoading, error }` |
| `useMarketStatus` | none | `{ data: MarketStatus \| null, isLoading, error }` |

### Utility Functions

| File | Functions | Notes |
|------|-----------|-------|
| `window-utils.ts` | `getWindowDateRange(window, today?)`, `WindowOption`, `WINDOW_OPTIONS`, `DEFAULT_WINDOW` | Maps PillToggle option to `{ startDate?, endDate }` |
| `chart-utils.ts` | `toAreaChartData(timeseries)`, `TimeseriesPoint` | Converts API response to TradingView AreaData. **This is the ONE place `Number()` is used** — TradingView requires numeric values. |
| `holdings-utils.ts` | `sortHoldings()`, `computeAllocation()`, `computeTotals()`, `isSymbolStale()` | All arithmetic via `Decimal.js`. Types: `Holding`, `SortColumn`, `SortDirection` |

### TradingView Lightweight Charts v5 Integration

**API change in v5:** Use `chart.addSeries(AreaSeries, options)` — NOT `chart.addAreaSeries()` (removed in v5).

**Shared chart hook (`apps/web/src/lib/hooks/useChart.ts`):**
```typescript
import { useChart } from "@/lib/hooks/useChart";
const { chart } = useChart({ container: containerRef, options: { height: 300 } });
// Then add series: chart.addSeries(AreaSeries, opts) or chart.addSeries(CandlestickSeries, opts)
```
Handles: createChart → ResizeObserver → dispose. Dark theme defaults built in.

Both `PortfolioChart` (area) and `CandlestickChart` (candlestick) use this hook.

### Decimal Exception for Charts (AD-4 Note)

TradingView Lightweight Charts requires `number` values for chart data points. `chart-utils.ts` and `chart-candlestick-utils.ts` are the **only** approved locations for `Number()` on financial values. All other UI code must use `formatCurrency()`, `formatPercent()`, etc.

### Seed Data

`apps/web/prisma/seed.ts` creates 28 instruments with ~300 trading days of price bars each (8300+ bars total), 30 transactions, and 28 latest quotes (3 intentionally stale for testing staleness indicators).

---

## Session 7 — Holding Detail + Transactions + Charts

### Holding Detail Components (`apps/web/src/components/holding-detail/`)

| Component | Props | Notes |
|-----------|-------|-------|
| `PositionSummary` | `detail: HoldingDetail` | 2x4 grid: shares, avg cost, market value, PnL, cost basis, realized PnL, mark price, quote time |
| `CandlestickChart` | `symbol: string` | TradingView candlestick with date range PillToggle (1M/3M/6M/1Y/ALL) |
| `LotsTable` | `lots: HoldingLot[]`, `markPrice: string \| null` | FIFO lots with per-lot unrealized PnL, totals row |
| `HoldingTransactions` | `transactions`, `onEdit?`, `onDelete?` | Sorted table, Badge for BUY/SELL, edit/delete icons wired to callbacks |
| `UnpricedWarning` | `symbol: string` | Amber banner when no price data |

### Transaction Components (`apps/web/src/components/transactions/`)

| Component | Props | Notes |
|-----------|-------|-------|
| `SellValidationError` | `error: SellValidationErrorData \| null` | Inline error: deficit qty, violation date, suggested fix. Uses `firstViolationDate` field. |
| `TransactionForm` | `mode`, `transaction?`, `instruments`, `onSuccess`, `onError` | BUY/SELL toggle, instrument select, date/qty/price/fees inputs |
| `TransactionFormModal` | `open`, `onClose`, `mode`, `transaction?`, `instruments`, `onSuccess` | Modal wrapper with toast feedback |
| `TransactionsTable` | `transactions`, `onEdit`, `onDelete` | Sortable columns, type badges, formatted values, actions |
| `DeleteConfirmation` | `open`, `onClose`, `transaction`, `onSuccess` | Danger modal with 422 sell validation handling |

### Instrument Components (`apps/web/src/components/instruments/`)

| Component | Props | Notes |
|-----------|-------|-------|
| `AddInstrumentModal` | `open`, `onClose`, `onSuccess` | Manual entry form (symbol search is stubbed). 409 duplicate detection. |
| `SymbolSearchInput` | `value`, `onChange` | Text input with search stub message |

### Session 7 Data Hooks (`apps/web/src/lib/hooks/`)

| Hook | Params | Returns |
|------|--------|---------|
| `useChart` | `{ container, options? }` | `{ chart: IChartApi \| null }` |
| `useHoldingDetail` | `symbol: string` | `{ data, isLoading, error, refetch }` |
| `useMarketHistory` | `symbol, startDate, endDate` | `{ data: PriceBar[], isLoading, error }` |
| `useTransactions` | `instrumentId?` | `{ data, isLoading, error, refetch }` |
| `useInstruments` | none | `{ data, isLoading, error, refetch }` |

### Session 7 Utility Functions

| File | Functions | Notes |
|------|-----------|-------|
| `chart-candlestick-utils.ts` | `toCandlestickData(bars)` | PriceBar → TradingView CandlestickData. `Number()` exception (AD-S6c). 12 tests. |
| `transaction-utils.ts` | `validateTransactionForm()`, `formatTransactionForApi()`, `sortTransactions()` | Client-side validation, API formatting, multi-column sort. 32 tests. |

### Sell Validation Error Shape (Verified)

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
Note: The field is `firstViolationDate` (not `firstNegativeDate` as in the master plan).

### Cross-Page Navigation

| From | To | Method |
|------|----|--------|
| Dashboard holdings table row | `/holdings/[symbol]` | `onRowClick` → `router.push()` |
| Holdings page table row | `/holdings/[symbol]` | `onRowClick` → `router.push()` |
| Holding detail back arrow | `/holdings` | `<Link>` |
| Holding detail edit icon | TransactionFormModal (edit) | `onEdit` callback |
| Holding detail delete icon | DeleteConfirmation modal | `onDelete` callback |

### ToastProvider

`ToastProvider` wraps all pages via `Shell` component. `useToast()` is available in any component rendered within the pages layout.

---

## Session 8 — Code Review Hardening + LLM Advisor

### Phase 0: Hardening

| Task | What Changed |
|------|-------------|
| H-1 | Snapshot rebuild wired in POST/PUT/DELETE transaction + DELETE instrument via `triggerSnapshotRebuild()` helper |
| H-2 | GET /api/portfolio/snapshot reads cached snapshots first (read-only), only rebuilds on cold start |
| H-3 | GET /api/market/search returns `{ results: [] }` with defensive client parsing |
| H-4 | `fetchWithTimeout()` utility wrapping all provider fetch calls (10s default, AbortController) |
| H-5 | Fonts bundled locally in `apps/web/src/fonts/` via `next/font/local` — no Google Fonts CDN dependency |

### Advisor Backend (`packages/advisor/`)

| File | Purpose |
|------|---------|
| `llm-adapter.ts` | Provider-agnostic interface: `LLMAdapter`, `Message`, `ToolCall`, `ToolDefinition`, `LLMResponse` |
| `anthropic-adapter.ts` | Anthropic Claude implementation. Handles `tool_use`/`tool_result` translation (W-5). Non-streaming. |
| `tools/get-portfolio-snapshot.ts` | Tool definition + dependency-injected executor for portfolio overview |
| `tools/get-holding.ts` | Tool definition + executor for single position detail with FIFO lots |
| `tools/get-transactions.ts` | Tool definition + executor for filtered transaction list |
| `tools/get-quotes.ts` | Tool definition + executor for quote freshness check |
| `tools/index.ts` | Barrel export + `allToolDefinitions` array |
| `tool-loop.ts` | Tool execution loop: LLM call → tool execution → loop (max 5 iterations) |
| `system-prompt.ts` | System prompt covering all 5 intent categories |
| `index.ts` | Package barrel export |

### Advisor API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/advisor/chat` | Send message, execute tool loop, return all generated messages. Creates thread if needed. |
| GET | `/api/advisor/threads` | List all threads with message count, sorted by updatedAt desc |
| GET | `/api/advisor/threads/[id]` | Thread detail with all messages |
| DELETE | `/api/advisor/threads/[id]` | Delete thread + messages, return 204 |

**Chat route internals:** `buildToolExecutors()` creates Prisma-backed executors for all 4 tools. All Decimal values formatted as `$X,XXX.XX` strings via `formatNum()`. Lot data uses `Lot.price` (per-unit cost) and `Lot.openedAt`.

### Advisor Frontend (`apps/web/src/components/advisor/`)

| Component | Purpose |
|-----------|---------|
| `AdvisorPanel` | Slide-out panel (448px max-w-md). Backdrop, Escape key, smooth transition. Manages thread/message display. |
| `AdvisorHeader` | Title, New Thread button, Threads dropdown toggle, Close button |
| `AdvisorMessages` | Scrollable message list with auto-scroll. Renders user/assistant/tool messages. Loading indicator. |
| `AdvisorInput` | Textarea with auto-resize (max 4 lines), Enter to send, Shift+Enter for newline, loading spinner |
| `SuggestedPrompts` | 3 clickable prompt cards for empty threads |
| `ToolCallIndicator` | Collapsed/expanded tool call display with tool name labels |
| `ThreadList` | Thread list dropdown with select and delete |

### Advisor Hook (`apps/web/src/lib/hooks/useAdvisor.ts`)

```typescript
const {
  threads, activeThreadId, messages, isLoading, error, isSetupRequired,
  sendMessage, loadThreads, loadThread, newThread, deleteThread,
} = useAdvisor();
```

- `sendMessage`: Optimistic user message → POST /api/advisor/chat → append response messages
- `isSetupRequired`: Set when API returns `LLM_NOT_CONFIGURED` (503) — shows setup instructions
- `error`: Set on 502 (LLM error) or network failure

### System Prompt Intent Categories (Verified Phase 2)

| # | Category | Coverage |
|---|----------|----------|
| 1 | Cross-holding synthesis | Rankings by PnL contribution, allocation comparison |
| 2 | Tax-aware reasoning | FIFO lot breakdown, explicit per-lot gain calculation |
| 3 | Performance attribution | Multi-window comparison, holding-level performance |
| 4 | Concentration awareness | Allocation percentage analysis, threshold flagging |
| 5 | Staleness/data quality | 4-step freshness protocol, 2-hour threshold, disclosure template |

### New Tests (62 new, 469 total)

| File | Tests | Scope |
|------|-------|-------|
| `packages/advisor/__tests__/tool-executors.test.ts` | 12 | Tool executor parameter passing, defaults, error cases |
| `packages/advisor/__tests__/tool-loop.test.ts` | 7 | Loop termination, tool error capture, max iterations, adapter error propagation |
| `packages/advisor/__tests__/anthropic-adapter.test.ts` | 6 | SDK mock, message translation, tool_use/tool_result, model env var |
| `packages/advisor/__tests__/exports.test.ts` | 8 | Barrel exports, tool definitions, system prompt coverage |
| `apps/web/__tests__/api/advisor/chat.test.ts` | 8 | 503 missing key, 400 validation, thread creation, 404, 502 LLM error |
| `apps/web/__tests__/api/advisor/threads.test.ts` | 8 | Thread list, thread detail, thread delete, 404, 500 |
| `apps/web/__tests__/api/advisor/useAdvisor.test.ts` | 7 | Frontend API integration (fetch shapes, error handling) |
| Hardening tests (Phases 0) | 6 | search route, fetchWithTimeout |

---

## Session 9 — Full-Stack Validation + Polish + MVP Signoff

### Phase 0: Live LLM Verification

| Change | Detail |
|--------|--------|
| Tool loop empty string fix | `tool-loop.ts` line 94: `??` → `||` to coalesce empty strings to fallback message |
| Model update | Default model changed to `claude-sonnet-4-6` |
| Adaptive thinking | `thinking: { type: 'adaptive' }` added to Anthropic adapter for higher-quality advisor responses |
| Max tokens increase | Default `max_tokens` raised from 4096 to 16000 to accommodate adaptive thinking |
| Live verification | All 5 advisor intent categories verified against real LLM with seed data |

### Phase 2: Accessibility & Polish

| Component | Change |
|-----------|--------|
| `useFocusTrap` hook | New hook at `apps/web/src/lib/hooks/useFocusTrap.ts` — Tab cycling, Shift+Tab backward, focus return on close |
| `AdvisorPanel` | Focus trap wired, `role="dialog"`, `aria-label`, `aria-modal="true"`, `aria-hidden` |
| `Toast` container | `role="status"`, `aria-live="polite"` on container |
| `UnpricedWarning` | `role="alert"` added |
| `DeleteConfirmation` | `id="delete-confirm-desc"` for ARIA describedby |

### New Documentation

| File | Purpose |
|------|---------|
| `KNOWN-LIMITATIONS.md` | 8 documented MVP gaps with impact and mitigation |
| `data/test/advisor-live-verification.md` | All 5 intent categories verified with pass/fail |
| `data/test/smoke-test-results.md` | 22-point smoke test results |

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
