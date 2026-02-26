# AGENTS.md — STALKER Tech Stack & Design Decisions

**Project:** STALKER — Stock & Portfolio Tracker + LLM Advisor
**Last Updated:** 2026-02-24 (Post-Session 12 — API Wiring + Pipeline Soak)

---

## Tech Stack

| Layer | Technology | Version/Notes |
|-------|-----------|---------------|
| **Framework** | Next.js 15.5.12 (App Router) | Single repo, file-based API routes, SSR optional |
| **Language** | TypeScript 5.9.3 (strict) | Full stack — packages + app |
| **Runtime** | Node.js 22.16.0 | LTS |
| **Database** | SQLite via Prisma 6.19.2 | `file:../data/portfolio.db` relative to prisma/ dir |
| **Decimal math** | Decimal.js 10.x + Prisma Decimal | Stored as TEXT in SQLite, exact financial arithmetic |
| **Timezone** | date-fns 3.x + date-fns-tz 3.x | IANA timezone strings, automatic DST handling |
| **Market calendar** | Custom `MarketCalendar` module | Weekday check only for MVP |
| **UI styling** | Tailwind CSS 4.2 | CSS-based `@theme` config (no tailwind.config.ts), PostCSS integration |
| **UI utilities** | clsx + tailwind-merge | `cn()` utility for conditional class merging |
| **Typography** | Crimson Pro (headings), DM Sans (body), JetBrains Mono (numeric tables) | Local woff2 via next/font/local (Session 8 H-5) |
| **Charting** | TradingView Lightweight Charts 5.1.0 | MIT license, v5 API: `chart.addSeries(AreaSeries, opts)` |
| **Monorepo** | pnpm 10.30.1 workspaces | Native, fast, no Turborepo/Nx needed |
| **Testing** | Vitest 3.2.4 | Fast, TypeScript-native, 677 tests passing |
| **Validation** | Zod 4.3.6 | Input validation for API routes |
| **IDs** | ULID 2.x | Sortable, no coordination, SQLite-friendly |
| **Process manager** | concurrently 9.x | Runs Next.js + scheduler together via `pnpm dev` |
| **LLM** | Anthropic Claude Sonnet 4.6 (primary, adaptive thinking), OpenAI (secondary) | Provider-agnostic adapter |

### Package Manager

pnpm exclusively. No npm, no yarn. Install with `pnpm install`. Run scripts with `pnpm {script}`.

### Workspace Packages

| Package | Path | Purpose | Depends On |
|---------|------|---------|------------|
| `@stalker/shared` | `packages/shared/` | Types, Decimal utils, ULID, constants | Nothing |
| `@stalker/analytics` | `packages/analytics/` | FIFO lots, PnL, portfolio value series | `@stalker/shared` |
| `@stalker/market-data` | `packages/market-data/` | Provider interface, implementations (FMP, Tiingo, AV), calendar, rate limiter | `@stalker/shared` |
| `@stalker/advisor` | `packages/advisor/` | LLM adapter, tool definitions, system prompt | `@stalker/shared` |
| `@stalker/scheduler` | `packages/scheduler/` | Polling orchestration | `@stalker/market-data` |
| `web` | `apps/web/` | Next.js application (UI + API routes) | All packages |

---

## Design Decisions

All decisions are **final unless explicitly revisited** in a planning session. Rationale is included to prevent re-litigation during build sessions.

### Data Architecture

| Decision | Detail | Why |
|----------|--------|-----|
| Event-sourced core | Transactions + PriceBars are truth. Everything else is a rebuildable cache. | Backdated trades require full history replay. Mutable position records would corrupt under backdating. |
| SQLite, not Postgres | Single user, local-first. Zero config. | Prisma makes migration to Postgres a one-line change if ever needed. |
| Decimal.js for financial math | All money and quantity values use Decimal operations. Stored as TEXT in SQLite. | Float drift is unacceptable for a portfolio tracker. |
| ULID for entity PKs | Sortable by creation time, no coordination needed. | Auto-increment IDs only for high-volume tables (PriceBar, LatestQuote) where sortability by creation isn't meaningful. |
| Symbol-keyed holdingsJson | `PortfolioValueSnapshot.holdingsJson` uses ticker symbol as key, not instrumentId. | Debuggability. When inspecting the database, `"AAPL": { ... }` is immediately readable. Symbol changes are rare enough to handle manually. |

### Market Data

| Decision | Detail | Why |
|----------|--------|-----|
| Three providers | FMP (search + quotes via `/stable/`), Tiingo (historical daily bars), Alpha Vantage (backup quotes) | FMP `/api/v3/` dead since Aug 2025. Stooq deprecated (no formal API). Tiingo: REST API, 30+ years of data, documented limits. |
| Flat polling | All instruments polled at equal interval. No priority tiers. | Single user, not day-trading. Tiered polling adds ~150 LOC for no user-facing benefit. |
| Weekday + holiday calendar | `isTradingDay()` = weekday check + NYSE holiday list (2025-2026) for US exchanges. | Static holiday set, updated annually. Half-days not tracked (negligible waste). Non-US exchanges unaffected. |
| Configurable rate limits | Provider limits read from env vars, not hardcoded. | When providers change free tiers, update `.env.local` — no code changes. |
| Standalone scheduler | Long-lived Node process separate from Next.js. | Next.js request-scoped execution model can't sustain a polling loop. |

### UI & Charting

| Decision | Detail | Why |
|----------|--------|-----|
| Bookworm design system | Dark-theme adaptation. Crimson Pro + DM Sans. Five-state status system → financial semantics. | Proven component patterns. Financial domain mapping well-defined in UX Plan. |
| TradingView Lightweight Charts | Area chart (portfolio value), candlestick (instrument price). Shared `useChart` hook for lifecycle. | MIT license, purpose-built for financial data, tiny bundle (<40kb). |
| Overlay chart deferred | Single-instrument chart only in MVP. Overlay/compare is post-MVP. | UI-only work when added later (daily bars pipeline already exists). Saves ~1 session. |
| Advisor as slide-out panel | Floating action button → slide-out chat, not a dedicated page. | Matches Bookworm pattern. Post-MVP may add side-by-side layout if conversations get long. |

### Advisor

| Decision | Detail | Why |
|----------|--------|-----|
| Cached data only (MVP) | Advisor reads LatestQuote and analytics caches. No live fetches, no web search. | Small, predictable tool surface. No side effects from chat. No rate limit risk. |
| Five tools | `getTopHoldings`, `getPortfolioSnapshot`, `getHolding`, `getTransactions`, `getQuotes` | `getTopHoldings` added in S17 for efficient 83-instrument scale. Covers all five intent categories. |
| Provider-agnostic adapter | `LLMAdapter` interface. Anthropic implementation for MVP. | Adding OpenAI is trivial later. Interface prevents vendor lock-in. |
| FIFO lot accounting only | No specific identification, no LIFO. | Industry standard for retail investors. Matches what brokerages report. |

---

## Agent Coordination Patterns

### Multi-Agent Sessions (Lead + Teammates)

**Filesystem Isolation:** Each teammate gets an explicit filesystem scope in their spawn prompt. Teammates must not write files outside their scope. This prevents merge conflicts.

**Parallel vs. Sequenced:**
- **Parallel:** Teammates have no dependencies on each other. Launch both immediately.
- **Sequenced:** Teammate 1 produces output that Teammate 2 needs. Lead verifies Teammate 1's output, then spawns Teammate 2.

**Communication:** Teammates do not communicate directly. If Teammate 2 needs something from Teammate 1, the lead relays it.

**Commit Pattern:** Each teammate commits their own work. Lead verifies all commits are present before session sign-off.

### Solo Sessions

Lead does everything. Used for small sessions, design work, or documentation-only sessions.

### Quality Checkpoints

| Checkpoint | When | Command |
|-----------|------|---------|
| TypeScript | After every major change | `tsc --noEmit` |
| Tests | After every major change | `pnpm test` |
| Final check | Before session sign-off | Both of the above + manual verification from plan |

### Session Handoff Chain

```
HANDOFF.md → Session Report → Plan Review → Tightened Plan → KICKOFF → Next Session
```

Breaking any link in this chain means the next session starts with stale context.

---

## Environment Variables

All configuration via `apps/web/.env.local`:

```env
# Market Data Providers
FMP_API_KEY=                     # Financial Modeling Prep (search + quotes)
ALPHA_VANTAGE_API_KEY=           # Alpha Vantage (backup quotes)
TIINGO_API_KEY=                  # Tiingo (historical daily bars)

# Provider Rate Limits (configurable)
FMP_RPM=5                        # Requests per minute
FMP_RPD=250                      # Requests per day
AV_RPM=5
AV_RPD=25
TIINGO_RPH=50                    # Requests per hour
TIINGO_RPD=1000                  # Requests per day

# LLM Provider
LLM_PROVIDER=anthropic           # or "openai"
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
LLM_MODEL=claude-sonnet-4-6

# Scheduler
POLL_INTERVAL_MARKET_HOURS=1800  # seconds (30 min)
POST_CLOSE_DELAY=900             # seconds after close for final prices

# Database
DATABASE_URL=file:./data/portfolio.db
```

---

## Key File Locations

| File | Purpose | Read Frequency |
|------|---------|----------------|
| `CLAUDE.md` | Architecture, rules, agent protocols | Every session start |
| `AGENTS.md` | Tech stack, decisions, coordination | Every session start |
| `HANDOFF.md` | Current state, last session results | Every session start |
| `STALKER_MASTER-PLAN.md` | Roadmap, epics, strategic decisions | Planning sessions |
| `SESSION-{N}-PLAN.md` | Implementation spec for session N | Session N only |
| `SESSION-{N}-KICKOFF.md` | Launch prompt for session N | Session N only |
| `apps/web/prisma/schema.prisma` | Database schema | When touching data layer |
| `packages/shared/src/types/` | Shared TypeScript interfaces | Frequently |
| `data/test/reference-portfolio.json` | PnL validation fixture | Testing sessions |
