# HANDOFF.md — STALKER Current State

**Last Updated:** 2026-02-26 (Post-Session 18)
**Last Session:** Session 18 — Visual UAT Fixes + UX Enhancements
**Status:** Production Ready

---

## Current State

Session 18 resolved 5 issues from the first visual browser UAT: extended price bar history to cover the full portfolio timeline (Dec 2022+), improved holdings table columns, added resilient refetch, preserved table state on delete, and added "Add Another" to the instrument creation flow.

### What Exists

**Infrastructure:**
- pnpm workspace monorepo with 7 packages (5 in `packages/`, 1 app, 1 root)
- TypeScript 5.9.3 with strict mode, zero errors
- Prisma 6.19.2 with SQLite — all 7 tables defined
- Vitest 3.2.4 — **683 tests** passing across **59 test files**
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
  - MarketCalendar with **NYSE holiday support** (2025-2026), 3 active providers (FMP, Tiingo, Alpha Vantage), rate limiter (per-min + per-hour + per-day), fallback chain, cache
  - **Tiingo IEX batch quotes** (`getBatchQuotes()`) — fetches all instruments in one call
  - **`pollAllQuotes()`** on MarketDataService — Tiingo batch → FMP single → AV single fallback chain
  - MarketDataService with singleton factory (`apps/web/src/lib/market-data-service.ts`)
  - Stooq deprecated (file kept for reference, not in active chain)
- `@stalker/advisor` — Complete:
  - **5 tools:** `getTopHoldings`, `getPortfolioSnapshot` (enhanced with summary), `getHolding`, `getTransactions`, `getQuotes`
  - System prompt with tool selection guidance for efficient 83-instrument handling
- `@stalker/scheduler` — Complete:
  - Config loader (with Tiingo env vars), budget check, poller with **batch polling** via `pollAllQuotes()`, graceful shutdown
  - Quote provider chain: Tiingo IEX (batch) → FMP (single) → AV (single)
  - 30-minute poll interval (no longer auto-extended for large portfolios since batch = 1 call)

**Session 18 Changes:**
- **Backfill lookback extended to 10 years** (AD-S18-1) — Instruments now get full price history from Tiingo. Re-backfill script added 12,748 bars across 73 instruments. Portfolio chart covers Dec 2022 onward.
- **Re-backfill script** — `scripts/re-backfill-history.ts` for extending history on existing instruments. Batches of 45 with 60s pause for Tiingo rate limits. Idempotent via date-range dedup.
- **Holdings table column improvements** — "Avg Cost" column added (Decimal division via `avgCostPerShare()`), "Price" renamed to "Current Price", "Cost Basis" moved next to "Avg Cost" for logical grouping.
- **Resilient holding detail refetch** — `useHoldingDetail` retries once on HTTP 500 with 500ms delay. Error messages now include server-side message body.
- **List position preservation** — `useHoldings` hook no longer shows loading skeleton on refetch, preventing PortfolioTable unmount/remount that reset pagination state.
- **"Add Another" instrument flow** — After successful instrument creation, modal shows success state with "Add Another" and "Done" buttons instead of closing immediately.
- **Snapshot coverage** — Portfolio value snapshots now cover Dec 29, 2022 through present (813 snapshots, was starting Feb 2024).

**API Layer (Sessions 4–18):**
- **Instrument CRUD:** POST/GET/GET[id]/DELETE with exchange→timezone mapping, providerSymbolMap, cascade delete, automatic Tiingo backfill on creation (10yr lookback)
- **Transaction CRUD:** POST/GET/GET[id]/PUT/DELETE with sell validation via `validateTransactionSet()`
- **Bulk transactions:** POST /api/transactions/bulk — dedup guard, auto-creates missing instruments, sequential backfills, fire-and-forget snapshot rebuild
- **Portfolio endpoints:** snapshot (read-only), rebuild (explicit POST, 60s timeout), timeseries, holdings (allocation %, firstBuyDate), holdings/[symbol] (lot detail + error logging)
- **Market endpoints:** quote (cached), history (price bars), search (live FMP), refresh (live multi-provider), status (multi-provider health summary)
- **Advisor endpoints:** chat (with 5-tool loop), threads CRUD

**Real Portfolio State:**
- 83 instruments (all with proper names)
- 87 transactions
- ~53,600 price bars (12,748 added in S18 re-backfill)
- 813 portfolio value snapshots (covering Dec 2022 – present)

### What Does Not Exist Yet

- Advisor context window management (KL-2/KL-3 — acceptable workarounds exist)
- Responsive refinements for tablet/mobile (user is on desktop)

### Known Limitations

See `KNOWN-LIMITATIONS.md` for the current list (KL-2 through KL-6).
- ~~KL-1~~ — RESOLVED: NYSE holidays for 2025-2026 added in Session 17.
- ~~KL-7~~ — RESOLVED: Snapshot rebuild now ~4s (was minutes). BatchPriceLookup optimization.
- ~~KL-8~~ — RESOLVED: All instruments have proper names via resolution script + Tiingo fallback.
- ~~KL-9~~ — RESOLVED: Bulk import dedup guard prevents duplicate transactions.
- ~~KL-10~~ — RESOLVED: Quote starvation. Tiingo batch quotes fetch all 83 instruments in 1 API call.

---

## Metrics

| Metric | Value |
|--------|-------|
| Test count (total) | 683 |
| Test files | 59 |
| TypeScript errors | 0 |
| Packages created | 5 of 5 (all implemented) |
| API endpoints | 22 (all implemented — no stubs remaining) |
| UI components | 49 |
| Data hooks | 12 |
| Utility modules | 15 (+1: avgCostPerShare) |
| UI pages | 4 (Portfolio, Charts, Holding Detail, Settings) |
| Prisma tables | 7 of 7 |
| Market data providers | 3 active (FMP, Tiingo, AV) + 1 deprecated (Stooq) |
| Advisor tools | 5 (getTopHoldings, getPortfolioSnapshot, getHolding, getTransactions, getQuotes) |
| Real portfolio | 83 instruments, 87 transactions, 53K+ bars |
| Snapshot rebuild | ~4s for 83 instruments (benchmarked) |

---

## Architecture Decisions (Session 18)

| # | Decision | Rationale |
|---|----------|-----------|
| AD-S18-1 | Backfill lookback extended to 10 years (static default) | Tiingo provides 30+ years free data. 10yr covers any reasonable transaction history. Backfill runs at instrument creation before any transactions exist, so computed-from-transactions is not possible. |
| AD-S18-2 | Holding detail refetch retries once on 500 | Transient SQLite contention can cause intermittent 500s. Single retry with 500ms delay resolves most cases without degrading UX. |
| AD-S18-3 | Avg Cost displayed as `costBasis / totalQuantity` (Decimal division) | Standard brokerage column. Guards divide-by-zero for fully closed positions (returns null). |
| AD-S18-4 | Re-backfill is a one-time script, not automatic migration | Existing instruments needed history gap filled. Future instruments get 10yr lookback automatically. Script is idempotent (UNIQUE constraint handles dedup). |
| AD-S18-5 | useHoldings skips loading skeleton on refetch | Prevents PortfolioTable unmount that destroyed pagination/scroll state. Initial load still shows skeleton. |

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
9. ~~Transaction UX gap closure~~ — Completed (Session 17)
10. ~~Holiday market calendar~~ — Completed (Session 17)
11. ~~Advisor 83-instrument tuning~~ — Completed (Session 17)
12. ~~Visual UAT fixes~~ — Completed (Session 18)
13. **Advisor context window management** — Token counting, summary generation for long threads
14. **Responsive refinements** — Tablet/mobile layout adjustments

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
