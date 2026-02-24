# HANDOFF.md — STALKER Current State

**Last Updated:** 2026-02-23 (Post-Session 8)
**Last Session:** Session 8 — Code Review Hardening + LLM Advisor

---

## Current State

The project has a complete backend (Sessions 1–4), full design system + component library (Session 5), data-wired dashboard and holdings pages (Session 6), holding detail, transactions, and charts pages (Session 7), and now the LLM advisor (Session 8). All pages are functional with live data. The advisor chat panel is wired end-to-end: FAB → slide-out panel → API route → LLM tool loop → response rendering.

### What Exists

**Infrastructure:**
- pnpm workspace monorepo with 7 packages (5 in `packages/`, 1 app, 1 root)
- TypeScript 5.9.3 with strict mode, zero errors
- Prisma 6.19.2 with SQLite — all 7 tables defined, database seeded with 28 instruments
- Vitest 3.2.4 — **469 tests** passing across **39 test files**
- Next.js 15.5.12 App Router with all API routes + all UI pages (including advisor)
- Tailwind CSS 4.2 with PostCSS — dark financial theme via CSS `@theme` directives
- Zod v4 for input validation
- TradingView Lightweight Charts v5 for portfolio area chart + candlestick charts
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

**API Layer (Session 4, updated Session 7):**
- **Instrument CRUD:** POST/GET/GET[id]/DELETE with exchange→timezone mapping, providerSymbolMap, cascade delete
- **Transaction CRUD:** POST/GET/GET[id]/PUT/DELETE with sell validation via `validateTransactionSet()`
- **GET /api/transactions:** Now supports listing all transactions (instrumentId optional), includes `symbol` and `instrumentName` per row
- **Portfolio endpoints:** snapshot (window-based), timeseries (date range), holdings (allocation %), holdings/[symbol] (lot detail)
- **Market endpoints:** quote (cached), history (price bars), search (stub), refresh (stub), status (health summary)
- **Prisma interface implementations:** PrismaPriceLookup (carry-forward), PrismaSnapshotStore (Decimal serialization)
- **Shared utilities:** errors.ts (apiError factory), Zod validators, prisma singleton

**UI Foundation (Session 5 — all implemented):**
- **Design system:** Tailwind v4 dark theme, 3 Google Fonts, CSS variables, `cn()` utility
- **12 base components:** Button, Input, Select, Card, Badge, Table, Tooltip, Toast, Modal, PillToggle, Skeleton, ValueChange
- **4 layout components:** Shell (now wraps ToastProvider), NavTabs, DataHealthFooter (live), AdvisorFAB
- **4 empty states:** Dashboard, Holdings, Transactions, Advisor
- **6 formatting utilities:** formatCurrency, formatPercent, formatQuantity, formatCompact, formatDate, formatRelativeTime (49 tests)

**Dashboard + Holdings (Session 6 — all implemented):**
- **Dashboard page (`/`):** Hero metric, TradingView area chart (now uses shared useChart hook), window selector (1D-ALL), summary cards, compact holdings table with row click → holding detail, Skeleton loading states
- **Holdings page (`/holdings`):** Full sortable table (8 columns) with row click → holding detail, totals row, staleness banner + per-instrument staleness indicators, empty state transition
- **Data fetching hooks:** usePortfolioSnapshot, usePortfolioTimeseries, useHoldings, useMarketStatus
- **Utility functions:** window-utils (date range mapping), chart-utils (TradingView data transform), holdings-utils (sort, allocation, totals, staleness)

**Holding Detail + Transactions + Charts (Session 7 — all implemented):**
- **Holding detail page (`/holdings/[symbol]`):** Position summary (2x4 grid), TradingView candlestick chart with date range selector (1M/3M/6M/1Y/ALL), FIFO lots table with per-lot unrealized PnL, transaction history with edit/delete actions wired to modals, unpriced warning banner, 404 redirect to dashboard
- **Transactions page (`/transactions`):** Full sortable table showing all transactions with symbol, type badges (BUY/SELL), formatted values. Add/edit/delete via modals with sell validation error display (inline SellValidationError on 422). Empty state with CTA.
- **Charts page (`/charts`):** Symbol selector dropdown + full-width candlestick chart for any held instrument
- **Add Instrument modal:** Manual entry form with symbol/name/type/exchange fields, symbol search input (stub), 409 duplicate detection. Accessible from transactions page.
- **Shared chart hook:** `useChart` extracted from Session 6 area chart — handles createChart, ResizeObserver, dispose lifecycle. Used by both PortfolioChart (area) and CandlestickChart.
- **Sell validation UX:** SellValidationError component shows deficit quantity, first violation date, and suggested fix. Appears inline below form on 422 — form stays open for user to adjust.
- **Transaction form:** Create and edit modes, BUY/SELL toggle, instrument select, date/price/qty/fees inputs, client-side + server-side validation.
- **Delete confirmation:** Danger modal with sell validation handling for dependent transactions.
- **Cross-page navigation:** Holdings table rows → holding detail, holding detail back → holdings, holding detail edit/delete → transaction modals with refetch.
- **Data hooks:** useHoldingDetail (with refetch), useMarketHistory, useTransactions (with refetch), useInstruments (with refetch)
- **Utility modules:** chart-candlestick-utils (PriceBar → TradingView, 12 tests), transaction-utils (validation, formatting, sorting, 32 tests)

**Reference Portfolio Fixtures** (`data/test/`):
- `reference-portfolio.json` — 6 instruments, 25 transactions, 56 trading days of mock prices
- `expected-outputs.json` — Hand-computed expected values at 6 checkpoint dates
- 24 fixture-based validation tests

**Advisor (Session 8 — fully implemented):**
- `@stalker/advisor` — LLM adapter interface, Anthropic adapter, 4 tool definitions, tool execution loop, system prompt
- Advisor API routes: POST /api/advisor/chat, GET/api/advisor/threads, GET/DELETE /api/advisor/threads/[id]
- Advisor frontend: AdvisorPanel slide-out, AdvisorHeader, AdvisorMessages, AdvisorInput, SuggestedPrompts, ToolCallIndicator, ThreadList
- useAdvisor hook: thread/message state management, sendMessage, loadThread, loadThreads, newThread, deleteThread
- System prompt verified against all 5 intent categories (cross-holding, tax, performance, concentration, staleness)

**Session 8 Hardening (Phase 0):**
- H-1: Snapshot rebuild wired in all transaction CRUD + instrument DELETE
- H-2: GET /api/portfolio/snapshot reads cached snapshots first (read-only path)
- H-3: GET /api/market/search returns `{ results: [] }` (not bare array)
- H-4: All provider fetch calls use fetchWithTimeout (10s default)
- H-5: Fonts bundled locally via next/font/local (no Google Fonts CDN dependency)

### What Does Not Exist Yet

- Historical price backfill in instrument creation (stubbed — needs live API keys)
- Manual quote refresh (stubbed — needs live API keys)
- Symbol search proxy (stubbed — needs live API keys)
- CI pipeline

### Known Stubs (Ready to Wire)

| Stub | Location | What's Needed |
|------|----------|---------------|
| Historical backfill on instrument create | `apps/web/src/app/api/instruments/route.ts` | Call market data service `getHistory()`, write PriceBars, set firstBarDate |
| Symbol search | `apps/web/src/app/api/market/search/route.ts` | Wire to MarketDataService.searchSymbols() |
| Manual quote refresh | `apps/web/src/app/api/market/refresh/route.ts` | Wire to MarketDataService.getQuote() per instrument |

---

## Session 7 Component Usage Guide (for Session 8+)

### Holding Detail Components

```typescript
import { PositionSummary } from "@/components/holding-detail/PositionSummary";
import { CandlestickChart } from "@/components/holding-detail/CandlestickChart";
import { LotsTable } from "@/components/holding-detail/LotsTable";
import { HoldingTransactions } from "@/components/holding-detail/HoldingTransactions";
import { UnpricedWarning } from "@/components/holding-detail/UnpricedWarning";
```

### Transaction Components

```typescript
import { TransactionFormModal } from "@/components/transactions/TransactionFormModal";
import { TransactionsTable } from "@/components/transactions/TransactionsTable";
import { DeleteConfirmation } from "@/components/transactions/DeleteConfirmation";
import { SellValidationError } from "@/components/transactions/SellValidationError";
```

### Instrument Components

```typescript
import { AddInstrumentModal } from "@/components/instruments/AddInstrumentModal";
import { SymbolSearchInput } from "@/components/instruments/SymbolSearchInput";
```

### New Data Hooks

```typescript
import { useHoldingDetail } from "@/lib/hooks/useHoldingDetail";
import { useMarketHistory } from "@/lib/hooks/useMarketHistory";
import { useTransactions } from "@/lib/hooks/useTransactions";
import { useInstruments } from "@/lib/hooks/useInstruments";
import { useChart } from "@/lib/hooks/useChart";
```

### Key Patterns

- **Row click navigation:** Pass `onRowClick` to `HoldingsTable` — navigates to `/holdings/[symbol]`.
- **Transaction CRUD refetch:** All mutation modals accept `onSuccess` callback — use for refetch.
- **Sell validation:** 422 responses render `SellValidationError` inline — form stays open for adjustment.
- **Shared chart hook:** `useChart({ container, options })` returns `{ chart }` — callers add their own series.
- **Decimal exception:** `Number()` permitted only in `chart-utils.ts` and `chart-candlestick-utils.ts`.
- **ToastProvider:** Wraps all pages via Shell component — `useToast()` available everywhere.

---

## Metrics

| Metric | Value |
|--------|-------|
| Test count (total) | 469 |
| Test files | 39 |
| TypeScript errors | 0 |
| Packages created | 5 of 5 (all implemented) |
| API endpoints | 19 of ~21 implemented (2 stubs: search, refresh) |
| UI components | 44 (12 base + 4 layout + 4 empty states + 4 dashboard + 5 holding-detail + 5 transactions + 2 instruments + 1 chart hook + 7 advisor) |
| Data hooks | 10 (snapshot, timeseries, holdings, market status, holding detail, market history, transactions, instruments, chart, advisor) |
| Utility modules | 6 (window-utils, chart-utils, chart-candlestick-utils, holdings-utils, transaction-utils, fetch-with-timeout) |
| UI pages | 6 of 6 (all data-wired including advisor) |
| Prisma tables | 7 of 7 |
| Market data providers | 3 of 3 |
| Scheduler | Complete |
| Analytics engine | Complete |
| Advisor engine | Complete |
| Reference portfolio | Complete |
| Formatting utilities | 6 functions, 49 tests |
| Seed data | 28 instruments, 30 transactions, 8300+ price bars |

---

## What's Next

**Session 9: Full-Stack Validation + Polish + MVP Signoff**

Scope: End-to-end testing with live data, polish remaining rough edges, MVP signoff.

Key areas:
- Full-stack smoke test: seed data → dashboard → holdings → advisor chat → thread persistence
- Live API key integration test (if keys available): scheduler polls → quote updates → advisor sees fresh data
- Any remaining accessibility polish (focus trap in advisor panel, keyboard navigation)
- CI pipeline setup (if time allows)
- Final documentation sweep

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
