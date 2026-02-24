# HANDOFF.md — STALKER Current State

**Last Updated:** 2026-02-24 (Post-Session 10)
**Last Session:** Session 10 — Hardening + Bulk Paste + CI

---

## Current State

The project is post-MVP with all known data-integrity issues resolved. Session 10 closed W-3, W-4, W-5, and W-8 from the known limitations, delivered the first post-MVP feature (bulk transaction paste), established CI, and added performance benchmarking. All pages are functional with live data. The advisor chat panel is wired end-to-end.

### What Exists

**Infrastructure:**
- pnpm workspace monorepo with 7 packages (5 in `packages/`, 1 app, 1 root)
- TypeScript 5.9.3 with strict mode, zero errors
- Prisma 6.19.2 with SQLite — all 7 tables defined, database seeded with 28 instruments
- Vitest 3.2.4 — **506 tests** passing across **42 test files**
- Next.js 15.5.12 App Router with all API routes + all UI pages (including advisor)
- Tailwind CSS 4.2 with PostCSS — dark financial theme via CSS `@theme` directives
- Zod v4 for input validation
- TradingView Lightweight Charts v5 for portfolio area chart + candlestick charts
- `.env.example` template with all environment variables
- `concurrently` wired: `pnpm dev` launches both Next.js and scheduler
- Seed script at `apps/web/prisma/seed.ts` (28 instruments, 30 transactions, 8300+ price bars)
- **GitHub Actions CI:** `.github/workflows/ci.yml` — type-check, test, build on push/PR to main
- **Performance benchmark:** `data/test/benchmark-rebuild.ts` — 20 instruments, 215 transactions, 147ms rebuild
- **`prefers-reduced-motion`** CSS support gating all animations

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

**API Layer (Sessions 4–10):**
- **Instrument CRUD:** POST/GET/GET[id]/DELETE with exchange→timezone mapping, providerSymbolMap, cascade delete
- **Transaction CRUD:** POST/GET/GET[id]/PUT/DELETE with sell validation via `validateTransactionSet()`
- **Bulk transactions:** POST /api/transactions/bulk — tab-separated batch with all-or-none sell validation (AD-S10c)
- **Portfolio endpoints:** snapshot (read-only, AD-S10b), rebuild (explicit POST), timeseries, holdings (allocation %), holdings/[symbol] (lot detail)
- **Market endpoints:** quote (cached), history (price bars), search (stub), refresh (stub), status (health summary)
- **Prisma interface implementations:** PrismaPriceLookup (carry-forward), PrismaSnapshotStore (Decimal serialization, accepts tx client)
- **Shared utilities:** errors.ts (apiError factory), Zod validators, prisma singleton

**Session 10 Data Integrity Fixes (Phase 0):**
- AD-S10a: Snapshot rebuild wrapped in `prisma.$transaction()` — atomic delete + recompute + insert
- AD-S10b: GET /api/portfolio/snapshot is strictly read-only — POST /api/portfolio/rebuild for explicit rebuild
- W-5: Anthropic tool_result message translation fully documented
- W-8: Advisor `formatNum()` uses Decimal.toFixed(2) instead of parseFloat()

**Session 10 Bulk Paste Feature (Phase 1):**
- `bulk-parser.ts` — Tab/multi-space-separated text parser with per-row validation (23 tests)
- `POST /api/transactions/bulk` — Batch insert with Zod validation, symbol resolution, sell invariant, $transaction, snapshot rebuild (8 tests)
- `BulkPastePanel.tsx` — Collapsible disclosure with textarea, parse button, preview table, confirm button
- `BulkPreviewTable.tsx` — Per-row validation with green/red indicators, error messages
- `useBulkImport.ts` — Hook for API call with loading/error state

**Session 10 CI & Hardening (Phase 1):**
- Cross-validation script wrapped as 3 Vitest tests (749 sub-checks across Path A/B/C)
- GitHub Actions CI: type-check → test → build
- Snapshot rebuild benchmark: 147ms for 20 instruments + 215 transactions
- `prefers-reduced-motion` CSS media query gating all animations

**UI Foundation (Session 5 — all implemented):**
- **Design system:** Tailwind v4 dark theme, 3 bundled fonts (next/font/local), CSS variables, `cn()` utility
- **12 base components:** Button, Input, Select, Card, Badge, Table, Tooltip, Toast, Modal, PillToggle, Skeleton, ValueChange
- **4 layout components:** Shell (now wraps ToastProvider), NavTabs, DataHealthFooter (live), AdvisorFAB
- **4 empty states:** Dashboard, Holdings, Transactions, Advisor
- **6 formatting utilities:** formatCurrency, formatPercent, formatQuantity, formatCompact, formatDate, formatRelativeTime (49 tests)

**Reference Portfolio Fixtures** (`data/test/`):
- `reference-portfolio.json` — 6 instruments, 25 transactions, 56 trading days of mock prices
- `expected-outputs.json` — Hand-computed expected values at 6 checkpoint dates
- 24 fixture-based validation tests + 3 cross-validation wrapper tests (749 sub-checks)

### What Does Not Exist Yet

- Historical price backfill in instrument creation (stubbed — needs live API keys)
- Manual quote refresh (stubbed — needs live API keys)
- Symbol search proxy (stubbed — needs live API keys)

### Known Stubs (Ready to Wire)

| Stub | Location | What's Needed |
|------|----------|---------------|
| Historical backfill on instrument create | `apps/web/src/app/api/instruments/route.ts` | Call market data service `getHistory()`, write PriceBars, set firstBarDate |
| Symbol search | `apps/web/src/app/api/market/search/route.ts` | Wire to MarketDataService.searchSymbols() |
| Manual quote refresh | `apps/web/src/app/api/market/refresh/route.ts` | Wire to MarketDataService.getQuote() per instrument |

### Known Limitations

See `KNOWN-LIMITATIONS.md` for the current list. W-3, W-4, W-5, W-8 resolved in Session 10.

---

## Metrics

| Metric | Value |
|--------|-------|
| Test count (total) | 506 |
| Test files | 42 |
| TypeScript errors | 0 |
| Packages created | 5 of 5 (all implemented) |
| API endpoints | 21 (20 implemented + 2 stubs: search, refresh) |
| UI components | 48 (12 base + 4 layout + 4 empty states + 4 dashboard + 5 holding-detail + 7 transactions + 2 instruments + 1 chart hook + 7 advisor + 1 focus trap hook + 1 bulk import hook) |
| Data hooks | 12 (snapshot, timeseries, holdings, market status, holding detail, market history, transactions, instruments, chart, advisor, focus trap, bulk import) |
| Utility modules | 7 (window-utils, chart-utils, chart-candlestick-utils, holdings-utils, transaction-utils, fetch-with-timeout, bulk-parser) |
| UI pages | 6 of 6 (all data-wired including advisor) |
| Prisma tables | 7 of 7 |
| Market data providers | 3 of 3 |
| Scheduler | Complete |
| Analytics engine | Complete |
| Advisor engine | Complete |
| Reference portfolio | Complete + cross-validation in CI |
| Benchmark | 147ms (20 instruments, 215 transactions) |
| Seed data | 28 instruments, 30 transactions, 8300+ price bars |

---

## Post-MVP Priorities

1. ~~Bulk transaction paste input~~ — Completed (Session 10)
2. **Live API key wiring** — Symbol search, manual quote refresh, historical price backfill
3. ~~CI pipeline~~ — Completed (Session 10)
4. **Holiday/half-day market calendar** — Reduce wasted API calls on market holidays
5. **Advisor context window management** — Token counting, summary generation for long threads
6. ~~`prefers-reduced-motion` support~~ — Completed (Session 10)
7. **Responsive refinements** — Tablet/mobile layout adjustments
8. ~~Performance profiling~~ — Benchmark established (Session 10)

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
