# HANDOFF.md — STALKER Current State

**Last Updated:** 2026-02-25 (Post-Session 13)
**Last Session:** Session 13 — UAT + Live Data Fixes

---

## Current State

Session 13 was a User Acceptance Testing session where the business stakeholder operated the browser while the engineer diagnosed and hotfixed issues in real-time. The session surfaced 12+ UX issues which were all resolved: search UX flooding the page, form fields not populating from search, charts not rendering (React lifecycle timing bug), missing "Add Instrument" buttons, no buy info during instrument creation, bulk import rejecting unknown symbols, and SQLite write contention during concurrent backfills. The user successfully imported their real portfolio (~80 instruments, ~87 transactions) and verified data correctness after duplicate cleanup and price bar backfill.

### What Exists

**Infrastructure:**
- pnpm workspace monorepo with 7 packages (5 in `packages/`, 1 app, 1 root)
- TypeScript 5.9.3 with strict mode, zero errors
- Prisma 6.19.2 with SQLite — all 7 tables defined
- Vitest 3.2.4 — **598 tests** passing across **50 test files**
- Next.js 15.5.12 App Router with all API routes + all UI pages (including advisor)
- Tailwind CSS 4.2 with PostCSS — dark financial theme via CSS `@theme` directives
- Zod v4 for input validation
- TradingView Lightweight Charts v5 for portfolio area chart + candlestick charts
- `.env.example` template with all environment variables
- `concurrently` wired: `pnpm dev` launches both Next.js and scheduler
- **GitHub Actions CI:** `.github/workflows/ci.yml` — type-check, test, build on push/PR to main
- **Performance benchmark:** `data/test/benchmark-rebuild.ts` — 20 instruments, 215 transactions, 147ms rebuild
- **`prefers-reduced-motion`** CSS support gating all animations

**Packages implemented:**
- `@stalker/shared` — Types (incl. `ProviderLimits.requestsPerHour`), Decimal.js utilities, ULID generation, constants
- `@stalker/analytics` — Complete:
  - FIFO lot engine, PnL computation, sell validation invariant
  - PriceLookup / SnapshotStore / CalendarFns interfaces
  - buildPortfolioValueSeries, rebuildSnapshotsFrom, queryPortfolioWindow
- `@stalker/market-data` — Complete:
  - MarketCalendar, 3 active providers (FMP, Tiingo, Alpha Vantage), rate limiter (per-min + per-hour + per-day), fallback chain, cache
  - MarketDataService with singleton factory (`apps/web/src/lib/market-data-service.ts`)
  - Stooq deprecated (file kept for reference, not in active chain)
- `@stalker/scheduler` — Complete:
  - Config loader (with Tiingo env vars), budget check, poller, graceful shutdown

**Session 13 Changes (NEW):**
- **Symbol search UX overhaul** — Min 3 chars, max 10 results, scrollable dropdown, clears on select, `onSelect(SearchResult)` callback returns full metadata (name, exchange, type)
- **Add Instrument + Buy flow** — AddInstrumentModal now includes optional initial purchase fields (date, shares, price, fees). Price auto-fills from historical close. Creates instrument then transaction in one flow.
- **Persistent Add Instrument button** — Always visible on Dashboard and Holdings pages (was only in empty states)
- **Chart rendering fix** — Container div always rendered (hidden with `invisible absolute` during loading). Fixed React lifecycle timing where useChart fired before container was in DOM.
- **ALL window fix** — usePortfolioTimeseries sends `startDate=1970-01-01` for ALL window (API requires both dates)
- **Auto-create instruments** — `findOrCreateInstrument()` helper at `apps/web/src/lib/auto-create-instrument.ts`. Both bulk import and individual transaction POST auto-create missing instruments with FMP metadata lookup and Tiingo backfill.
- **SQLite contention fix** — Bulk import creates instruments without backfill (avoids write lock contention), then queues backfills sequentially after transaction insert. Snapshot rebuild is fire-and-forget for bulk imports.
- **Snapshot rebuild timeout** — Increased from 30s to 10 minutes for large portfolios (80+ instruments)
- **Backfill script** — `scripts/backfill-missing.ts` for one-off backfill of instruments missing price data
- **Price auto-fill** — TransactionForm and AddInstrumentModal auto-fill price from `/api/market/history` for the selected date

**API Layer (Sessions 4–13):**
- **Instrument CRUD:** POST/GET/GET[id]/DELETE with exchange→timezone mapping, providerSymbolMap, cascade delete, automatic Tiingo backfill on creation
- **Transaction CRUD:** POST/GET/GET[id]/PUT/DELETE with sell validation via `validateTransactionSet()`
- **Bulk transactions:** POST /api/transactions/bulk — auto-creates missing instruments, sequential backfills, fire-and-forget snapshot rebuild
- **Portfolio endpoints:** snapshot (read-only), rebuild (explicit POST, 10min timeout), timeseries, holdings (allocation %), holdings/[symbol] (lot detail)
- **Market endpoints:** quote (cached), history (price bars), search (live FMP), refresh (live multi-provider), status (health summary)

**Real Portfolio State (Session 13 UAT):**
- 83 instruments (80 from user import + GOOGL, MSFT, AMZN auto-created)
- 87 transactions (after duplicate cleanup)
- ~35,000+ price bars (all instruments backfilled)
- 826 portfolio value snapshots

### What Does Not Exist Yet

- Holiday/half-day market calendar
- Advisor context window management
- Responsive refinements for tablet/mobile
- Instrument name resolution (many auto-created instruments show symbol as name)
- Bulk import duplicate detection (user imported 3x, had to manually clean)

### Known Limitations

See `KNOWN-LIMITATIONS.md` for the current list (KL-1 through KL-6). New:
- KL-7: Snapshot rebuild scales poorly with 80+ instruments (~minutes). Prisma interactive transaction timeout set to 10 minutes.
- KL-8: Auto-created instruments use symbol as name when FMP search doesn't return metadata.
- KL-9: No bulk import idempotency — re-importing creates duplicates.

---

## Metrics

| Metric | Value |
|--------|-------|
| Test count (total) | 598 |
| Test files | 50 |
| TypeScript errors | 0 |
| Packages created | 5 of 5 (all implemented) |
| API endpoints | 22 (all implemented — no stubs remaining) |
| UI components | 48 |
| Data hooks | 12 |
| Utility modules | 9 |
| UI pages | 6 of 6 (all data-wired including advisor) |
| Prisma tables | 7 of 7 |
| Market data providers | 3 active (FMP, Tiingo, AV) + 1 deprecated (Stooq) |
| Real portfolio | 83 instruments, 87 transactions, 35K+ bars |

---

## Architecture Decisions (Session 13)

| # | Decision | Rationale |
|---|----------|-----------|
| AD-S13a | `findOrCreateInstrument()` shared helper | Reused by bulk import and individual transaction routes. Accepts `skipBackfill` flag to avoid SQLite contention during batch operations. |
| AD-S13b | Sequential backfills in bulk import | SQLite single-writer lock means concurrent backfills cause timeouts. Create all instruments first (no backfill), insert all transactions, then backfill sequentially. |
| AD-S13c | Fire-and-forget snapshot rebuild for bulk | With 80+ instruments, rebuild can take minutes. API responds immediately; dashboard auto-triggers rebuild if needed. |
| AD-S13d | Chart container always rendered | TradingView `createChart()` needs a real DOM element. Container hidden with `invisible absolute` during loading, not removed from DOM. |

---

## Post-MVP Priorities

1. ~~Bulk transaction paste input~~ — Completed (Session 10)
2. ~~Provider integration testing~~ — Completed (Session 11)
3. ~~Wire stubs to live providers~~ — Completed (Session 12)
4. ~~UAT with real portfolio~~ — Completed (Session 13)
5. **Bulk import idempotency** — Detect and skip duplicate transactions
6. **Instrument name resolution** — Batch FMP lookup to fix auto-created instruments with symbol-as-name
7. **Holiday/half-day market calendar** — Reduce wasted API calls on market holidays
8. **Advisor context window management** — Token counting, summary generation for long threads
9. **Responsive refinements** — Tablet/mobile layout adjustments

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
- `FMP_API_KEY` — Financial Modeling Prep (search + quotes)
- `ALPHA_VANTAGE_API_KEY` — Alpha Vantage (backup quotes)
- `TIINGO_API_KEY` — Tiingo (historical bars)
- `TIINGO_RPH=50` — Tiingo requests per hour
- `TIINGO_RPD=1000` — Tiingo requests per day
