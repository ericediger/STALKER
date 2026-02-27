# HANDOFF.md — STALKER Current State

**Last Updated:** 2026-02-27 (Post-Session 19)
**Last Session:** Session 19 — Advisor Context Window Management
**Status:** Production Ready — Zero Open Functional Limitations

---

## Current State

Session 19 implemented advisor context window management, resolving the last two functional limitations (KL-2 and KL-3). Long advisor threads now automatically trim older messages to stay within the LLM's context window, and trimmed messages are compressed into rolling summaries.

### What Exists

**Infrastructure:**
- pnpm workspace monorepo with 7 packages (5 in `packages/`, 1 app, 1 root)
- TypeScript 5.9.3 with strict mode, zero errors
- Prisma 6.19.2 with SQLite — all 7 tables defined
- Vitest 3.2.4 — **718 tests** passing across **62 test files**
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
  - **Context window management:** Token estimation, message windowing, summary generation (S19)
- `@stalker/scheduler` — Complete:
  - Config loader (with Tiingo env vars), budget check, poller with **batch polling** via `pollAllQuotes()`, graceful shutdown
  - Quote provider chain: Tiingo IEX (batch) → FMP (single) → AV (single)
  - 30-minute poll interval (no longer auto-extended for large portfolios since batch = 1 call)

**Session 19 Changes:**
- **Token estimation** — `packages/advisor/src/token-estimator.ts`. Character-ratio heuristic (3.0–3.5 chars/token). Conservative overestimation is the safe failure mode.
- **Context budget** — `packages/advisor/src/context-budget.ts`. 174,700 token budget for conversation messages after reserving system prompt, response headroom, and safety margin.
- **Message windowing** — `packages/advisor/src/context-window.ts`. Trims oldest conversational turns when approaching budget. Never orphans tool calls from their results. Turn-boundary trimming only.
- **Summary generation** — `packages/advisor/src/summary-generator.ts`. LLM-generated rolling summaries stored in `AdvisorThread.summaryText`. Fire-and-forget after response returns. Uses same adapter, minimal prompt, no tools.
- **Chat route integration** — `POST /api/advisor/chat` now windows messages before sending to tool loop. Summary preamble prepended when `summaryText` exists. Summary generation triggered asynchronously when messages are trimmed.
- **Frontend indicator** — `hasSummary` field on thread detail response. Info banner in `AdvisorMessages` when older messages have been summarized.

**API Layer (Sessions 4–19):**
- **Instrument CRUD:** POST/GET/GET[id]/DELETE with exchange→timezone mapping, providerSymbolMap, cascade delete, automatic Tiingo backfill on creation (10yr lookback)
- **Transaction CRUD:** POST/GET/GET[id]/PUT/DELETE with sell validation via `validateTransactionSet()`
- **Bulk transactions:** POST /api/transactions/bulk — dedup guard, auto-creates missing instruments, sequential backfills, fire-and-forget snapshot rebuild
- **Portfolio endpoints:** snapshot (read-only), rebuild (explicit POST, 60s timeout), timeseries, holdings (allocation %, firstBuyDate), holdings/[symbol] (lot detail + error logging)
- **Market endpoints:** quote (cached), history (price bars), search (live FMP), refresh (live multi-provider), status (multi-provider health summary)
- **Advisor endpoints:** chat (with 5-tool loop + context windowing), threads CRUD (with `hasSummary`)

**Real Portfolio State:**
- 83 instruments (all with proper names)
- 87 transactions
- ~53,600 price bars (12,748 added in S18 re-backfill)
- 813 portfolio value snapshots (covering Dec 2022 – present)

### What Does Not Exist Yet

- Responsive refinements for tablet/mobile (user is on desktop)

### Known Limitations

See `KNOWN-LIMITATIONS.md` for the current list (KL-4 through KL-6).
- ~~KL-1~~ — RESOLVED: NYSE holidays for 2025-2026 added in Session 17.
- ~~KL-2~~ — RESOLVED: Message windowing with token estimation (Session 19).
- ~~KL-3~~ — RESOLVED: LLM-generated rolling summaries (Session 19).
- ~~KL-7~~ — RESOLVED: Snapshot rebuild now ~4s (was minutes). BatchPriceLookup optimization.
- ~~KL-8~~ — RESOLVED: All instruments have proper names via resolution script + Tiingo fallback.
- ~~KL-9~~ — RESOLVED: Bulk import dedup guard prevents duplicate transactions.
- ~~KL-10~~ — RESOLVED: Quote starvation. Tiingo batch quotes fetch all 83 instruments in 1 API call.

---

## Metrics

| Metric | Value |
|--------|-------|
| Test count (total) | 718 |
| Test files | 62 |
| TypeScript errors | 0 |
| Packages created | 5 of 5 (all implemented) |
| API endpoints | 22 (all implemented — no stubs remaining) |
| UI components | 49 |
| Data hooks | 12 |
| Utility modules | 19 (+4: token-estimator, context-budget, context-window, summary-generator) |
| UI pages | 4 (Portfolio, Charts, Holding Detail, Settings) |
| Prisma tables | 7 of 7 |
| Market data providers | 3 active (FMP, Tiingo, AV) + 1 deprecated (Stooq) |
| Advisor tools | 5 (getTopHoldings, getPortfolioSnapshot, getHolding, getTransactions, getQuotes) |
| Real portfolio | 83 instruments, 87 transactions, 53K+ bars |
| Snapshot rebuild | ~4s for 83 instruments (benchmarked) |

---

## Architecture Decisions (Session 19)

| # | Decision | Rationale |
|---|----------|-----------|
| AD-S19-1 | Token estimation via character-ratio heuristic (3.0–3.5 chars/token) | Conservative overestimation is the safe failure mode. No external dependency. Calibratable via LLMResponse.usage if needed. |
| AD-S19-2 | Message windowing trims at turn boundaries, not individual messages | Prevents orphaned tool results or context-free assistant responses. The LLM always sees complete conversational exchanges. |
| AD-S19-3 | Summary generation triggered by `shouldGenerateSummary` signal from windowing | Decouples the "when" (windowing detects) from the "how" (summary generator executes). Clean separation of concerns. |
| AD-S19-4 | Summary generation uses same LLM adapter, minimal prompt, no tools | Keeps summary cost low (~1,800 tokens per summary). Reuses existing infrastructure. |
| AD-S19-5 | Summary generation is fire-and-forget, non-blocking | User gets their answer immediately. Summary failure degrades gracefully (windowing still works, just without context compression). |
| AD-S19-6 | `summaryText` not exposed to frontend | Internal to LLM context preparation. Users see a "messages summarized" indicator, not the raw summary. Avoids confusing UX. |

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
13. ~~Advisor context window management~~ — Completed (Session 19)
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
