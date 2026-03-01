# HANDOFF.md — STALKER Current State

**Last Updated:** 2026-03-01 (Post-Session 21)
**Last Session:** Session 21 — IAT Remediation (Bugs, Performance, Features)
**Status:** Production Ready

---

## Current State

Session 21 addressed 7 issues from IAT (Internal Acceptance Testing) feedback across three categories: data bugs, performance, and missing features. The root cause of most issues was that only 3 of 87 instruments had LatestQuotes — the detail page showed $0 market value and wrong P&L for everything else.

### What Changed (Session 21)

**Bug Fixes:**
- **Detail page price fallback** — `holdings/[symbol]/route.ts` now falls back to the most recent daily PriceBar close when no LatestQuote exists. Builds a synthetic `latestQuote` response with `provider: 'price-history'`. Fixes $0 market value and incorrect P&L on 84 of 87 instruments.

**Performance:**
- **Non-blocking snapshot rebuild** — `usePortfolioSnapshot` no longer blocks page render during rebuild. Shows existing data immediately, rebuilds in background, updates when complete. Added `isRebuilding` state + spinner indicator.
- **No more full page reload** — `window.location.reload()` on instrument add replaced with targeted `refetchHoldings()` + `refetchInstruments()`.

**Features:**
- **Detail page new metrics** — Allocation %, First Buy date, Day Change ($+%), Data Source. PositionSummary expanded from 8 to 12 metrics (3 rows of 4).
- **Google News link** — New `LatestNews.tsx` component on holding detail page. Constructs Google News search URL with company name in quotes + 90-day date range. External link, no backend needed.

**Data Issues (Not Code Bugs):**
- XRP ticker maps to "Bitwise XRP ETF" (correct STOCK behavior). If user intended XRP crypto, they need to re-add with crypto provider mapping.
- APLD price staleness resolved by PriceBar fallback — last bar date is 2026-02-25.

### What Exists

**Infrastructure:**
- pnpm workspace monorepo with 7 packages (5 in `packages/`, 1 app, 1 root)
- TypeScript 5.9.3 with strict mode, zero errors
- Prisma 6.19.2 with SQLite — all 7 tables defined
- Vitest 3.2.4 — **720 tests** passing across **62 test files**
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
- `@stalker/analytics` — FIFO lot engine, PnL computation, sell validation, BatchPriceLookup, portfolio value series
- `@stalker/market-data` — 3 active providers (FMP, Tiingo, AV), NYSE holiday calendar, rate limiter, Tiingo IEX batch quotes, `pollAllQuotes()`
- `@stalker/advisor` — 5 tools, system prompt, context window management (token estimation, message windowing, rolling summaries), single message conversion pipeline
- `@stalker/scheduler` — Batch polling via `pollAllQuotes()`, budget-aware, graceful shutdown

**API Layer (Sessions 4–21):**
- **22 endpoints**, all implemented — no stubs remaining
- All transaction writes enforce sell validation + snapshot invalidation
- Advisor chat with 5-tool loop, context windowing, rolling summary generation
- Detail page API now returns allocation, firstBuyDate, dayChange/dayChangePct

**Real Portfolio State:**
- 83 instruments (all with proper names)
- 87 transactions
- ~53,600 price bars (12,748 added in S18 re-backfill)
- 813 portfolio value snapshots (Dec 2022 – present)

### What Does Not Exist Yet

- Responsive refinements for tablet/mobile (user is on desktop — accepted deferral)

### Known Limitations

See `KNOWN-LIMITATIONS.md` for the current list (KL-4 through KL-6).
- ~~KL-1~~ — RESOLVED: NYSE holidays for 2025-2026 (Session 17).
- ~~KL-2~~ — RESOLVED: Message windowing with token estimation (Session 19).
- ~~KL-3~~ — RESOLVED: LLM-generated rolling summaries (Session 19, trigger fixed Session 20).
- ~~KL-7~~ — RESOLVED: Snapshot rebuild ~4s via BatchPriceLookup (Session 14).
- ~~KL-8~~ — RESOLVED: All instruments named via resolution script (Session 14).
- ~~KL-9~~ — RESOLVED: Bulk import dedup guard (Session 14).
- ~~KL-10~~ — RESOLVED: Tiingo batch quotes (Session 15).

---

## Metrics

| Metric | Value |
|--------|-------|
| Test count (total) | 720 |
| Test files | 62 |
| TypeScript errors | 0 |
| Packages created | 5 of 5 (all implemented) |
| API endpoints | 22 (all implemented) |
| UI components | 50 (+1: LatestNews) |
| Data hooks | 12 |
| Utility modules | 19 |
| UI pages | 4 (Portfolio, Charts, Holding Detail, Settings) |
| Prisma tables | 7 of 7 |
| Market data providers | 3 active (FMP, Tiingo, AV) + 1 deprecated (Stooq) |
| Advisor tools | 5 (getTopHoldings, getPortfolioSnapshot, getHolding, getTransactions, getQuotes) |
| Real portfolio | 83 instruments, 87 transactions, 53K+ bars |
| Snapshot rebuild | ~4s for 83 instruments |
| Sessions completed | 21 (zero scope cuts) |

---

## Architecture Decisions (Session 21)

| # | Decision | Rationale |
|---|----------|-----------|
| AD-S21-1 | PriceBar fallback with `provider: 'price-history'` | Reuses existing `latestQuote` response shape. Provider field lets UI distinguish live vs historical data. |
| AD-S21-2 | Non-blocking rebuild: render stale data, rebuild in background | Eliminates 4–30s blocking page loads. User sees data immediately. |
| AD-S21-3 | Day change computed from 2nd-most-recent PriceBar (skip 1) | Simple and accurate — compares current mark price to previous trading day's close. |
| AD-S21-4 | Google News URL construction (no backend) | Zero API cost, no rate limits, no key needed. 90-day window + quoted company name gives relevant results. |

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
13. ~~Advisor context window management~~ — Completed (Session 19, fixed Session 20)
14. ~~IAT remediation~~ — Completed (Session 21)
15. **Responsive refinements** — Deferred (user on desktop)

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
