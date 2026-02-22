# SESSION-1-PLAN: Project Scaffolding + Data Foundation + Analytics Core

**Project:** STALKER (Stock & Portfolio Tracker + LLM Advisor)
**Session:** 1 of 9
**Date:** 2026-02-21
**Depends on:** Nothing (this is the first session)
**Blocks:** Sessions 2, 3, 4, 5 (all subsequent sessions)

---

## Context

This is Session 1 — the foundation session. Everything downstream depends on the structures and patterns established here. The monorepo layout, database schema, TypeScript configuration, shared types, Decimal utilities, market calendar, and the core FIFO lot accounting engine are all in scope.

This session is high-risk because:
- Schema mistakes propagate to every table interaction in every future session.
- Decimal precision decisions are extremely difficult to retrofit.
- The FIFO lot engine is the algorithmic heart of the product — if it's wrong, PnL is wrong, and nothing else matters.

The session is designed so that two teammates work in parallel: one building project infrastructure, the other building the analytics and shared packages. Neither blocks the other.

---

## Read First

Agents must read these files in order before starting work:

1. `CLAUDE.md` — Architecture rules, coding standards, agent protocols
2. `AGENTS.md` — Tech stack, design decisions, coordination patterns
3. `HANDOFF.md` — Current state (will be blank/initial for Session 1)
4. `SESSION-1-PLAN.md` — This document
5. `SPEC_v4.md` — Sections 2 (Time/Calendar/Precision), 3 (Architecture), 4 (Data Model), 5 (Analytics Engine)

---

## Scope

### In Scope

**Infrastructure (Teammate 1):**
- pnpm workspace monorepo matching Spec 3.3 directory structure
- `tsconfig.base.json` with strict TypeScript (no implicit any, strict null checks)
- Per-package `tsconfig.json` files extending base
- Prisma schema with all seven tables: Instrument, Transaction, PriceBar, LatestQuote, PortfolioValueSnapshot, AdvisorThread, AdvisorMessage
- SQLite database configuration (`file:./data/portfolio.db`)
- Prisma client generation and initial migration
- Vitest configuration (workspace-level)
- `.env.local` template with all variables from Spec 12
- Root `package.json` with workspace scripts (`dev`, `build`, `test`, `lint`, `db:push`, `db:generate`)
- `CLAUDE.md`, `AGENTS.md`, `HANDOFF.md` — update with actual paths, versions, and metrics after setup

**Shared Package (Teammate 2):**
- `packages/shared/src/types/` — All TypeScript types and interfaces from the spec:
  - Entity types: Instrument, Transaction, PriceBar, LatestQuote, PortfolioValueSnapshot
  - Enums: TransactionType (BUY, SELL), InstrumentType (STOCK, ETF, FUND), Resolution ("1D")
  - Analytics types: Lot, RealizedTrade, HoldingSummary, PortfolioSummary
  - Market data types: Quote, SymbolSearchResult, ProviderLimits, MarketDataProvider interface
  - API response types for all endpoints
- `packages/shared/src/decimal.ts` — Decimal.js utility functions:
  - `toDecimal(value: string | number): Decimal`
  - `add(a: Decimal, b: Decimal): Decimal`
  - `sub(a: Decimal, b: Decimal): Decimal`
  - `mul(a: Decimal, b: Decimal): Decimal`
  - `div(a: Decimal, b: Decimal): Decimal`
  - `isNegative(d: Decimal): boolean`
  - `isZero(d: Decimal): boolean`
  - `formatCurrency(d: Decimal, decimals?: number): string`
  - `formatPercent(d: Decimal, decimals?: number): string`
  - `formatQuantity(d: Decimal): string`
  - `ZERO`, `ONE` constants
- `packages/shared/src/ulid.ts` — ULID generation utility
- `packages/shared/src/constants.ts` — Shared constants (exchange timezone map, default values)

**Market Calendar (Teammate 2):**
- `packages/market-data/src/calendar/market-calendar.ts` — Implementation of:
  - `isTradingDay(date: Date, exchange: string): boolean` — weekday check
  - `getSessionTimes(date: Date, exchange: string): { open: Date; close: Date }` — 9:30–16:00 in exchange TZ
  - `isMarketOpen(now: Date, exchange: string): boolean`
  - `getPriorTradingDay(date: Date, exchange: string): Date`
  - `getNextTradingDay(date: Date, exchange: string): Date`
- Uses `date-fns-tz` for timezone conversion (no manual offset math)
- Exchange timezone mapping (NYSE/NASDAQ/AMEX → America/New_York, etc.)
- Unit tests for: weekday detection, DST transitions, prior/next trading day, session times

**Analytics Engine — Core (Teammate 2):**
- `packages/analytics/src/lot-engine.ts` — FIFO lot accounting:
  - Input: ordered transactions for an instrument
  - Output: `Lot[]` (open lots with remainingQty, costBasisRemaining) + `RealizedTrade[]`
  - All arithmetic via Decimal.js
  - Handles: multiple buys at different prices, partial sells, full position closes
- `packages/analytics/src/pnl.ts` — PnL computations:
  - `computeUnrealizedPnL(lots: Lot[], markPrice: Decimal): UnrealizedPnL`
  - `computeRealizedPnL(trades: RealizedTrade[]): Decimal`
  - `computeHoldingSummary(lots: Lot[], trades: RealizedTrade[], markPrice: Decimal): HoldingSummary`
- `packages/analytics/src/validation.ts` — Sell validation invariant:
  - `validateTransactionSet(transactions: Transaction[]): ValidationResult`
  - Checks cumulative buy ≥ cumulative sell at every point in timeline
  - Returns: valid/invalid, offending transaction, first negative date, deficit quantity
- Unit tests for lot engine, PnL, validation (manually computed expected values)

### Out of Scope

- Market data providers (Session 2)
- Portfolio value series builder and snapshot rebuild (Session 3)
- API endpoints (Session 4)
- Any UI code (Session 5+)
- Scheduler (Session 2)
- LLM adapter or advisor (Session 8)
- Reference portfolio fixture (Session 3 — needs value series builder first)

### Scope Cut Order

If the session runs long, cut in this order:
1. **Cut last:** Sell validation — move to Session 3 if needed (analytics-completion can pick it up)
2. **Cut second-to-last:** Market calendar tests for DST edge cases — basic weekday tests are sufficient
3. **Never cut:** Prisma schema, shared types, FIFO lot engine, Decimal utilities — these block everything

---

## Team Split

### Teammate 1: `scaffolding-engineer`

**Scope:** Project infrastructure — monorepo, database, configuration, project docs.

**Filesystem scope:** Root directory, `apps/web/prisma/`, root config files. Do NOT touch `packages/`.

**Deliverables:**
1. Initialize pnpm workspace with `pnpm-workspace.yaml`
2. Create directory structure per Spec 3.3
3. Set up `apps/web/` as Next.js 14+ App Router project
4. Configure `tsconfig.base.json` (strict mode) and per-package tsconfigs
5. Write Prisma schema (`apps/web/prisma/schema.prisma`) with all seven tables:
   - **Instrument:** id (TEXT/ULID, PK), symbol (TEXT, UNIQUE), name, type (enum), currency, exchange, exchangeTz, providerSymbolMap (JSON), firstBarDate (nullable), createdAt, updatedAt
   - **Transaction:** id (TEXT/ULID, PK), instrumentId (FK), type (enum), quantity (Decimal/TEXT), price (Decimal/TEXT), fees (Decimal/TEXT, default "0"), tradeAt (DateTime UTC), notes (nullable), createdAt, updatedAt. Indexes: (instrumentId, tradeAt), (tradeAt)
   - **PriceBar:** id (Int, autoincrement), instrumentId (FK), provider, resolution, date (Date), time (nullable DateTime), open/high/low/close (Decimal/TEXT), volume (nullable Int). Index: UNIQUE (instrumentId, provider, resolution, date)
   - **LatestQuote:** id (Int, autoincrement), instrumentId (FK), provider, price (Decimal/TEXT), asOf (DateTime), fetchedAt (DateTime), rebuiltAt (DateTime). Index: UNIQUE (instrumentId, provider)
   - **PortfolioValueSnapshot:** id (Int, autoincrement), date (Date, UNIQUE), totalValue/totalCostBasis/realizedPnl/unrealizedPnl (Decimal/TEXT), holdingsJson (JSON), rebuiltAt (DateTime)
   - **AdvisorThread:** id (TEXT/ULID, PK), title, createdAt, updatedAt, summaryText (nullable)
   - **AdvisorMessage:** id (TEXT/ULID, PK), threadId (FK), role, content, toolCalls (nullable JSON), toolResults (nullable JSON), createdAt
6. Run `prisma db push` to create SQLite database
7. Generate Prisma client
8. Set up Vitest configuration
9. Create `.env.local` template (from Spec 12)
10. Create root scripts: `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm db:push`, `pnpm db:generate`
11. Update `CLAUDE.md` — add any new architecture details discovered during scaffolding (e.g., actual tsconfig paths, workspace resolution details). These files already exist; do not recreate from scratch.
12. Update `AGENTS.md` — add confirmed version numbers, any dependency notes from actual installation
13. Update `HANDOFF.md` — update metrics and current state after scaffolding is complete
14. Verify: `tsc --noEmit` passes, Prisma generates successfully, Vitest runs (even with 0 tests)

### Teammate 2: `analytics-engineer`

**Scope:** Shared package, market calendar, and core analytics engine.

**Filesystem scope:** `packages/shared/`, `packages/analytics/`, `packages/market-data/src/calendar/`. Do NOT touch `apps/` or root config files.

**Deliverables:**
1. Create `packages/shared/` with package.json, tsconfig.json
2. Implement all shared types (see In Scope above)
3. Implement Decimal utility module with full test coverage
4. Implement ULID generation utility
5. Implement constants (exchange timezone map)
6. Create `packages/market-data/` shell with package.json, tsconfig.json
7. Implement MarketCalendar module with all five methods
8. Write MarketCalendar tests (weekday detection, session times, prior/next trading day, DST transitions)
9. Create `packages/analytics/` with package.json, tsconfig.json
10. Implement FIFO lot engine:
    - Process ordered transactions → produce Lot[] and RealizedTrade[]
    - All Decimal arithmetic (no Number for financial values)
    - Handle: sequential buys, partial sell consuming one lot, partial sell consuming multiple lots, full position close, zero-quantity edge
11. Implement PnL computation functions
12. Implement sell validation invariant
13. Write comprehensive unit tests:
    - Lot engine: single buy, multiple buys, partial sell, multi-lot sell, full close, zero remaining
    - PnL: unrealized with different mark prices, realized across multiple sells
    - Validation: valid set, sell exceeding position, backdated sell creating mid-timeline negative
    - All tests use manually computed expected values with Decimal assertions

**Critical:** Every Decimal assertion must compare string representations (e.g., `expect(result.toString()).toBe("1234.56")`) to avoid floating-point comparison issues.

---

## Agent Process Notes

- Teammates commit and continue without waiting for lead approval between tasks. Lead reviews at the end.
- Skip MCP memory-keeper bootstrap — not needed for teammate agents.
- **Parallel:** Both teammates are fully independent — launch both immediately. Scaffolding-engineer works on infrastructure; analytics-engineer works on packages. No shared filesystem.
- Lead must verify all teammates' work is committed before sign-off.
- **Scope cut order:** If session runs long, cut sell validation tests (not the implementation), then DST edge case tests, then nothing else — everything else is critical path.

---

## Critical Guardrails

### Must Not Break
1. **Prisma schema must match Spec 4.2 exactly.** Column names, types, indexes, and relationships must be verbatim from the spec. Any deviation blocks every future session.
2. **Decimal.js is the only math library for financial values.** No `Number` type in lot engine, PnL, or validation. No `parseFloat()`. No `Math.round()`.
3. **TypeScript strict mode.** No `any` types. No `@ts-ignore`. No implicit returns.
4. **ULID for all primary keys** (except PriceBar and LatestQuote which use auto-increment integers).
5. **UTC storage for all timestamps.** `tradeAt` is stored as UTC. `date` fields on PriceBar and PortfolioValueSnapshot are exchange trading dates (plain DATE, not DateTime).

### Code Standards
- All files in TypeScript (.ts, not .js)
- Exports use named exports (no default exports for non-page files)
- Package entry points via `index.ts` barrel files
- Tests colocated in `__tests__/` directories within each package
- Import paths use workspace protocol (`@stalker/shared`, `@stalker/analytics`, etc.)

---

## Verification

Lead performs these checks before sign-off:

1. **Directory structure** matches Spec 3.3 (run `tree -L 3` and compare)
2. **`tsc --noEmit`** — zero errors across all packages
3. **`pnpm test`** — all tests pass
4. **Prisma schema review:**
   - All seven tables present with correct column types
   - Indexes match spec (especially composite indexes on Transaction)
   - Decimal columns stored as TEXT (verify in generated SQL)
   - UNIQUE constraints on Instrument.symbol, PriceBar(instrumentId, provider, resolution, date), LatestQuote(instrumentId, provider), PortfolioValueSnapshot(date)
5. **Lot engine correctness (manual review of test cases):**
   - Single buy: 100 shares @ $10 → 1 lot, cost basis $1000
   - Two buys + partial sell: Buy 100@$10, Buy 50@$12 → Sell 120. First lot fully consumed (100 shares), second lot partially consumed (20 of 50). Realized PnL computed correctly.
   - Full close: Buy 100@$10 → Sell 100@$15. Zero remaining lots. Realized PnL = $500.
   - Sell validation catches negative position in middle of timeline
6. **Decimal precision:** Spot-check that no `number` type is used for money/quantity in analytics package
7. **MarketCalendar:** Friday is trading day, Saturday is not. Prior trading day of Monday is Friday. Session times are 9:30–16:00 ET.
8. **Package.json scripts** work: `pnpm test`, `pnpm build`, `pnpm db:push`, `pnpm db:generate`
9. **All teammates' work committed** — `git log` shows commits from both

---

## Exit Criteria

- [ ] Monorepo structure matches Spec 3.3
- [ ] Prisma schema defines all 7 tables with correct types, indexes, and relationships
- [ ] SQLite database created via `prisma db push`
- [ ] Prisma client generated successfully
- [ ] `packages/shared/` exports: types, Decimal utils, ULID, constants
- [ ] `packages/market-data/src/calendar/` MarketCalendar implemented and tested
- [ ] `packages/analytics/` FIFO lot engine implemented and tested
- [ ] PnL computation functions implemented and tested
- [ ] Sell validation invariant implemented and tested
- [ ] `tsc --noEmit` — zero errors
- [ ] All tests passing (target: 20+ tests covering lot engine, PnL, validation, calendar, decimal utils)
- [ ] `CLAUDE.md`, `AGENTS.md`, `HANDOFF.md` updated with actual project details
- [ ] `.env.local` template created
- [ ] All work committed
- [ ] Pushed to origin

---

## Baselines

Since this is Session 1, baselines are all zero:

| Metric | Value |
|--------|-------|
| Test count (backend) | 0 |
| Test count (frontend) | 0 |
| TypeScript errors | 0 (clean start) |
| Packages | 0 |
