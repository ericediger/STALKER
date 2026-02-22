# HANDOFF.md — STALKER Current State

**Last Updated:** 2026-02-22 (Post-Session 5)
**Last Session:** Session 5 — UI Foundation

---

## Current State

The project has a complete backend (Sessions 1–4) and a full design system + component library (Session 5). The UI is dark-themed, stateless, and ready for data wiring in Sessions 6–7.

### What Exists

**Infrastructure:**
- pnpm workspace monorepo with 7 packages (5 in `packages/`, 1 app, 1 root)
- TypeScript 5.9.3 with strict mode, zero errors
- Prisma 6.19.2 with SQLite — all 7 tables defined, database created and seeded
- Vitest 3.2.4 — **324 tests** passing across **25 test files**
- Next.js 15.5.12 App Router with all API routes + UI pages
- Tailwind CSS 4.2 with PostCSS — dark financial theme via CSS `@theme` directives
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

**UI Foundation (Session 5 — all implemented):**
- **Design system:** Tailwind v4 dark theme, 3 Google Fonts, CSS variables, `cn()` utility
- **12 base components:** Button, Input, Select, Card, Badge, Table, Tooltip, Toast, Modal, PillToggle, Skeleton, ValueChange
- **4 layout components:** Shell, NavTabs, DataHealthFooter, AdvisorFAB
- **4 empty states:** DashboardEmpty, HoldingsEmpty, TransactionsEmpty, AdvisorEmpty
- **4 page routes:** Dashboard (`/`), Holdings (`/holdings`), Transactions (`/transactions`), Charts (`/charts`)
- **6 formatting utilities:** formatCurrency, formatPercent, formatQuantity, formatCompact, formatDate, formatRelativeTime (49 tests)

**Reference Portfolio Fixtures** (`data/test/`):
- `reference-portfolio.json` — 6 instruments, 25 transactions, 56 trading days of mock prices
- `expected-outputs.json` — Hand-computed expected values at 6 checkpoint dates
- 24 fixture-based validation tests

**Packages scaffolded (empty shells):**
- `@stalker/advisor` — placeholder only

### What Does Not Exist Yet

- Data-wired UI views (Sessions 6–7) — pages currently show empty states
- Charting (TradingView Lightweight Charts) — Session 6 or 7
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
| DataHealthFooter | `apps/web/src/components/layout/DataHealthFooter.tsx` | Wire to GET /api/market/status |
| AdvisorFAB | `apps/web/src/components/layout/AdvisorFAB.tsx` | Wire to advisor panel |

---

## Session 5 Component Usage Guide (for Session 6+)

### Using Components

```typescript
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Table } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { PillToggle } from "@/components/ui/PillToggle";
import { ValueChange } from "@/components/ui/ValueChange";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency, formatPercent, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/cn";
```

### Key Patterns

- **All financial values from API are strings.** Use `formatCurrency()`, `formatPercent()`, etc. at render time.
- **ValueChange component** shows green/red arrows automatically: `<ValueChange value="-3.45" format="percent" />`
- **Table numeric columns** auto-align right with `font-mono tabular-nums`: set `numeric: true` in column config.
- **Toast system** requires `<ToastProvider>` in the layout — add to Shell or root layout when needed.
- **PillToggle** for time window selectors: `<PillToggle options={[{label:"1D",value:"1D"},{label:"1W",value:"1W"},...]} value={window} onChange={setWindow} />`

### Tailwind Token Classes

Colors: `bg-bg-primary`, `bg-bg-secondary`, `bg-bg-tertiary`, `text-text-primary`, `text-text-secondary`, `text-text-tertiary`, `border-border-primary`, `bg-accent-primary`, `bg-accent-positive`, `bg-accent-negative`.

Typography: `font-heading` (Crimson Pro), `font-body` (DM Sans), `font-mono` (JetBrains Mono).

Spacing: `p-card`, `p-section`, `px-page`.

---

## Metrics

| Metric | Value |
|--------|-------|
| Test count (total) | 324 |
| Test files | 25 |
| TypeScript errors | 0 |
| Packages created | 5 of 5 (4 implemented, 1 shell) |
| API endpoints | 16 of ~18 implemented (2 stubs: search, refresh) |
| UI components | 20 (12 base + 4 layout + 4 empty states) |
| UI pages | 4 of 6 (empty state views) |
| Prisma tables | 7 of 7 |
| Market data providers | 3 of 3 |
| Scheduler | Complete |
| Analytics engine | Complete |
| Reference portfolio | Complete |
| Formatting utilities | 6 functions, 49 tests |

---

## What's Next

**Session 6: Data-Wired Dashboard + Holdings**

Scope: Replace empty states with live data views using the API endpoints from Session 4 and components from Session 5.

Key integration points:
- Dashboard fetches `GET /api/portfolio/snapshot?window=1M` for summary cards
- Portfolio value chart uses `GET /api/portfolio/timeseries` with TradingView Lightweight Charts
- Holdings table uses `GET /api/portfolio/holdings` for position list with allocation %
- Position detail uses `GET /api/portfolio/holdings/[symbol]` for lot-level view
- Time window selector uses `PillToggle` component
- All API responses use string-serialized Decimals — format with `formatCurrency()` etc. at render time
- `ValueChange` component for PnL display with color-coded arrows

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
