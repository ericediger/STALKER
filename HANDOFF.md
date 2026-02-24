# HANDOFF.md — STALKER Current State

**Last Updated:** 2026-02-24 (Post-Session 11)
**Last Session:** Session 11 — Provider Integration Testing

---

## Current State

Session 11 migrated all market data providers to work with real APIs. FMP was migrated from dead `/api/v3/` endpoints to the `/stable/` API. Stooq was replaced by a new Tiingo provider for historical daily bars. The provider chain was rewired, all mock fixtures updated to match real response shapes, and a per-hour rate limit bucket was added for Tiingo.

### What Exists

**Infrastructure:**
- pnpm workspace monorepo with 7 packages (5 in `packages/`, 1 app, 1 root)
- TypeScript 5.9.3 with strict mode, zero errors
- Prisma 6.19.2 with SQLite — all 7 tables defined, database seeded with 28 instruments
- Vitest 3.2.4 — **526 tests** passing across **43 test files**
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
- `@stalker/shared` — Types (incl. `ProviderLimits.requestsPerHour`), Decimal.js utilities, ULID generation, constants
- `@stalker/analytics` — Complete:
  - FIFO lot engine, PnL computation, sell validation invariant
  - PriceLookup / SnapshotStore / CalendarFns interfaces
  - buildPortfolioValueSeries, rebuildSnapshotsFrom, queryPortfolioWindow
- `@stalker/market-data` — Complete:
  - MarketCalendar, 3 active providers (FMP, Tiingo, Alpha Vantage), rate limiter (per-min + per-hour + per-day), fallback chain, cache
  - Stooq deprecated (file kept for reference, not in active chain)
- `@stalker/scheduler` — Complete:
  - Config loader (with Tiingo env vars), budget check, poller, graceful shutdown

**Session 11 Provider Integration:**
- **FMP `/stable/` migration:** Search via `/stable/search-symbol`, quotes via `/stable/quote`. `getHistory()` disabled (premium-only).
- **TiingoProvider (new):** Historical daily bars via `/tiingo/daily/{sym}/prices`, quotes via `/iex/{sym}`. Uses adjusted prices (adjClose/adjOpen/adjHigh/adjLow). Safe text-first JSON parsing for rate limit detection.
- **Provider chain:** FMP (search + quotes) → Alpha Vantage (backup quotes) → Tiingo (sole history provider)
- **Rate limiter:** Added per-hour sliding window bucket for Tiingo (50 req/hr default)
- **Decimal safety:** All JSON numbers from FMP/Tiingo convert via `toDecimal(String(value))` — no `parseFloat`/`Number()` in financial paths
- **Symbol mapping:** Tiingo uses hyphens (BRK-B), FMP uses dots (BRK.B) — `providerSymbolMap` handles this
- **Mock fixtures:** All updated to match real `/stable/` and Tiingo response shapes
- **Smoke test data:** Real API responses archived in `data/test/smoke-responses/`

**API Layer (Sessions 4–11):**
- **Instrument CRUD:** POST/GET/GET[id]/DELETE with exchange→timezone mapping, providerSymbolMap, cascade delete
- **Transaction CRUD:** POST/GET/GET[id]/PUT/DELETE with sell validation via `validateTransactionSet()`
- **Bulk transactions:** POST /api/transactions/bulk — tab-separated batch with all-or-none sell validation (AD-S10c)
- **Portfolio endpoints:** snapshot (read-only, AD-S10b), rebuild (explicit POST), timeseries, holdings (allocation %), holdings/[symbol] (lot detail)
- **Market endpoints:** quote (cached), history (price bars), search (stub), refresh (stub), status (health summary)
- **Prisma interface implementations:** PrismaPriceLookup (carry-forward), PrismaSnapshotStore (Decimal serialization, accepts tx client)
- **Shared utilities:** errors.ts (apiError factory), Zod validators, prisma singleton

**Reference Portfolio Fixtures** (`data/test/`):
- `reference-portfolio.json` — 6 instruments, 25 transactions, 56 trading days of mock prices
- `expected-outputs.json` — Hand-computed expected values at 6 checkpoint dates
- 24 fixture-based validation tests + 3 cross-validation wrapper tests (749 sub-checks)
- `provider-smoke-results.md` — Phase 0 smoke test findings with exact response shapes
- `smoke-responses/` — Raw API response JSON files from live providers

### What Does Not Exist Yet

- Historical price backfill in instrument creation (stubbed — providers now wired, needs API route integration)
- Manual quote refresh (stubbed — providers now wired, needs API route integration)
- Symbol search proxy (stubbed — FMP search now works, needs API route integration)

### Known Stubs (Ready to Wire — Providers Are Now Live)

| Stub | Location | What's Needed |
|------|----------|---------------|
| Historical backfill on instrument create | `apps/web/src/app/api/instruments/route.ts` | Instantiate MarketDataService with TiingoProvider, call `getHistory()`, write PriceBars |
| Symbol search | `apps/web/src/app/api/market/search/route.ts` | Instantiate MarketDataService with FmpProvider, call `searchSymbols()` |
| Manual quote refresh | `apps/web/src/app/api/market/refresh/route.ts` | Instantiate MarketDataService, call `getQuote()` per instrument |

### Known Limitations

See `KNOWN-LIMITATIONS.md` for the current list. W-3, W-4, W-5, W-8 resolved in Session 10.

---

## Metrics

| Metric | Value |
|--------|-------|
| Test count (total) | 526 |
| Test files | 43 |
| TypeScript errors | 0 |
| Packages created | 5 of 5 (all implemented) |
| API endpoints | 21 (20 implemented + 2 stubs: search, refresh) |
| UI components | 48 |
| Data hooks | 12 |
| Utility modules | 7 |
| UI pages | 6 of 6 (all data-wired including advisor) |
| Prisma tables | 7 of 7 |
| Market data providers | 3 active (FMP, Tiingo, AV) + 1 deprecated (Stooq) |
| Scheduler | Complete (wired to Tiingo) |
| Analytics engine | Complete |
| Advisor engine | Complete |
| Reference portfolio | Complete + cross-validation in CI |
| Benchmark | 147ms (20 instruments, 215 transactions) |
| Seed data | 28 instruments, 30 transactions, 8300+ price bars |

---

## Architecture Decisions (Session 11)

| # | Decision | Rationale |
|---|----------|-----------|
| AD-S11-1 | Tiingo replaces Stooq as historical daily bars provider | Stooq has no formal API, IP-rate-limiting, CAPTCHA risk. Tiingo provides REST API with JSON, 30+ years of data, documented limits. |
| AD-S11-2 | FMP role reduced to search + quotes only | Free tier no longer includes historical EOD data after Aug 2025 cutoff. |
| AD-S11-3 | Use Tiingo adjusted prices as default | Adjusted prices account for splits and dividends. Matches user expectations for historical portfolio value. |
| AD-S11-4 | FMP price numbers convert via String intermediary | `new Decimal(272.11)` risks float contamination. `toDecimal(String(272.11))` = `"272.11"` is exact. |

---

## Post-MVP Priorities

1. ~~Bulk transaction paste input~~ — Completed (Session 10)
2. ~~Provider integration testing~~ — Completed (Session 11)
3. **Wire stubs to live providers** — Symbol search, manual quote refresh, historical price backfill (providers ready, API routes still stubbed)
4. **Holiday/half-day market calendar** — Reduce wasted API calls on market holidays
5. **Advisor context window management** — Token counting, summary generation for long threads
6. ~~CI pipeline~~ — Completed (Session 10)
7. **Responsive refinements** — Tablet/mobile layout adjustments
8. ~~Performance profiling~~ — Benchmark established (Session 10)

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
