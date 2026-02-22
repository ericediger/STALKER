# SESSION-1-KICKOFF: Foundation + Analytics Core

## Read First (in order)
1. `CLAUDE.md`
2. `AGENTS.md`
3. `HANDOFF.md`
4. `SESSION-1-PLAN.md` ← Full implementation spec for this session
5. `SPEC_v4.md` — Sections 2, 3, 4, 5

## MCP Note
Skip MCP memory-keeper bootstrap — not needed for teammate agents.

## Agent Team

### Teammate 1: `scaffolding-engineer`
**Scope:** Monorepo setup, Prisma schema (all 7 tables), TypeScript config, Vitest, env template. Update CLAUDE.md/AGENTS.md/HANDOFF.md at end with actual paths and versions.
**Filesystem:** Root directory + `apps/web/prisma/`. Do NOT touch `packages/`.

### Teammate 2: `analytics-engineer`
**Scope:** `packages/shared/` (types, Decimal utils, ULID, constants), `packages/market-data/src/calendar/` (MarketCalendar), `packages/analytics/` (FIFO lot engine, PnL, sell validation). All with tests.
**Filesystem:** `packages/` only. Do NOT touch `apps/` or root configs.

## Sequencing
**Parallel** — launch both immediately. No shared filesystem, no dependencies between teammates.

## Key Rules
- **Decimal.js for all financial math.** No `Number` for money or quantity. No exceptions.
- **Prisma Decimal columns stored as TEXT in SQLite.** This is correct and intentional.
- **TypeScript strict mode.** No `any`, no `@ts-ignore`.
- **ULID for primary keys** (except PriceBar and LatestQuote: auto-increment int).
- **UTC for all DateTime columns.** PriceBar.date and PortfolioValueSnapshot.date are plain DATE (exchange trading date).
- **Decimal test assertions use `.toString()` comparison**, not numeric equality.

## Quality Gates
- `tsc --noEmit` — zero errors
- `pnpm test` — all passing, target 20+ tests
- Push to origin

## Scope Cut Order
If session runs long: cut sell validation tests (not implementation) → cut DST edge case tests → cut nothing else.

## Delegation Mode
I will coordinate only. Teammates commit and continue without waiting for lead approval. Lead reviews all work at session end before sign-off.
