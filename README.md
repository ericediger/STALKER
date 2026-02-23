# STALKER — Stock & Portfolio Tracker + LLM Advisor

A local-first, event-sourced portfolio tracker built for a single user on macOS. No auth, no cloud, no multi-tenancy.

## Tech Stack

- **Next.js 15** (App Router) + **TypeScript 5.9** (strict)
- **SQLite** via **Prisma 6** — zero-config local database
- **Decimal.js** — exact financial arithmetic (no floats)
- **TradingView Lightweight Charts v5** — portfolio area charts + candlestick charts
- **Tailwind CSS 4** — dark financial theme
- **Vitest** — 407 tests across 30 test files
- **pnpm workspaces** — monorepo with 5 packages + 1 app

## Quick Start

```bash
pnpm install
pnpm db:generate          # Generate Prisma client
pnpm db:push              # Create/sync database schema
cd apps/web && npx prisma db seed  # Seed demo data (28 instruments, 30 transactions)
pnpm dev                  # Starts Next.js + scheduler
```

The app runs at `http://localhost:3000`.

## Project Structure

```
apps/web/                  # Next.js App Router (UI + API routes)
packages/
  shared/                  # Types, Decimal utils, ULID, constants
  analytics/               # FIFO lot engine, PnL, portfolio value series
  market-data/             # 3 providers, rate limiter, fallback chain, calendar
  advisor/                 # LLM adapter (placeholder — Session 8)
  scheduler/               # Standalone polling process
```

## Running Tests

```bash
pnpm test                 # All 407 tests
pnpm tsc --noEmit         # TypeScript type check (also available as `pnpm lint`)
```

## Documentation

| Document | Purpose |
|----------|---------|
| [HANDOFF.md](HANDOFF.md) | Current state, what exists, what's next |
| [CLAUDE.md](CLAUDE.md) | Architecture, coding rules, API catalog, component inventory |
| [AGENTS.md](AGENTS.md) | Tech stack, design decisions, environment setup |
| [STALKER_MASTER-PLAN.md](STALKER_MASTER-PLAN.md) | Roadmap, epics, session history |

## Environment

Copy `.env.example` to `apps/web/.env.local` and fill in API keys:

```bash
cp .env.example apps/web/.env.local
```

See [AGENTS.md](AGENTS.md) for the full variable reference.

## Status

Sessions 1-7 of 9 complete. All core UI pages are functional. LLM advisor (Session 8) and final validation + polish (Session 9) remain.
