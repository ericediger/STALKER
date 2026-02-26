# HANDOFF.md — STALKER Current State

**Last Updated:** 2026-02-26 (Post-Session 16)
**Last Session:** Session 16 — UX Consolidation + Enhancements

---

## Current State

Session 16 consolidated the navigation from 5 tabs to 3 tabs (Portfolio, Charts, Settings), merged the Dashboard + Holdings + Transactions pages into a single Portfolio page, added purchase date visibility, chart transaction markers, and delete instrument UI. All changes are frontend + one API enhancement — no schema changes.

### What Exists

**Infrastructure:**
- pnpm workspace monorepo with 7 packages (5 in `packages/`, 1 app, 1 root)
- TypeScript 5.9.3 with strict mode, zero errors
- Prisma 6.19.2 with SQLite — all 7 tables defined
- Vitest 3.2.4 — **659 tests** passing across **57 test files**
- Next.js 15.5.12 App Router with all API routes + all UI pages (including advisor)
- Tailwind CSS 4.2 with PostCSS — dark financial theme via CSS `@theme` directives
- Zod v4 for input validation
- TradingView Lightweight Charts v5 for portfolio area chart + candlestick charts with transaction markers
- `.env.example` template with all environment variables
- `concurrently` wired: `pnpm dev` launches both Next.js and scheduler
- **GitHub Actions CI:** `.github/workflows/ci.yml` — type-check, test, build on push/PR to main
- **`prefers-reduced-motion`** CSS support gating all animations

**Packages implemented:**
- `@stalker/shared` — Types (incl. `ProviderLimits.requestsPerHour`), Decimal.js utilities, ULID generation, constants
- `@stalker/analytics` — Complete:
  - FIFO lot engine, PnL computation, sell validation invariant
  - PriceLookup / SnapshotStore / CalendarFns interfaces
  - buildPortfolioValueSeries, rebuildSnapshotsFrom, queryPortfolioWindow
- `@stalker/market-data` — Complete:
  - MarketCalendar, 3 active providers (FMP, Tiingo, Alpha Vantage), rate limiter (per-min + per-hour + per-day), fallback chain, cache
  - **Tiingo IEX batch quotes** (`getBatchQuotes()`) — fetches all instruments in one call
  - **`pollAllQuotes()`** on MarketDataService — Tiingo batch → FMP single → AV single fallback chain
  - MarketDataService with singleton factory (`apps/web/src/lib/market-data-service.ts`)
  - Stooq deprecated (file kept for reference, not in active chain)
- `@stalker/scheduler` — Complete:
  - Config loader (with Tiingo env vars), budget check, poller with **batch polling** via `pollAllQuotes()`, graceful shutdown
  - Quote provider chain: Tiingo IEX (batch) → FMP (single) → AV (single)
  - 30-minute poll interval (no longer auto-extended for large portfolios since batch = 1 call)

**Session 16 Changes (NEW):**
- **Navigation consolidation (5→3 tabs)** — Portfolio, Charts, Settings. Holdings and Transactions tabs removed.
- **Portfolio page** — Unified view combining Dashboard + Holdings + Transactions capabilities. Full holdings table with pagination (20/page), sortable columns, search/filter, totals row, delete instrument action.
- **New columns** — First Buy date (MMM 'YY format), Cost Basis. All existing columns retained.
- **`firstBuyDate` in holdings API** — `GET /api/portfolio/holdings` returns `firstBuyDate` per holding (derived from `MIN(tradeAt) WHERE type='BUY'`).
- **Chart transaction markers** — BUY (green arrowUp) and SELL (red arrowDown) markers on candlestick charts via TradingView v5 `createSeriesMarkers()` plugin.
- **Delete instrument UI** — Trash icon on table row hover + Delete button on Holding Detail header. Confirmation modal → `DELETE /api/instruments/[id]` → refresh/redirect.
- **Bulk paste relocated** — Collapsible section at bottom of Portfolio page (was on deleted Transactions page).
- **Page redirects** — `/holdings` and `/transactions` redirect to `/`. Holding Detail back link updated to "Back to Portfolio" → `/`.
- **`formatMonthYear()` utility** — Formats ISO dates as "Jun '25" for the First Buy column.
- **`chart-marker-utils.ts`** — `transactionsToMarkers()` converts BUY/SELL to TradingView markers. `parseFloat()` exception documented (same as chart-utils.ts).

**API Layer (Sessions 4–16):**
- **Instrument CRUD:** POST/GET/GET[id]/DELETE with exchange→timezone mapping, providerSymbolMap, cascade delete, automatic Tiingo backfill on creation
- **Transaction CRUD:** POST/GET/GET[id]/PUT/DELETE with sell validation via `validateTransactionSet()`
- **Bulk transactions:** POST /api/transactions/bulk — dedup guard, auto-creates missing instruments, sequential backfills, fire-and-forget snapshot rebuild
- **Portfolio endpoints:** snapshot (read-only), rebuild (explicit POST, 60s timeout), timeseries, holdings (allocation %, firstBuyDate), holdings/[symbol] (lot detail)
- **Market endpoints:** quote (cached), history (price bars), search (live FMP), refresh (live multi-provider), status (multi-provider health summary)

**Real Portfolio State:**
- 83 instruments (all with proper names)
- 87 transactions
- ~40,881 price bars
- 826 portfolio value snapshots

### What Does Not Exist Yet

- Holiday/half-day market calendar
- Advisor context window management
- Responsive refinements for tablet/mobile
- UAT acceptance criteria sweep (Phases 3-4 from Session 14 plan — deferred)

### Known Limitations

See `KNOWN-LIMITATIONS.md` for the current list (KL-1 through KL-6).
- ~~KL-7~~ — RESOLVED: Snapshot rebuild now ~4s (was minutes). BatchPriceLookup optimization.
- ~~KL-8~~ — RESOLVED: All instruments have proper names via resolution script + Tiingo fallback.
- ~~KL-9~~ — RESOLVED: Bulk import dedup guard prevents duplicate transactions.
- ~~KL-10~~ — RESOLVED: Quote starvation. Tiingo batch quotes fetch all 83 instruments in 1 API call.

---

## Metrics

| Metric | Value |
|--------|-------|
| Test count (total) | 659 |
| Test files | 57 |
| TypeScript errors | 0 |
| Packages created | 5 of 5 (all implemented) |
| API endpoints | 22 (all implemented — no stubs remaining) |
| UI components | 49 (+1 PortfolioTable) |
| Data hooks | 12 |
| Utility modules | 13 (+2: chart-marker-utils, formatMonthYear) |
| UI pages | 4 (Portfolio, Charts, Holding Detail, Settings — down from 6) |
| Prisma tables | 7 of 7 |
| Market data providers | 3 active (FMP, Tiingo, AV) + 1 deprecated (Stooq) |
| Real portfolio | 83 instruments, 87 transactions, 40K+ bars |
| Snapshot rebuild | ~4s for 83 instruments (benchmarked) |

---

## Architecture Decisions (Session 16)

| # | Decision | Rationale |
|---|----------|-----------|
| AD-S16-1 | Consolidate to 3 tabs (Portfolio, Charts, Settings) | Dashboard + Holdings + Transactions showed redundant data at 83-instrument scale. Single Portfolio page with full table replaces all three. |
| AD-S16-2 | Purchase date = First BUY date (`MIN(tradeAt) WHERE type='BUY'`) | Shows holding period for tax awareness. Single `groupBy` query — negligible performance cost. |
| AD-S16-3 | Chart markers on Holding Detail + Charts page, not portfolio area chart | Portfolio area chart would be too noisy with 83 instruments × multiple transactions. Markers on per-instrument candlestick charts are contextual. |
| AD-S16-4 | TradingView v5 `createSeriesMarkers()` plugin API | `series.setMarkers()` is deprecated in v5. Plugin API is the supported approach. |
| AD-S16-5 | Client-side pagination (20/page) over virtual scroll | Simpler implementation, works well for ~83 instruments. Virtual scroll would be justified at 500+. |
| AD-S16-6 | `parseFloat()` exception in `chart-marker-utils.ts` | Third documented exception (alongside `chart-utils.ts` and `chart-candlestick-utils.ts`). TradingView requires native numbers. |

---

## Post-MVP Priorities

1. ~~Bulk transaction paste input~~ — Completed (Session 10)
2. ~~Provider integration testing~~ — Completed (Session 11)
3. ~~Wire stubs to live providers~~ — Completed (Session 12)
4. ~~UAT with real portfolio~~ — Completed (Session 13)
5. ~~Bulk import idempotency~~ — Completed (Session 14)
6. ~~Instrument name resolution~~ — Completed (Session 14)
7. ~~Quote pipeline unblock~~ — Completed (Session 15)
8. ~~UX consolidation~~ — Completed (Session 16)
9. **UAT acceptance criteria sweep** — Verify all 11 criteria + 5 advisor intents against real portfolio
10. **Holiday/half-day market calendar** — Reduce wasted API calls on market holidays
11. **Advisor context window management** — Token counting, summary generation for long threads
12. **Responsive refinements** — Tablet/mobile layout adjustments

---

## Blocking Issues

None.

---

## Service Health

Both processes start via `pnpm dev`:
- Next.js dev server (web)
- Scheduler process (requires `FMP_API_KEY` and `TIINGO_API_KEY` in `.env.local`)

Database at `apps/web/data/portfolio.db`.
Seed with `cd apps/web && npx prisma db seed`.

Environment variables required in `apps/web/.env.local`:
- `FMP_API_KEY` — Financial Modeling Prep (search + single-symbol fallback quotes)
- `ALPHA_VANTAGE_API_KEY` — Alpha Vantage (backup quotes)
- `TIINGO_API_KEY` — Tiingo (batch quotes + historical bars)
- `TIINGO_RPH=50` — Tiingo requests per hour
- `TIINGO_RPD=1000` — Tiingo requests per day
