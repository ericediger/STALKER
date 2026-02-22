# HANDOFF.md — STALKER Current State

**Last Updated:** 2026-02-22 (Post-Session 6)
**Last Session:** Session 6 — Dashboard + Holdings UI

---

## Current State

The project has a complete backend (Sessions 1–4), full design system + component library (Session 5), and data-wired dashboard and holdings pages (Session 6). The app now displays live portfolio data with charts, PnL metrics, and a holdings table.

### What Exists

**Infrastructure:**
- pnpm workspace monorepo with 7 packages (5 in `packages/`, 1 app, 1 root)
- TypeScript 5.9.3 with strict mode, zero errors
- Prisma 6.19.2 with SQLite — all 7 tables defined, database seeded with 28 instruments
- Vitest 3.2.4 — **363 tests** passing across **28 test files**
- Next.js 15.5.12 App Router with all API routes + data-wired UI pages
- Tailwind CSS 4.2 with PostCSS — dark financial theme via CSS `@theme` directives
- Zod v4 for input validation
- TradingView Lightweight Charts v5 for portfolio area chart
- `.env.example` template with all environment variables
- `concurrently` wired: `pnpm dev` launches both Next.js and scheduler
- Seed script at `apps/web/prisma/seed.ts` (28 instruments, 30 transactions, 8300+ price bars)

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

**UI Foundation (Session 5 — all implemented):**
- **Design system:** Tailwind v4 dark theme, 3 Google Fonts, CSS variables, `cn()` utility
- **12 base components:** Button, Input, Select, Card, Badge, Table, Tooltip, Toast, Modal, PillToggle, Skeleton, ValueChange
- **4 layout components:** Shell, NavTabs, DataHealthFooter (live), AdvisorFAB
- **4 empty states:** Dashboard, Holdings, Transactions, Advisor
- **6 formatting utilities:** formatCurrency, formatPercent, formatQuantity, formatCompact, formatDate, formatRelativeTime (49 tests)

**Dashboard + Holdings (Session 6 — all implemented):**
- **Dashboard page (`/`):** Hero metric (total value + day change), TradingView area chart, window selector (1D-ALL), summary cards (total gain, realized/unrealized PnL), compact holdings table, Skeleton loading states
- **Holdings page (`/holdings`):** Full sortable table (8 columns), totals row, staleness banner + per-instrument staleness indicators, empty state transition
- **Data fetching hooks:** usePortfolioSnapshot, usePortfolioTimeseries, useHoldings, useMarketStatus
- **Utility functions:** window-utils (date range mapping), chart-utils (TradingView data transform), holdings-utils (sort, allocation, totals, staleness)
- **DataHealthFooter wired:** Live instrument count, polling interval, budget usage, freshness/staleness info

**Reference Portfolio Fixtures** (`data/test/`):
- `reference-portfolio.json` — 6 instruments, 25 transactions, 56 trading days of mock prices
- `expected-outputs.json` — Hand-computed expected values at 6 checkpoint dates
- 24 fixture-based validation tests

**Packages scaffolded (empty shells):**
- `@stalker/advisor` — placeholder only

### What Does Not Exist Yet

- Holding detail page (Session 7)
- Transaction add/edit forms (Session 7)
- Add instrument modal with symbol search (Session 7)
- Candlestick chart variant (Session 7 — holding detail)
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
| AdvisorFAB | `apps/web/src/components/layout/AdvisorFAB.tsx` | Wire to advisor panel |

---

## Session 6 Component Usage Guide (for Session 7+)

### Dashboard Components

```typescript
import { HeroMetric } from "@/components/dashboard/HeroMetric";
import { SummaryCards } from "@/components/dashboard/SummaryCards";
import { PortfolioChart } from "@/components/dashboard/PortfolioChart";
import { WindowSelector } from "@/components/dashboard/WindowSelector";
```

### Holdings Components

```typescript
import { HoldingsTable } from "@/components/holdings/HoldingsTable";
import { TotalsRow } from "@/components/holdings/TotalsRow";
import { StalenessBanner } from "@/components/holdings/StalenessBanner";
import { StalenessIndicator } from "@/components/holdings/StalenessIndicator";
```

### Data Hooks

```typescript
import { usePortfolioSnapshot } from "@/lib/hooks/usePortfolioSnapshot";
import { usePortfolioTimeseries } from "@/lib/hooks/usePortfolioTimeseries";
import { useHoldings } from "@/lib/hooks/useHoldings";
import { useMarketStatus } from "@/lib/hooks/useMarketStatus";
```

### Key Patterns

- **Window state management:** Dashboard page holds `selectedWindow` state, passes it to hooks and components.
- **HoldingsTable `compact` mode:** `<HoldingsTable holdings={data} compact />` — no sort headers, no staleness indicators.
- **TradingView v5:** Use `chart.addSeries(AreaSeries, options)` not `chart.addAreaSeries()`.
- **Decimal exception:** Only `chart-utils.ts` may use `Number()` on financial values (TradingView requires numbers).
- **Staleness:** `useMarketStatus` provides `staleInstruments[]` — pass to `HoldingsTable` and `StalenessBanner`.

---

## Metrics

| Metric | Value |
|--------|-------|
| Test count (total) | 363 |
| Test files | 28 |
| TypeScript errors | 0 |
| Packages created | 5 of 5 (4 implemented, 1 shell) |
| API endpoints | 16 of ~18 implemented (2 stubs: search, refresh) |
| UI components | 24 (12 base + 4 layout + 4 empty states + 4 dashboard) |
| Holdings components | 4 (HoldingsTable, TotalsRow, StalenessIndicator, StalenessBanner) |
| Data hooks | 4 (snapshot, timeseries, holdings, market status) |
| Utility modules | 3 (window-utils, chart-utils, holdings-utils) |
| UI pages | 4 of 6 (2 data-wired, 2 stubs) |
| Prisma tables | 7 of 7 |
| Market data providers | 3 of 3 |
| Scheduler | Complete |
| Analytics engine | Complete |
| Reference portfolio | Complete |
| Formatting utilities | 6 functions, 49 tests |
| Seed data | 28 instruments, 30 transactions, 8300+ price bars |

---

## What's Next

**Session 7: Holding Detail + Transaction Forms + Charts**

Scope: Individual holding detail pages, transaction add/edit forms, add instrument modal with symbol search, candlestick chart for individual instruments.

Key integration points:
- Holding detail page uses `GET /api/portfolio/holdings/[symbol]` for lot-level view
- Transaction forms POST/PUT to `/api/transactions`
- Add instrument modal uses `/api/market/search` (needs API keys) or manual entry
- Candlestick chart uses `GET /api/market/history` with TradingView Lightweight Charts

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
