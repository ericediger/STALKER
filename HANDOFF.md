# HANDOFF.md — STALKER Current State

**Last Updated:** 2026-02-25 (Post-Session 14)
**Last Session:** Session 14 — Data Integrity + Rebuild Performance + Name Resolution

---

## Current State

Session 14 addressed three critical post-UAT issues: bulk import idempotency, snapshot rebuild performance, and instrument name resolution. All 78 unnamed instruments now have proper names. Bulk import is idempotent (re-import produces 0 new transactions). Snapshot rebuild dropped from minutes to ~4 seconds for 83 instruments.

### What Exists

**Infrastructure:**
- pnpm workspace monorepo with 7 packages (5 in `packages/`, 1 app, 1 root)
- TypeScript 5.9.3 with strict mode, zero errors
- Prisma 6.19.2 with SQLite — all 7 tables defined
- Vitest 3.2.4 — **602 tests** passing across **50 test files**
- Next.js 15.5.12 App Router with all API routes + all UI pages (including advisor)
- Tailwind CSS 4.2 with PostCSS — dark financial theme via CSS `@theme` directives
- Zod v4 for input validation
- TradingView Lightweight Charts v5 for portfolio area chart + candlestick charts
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
  - MarketDataService with singleton factory (`apps/web/src/lib/market-data-service.ts`)
  - Stooq deprecated (file kept for reference, not in active chain)
- `@stalker/scheduler` — Complete:
  - Config loader (with Tiingo env vars), budget check (auto-adjusts interval for large portfolios), poller, graceful shutdown

**Session 14 Changes (NEW):**
- **Bulk import dedup guard** — Exact match on `(instrumentId, type, quantity, price, tradeAt)` using `Decimal.eq()`. Skipped rows reported in response. UI shows "Imported N. Skipped M duplicates." toast.
- **Single transaction dedup warning** — `POST /api/transactions` returns `potentialDuplicate: true` when match exists (still inserts, just warns).
- **BatchPriceLookup** — Pre-loads all price bars into memory via single query. O(1) exact lookups, O(log n) carry-forward via binary search. Replaces per-query PriceLookup in snapshot rebuild.
- **Snapshot rebuild: ~4 seconds** for 83 instruments × 40K bars (was minutes). Timeout reduced from 600s to 60s.
- **Instrument name resolution** — `scripts/resolve-instrument-names.ts` resolved all 78 unnamed instruments (76 FMP, 2 Tiingo).
- **Auto-create Tiingo fallback** — `findOrCreateInstrument()` tries Tiingo metadata when FMP search returns nothing.
- **Benchmark script** — `scripts/benchmark-rebuild.ts` for measuring rebuild performance.

**API Layer (Sessions 4–14):**
- **Instrument CRUD:** POST/GET/GET[id]/DELETE with exchange→timezone mapping, providerSymbolMap, cascade delete, automatic Tiingo backfill on creation
- **Transaction CRUD:** POST/GET/GET[id]/PUT/DELETE with sell validation via `validateTransactionSet()`
- **Bulk transactions:** POST /api/transactions/bulk — dedup guard, auto-creates missing instruments, sequential backfills, fire-and-forget snapshot rebuild
- **Portfolio endpoints:** snapshot (read-only), rebuild (explicit POST, 60s timeout), timeseries, holdings (allocation %), holdings/[symbol] (lot detail)
- **Market endpoints:** quote (cached), history (price bars), search (live FMP), refresh (live multi-provider), status (health summary)

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

---

## Metrics

| Metric | Value |
|--------|-------|
| Test count (total) | 602 |
| Test files | 50 |
| TypeScript errors | 0 |
| Packages created | 5 of 5 (all implemented) |
| API endpoints | 22 (all implemented — no stubs remaining) |
| UI components | 48 |
| Data hooks | 12 |
| Utility modules | 10 |
| UI pages | 6 of 6 (all data-wired including advisor) |
| Prisma tables | 7 of 7 |
| Market data providers | 3 active (FMP, Tiingo, AV) + 1 deprecated (Stooq) |
| Real portfolio | 83 instruments, 87 transactions, 40K+ bars |
| Snapshot rebuild | ~4s for 83 instruments (benchmarked) |

---

## Architecture Decisions (Session 14)

| # | Decision | Rationale |
|---|----------|-----------|
| AD-S14-1 | Dedup by exact match on (instrumentId, type, quantity, price, tradeAt) | Conservative. Avoids false positives. Two trades at different prices on the same day are distinct. |
| AD-S14-2 | Dedup uses Decimal.eq() for quantity/price | String comparison fails if Prisma returns "50.00" vs "50" for same value. |
| AD-S14-3 | BatchPriceLookup: single query, in-memory Map, binary search carry-forward | O(1) per date lookup vs O(1) query per date. Memory: ~1MB for 40K bars. |
| AD-S14-4 | Name resolution is manual script, not auto-startup | FMP calls expensive (250/day). One-time resolution, not repeated. |

---

## Post-MVP Priorities

1. ~~Bulk transaction paste input~~ — Completed (Session 10)
2. ~~Provider integration testing~~ — Completed (Session 11)
3. ~~Wire stubs to live providers~~ — Completed (Session 12)
4. ~~UAT with real portfolio~~ — Completed (Session 13)
5. ~~Bulk import idempotency~~ — Completed (Session 14)
6. ~~Instrument name resolution~~ — Completed (Session 14)
7. **UAT acceptance criteria sweep** — Verify all 11 criteria + 5 advisor intents against real portfolio
8. **Holiday/half-day market calendar** — Reduce wasted API calls on market holidays
9. **Advisor context window management** — Token counting, summary generation for long threads
10. **Responsive refinements** — Tablet/mobile layout adjustments

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
