# HANDOFF.md — STALKER Current State

**Last Updated:** 2026-02-28 (Post-Session 20)
**Last Session:** Session 20 — Hardening, Bug Fixes & Project Close-Out
**Status:** Production Ready — Project Complete

---

## Current State

Session 20 was the project's closing sprint. It fixed a rolling summary trigger bug (AD-S20-1), added 2 missing integration tests, consolidated dual message converters into a single pipeline (AD-S20-2), added token calibration logging for development (AD-S20-3), and brought all documentation current (Master Plan v5.0).

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

**Session 20 Changes:**
- **Rolling summary fix** — Removed `!summaryText` guard from `shouldGenerateSummary` in `context-window.ts`. Rolling summaries now fire on every trim, enabling the merge path in `summary-generator.ts`. (AD-S20-1)
- **Message converter consolidation** — Created `parsePrismaMessage()` for Prisma→WindowableMessage parsing. Retired unused `prismaMessageToInternal()`. Single pipeline: `parsePrismaMessage → windowableToMessage`. (AD-S20-2)
- **Token calibration logging** — Development-mode log comparing estimated vs actual token counts. Extended `executeToolLoop` to return `usage` from final LLM response. (AD-S20-3)
- **Integration tests** — Added windowed long-thread test (verifies LLM receives fewer messages than total). Added rolling summary wiring test (verifies `generateSummary` called with existing summary). +2 tests → 720 total.
- **Documentation** — Master Plan v5.0 (S12–S20 complete), HANDOFF, CLAUDE.md, AGENTS.md all updated.

**API Layer (Sessions 4–20):**
- **22 endpoints**, all implemented — no stubs remaining
- All transaction writes enforce sell validation + snapshot invalidation
- Advisor chat with 5-tool loop, context windowing, rolling summary generation

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
| UI components | 49 |
| Data hooks | 12 |
| Utility modules | 19 |
| UI pages | 4 (Portfolio, Charts, Holding Detail, Settings) |
| Prisma tables | 7 of 7 |
| Market data providers | 3 active (FMP, Tiingo, AV) + 1 deprecated (Stooq) |
| Advisor tools | 5 (getTopHoldings, getPortfolioSnapshot, getHolding, getTransactions, getQuotes) |
| Real portfolio | 83 instruments, 87 transactions, 53K+ bars |
| Snapshot rebuild | ~4s for 83 instruments |
| Sessions completed | 20 (zero scope cuts) |

---

## Architecture Decisions (Session 20)

| # | Decision | Rationale |
|---|----------|-----------|
| AD-S20-1 | Rolling summary trigger fires on every trim, not just the first | Original `!summaryText` guard made the merge path in `summary-generator.ts` unreachable. Correct behavior: any trim offers messages for summarization. |
| AD-S20-2 | Single message conversion pipeline: `parsePrismaMessage → windowableToMessage` | Eliminates dual converter paths. One parse step (JSON strings → objects), one conversion step (WindowableMessage → Message). |
| AD-S20-3 | Token calibration logging in development mode only | Zero production overhead. Provides data to validate the 3.0–3.5 chars/token heuristic. |

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
14. **Responsive refinements** — Deferred (user on desktop)

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
