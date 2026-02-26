# HANDOFF.md — STALKER Current State

**Last Updated:** 2026-02-26 (Post-Session 17)
**Last Session:** Session 17 — Production Hardening + Transaction UX Closure
**Status:** Production Ready

---

## Current State

Session 17 closed the transaction CRUD UX gap (created when S16 deleted the Transactions page), tuned the advisor for 83-instrument scale, and added the NYSE holiday calendar. This was the final engineering session before production.

### What Exists

**Infrastructure:**
- pnpm workspace monorepo with 7 packages (5 in `packages/`, 1 app, 1 root)
- TypeScript 5.9.3 with strict mode, zero errors
- Prisma 6.19.2 with SQLite — all 7 tables defined
- Vitest 3.2.4 — **677 tests** passing across **59 test files**
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
  - **5 tools:** `getTopHoldings` (new), `getPortfolioSnapshot` (enhanced with summary), `getHolding`, `getTransactions`, `getQuotes`
  - System prompt with tool selection guidance for efficient 83-instrument handling
- `@stalker/scheduler` — Complete:
  - Config loader (with Tiingo env vars), budget check, poller with **batch polling** via `pollAllQuotes()`, graceful shutdown
  - Quote provider chain: Tiingo IEX (batch) → FMP (single) → AV (single)
  - 30-minute poll interval (no longer auto-extended for large portfolios since batch = 1 call)

**Session 17 Changes:**
- **Transaction CRUD on Holding Detail** — "+ Add Transaction" button in transactions section header opens TransactionFormModal in create mode with instrument pre-selected and locked. Edit and delete were already wired.
- **`defaultInstrumentId` prop** — TransactionForm and TransactionFormModal accept optional `defaultInstrumentId` that pre-selects the instrument and disables the dropdown.
- **`onAdd` callback on HoldingTransactions** — Shows "+ Add Transaction" button in the section header. Button visible even in empty state.
- **Select `disabled` prop** — UI Select component now supports `disabled` styling.
- **`getTopHoldings` advisor tool** — Returns top N holdings by allocation/value/pnl. Reduces context window usage for overview questions.
- **Portfolio summary in `getPortfolioSnapshot`** — Prepends a summary line (total holdings, total value, top 5, stale count) for quick LLM reference.
- **Updated system prompt** — 5 tools documented, tool selection guidance added (prefer getTopHoldings for overview).
- **NYSE holiday calendar** — Static holiday list for 2025-2026. `isTradingDay()` returns false on holidays for NYSE/NASDAQ/AMEX exchanges. Non-US exchanges unaffected.

**API Layer (Sessions 4–17):**
- **Instrument CRUD:** POST/GET/GET[id]/DELETE with exchange→timezone mapping, providerSymbolMap, cascade delete, automatic Tiingo backfill on creation
- **Transaction CRUD:** POST/GET/GET[id]/PUT/DELETE with sell validation via `validateTransactionSet()`
- **Bulk transactions:** POST /api/transactions/bulk — dedup guard, auto-creates missing instruments, sequential backfills, fire-and-forget snapshot rebuild
- **Portfolio endpoints:** snapshot (read-only), rebuild (explicit POST, 60s timeout), timeseries, holdings (allocation %, firstBuyDate), holdings/[symbol] (lot detail)
- **Market endpoints:** quote (cached), history (price bars), search (live FMP), refresh (live multi-provider), status (multi-provider health summary)
- **Advisor endpoints:** chat (with 5-tool loop), threads CRUD

**Real Portfolio State:**
- 83 instruments (all with proper names)
- 87 transactions
- ~40,881 price bars
- 826 portfolio value snapshots

### What Does Not Exist Yet

- Advisor context window management (KL-2/KL-3 — acceptable workarounds exist)
- Responsive refinements for tablet/mobile (user is on desktop)
- UAT acceptance criteria sweep (deferred — system is functionally complete)

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
| Test count (total) | 677 |
| Test files | 59 |
| TypeScript errors | 0 |
| Packages created | 5 of 5 (all implemented) |
| API endpoints | 22 (all implemented — no stubs remaining) |
| UI components | 49 |
| Data hooks | 12 |
| Utility modules | 14 (+1: nyse-holidays) |
| UI pages | 4 (Portfolio, Charts, Holding Detail, Settings) |
| Prisma tables | 7 of 7 |
| Market data providers | 3 active (FMP, Tiingo, AV) + 1 deprecated (Stooq) |
| Advisor tools | 5 (getTopHoldings, getPortfolioSnapshot, getHolding, getTransactions, getQuotes) |
| Real portfolio | 83 instruments, 87 transactions, 40K+ bars |
| Snapshot rebuild | ~4s for 83 instruments (benchmarked) |

---

## Architecture Decisions (Session 17)

| # | Decision | Rationale |
|---|----------|-----------|
| AD-S17-1 | Transaction CRUD on Holding Detail page | Transactions page deleted in S16. Holding Detail already shows per-instrument transactions. Natural home for Add/Edit/Delete. |
| AD-S17-2 | `getTopHoldings` advisor tool | 83 instruments in a single tool response consumes excessive context window. Targeted queries reduce token usage and improve response quality. |
| AD-S17-3 | Portfolio summary in advisor snapshot response | Gives the advisor high-level portfolio facts without parsing all 83 rows. Reduces hallucination risk for aggregate questions. |
| AD-S17-4 | Static NYSE holiday list (2025-2026) | Simplest correct implementation. ~10 holidays/year. Annual manual update is acceptable for a single-user local app. |
| AD-S17-5 | Reuse existing transaction form components | TransactionForm, TransactionFormModal, DeleteConfirmation, SellValidationError all survived S16 deletion. Added `defaultInstrumentId` prop for holding-scoped usage. |

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
12. **Advisor context window management** — Token counting, summary generation for long threads
13. **Responsive refinements** — Tablet/mobile layout adjustments
14. **UAT acceptance criteria sweep** — Verify all 11 criteria + 5 advisor intents

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
