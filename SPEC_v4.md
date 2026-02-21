# Stock & Portfolio Tracker + LLM Advisor

## Local-First Application — Specification

**Version:** 4.0
**Last Updated:** 2026-02-20
**Architecture Review Status:** Complete
**Engineering Review Status:** Complete
**Product Review Status:** Complete

### Changelog

| Version | Date | Changes |
|---------|------|---------|
| 4.0 | 2026-02-20 | Incorporated v3.1 amendments (flat polling, weekday-only calendar, symbol-keyed holdingsJson, removed valuationMode) and product brief v3.1 recommendations (advisor system prompt & example conversations, empty states, data health indicator, bulk transaction paste as Next priority, overlay chart deferred to post-MVP, PnL validation strategy) |
| 3.0 | 2026-02-19 | Incorporated engineering lead review: timezone/calendar semantics, materialized cache reframing, decimal precision policy, carry-forward rules, polling tiers, holdingsJson keying, unified sell validation invariant, advisor scope clarification |
| 2.0 | 2026-02-19 | Event-sourced core, relaxed polling, PortfolioValueSnapshot, scoped advisor MVP, error handling matrix |
| 1.0 | 2026-02-18 | Initial draft |

---

## 1. Objective

Build a **local-first web application** that tracks a single user's **portfolio performance** (realized + unrealized), supports **backdated trades** with full history recalculation, and provides **periodic market pricing** using **free/public data sources** with pluggable providers. Include an **LLM-powered advisor** with persistent memory and read access to portfolio state.

### 1.1 Design Principles

1. **Event-sourced core** — Transactions are the sole source of truth. All derived state (lots, PnL, portfolio value series) is computed from the transaction log + price history. Derived tables are **materialized caches** — fully rebuildable, never authoritative, safe to delete and reconstruct at any time.
2. **Local-first, single-user** — No auth, no cloud dependency. SQLite file database. Runs entirely on a Mac dev machine.
3. **Provider-agnostic market data** — Abstract interface with pluggable implementations. System tolerates rate limits, delays, partial data, and outages gracefully.
4. **Incremental complexity** — MVP is deliberately narrow. Every feature beyond MVP is a distinct, deferrable milestone.

### 1.2 Derived Data Rule

> **Any table or computed value that is not `Instrument`, `Transaction`, or `PriceBar` is a materialized cache.** It must be fully reproducible from those three sources. Caches carry a `rebuiltAt` timestamp. If a cache row conflicts with a fresh computation, the fresh computation wins and the cache is overwritten.

---

## 2. Time, Calendar & Precision

These rules apply globally. Getting these wrong is the #1 source of "why is my PnL off?" bugs.

### 2.1 Timestamp Storage

| Data | Storage Format | Rule |
|------|---------------|------|
| `Transaction.tradeAt` | UTC ISO-8601 datetime | User enters local date+time; app converts to UTC using the instrument's exchange timezone before storage. |
| `PriceBar.time` (intraday) | UTC ISO-8601 datetime | Bar open time in UTC. |
| `PriceBar.date` (daily, resolution=1D) | DATE (YYYY-MM-DD) | The **exchange trading date**, not a UTC date. A bar for "2026-02-18" means the session that opened on Feb 18 in the exchange's local timezone. |
| `LatestQuote.asOf` | UTC ISO-8601 datetime | Provider timestamp, converted to UTC. |
| `LatestQuote.fetchedAt` | UTC ISO-8601 datetime | Clock time when we fetched. |
| All `createdAt`/`updatedAt` | UTC ISO-8601 datetime | |

### 2.2 Exchange Timezone

Each `Instrument` carries an `exchangeTz` field (IANA timezone string, e.g., `America/New_York`). This is set automatically on instrument creation based on exchange mapping:

| Exchange | Timezone |
|----------|----------|
| NYSE, NASDAQ, AMEX | America/New_York |
| LSE | Europe/London |
| TSX | America/Toronto |
| (default) | America/New_York |

The exchange timezone is used for:
- Converting user-entered trade dates to UTC.
- Determining "today's trading date" for day-change calculations.
- Resolving daily bar lookups (which date's close to use).

### 2.3 Day Change Definition

> **Day change** = latest quote price − prior trading day's close, where "prior trading day" is determined by the market calendar for the instrument's exchange.

### 2.4 Market Calendar

A `MarketCalendar` module provides market-hours awareness:

```typescript
interface MarketCalendar {
  isTradingDay(date: Date, exchange: string): boolean;
  getSessionTimes(date: Date, exchange: string): { open: Date; close: Date };
  isMarketOpen(now: Date, exchange: string): boolean;
  getPriorTradingDay(date: Date, exchange: string): Date;
  getNextTradingDay(date: Date, exchange: string): Date;
}
```

**MVP implementation:**
- `isTradingDay()` = weekday check only (Monday–Friday).
- `getSessionTimes()` = 9:30–16:00 in the instrument's exchange timezone.
- DST handled automatically via IANA timezone strings + `date-fns-tz` (no manual offset math).
- **Holidays and half-days are not handled in MVP.** If the scheduler polls on a holiday, it receives the prior close — the staleness indicator already covers this. No harm, no incorrect data.

**Post-MVP:** Add static holiday JSON or pull from a calendar source. Half-day schedules. Non-US exchanges.

### 2.5 Numeric Precision

| Data Type | Storage | Serialization | Notes |
|-----------|---------|---------------|-------|
| Money (price, fees, PnL) | Prisma `Decimal` | String in JSON | Avoids floating-point drift. All math uses `Decimal.js` or Prisma's decimal type. |
| Quantity (shares) | Prisma `Decimal` | String in JSON | Supports fractional shares (e.g., DRIP, ETF fractional). |
| Percentage (returns) | Computed at display | Number (4 decimal places) | Never stored; always derived. |

**Implementation rule:** No `number` type is used for money or quantity in business logic. All arithmetic on financial values uses `Decimal` operations. JSON API responses serialize decimals as strings. The UI layer converts to display format (Number with fixed decimals) only at render time.

**SQLite note:** SQLite stores Prisma `Decimal` as TEXT internally. This is correct and intentional — it preserves exact decimal representation. Queries that need numeric comparison should use `CAST()` or compare in application code.

---

## 3. Architecture Overview

### 3.1 High-Level Components

```
┌─────────────────────────────────────────────────────┐
│                   UI (Next.js/React)                 │
│  Dashboard │ Holdings │ Transactions │ Charts │ Chat │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP (internal)
┌──────────────────────▼──────────────────────────────┐
│            API Layer (Next.js App Router)             │
│  /api/instruments/    → Instrument CRUD              │
│  /api/transactions/   → Transaction CRUD + Bulk      │
│  /api/portfolio/      → Analytics (reads cache)      │
│  /api/market/         → Market Data + Status         │
│  /api/advisor/        → LLM Chat                     │
└───┬──────────────────┬──────────────────┬───────────┘
    │                  │                  │
┌───▼───┐    ┌────────▼────────┐   ┌────▼──────────┐
│Analytics│   │ Market Data Svc │   │   Advisor     │
│ Engine  │   │ (Providers +    │   │ Orchestrator  │
│ (lots,  │   │  Rate Limiter + │   │ (LLM adapter  │
│  PnL,   │   │  Cache +        │   │  + tools)     │
│  series)│   │  Calendar)      │   └───────────────┘
└───┬─────┘   └────────┬────────┘
    │                  │
    │           ┌──────▼──────┐
    │           │  Scheduler  │  ← Separate Node process
    │           │  (flat      │
    │           │   polling)  │
    │           └─────────────┘
    │
┌───▼─────────────────────────────────────────────────┐
│              SQLite (via Prisma ORM)                 │
│                                                     │
│  SOURCE OF TRUTH:                                   │
│    Instrument │ Transaction │ PriceBar              │
│                                                     │
│  MATERIALIZED CACHES (fully rebuildable):           │
│    LatestQuote │ PortfolioValueSnapshot             │
│                                                     │
│  APPLICATION STATE:                                 │
│    AdvisorThread │ AdvisorMessage                   │
└─────────────────────────────────────────────────────┘
```

### 3.2 Process Model

| Process | Responsibility | Lifecycle |
|---------|---------------|-----------|
| `next dev` | UI + API routes | Request-scoped, standard Next.js |
| `scheduler` | Flat quote polling, snapshot rebuilds | Long-lived Node process |

Launched together via `pnpm dev` using `concurrently`. The scheduler is a standalone script in `packages/scheduler/` — it does **not** run inside Next.js API routes.

### 3.3 Monorepo Structure

```
/
├── apps/
│   └── web/                        # Next.js application
│       ├── src/
│       │   ├── app/                # App router pages + API routes
│       │   │   ├── api/
│       │   │   │   ├── instruments/
│       │   │   │   │   ├── route.ts            # GET (list), POST (create)
│       │   │   │   │   └── [id]/
│       │   │   │   │       └── route.ts        # GET, DELETE
│       │   │   │   ├── transactions/
│       │   │   │   │   ├── route.ts            # GET (list), POST (create)
│       │   │   │   │   ├── bulk/
│       │   │   │   │   │   └── route.ts        # POST (bulk paste import) [Next]
│       │   │   │   │   └── [id]/
│       │   │   │   │       └── route.ts        # GET, PUT, DELETE
│       │   │   │   ├── portfolio/
│       │   │   │   │   ├── snapshot/route.ts
│       │   │   │   │   ├── timeseries/route.ts
│       │   │   │   │   └── holdings/
│       │   │   │   │       ├── route.ts
│       │   │   │   │       └── [symbol]/route.ts
│       │   │   │   ├── market/
│       │   │   │   │   ├── quote/route.ts
│       │   │   │   │   ├── history/route.ts
│       │   │   │   │   ├── search/route.ts
│       │   │   │   │   ├── refresh/route.ts
│       │   │   │   │   └── status/route.ts     # GET (data health)
│       │   │   │   └── advisor/
│       │   │   │       ├── chat/route.ts
│       │   │   │       └── threads/
│       │   │   │           ├── route.ts
│       │   │   │           └── [id]/route.ts
│       │   │   ├── (pages)/        # UI pages
│       │   │   └── layout.tsx
│       │   ├── components/
│       │   └── lib/
│       └── prisma/
│           └── schema.prisma
├── packages/
│   ├── analytics/                  # Lot accounting, PnL, value series
│   ├── market-data/                # Provider interface + implementations
│   │   ├── src/
│   │   │   ├── providers/
│   │   │   ├── calendar/           # Market calendar module
│   │   │   ├── rate-limiter.ts
│   │   │   └── cache.ts
│   │   └── __tests__/
│   ├── advisor/                    # LLM adapter, tool registry
│   ├── scheduler/                  # Polling orchestration
│   └── shared/                     # Shared types, constants, decimal utils
├── data/
│   └── test/
│       ├── reference-portfolio.json      # PnL validation fixture
│       └── expected-outputs.json         # Expected PnL/lot values
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── SPEC.md
```

---

## 4. Data Model (SQLite via Prisma)

### 4.1 Entity Classification

```
SOURCE OF TRUTH (never derived, never auto-deleted):
  Instrument, Transaction, PriceBar

MATERIALIZED CACHES (derived, rebuildable, carry rebuiltAt):
  LatestQuote, PortfolioValueSnapshot

APPLICATION STATE (not derived from transactions):
  AdvisorThread, AdvisorMessage
```

### 4.2 Table Definitions

#### Instrument

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT (ULID) | Primary key |
| symbol | TEXT | Canonical ticker (e.g., AAPL) |
| name | TEXT | Display name |
| type | ENUM | STOCK, ETF, FUND |
| currency | TEXT | USD default |
| exchange | TEXT | e.g., NASDAQ, NYSE |
| exchangeTz | TEXT | IANA timezone (e.g., `America/New_York`) |
| providerSymbolMap | JSON | `{ "fmp": "AAPL", "stooq": "aapl.us" }` |
| firstBarDate | DATE | Earliest available price bar (set on backfill). Null if no data yet. |
| createdAt | DATETIME (UTC) | |
| updatedAt | DATETIME (UTC) | |

**Indexes:** UNIQUE on `symbol`

#### Transaction

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT (ULID) | Primary key |
| instrumentId | TEXT | FK → Instrument |
| type | ENUM | BUY, SELL |
| quantity | DECIMAL (TEXT) | Positive value. Stored as string for precision. |
| price | DECIMAL (TEXT) | Per-unit price at execution |
| fees | DECIMAL (TEXT) | Default "0" |
| tradeAt | DATETIME (UTC) | User-entered date converted to UTC via instrument's exchangeTz |
| notes | TEXT | Optional |
| createdAt | DATETIME (UTC) | When the record was entered |
| updatedAt | DATETIME (UTC) | |

**Indexes:** `(instrumentId, tradeAt)` composite; `(tradeAt)` for range queries

**MVP scope:** BUY and SELL only. DIVIDEND, SPLIT, FEE, TRANSFER are post-MVP.

**Validation invariant:** At every point in chronological order, for each instrument:
> `cumulative_buy_quantity >= cumulative_sell_quantity`

If a new or edited transaction would violate this invariant at any point in the timeline, the API rejects it with an error containing: the offending transaction, the first date/time where the position goes negative, and the deficit quantity.

#### PriceBar

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER | Auto-increment PK |
| instrumentId | TEXT | FK → Instrument |
| provider | TEXT | Source provider name |
| resolution | TEXT | "1D" for MVP |
| date | DATE | Exchange trading date (for resolution=1D). Not a UTC date. |
| time | DATETIME (UTC) | Bar open time in UTC (for intraday; NULL for daily bars) |
| open | DECIMAL (TEXT) | |
| high | DECIMAL (TEXT) | |
| low | DECIMAL (TEXT) | |
| close | DECIMAL (TEXT) | |
| volume | INTEGER | Optional |

**Indexes:** UNIQUE on `(instrumentId, provider, resolution, date)` for daily bars

**Note on daily bars:** The `date` column stores the exchange trading date as a plain date (YYYY-MM-DD). This avoids timezone confusion — "the close on 2026-02-18" means the close of that day's session in the exchange's local timezone, regardless of what UTC date/time that falls on.

#### LatestQuote *(materialized cache)*

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER | Auto-increment PK |
| instrumentId | TEXT | FK → Instrument |
| provider | TEXT | |
| price | DECIMAL (TEXT) | Last known price |
| asOf | DATETIME (UTC) | Timestamp from provider |
| fetchedAt | DATETIME (UTC) | When we fetched it |
| rebuiltAt | DATETIME (UTC) | When this cache row was last written |

**Indexes:** UNIQUE on `(instrumentId, provider)`

#### PortfolioValueSnapshot *(materialized cache)*

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER | Auto-increment PK |
| date | DATE | Calendar date (exchange trading date) |
| totalValue | DECIMAL (TEXT) | Sum of (qty × close) for all open positions |
| totalCostBasis | DECIMAL (TEXT) | Sum of cost basis for all open lots |
| realizedPnl | DECIMAL (TEXT) | Cumulative realized PnL through this date |
| unrealizedPnl | DECIMAL (TEXT) | totalValue − totalCostBasis |
| holdingsJson | JSON | `{ "AAPL": { qty, value, costBasis }, ... }` |
| rebuiltAt | DATETIME (UTC) | When this snapshot was last computed |

**Indexes:** UNIQUE on `(date)`

**Rebuild strategy:** On any transaction insert/edit/delete, delete all snapshots from the earliest affected `tradeAt` date forward and recompute. With single-user volume, full replay is sub-second. The `rebuiltAt` field enables debugging ("when was this last recalculated?").

**Note on holdingsJson:** Keyed by ticker symbol for immediate readability when debugging the database. Symbol changes are rare enough to handle manually if they ever occur. Each entry contains `{ qty, value, costBasis }`.

**Future-proofing:** When cash tracking is added post-MVP, a `valuationMode` column or similar mechanism can be introduced via a trivial migration: delete all rows, add column, rebuild. This table is a rebuildable cache; schema changes carry zero data-migration risk.

#### AdvisorThread

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT (ULID) | Primary key |
| title | TEXT | Auto-generated or user-set |
| createdAt | DATETIME (UTC) | |
| updatedAt | DATETIME (UTC) | |
| summaryText | TEXT | Rolling summary for context compression |

#### AdvisorMessage

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT (ULID) | Primary key |
| threadId | TEXT | FK → AdvisorThread |
| role | TEXT | "user", "assistant", "tool" |
| content | TEXT | Message body |
| toolCalls | JSON | Tool invocations (if role=assistant) |
| toolResults | JSON | Tool results (if role=tool) |
| createdAt | DATETIME (UTC) | |

---

## 5. Analytics Engine (Event-Sourced)

### 5.1 Core Principle

**Transactions + PriceBars → Everything else.** There is no mutable "position" record. Lots, PnL, and portfolio value are always computed from the event log. `PortfolioValueSnapshot` and `LatestQuote` are caches — if deleted, the system rebuilds them.

### 5.2 Lot Accounting (FIFO)

**Input:** Ordered list of transactions for an instrument, sorted by `tradeAt` ASC.

**Algorithm:**
1. Maintain an ordered queue of open lots.
2. For each BUY: push a new lot `{ openedAt, qty, price, remainingQty, costBasisRemaining }`.
3. For each SELL: consume from the front of the queue (FIFO).
   - If sell qty ≤ front lot's remainingQty: reduce that lot, record realized PnL.
   - If sell qty > front lot's remainingQty: fully consume front lot, continue to next lot with remainder.
   - Realized PnL for consumed shares = `(sellPrice × consumedQty) - (lotPrice × consumedQty) - allocatedFees`
4. After processing all transactions: remaining lots = open positions.

**All arithmetic uses Decimal operations.** No floating-point math.

**Output:**
- `Lot[]` — each with openedAt, remainingQty, costBasisRemaining
- `RealizedTrade[]` — each with sellDate, qty, proceeds, costBasis, realizedPnL

### 5.3 Unrealized PnL

For each open lot, given a mark price:
```
unrealizedPnL = (markPrice - lotOpenPrice) × remainingQty
```
Total unrealized = sum across all open lots for all instruments.

### 5.4 Portfolio Value Series

**Build process (runs on snapshot rebuild):**

For each **exchange trading date** from `earliest_transaction_date` to `today`:
1. Skip non-trading days (using MarketCalendar).
2. Replay transactions through this date → compute open lots and cumulative realized PnL.
3. For each open lot, look up the daily close price from `PriceBar`.
4. `totalValue = Σ(remainingQty × closePrice)` across all instruments.
5. `totalCostBasis = Σ(costBasisRemaining)` across all open lots.
6. `unrealizedPnl = totalValue - totalCostBasis`.
7. Write a `PortfolioValueSnapshot` row with `rebuiltAt = now()`.

**Optimization:** Transactions are sparse relative to trading days. Between transaction boundaries, only prices change — lot state carries forward.

### 5.5 Missing Price Handling

| Scenario | Behavior |
|----------|----------|
| No price bar exists for a trading date, but earlier bars exist | Carry forward the most recent prior close. Mark the snapshot as `estimated` (flag in holdingsJson per instrument). |
| No price bar exists at all for an instrument (`firstBarDate` is null) | Exclude instrument from portfolio value. Show warning: "No price data available for [symbol]." |
| Trade date is before `firstBarDate` | Allow the transaction. Snapshots before `firstBarDate` exclude this instrument's market value (show cost basis only with a warning). |
| Instrument delisted / no new bars arriving | Latest cached quote shows staleness. Post-MVP: support manual price override. |

### 5.6 Flexible Window Queries

All analytics endpoints accept:
- `startDate` (ISO date) — beginning of window
- `endDate` (ISO date) — end of window (default: today)
- `asOf` (ISO datetime, optional) — ignore transactions after this point

Return:
- Portfolio value series for the window (from PortfolioValueSnapshot cache)
- Starting value, ending value, absolute and percentage change
- Realized PnL within the window
- Unrealized PnL at end of window
- Per-instrument breakdown

---

## 6. Market Data Service

### 6.1 Provider Interface

```typescript
interface MarketDataProvider {
  readonly name: string;

  searchSymbols(query: string): Promise<SymbolSearchResult[]>;

  getQuote(symbol: string): Promise<Quote>;

  getHistory(
    symbol: string,
    start: Date,
    end: Date,
    resolution: "1D"  // MVP: daily only
  ): Promise<PriceBar[]>;

  getLimits(): ProviderLimits;
}

interface ProviderLimits {
  requestsPerMinute: number;
  requestsPerDay: number;
  supportsIntraday: boolean;
  quoteDelayMinutes: number;
}

interface Quote {
  symbol: string;
  price: Decimal;
  asOf: Date;
  provider: string;
}

interface SymbolSearchResult {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
  providerSymbol: string;
}
```

### 6.2 Provider Implementations (MVP)

| Provider | Role | Free Tier Limits | Notes |
|----------|------|-----------------|-------|
| **Financial Modeling Prep** | Primary quotes + search | ~250 req/day (free; subject to change) | Good symbol search, real-time-ish quotes |
| **Stooq** | Historical daily bars | No API key needed | CSV download, excellent daily history |
| **Alpha Vantage** | Backup/secondary quotes | ~25 req/day (free; subject to change) | Reliable but very limited free tier |

**Provider limits are configurable** via environment variables, not hardcoded in the spec. When providers change their tiers, update `.env.local` — no code changes needed.

```env
FMP_RPM=5
FMP_RPD=250
AV_RPM=5
AV_RPD=25
```

### 6.3 Polling Strategy

Polling is **periodic and flat** — all held instruments are polled at the same interval.

| Scenario | Frequency | Notes |
|----------|-----------|-------|
| Market hours (weekdays, ~9:30–16:00 ET) | Every 30 minutes | Configurable via `POLL_INTERVAL_MARKET_HOURS` |
| After market close | Once, 15 min after close | Captures final closing prices |
| Outside market hours / weekends | Not polled | Scheduler idles |
| Manual refresh | On-demand via UI button | Respects rate limits |

**Budget check at startup:** Given N tracked instruments and provider daily limit, the scheduler logs whether the polling interval fits within budget. If not, it extends the interval and logs a warning. No tiering, no priority queues.

```
Polling plan: 15 instruments every 30min during market hours (~6.5hrs)
Estimated daily calls: 195/250 (FMP). Budget OK.
```

**Market hours** are determined by `MarketCalendar`:
- Only poll when the market is open for the instrument's exchange.
- Handle DST transitions (via IANA timezone, not hardcoded offsets).
- Skip weekends (holidays are not detected in MVP; polling on a holiday wastes a few API calls but produces no incorrect data).
- "Once at close" means: fetch final closing price 15 minutes after session close (to allow data to settle).

**Manual refresh:** User can trigger an on-demand refresh of all instruments via UI button → `POST /api/market/refresh`. This bypasses the polling schedule but still respects rate limits.

### 6.4 Rate Limiter

Central rate limiter per provider using a token bucket:
- Tracks remaining calls per minute and per day.
- Queues requests that would exceed limits.
- Exposes `canCall(): boolean` and `waitForSlot(): Promise<void>`.
- Resets daily count at midnight UTC.
- Limits are read from environment variables (configurable, not hardcoded).

### 6.5 Provider Fallback

If the primary provider fails (rate limited, timeout, error):
1. Return cached `LatestQuote` if fresh enough (< 1 hour during market hours, < 24 hours otherwise).
2. Try secondary provider.
3. If all providers fail, surface "stale" indicator in UI with the `asOf` timestamp.

---

## 7. LLM Advisor

### 7.1 MVP Scope

> **Scope trade (explicit):** The original requirement called for advisor access to web search and market data tools. For MVP, the advisor reads **cached quotes and analytics only** — it does not trigger external fetches or web searches. This keeps the tool surface small and predictable. Post-MVP adds web search and on-demand price refresh tools.

**MVP tools exposed to the LLM:**

| Tool | Input | Output |
|------|-------|--------|
| `getPortfolioSnapshot` | `{ asOf?, window? }` | Total value, PnL summary, holdings list |
| `getHolding` | `{ symbol }` | Position detail, lots, unrealized PnL |
| `getTransactions` | `{ symbol?, startDate?, endDate?, type? }` | Filtered transaction list |
| `getQuotes` | `{ symbols[] }` | Latest cached quotes with `asOf` timestamps |

**Post-MVP tools (deferred milestones):**
- `getInstrumentHistory` — for chart-like queries in conversation
- `webSearch` — external news/research via search API
- `refreshQuotes` — trigger on-demand price refresh from within chat
- `runHypothetical` — "what if I had bought X on date Y"

### 7.2 LLM Adapter

Provider-agnostic adapter supporting function/tool calling:

```typescript
interface LLMAdapter {
  chat(
    messages: Message[],
    tools: ToolDefinition[],
    options: { model?: string; maxTokens?: number }
  ): Promise<LLMResponse>;
}

interface LLMResponse {
  content: string | null;
  toolCalls: ToolCall[] | null;
  usage: { inputTokens: number; outputTokens: number };
}
```

**MVP:** Implement one adapter (Anthropic or OpenAI). The interface makes adding the second trivial.

### 7.3 Conversation Persistence

- Threads stored in `AdvisorThread`, messages in `AdvisorMessage`.
- On each turn: append user message → call LLM (with tool loop) → append assistant message(s).
- Context window management: send last N messages. If thread is long, prepend the `summaryText` from the thread record.
- Summary generation is post-MVP (manual thread clearing is fine for now).

### 7.4 Tool Execution Loop

```
User message
    ↓
LLM receives: system prompt + conversation history + tool definitions
    ↓
LLM responds with tool_calls (or direct text)
    ↓
Execute each tool call against analytics/market-data packages
    ↓
Return tool results to LLM
    ↓
LLM responds with final text (or more tool calls — loop max 5 iterations)
    ↓
Store all messages in AdvisorMessage
```

### 7.5 Advisor System Prompt and Example Conversations

The advisor is the most differentiated feature in the product. Four read-only tools against cached data will produce a useful advisor only if the system prompt directs the LLM toward synthesis the dashboard UI cannot provide on its own. The system prompt and a set of example conversations must be written and tested before the advisor UI is built.

#### System Prompt Requirements

The system prompt must instruct the LLM to:

1. **Synthesize across holdings** — compare performance across positions, identify which holdings are contributing to or detracting from portfolio returns over specific windows.
2. **Reason about lots and cost basis** — use FIFO lot data from `getHolding` to answer questions about realized gains, unrealized exposure per lot, and tax implications of hypothetical sells.
3. **Flag data staleness** — check `asOf` timestamps in quote data and proactively warn the user if prices are stale before presenting price-dependent analysis.
4. **Stay within scope** — the advisor must not give financial advice, make trade recommendations, or predict market direction. It is an analytical assistant that helps the user understand their own portfolio data.

#### Intent Categories

The following five intent categories define the minimum useful surface for the advisor. Example conversations covering each category must be written and tested against the four MVP tools before build begins. These conversations serve as both a validation fixture for tool sufficiency and a design reference for the system prompt.

| # | Intent Category | Example Query | Primary Tools Used |
|---|----------------|---------------|-------------------|
| 1 | Cross-holding synthesis | "Which positions are dragging my portfolio down over the last 90 days?" | `getPortfolioSnapshot` (with window), `getQuotes` |
| 2 | Tax-aware reasoning | "If I sold my VTI lots opened before June, what would the realized gain be?" | `getHolding` (returns lots with cost basis) |
| 3 | Performance attribution | "How much of my portfolio gain this year came from QQQ versus everything else?" | `getPortfolioSnapshot`, `getHolding` |
| 4 | Concentration awareness | "Am I overexposed to any single sector based on my current allocations?" | `getPortfolioSnapshot` (holdings with allocation %) |
| 5 | Staleness and data quality | "Are any of my holdings showing stale prices?" | `getQuotes` (check `asOf` timestamps) |

#### Validation Criteria

The system prompt is considered ready when all five intent categories produce a useful, non-trivial response using only the four MVP tools. "Non-trivial" means the advisor surfaces an insight or performs a computation that is not directly visible on any single dashboard view.

#### Deliverables

- System prompt text (stored in `packages/advisor/src/system-prompt.ts` or equivalent).
- Example conversations document (stored in `data/test/advisor-examples.md` or equivalent). Each example includes the user query, expected tool calls, and a representative advisor response.

---

## 8. API Endpoints

All routes follow Next.js App Router conventions (`/api/.../route.ts`).

### 8.1 Instruments

| Method | Route File | Description |
|--------|-----------|-------------|
| POST | `api/instruments/route.ts` | Add instrument (triggers historical backfill) |
| GET | `api/instruments/route.ts` | List all tracked instruments |
| GET | `api/instruments/[id]/route.ts` | Get instrument detail |
| DELETE | `api/instruments/[id]/route.ts` | Remove instrument (and its transactions) |

### 8.2 Transactions

| Method | Route File | Description |
|--------|-----------|-------------|
| POST | `api/transactions/route.ts` | Add transaction (validates position invariant, triggers snapshot rebuild from tradeAt forward) |
| GET | `api/transactions/route.ts` | List transactions. Query params: `instrumentId`, `startDate`, `endDate`, `type` |
| PUT | `api/transactions/[id]/route.ts` | Edit transaction (re-validates, triggers rebuild) |
| DELETE | `api/transactions/[id]/route.ts` | Delete transaction (re-validates remaining, triggers rebuild) |
| POST | `api/transactions/bulk/route.ts` | **[Next priority]** Bulk insert from paste input. Body: `{ rows: TransactionInput[] }`. Validates all rows, returns preview with errors. On confirm, inserts all and triggers single snapshot rebuild from earliest `tradeAt`. See Section 9.3.1. |

### 8.3 Portfolio Analytics

| Method | Route File | Description |
|--------|-----------|-------------|
| GET | `api/portfolio/snapshot/route.ts` | Current portfolio state. Query: `asOf`, `window` |
| GET | `api/portfolio/timeseries/route.ts` | Value series. Query: `startDate`, `endDate`, `resolution` |
| GET | `api/portfolio/holdings/route.ts` | All holdings with current unrealized PnL |
| GET | `api/portfolio/holdings/[symbol]/route.ts` | Single holding: lots, transactions, PnL |

### 8.4 Market Data

| Method | Route File | Description |
|--------|-----------|-------------|
| GET | `api/market/quote/route.ts` | Latest quote. Query: `symbol` |
| GET | `api/market/history/route.ts` | Daily bars. Query: `symbol`, `startDate`, `endDate` |
| GET | `api/market/search/route.ts` | Symbol search. Query: `q` |
| POST | `api/market/refresh/route.ts` | Trigger manual quote refresh for all instruments |
| GET | `api/market/status/route.ts` | Data health summary: instrument count, polling status, API budget usage, overall quote freshness |

#### `GET /api/market/status` Response Shape

```typescript
interface MarketStatusResponse {
  instrumentCount: number;
  pollingInterval: number;             // seconds
  pollingActive: boolean;              // is market currently open?
  budget: {
    provider: string;
    usedToday: number;
    dailyLimit: number;
  };
  freshness: {
    allFreshWithinMinutes: number | null;  // null if any quotes stale
    staleInstruments: Array<{
      symbol: string;
      lastUpdated: string;              // ISO datetime
      minutesStale: number;
    }>;
  };
}
```

### 8.5 Advisor

| Method | Route File | Description |
|--------|-----------|-------------|
| POST | `api/advisor/chat/route.ts` | Send message. Body: `{ threadId?, message }` |
| GET | `api/advisor/threads/route.ts` | List threads |
| GET | `api/advisor/threads/[id]/route.ts` | Get thread with messages |
| DELETE | `api/advisor/threads/[id]/route.ts` | Delete thread |

---

## 9. UI Pages (MVP)

### 9.1 Portfolio Dashboard

- **Header:** Total portfolio value, day change ($, %), window selector (1D/1W/1M/3M/1Y/ALL)
- **Day change:** Uses MarketCalendar to determine prior trading day close (not naive "yesterday")
- **Chart:** Portfolio value over selected window (TradingView Lightweight Charts, area chart)
- **Summary cards:** Total gain/loss, realized PnL, unrealized PnL
- **Holdings table:** Symbol, name, qty, current price, market value, unrealized PnL ($, %), allocation %
- **Staleness indicator:** If any quotes are older than expected, show "Prices as of [timestamp]" with amber badge. Tooltip shows per-instrument staleness.
- **Data health indicator (footer):** A compact status bar at the bottom of the dashboard displaying system-level data health. The indicator shows three things:
  1. **Instrument count and polling status** (e.g., "15 instruments, polling every 30 min during market hours")
  2. **API budget usage** (e.g., "183 / 250 daily calls used")
  3. **Overall freshness** (e.g., "All quotes updated within last 35 min" or "3 quotes stale > 2 hours")

  Data is sourced from `GET /api/market/status`. The indicator is read-only and updates on page load or when the user triggers a manual refresh. No user-configurable settings are exposed in MVP.

### 9.2 Holding Detail

- **Price chart:** Daily candlestick chart with flexible date range picker
- **Position summary:** Total qty, avg cost, market value, unrealized PnL, realized PnL
- **Lots table:** OpenedAt, original qty, remaining qty, cost basis, unrealized PnL per lot
- **Transactions list:** Filtered to this instrument, sorted by tradeAt desc
- **Unpriced warning:** If instrument has no price data, show cost-basis-only view with explanation

### 9.3 Transactions Page

- **Transaction table:** All transactions, sortable/filterable by instrument, type, date range
- **Add transaction form:** Symbol (autocomplete via market search), type (BUY/SELL), quantity, price, date (defaults to now, supports backdating), fees (optional), notes (optional)
- **Edit/delete:** Inline or modal. Confirmation required for delete.
- **Validation errors:** If a transaction would create a negative position, show the specific date and deficit in the error message.

#### 9.3.1 Bulk Transaction Paste Input [Next Priority]

> **Priority:** Next (post-core-MVP, pre-polish). Not required for initial MVP acceptance.

A multi-line paste input on the transactions page that accepts tab-separated rows, enabling rapid entry of historical trades from a spreadsheet or brokerage statement.

**Expected format:** One transaction per line, tab-separated fields in the order: `symbol`, `type` (BUY/SELL), `quantity`, `price`, `date` (YYYY-MM-DD). Fees and notes are optional trailing fields.

**UI behavior:**
1. User pastes rows into a multi-line text area.
2. The UI parses each row and displays a preview table.
3. Validation errors are highlighted per row (unknown symbol, negative position after insert, missing required field, invalid date format).
4. The user reviews and confirms. On confirm, the batch is submitted to `POST /api/transactions/bulk`.
5. On success, a single snapshot rebuild is triggered from the earliest `tradeAt` in the batch.

**Scope:**
- **In scope:** Paste input, preview table with error highlighting, batch validation, batch insert with snapshot rebuild.
- **Out of scope:** CSV file upload, column mapping UI, brokerage-specific format parsing.

### 9.4 Compare / Overlay Chart [Post-MVP]

> **Deferred to post-MVP.** The single-instrument candlestick chart (Section 9.2) provides sufficient charting for MVP. The daily bars data pipeline is already in place per instrument, so adding the overlay chart later requires UI-only work — no backend changes.

When built, this feature will include:
- **Instrument multi-select:** Choose 2–5 instruments from portfolio (or search for any)
- **Date range picker**
- **Normalization toggle:** Raw price, normalize to 100 at start, percentage change from start
- **Chart:** Multi-line overlay using TradingView Lightweight Charts

### 9.5 Advisor Chat

- **Thread list:** Sidebar or dropdown showing past threads
- **Chat interface:** Message input, response display
- **Tool call visibility:** Show when the advisor is "looking up" portfolio data (collapsible detail)
- **New thread button**
- **Setup state:** If LLM API key is missing, show configuration instructions instead of chat input
- **Suggested prompts:** When holdings exist but no thread is active, display 3 suggested prompts drawn from the example conversations (Section 7.5) to help the user understand what the advisor can do.

### 9.6 Empty States and First-Run Experience

For a local-first app with no onboarding flow, the cold-start experience determines whether the user gets value in the first session or abandons the tool. Every page must handle the zero-data case gracefully.

| Page | Empty State Behavior |
|------|---------------------|
| Dashboard | Show a centered prompt: "Add your first holding to start tracking your portfolio." with a prominent "Add Instrument" button. No chart skeleton, no zero-value cards. |
| Holdings | Same prompt as dashboard. Single call-to-action. |
| Transactions | "No transactions yet. Add an instrument first, then record your trades." |
| Advisor | If no holdings exist: "Add some holdings first so the advisor has something to work with." If holdings exist but no thread: "Ask me anything about your portfolio." with 3 suggested prompts drawn from the example conversations (Section 7.5). |
| Single Holding | Should not be reachable if no holdings exist. If reached via direct URL, redirect to dashboard. |

**Design constraints:**
- No blank screens. No loading spinners on empty data. Every empty state renders a meaningful message and a clear next action.
- A new user must be able to go from first launch to seeing portfolio value in under 3 minutes.
- Empty states are acceptance-testable: each page must render correctly with zero data (see Section 13, criterion 11).

---

## 10. Charting

- **Library:** TradingView Lightweight Charts (MIT license, lightweight, performant)
- **Chart types (MVP):**
  - Area chart (portfolio value over time)
  - Candlestick chart (individual instrument price history)
- **Chart types (post-MVP):**
  - Line chart (overlay/compare view — see Section 9.4)
- **Data flow:** API returns time series → React component transforms to chart format → chart renders
- **Interaction:** Crosshair with value tooltip, date range selection via controls above chart

---

## 11. Error Handling & Edge Cases

### 11.1 Market Data

| Scenario | Behavior |
|----------|----------|
| Provider rate limited | Queue request, serve cached data, log warning |
| Provider down | Fallback to secondary provider, then cached data with staleness indicator |
| Symbol not found | Surface error on instrument add, suggest alternatives from search |
| Missing price for a trading date (after first bar) | Carry forward last known close, flag as estimated |
| No price data at all (before first bar) | Exclude from portfolio value, show cost-basis-only with warning |
| Instrument delisted / no new bars | Show stale indicator. Post-MVP: manual price override. |

### 11.2 Analytics

| Scenario | Behavior |
|----------|----------|
| Transaction would create negative position at any point | Reject with: offending transaction, first date position goes negative, deficit quantity |
| No price data for portfolio value date (after first bar) | Carry forward last close, mark estimated |
| No price data at all for instrument | Exclude from value snapshots, show cost-basis-only |
| Snapshot cache missing or stale | Rebuild on demand (transparent to caller) |

### 11.3 Advisor

| Scenario | Behavior |
|----------|----------|
| LLM API key missing/invalid | Show setup instructions in chat UI (not an error modal) |
| LLM rate limited | Queue with backoff, show "thinking..." indicator |
| Tool call returns error | Return error context to LLM, let it explain to user |
| Context too long | Truncate oldest messages, prepend summary if available |

---

## 12. Configuration

All configuration via environment variables (`.env.local`):

```env
# Market Data Providers (keys)
FMP_API_KEY=your_key_here
ALPHA_VANTAGE_API_KEY=your_key_here
# Stooq needs no key

# Market Data Provider Limits (configurable, not hardcoded)
FMP_RPM=5
FMP_RPD=250
AV_RPM=5
AV_RPD=25

# LLM Provider
LLM_PROVIDER=anthropic          # or "openai"
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
LLM_MODEL=claude-sonnet-4-5-20250514    # or "gpt-4o"

# Scheduler
POLL_INTERVAL_MARKET_HOURS=1800  # seconds (30 min default)
POST_CLOSE_DELAY=900             # seconds after close to fetch final prices

# Database
DATABASE_URL=file:./data/portfolio.db
```

---

## 13. MVP Acceptance Criteria

The MVP is complete when a user can:

1. **Add instruments** by searching for a ticker symbol, with automatic historical price backfill and correct exchange timezone assignment.
2. **Record BUY and SELL transactions** with any past date (backdating), with validation that prevents negative positions at any point in the timeline. Receive clear error messages if a transaction is invalid.
3. **View a dashboard** showing total portfolio value, day change (using correct prior-trading-day close), and a selectable time window (1W/1M/3M/1Y/ALL).
4. **See a holdings table** with current price, quantity, market value, unrealized PnL, and allocation percentage. Stale quotes are visually indicated.
5. **View a single instrument chart** with daily candles and a date range picker.
6. **See realized vs unrealized PnL** both at the portfolio level and per holding, with correct decimal precision (no floating-point artifacts).
7. **View lot detail** for any holding showing FIFO lots with individual cost basis and unrealized PnL.
8. **Chat with an advisor** that can answer questions about current holdings, transactions, and portfolio performance using read-only tool calls against cached data. The advisor handles all five intent categories defined in Section 7.5.
9. **See quote staleness** — timestamps showing when prices were last updated, with appropriate warnings when data is stale or unavailable.
10. **See data health at a glance** — instrument count, polling status, API budget usage, and overall quote freshness displayed on the dashboard footer (Section 9.1).
11. **See meaningful empty states** on every page when no data exists, with clear calls to action that guide first-run setup (Section 9.6).

### 13.1 PnL Validation Strategy

For a portfolio tracker, correctness is the product. If the PnL numbers are wrong, nothing else matters. A reference portfolio and expected outputs are defined as a validation fixture to ensure calculation correctness throughout development and as a regression guard going forward.

#### Reference Portfolio Requirements

The reference portfolio is a small, manually constructed set of transactions with independently computed expected outputs. It must include:

- At least 5 instruments with a total of 20 to 30 transactions, including backdated entries.
- At least one instrument with multiple buy lots at different prices (exercises lot tracking).
- At least one partial sell (exercises FIFO lot consumption across a partial lot).
- At least one full position close (exercises realized PnL computation).
- At least one backdated transaction (exercises snapshot rebuild from a past date).
- At least one date with a missing price bar (exercises carry-forward logic).
- Expected outputs computed independently (spreadsheet or manual calculation), covering: lot state after each transaction, realized PnL per sell, unrealized PnL at specific dates, and portfolio total value at specific dates.

#### Fixture Location

- `data/test/reference-portfolio.json` — transactions, instruments, and mock price bars.
- `data/test/expected-outputs.json` — expected lot state, realized PnL, unrealized PnL, and portfolio value for specific checkpoint dates.

#### Test Strategy

1. **Fixture-based unit tests** in the `analytics` package that replay the reference portfolio and assert expected values to the cent. These run in CI and catch regressions.
2. **Full-stack cross-validation** before MVP signoff: run the reference portfolio through the full stack (API + UI) and manually verify that displayed values match expected outputs.

#### MVP Signoff Gate

MVP is not considered complete until both the automated fixture tests pass and the full-stack cross-validation checkpoint has been manually verified and signed off.

### What is explicitly NOT in MVP:

- Dividends, splits, fees beyond per-transaction fees, cash tracking
- Intraday price history
- CSV import/export (bulk paste input is Next priority; see Section 9.3.1)
- Overlay/compare chart (deferred to post-MVP; see Section 9.4)
- Hypothetical "what if" calculations in advisor
- Web search / news in advisor
- On-demand price refresh from advisor
- Multi-user, auth, cloud deployment
- Alerts, watchlists, notifications
- Multi-currency / FX
- Manual price overrides for delisted instruments
- Holiday and half-day market calendar (weekday check only in MVP)

---

## 14. Technology Decisions Summary

| Concern | Decision | Rationale |
|---------|----------|-----------|
| Framework | Next.js 14+ (App Router) | Single repo, API routes follow file conventions, SSR optional |
| Language | TypeScript (strict) | Type safety across full stack |
| Database | SQLite + Prisma | Zero-config local, Prisma makes Postgres migration trivial |
| Decimal math | Prisma Decimal (stored as TEXT in SQLite) + Decimal.js | Exact financial arithmetic, no float drift |
| Timezone handling | `date-fns-tz` + IANA timezone strings | Correct DST handling, no manual offset math |
| Market calendar | `MarketCalendar` module (weekday check only for MVP) | Simplest correct implementation; holidays deferred |
| UI styling | Tailwind CSS | Utility-first, fast iteration, no runtime overhead |
| Charting | TradingView Lightweight Charts | MIT license, purpose-built for financial charts, tiny bundle |
| Monorepo | pnpm workspaces | Native, fast, no extra tooling needed |
| Testing | Vitest | Fast, TS-native, compatible with the ecosystem |
| Scheduler | Standalone Node process | Avoids Next.js request-scoped execution model |
| IDs | ULID | Sortable, no coordination needed, works great with SQLite |

---

## Appendix A: Summary of Changes from v3.0

This appendix documents every material change from the prior specification version for traceability.

### From Amendments v3.1

| Area | v3.0 | v4.0 | Rationale |
|------|------|------|-----------|
| Polling | 3-tier priority system | Flat interval, all instruments equal | Single user, not day-trading. Complexity not justified. Removes ~150 lines of code. |
| Market calendar | Full holidays + half-days in Phase 0 | Weekday check + IANA timezone only | Polling on a holiday wastes a few API calls. Staleness indicator already handles it. |
| holdingsJson key | instrumentId | symbol | Debuggability over theoretical correctness. Symbols rarely change. |
| valuationMode | Column on PortfolioValueSnapshot | Removed | YAGNI. Cache table — trivial to add later. |
| Scheduler | Tier classification + reclassification | Simple poll loop | Fewer moving parts, same user experience. |

### From Product Brief v3.1

| Spec Section | Change Type | Description |
|-------------|-------------|-------------|
| 7.5 (new) | Addition | Advisor system prompt requirements, five intent categories, example conversation deliverables |
| 9.6 (new) | Addition | Empty states and first-run experience definitions for every page |
| 9.1 | Addition | Data health indicator on dashboard footer |
| 8.4 | Addition | `GET /api/market/status` endpoint with response shape |
| 9.3.1 (new) | Addition (Next) | Bulk transaction paste input (post-core-MVP, pre-polish) |
| 8.2 | Addition (Next) | `POST /api/transactions/bulk` endpoint |
| 9.4 | Deferral | Compare/overlay chart moved to post-MVP |
| 13, criterion 6 | Removal | Overlay chart removed from MVP acceptance criteria |
| 13.1 (new) | Addition | PnL validation strategy, reference portfolio fixture, signoff gate |
