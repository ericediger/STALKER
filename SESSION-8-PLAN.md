# SESSION-8-PLAN.md — Hardening + LLM Advisor

**Date:** 2026-02-23
**Session:** 8 of 9
**Epic(s):** Code Review Hardening + Epic 7 (LLM Advisor)
**Mode:** SEQUENCED — Lead Phase 0, then backend teammate, then lead verification, then frontend teammate
**Depends on:** Sessions 1–7 complete (407 tests, all pages except advisor functional)
**Blocks:** Session 9 (full-stack validation + polish + MVP signoff)

**Reference Documents:**
- `SPEC_v4.md` §7.1–7.5 (Advisor), §8.5 (API), §11.3 (Error handling), §12 (Config)
- `STALKER-ux-ui-plan.md` §3.6 (Chat panel), §10 (Prompt UX guidance)
- `SESSION-8-HARDENING-ADDENDUM.md` (Phase 0 tasks H-1 through H-5)
- `STALKER_MASTER-PLAN_v3.md` §3 Session 8 details

---

## 0. Session Goal

After this session, the advisor is the last piece of the MVP. A user can open the chat panel from any page, ask a question about their portfolio, watch the advisor look up real data via tool calls, and receive a non-trivial analytical response. Conversations persist across page navigations and browser sessions.

Before any of that, five hardening fixes from the SWAT code review land first to stabilize the foundation the advisor reads from.

---

## 1. Pre-Session Checklist

The lead must verify these before starting Phase 0:

- [ ] `ANTHROPIC_API_KEY` is set in `.env.local` (required for Phases 1–2)
- [ ] `LLM_PROVIDER=anthropic` is set in `.env.local`
- [ ] `LLM_MODEL=claude-sonnet-4-5-20250514` is set in `.env.local` (or current Sonnet model string)
- [ ] `pnpm test` passes — 407 tests, 0 failures
- [ ] `tsc --noEmit` — 0 errors
- [ ] Seed data is loaded — 28 instruments, 30 transactions, 8300+ price bars (AD-S6d)
- [ ] Confirm Prisma schema includes `AdvisorThread` and `AdvisorMessage` models (created in Session 1)
- [ ] Confirm `packages/advisor/` exists as empty shell (created in Session 1)
- [ ] Download font files for H-5: Crimson Pro (400/500/600), DM Sans (400/500/600), JetBrains Mono (400)

---

## 2. Phase 0: Code Review Hardening (Lead Only)

**Duration estimate:** 2.5–3.5 hours
**Reference:** `SESSION-8-HARDENING-ADDENDUM.md` for full task details

Execute in this exact order. Each task builds on the prior.

### Task H-5: Local Fonts (unblocks `pnpm build`)

1. Place downloaded font files in `apps/web/public/fonts/` (or `apps/web/src/fonts/`).
2. Replace `next/font/google` imports in `apps/web/src/app/layout.tsx` with `next/font/local`.
3. Verify Tailwind `fontFamily` config still references the correct CSS variable names.
4. Run `pnpm build` — must exit 0.

**⚠ WATCHPOINT W-1: Font variable name continuity.** The existing code uses CSS variables from `next/font/google` (e.g., `--font-crimson-pro`). The `next/font/local` replacement must produce the same CSS variable names or the entire Tailwind token system breaks silently — text renders in fallback fonts with no build error. Verify visually on the dashboard after the swap.

### Task H-3: Search Route Response Shape

1. Change `apps/web/src/app/api/market/search/route.ts` to return `Response.json({ results: [] })`.
2. Add defensive parsing in `SymbolSearchInput.tsx`: `const results = Array.isArray(data?.results) ? data.results : []`.
3. Add route test: GET returns `{ results: [] }` with 200.

### Task H-4: Provider Fetch Timeouts

1. Create `packages/market-data/src/fetch-with-timeout.ts` with `AbortController` wrapper (10s default).
2. Replace bare `fetch()` in `fmp.ts`, `alpha-vantage.ts`, `stooq.ts`.
3. Verify existing provider tests still pass (they use mocked HTTP, not real fetch).
4. Add unit test: `fetchWithTimeout` rejects with `AbortError` after timeout.

### Task H-1: Wire Snapshot Rebuild on Mutations

1. In transaction POST handler: call `rebuildSnapshotsFrom(tradeAt)` after successful creation.
2. In transaction PUT handler: call `rebuildSnapshotsFrom(min(oldTradeAt, newTradeAt))`.
3. In transaction DELETE handler: call `rebuildSnapshotsFrom(deletedTx.tradeAt)`.
4. In instrument DELETE handler: full snapshot rebuild from earliest remaining transaction date.
5. Remove all "skip rebuild" comments/TODOs from mutation routes.

**⚠ WATCHPOINT W-2: Rebuild function import path.** The `rebuildSnapshotsFrom` function (or equivalent — may be named `buildPortfolioValueSeries`, `rebuildFromDate`, etc.) lives in `packages/analytics/`. Before writing code, `grep -r "rebuildSnapshot\|buildPortfolioValue\|deleteFrom" packages/analytics/src/` to find the exact function name and signature. The Session 3 analytics code may expose this differently than the spec describes. Use what exists — do not create a duplicate.

**⚠ WATCHPOINT W-3: Prisma transaction scope.** The sell validation and snapshot rebuild should ideally be in the same database transaction. If the current code uses `prisma.$transaction()`, the rebuild call must be inside the transaction boundary. If it doesn't, this is acceptable for MVP but document it as a known atomicity gap.

Add integration tests:
- POST transaction → GET snapshot → assert new transaction reflected
- DELETE transaction → GET snapshot → assert deleted transaction not reflected
- PUT transaction (change date) → GET snapshot → assert both date ranges correct

### Task H-2: Make GET Snapshot Read-Only

1. Modify the GET snapshot route to read from `PortfolioValueSnapshot` table without invoking the build pipeline.
2. If no cached snapshots exist for the requested window, compute the response on-the-fly from transactions + price bars **without writing to the snapshot table**.
3. Add test: mock `deleteFrom`/`writeBatch` — assert neither called during GET when cached snapshots exist.

**⚠ WATCHPOINT W-4: Coupling between `queryPortfolioWindow` and `buildPortfolioValueSeries`.** These may be tightly coupled — the window query function may internally call the builder. If refactoring the internal call structure is too invasive, the minimum acceptable fix for Phase 0 is: **check for existing snapshots first, only rebuild if none exist**. This eliminates the "every GET rebuilds" behavior. Document the residual coupling and schedule full decoupling for Session 9 if needed.

### Phase 0 Gate

Before proceeding to Phase 1:

- [ ] `pnpm build` exits 0 (H-5)
- [ ] `tsc --noEmit` — 0 errors
- [ ] All 407 existing tests pass, 0 regressions
- [ ] 10–15 new hardening tests pass
- [ ] No mutation route contains "skip rebuild" comments
- [ ] GET snapshot doesn't invoke delete/rebuild when cached data exists
- [ ] GET `/api/market/search` returns `{ results: [] }`
- [ ] All provider fetch calls use timeout wrapper

Commit: `Session 8 Phase 0: Code review hardening (H-1 through H-5)`

---

## 3. Phase 1: Advisor Backend (Teammate 1: `advisor-backend`)

**Duration estimate:** 3–4 hours
**Filesystem scope:** `packages/advisor/src/**`, `apps/web/src/app/api/advisor/**`, `data/test/advisor-examples.md`
**Does NOT touch:** Any component in `apps/web/src/components/`, any non-advisor API route, any analytics or market-data package source

### 3.1 Deliverable: LLM Adapter

**File:** `packages/advisor/src/llm-adapter.ts`

```typescript
// Interface (provider-agnostic)
interface LLMAdapter {
  chat(
    messages: Message[],
    tools: ToolDefinition[],
    options?: { model?: string; maxTokens?: number }
  ): Promise<LLMResponse>;
}

interface Message {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;       // for role='tool' — the ID of the tool call this responds to
  toolCalls?: ToolCall[];     // for role='assistant' — tool calls made
}

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;  // JSON Schema
}

interface LLMResponse {
  content: string | null;
  toolCalls: ToolCall[] | null;
  usage: { inputTokens: number; outputTokens: number };
}
```

**File:** `packages/advisor/src/anthropic-adapter.ts`

Implement `LLMAdapter` using the Anthropic SDK (`@anthropic-ai/sdk`).

- Install: `pnpm add @anthropic-ai/sdk --filter @stalker/advisor`
- Read `ANTHROPIC_API_KEY` from `process.env`
- Read `LLM_MODEL` from `process.env` (default: `claude-sonnet-4-5-20250514`)
- Map internal `Message[]` format to Anthropic's `messages` format
- Map internal `ToolDefinition[]` to Anthropic's `tools` format
- Map Anthropic's response back to internal `LLMResponse`
- Handle `tool_use` content blocks → `ToolCall[]`
- Set `max_tokens` from options (default: 4096)

**⚠ WATCHPOINT W-5: Anthropic tool calling format.** The Anthropic SDK's tool calling uses `tool_use` and `tool_result` content block types, not OpenAI's `function_call` pattern. The adapter must translate between our internal format and Anthropic's format. Key differences: Anthropic returns tool calls as content blocks with `type: "tool_use"`, and expects tool results as messages with `role: "user"` containing a `tool_result` content block (not `role: "tool"`). The adapter's `chat()` method must handle this translation transparently so the tool execution loop doesn't need to know which provider is active.

**⚠ WATCHPOINT W-6: Anthropic SDK version.** Install the latest stable version. The SDK has changed significantly across versions. Pin the exact version in `package.json` — do not use `^` range. Verify the `tools` parameter name and format against the installed version's TypeScript types before writing any code.

**Decision: Non-streaming for MVP.** Use `client.messages.create()`, not `client.messages.stream()`. The response is returned as a complete object. Streaming is a post-MVP enhancement. This simplifies the adapter, the API route, and the frontend significantly.

### 3.2 Deliverable: Tool Definitions and Executors

**File:** `packages/advisor/src/tools/index.ts`

Four tools. Each has a definition (JSON Schema for the LLM) and an executor (function that runs against real data).

#### Tool 1: `getPortfolioSnapshot`

```typescript
// Definition
{
  name: 'getPortfolioSnapshot',
  description: 'Get the current portfolio state including total value, cost basis, realized and unrealized PnL, and per-holding breakdown with allocation percentages. Optionally specify a time window.',
  parameters: {
    type: 'object',
    properties: {
      window: {
        type: 'string',
        enum: ['1W', '1M', '3M', '1Y', 'ALL'],
        description: 'Time window for performance metrics. Default: ALL'
      }
    }
  }
}

// Executor: calls GET /api/portfolio/snapshot?window={window} internally
// or directly calls queryPortfolioWindow() from @stalker/analytics
```

#### Tool 2: `getHolding`

```typescript
{
  name: 'getHolding',
  description: 'Get detailed position information for a single instrument including quantity, average cost, market value, unrealized PnL, FIFO lot breakdown with per-lot cost basis and unrealized PnL, and recent transactions.',
  parameters: {
    type: 'object',
    properties: {
      symbol: { type: 'string', description: 'Ticker symbol (e.g., VTI, QQQ, AAPL)' }
    },
    required: ['symbol']
  }
}

// Executor: calls GET /api/portfolio/holdings/{symbol} internally
// or directly queries analytics functions
```

#### Tool 3: `getTransactions`

```typescript
{
  name: 'getTransactions',
  description: 'Get a list of transactions, optionally filtered by symbol, date range, or type (BUY/SELL).',
  parameters: {
    type: 'object',
    properties: {
      symbol: { type: 'string', description: 'Filter by ticker symbol' },
      startDate: { type: 'string', description: 'ISO date string (YYYY-MM-DD)' },
      endDate: { type: 'string', description: 'ISO date string (YYYY-MM-DD)' },
      type: { type: 'string', enum: ['BUY', 'SELL'], description: 'Filter by transaction type' }
    }
  }
}

// Executor: calls GET /api/transactions with query params
// or directly queries Prisma
```

#### Tool 4: `getQuotes`

```typescript
{
  name: 'getQuotes',
  description: 'Get the latest cached price quotes for one or more instruments. Returns the price and asOf timestamp for each. Use this to check data freshness before presenting price-dependent analysis.',
  parameters: {
    type: 'object',
    properties: {
      symbols: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of ticker symbols'
      }
    },
    required: ['symbols']
  }
}

// Executor: queries LatestQuote table via Prisma
```

**⚠ WATCHPOINT W-7: Tool executors must use real data paths.** The executors must call into the actual analytics engine and Prisma database, not return mock data. With 28 instruments and 8300+ price bars in the seed data (AD-S6d), there is a realistic dataset available. The choice of whether to call API routes internally (via `fetch('http://localhost:3000/api/...')`) or call analytics/Prisma functions directly is left to the engineer. Direct function calls are preferred — they avoid the HTTP hop, they work without the Next.js server running, and they're easier to test. But either approach is acceptable.

**⚠ WATCHPOINT W-8: Decimal serialization in tool results.** Tool results are stringified and sent to the LLM. All `Decimal` values must be serialized as formatted strings (e.g., `"$29,436.00"` or `"29436.00"`), not as raw Decimal objects. The LLM cannot reason about `Decimal { d: [29436], e: 4, s: 1 }`. Use the existing numeric formatters from `packages/shared/`.

### 3.3 Deliverable: Tool Execution Loop

**File:** `packages/advisor/src/tool-loop.ts`

Implements Spec §7.4:

```typescript
async function executeToolLoop(
  adapter: LLMAdapter,
  systemPrompt: string,
  messages: Message[],
  tools: ToolDefinition[],
  toolExecutors: Record<string, (args: Record<string, unknown>) => Promise<unknown>>,
  maxIterations: number = 5
): Promise<{ messages: Message[]; finalResponse: string }> {
  // 1. Call adapter.chat(messages, tools)
  // 2. If response has toolCalls:
  //    a. Execute each tool call via toolExecutors[name](args)
  //    b. Append assistant message (with toolCalls) and tool result messages
  //    c. Loop (up to maxIterations)
  // 3. If response has content (no toolCalls): return final response
  // 4. If maxIterations exceeded: return whatever content exists
}
```

**Error handling within the loop:**
- If a tool executor throws, catch the error and return an error message as the tool result (e.g., `{ error: "Symbol XYZ not found" }`). The LLM will see this and explain the issue to the user. Do not throw out of the loop.
- If the adapter throws (API error, rate limit), propagate the error up to the API route handler.

### 3.4 Deliverable: System Prompt

**File:** `packages/advisor/src/system-prompt.ts`

The system prompt is the single most important deliverable in this session. It must be written to satisfy four requirements (Spec §7.5) and the UX guidance (UX Plan §10).

**Required content:**

1. **Role and identity.** "You are a portfolio analyst assistant. You have read-only access to the user's portfolio data through a set of tools."

2. **Capabilities framing.** Describe what the four tools provide. The LLM should know it can: see overall portfolio state, drill into individual holdings with FIFO lot detail, query transaction history, and check quote freshness.

3. **Synthesis directive.** "When answering questions, synthesize across multiple data points. Don't just relay raw numbers — compute derived insights like: which positions contributed most to gains/losses, what the tax impact of selling specific lots would be, whether the portfolio is concentrated in a single holding."

4. **Staleness protocol.** "Before presenting any analysis that depends on current prices, check quote freshness using getQuotes. If any relevant quotes are older than 2 hours, disclose this to the user before proceeding."

5. **Scope boundaries.** "You are an analytical assistant, not a financial advisor. Do not recommend buying or selling specific securities. Do not predict market direction. Do not give tax advice — you can compute what a realized gain would be, but you cannot advise on whether to take that gain. If asked for a recommendation, reframe as analysis: 'Here's what the data shows...' rather than 'You should...'"

6. **Response style.** "Be precise and direct. Use specific numbers from the data. Format dollar amounts with commas and two decimal places. Format percentages to two decimal places. When comparing holdings, present the data in a structured way. Avoid hedging language and unnecessary disclaimers beyond the scope boundary."

**⚠ WATCHPOINT W-9: System prompt must produce non-trivial responses for all 5 intent categories.** This is the validation criteria from Spec §7.5. The prompt will be tested in Phase 2 before the frontend is built. If the prompt produces generic or non-analytical responses, it needs iteration before Phase 3 starts. Common failure modes: LLM refuses to compute tax scenarios because it "isn't a tax advisor" (scope boundary too aggressive), LLM doesn't call getQuotes before price-dependent analysis (staleness directive not prominent enough), LLM just echoes raw tool output instead of synthesizing.

### 3.5 Deliverable: Advisor API Routes

**Files:**
- `apps/web/src/app/api/advisor/chat/route.ts`
- `apps/web/src/app/api/advisor/threads/route.ts`
- `apps/web/src/app/api/advisor/threads/[id]/route.ts`

#### POST `/api/advisor/chat`

**Request body:**
```typescript
{
  threadId?: string;   // ULID. If omitted, create new thread.
  message: string;     // User message text
}
```

**Behavior:**
1. If `threadId` is null, create a new `AdvisorThread`. Set `title` to first 60 characters of the message.
2. Append a `user` `AdvisorMessage` to the thread.
3. Load conversation history: last 50 messages from the thread. If fewer than 50, load all.
4. Build the message array: `[system prompt, ...conversation history]`.
5. Execute tool loop (§3.3).
6. Append all generated messages (assistant + tool) to `AdvisorMessage`.
7. Update thread `updatedAt`.

**Response body:**
```typescript
{
  threadId: string;
  messages: Array<{
    id: string;
    role: 'assistant' | 'tool';
    content: string;
    toolCalls?: ToolCall[];    // present if role=assistant and tools were called
    toolName?: string;         // present if role=tool
    createdAt: string;
  }>;
}
```

The response returns **all messages generated in this turn** — typically one or more tool messages and one final assistant message. The frontend renders them sequentially.

**Error handling:**
- Missing/invalid API key: Return `{ error: 'LLM provider not configured', code: 'LLM_NOT_CONFIGURED' }` with 503 status. Frontend shows setup instructions.
- LLM API error: Return `{ error: 'Advisor temporarily unavailable', code: 'LLM_ERROR' }` with 502 status.
- Empty message: Return 400.

**⚠ WATCHPOINT W-10: The chat route MUST be `"use client"`-safe.** This is a POST route so it won't be statically prerendered, but the response body must be JSON-serializable (no Decimal objects, no Date objects — all strings). Apply lesson AD-S7c: context providers used by the frontend for streaming state must be wrapped at the layout level.

#### GET `/api/advisor/threads`

Return all threads sorted by `updatedAt` desc:
```typescript
{
  threads: Array<{
    id: string;
    title: string;
    updatedAt: string;
    messageCount: number;
  }>;
}
```

#### GET `/api/advisor/threads/[id]`

Return thread with all messages:
```typescript
{
  thread: { id, title, createdAt, updatedAt };
  messages: Array<{ id, role, content, toolCalls?, toolResults?, createdAt }>;
}
```

#### DELETE `/api/advisor/threads/[id]`

Delete thread and all its messages. Return 204.

### 3.6 Deliverable: Example Conversations Document

**File:** `data/test/advisor-examples.md`

Five example conversations, one per intent category (Spec §7.5). Each includes:

1. **User query** (exact text)
2. **Expected tool calls** (which tools, in what order, with what arguments)
3. **Representative advisor response** (what a good response looks like — not verbatim, but capturing the analytical content that should be present)

These serve as:
- Validation fixture for Phase 2 testing
- Design reference for the system prompt
- Regression reference for future prompt changes

### 3.7 Tests

Target: 25–30 new tests

| Area | Tests | Notes |
|------|-------|-------|
| Anthropic adapter | 5–8 | Mock Anthropic SDK responses. Test text response, tool_use response, error handling, message format translation. |
| Tool executors | 8–12 | Each tool against seed data. Assert response shape, Decimal formatting, empty results, invalid symbol. |
| Tool execution loop | 5–8 | Mock adapter. Test: direct response (no tools), single tool call, multi-tool chain, error in tool, max iteration limit. |
| API routes | 4–6 | Thread CRUD, chat with mock adapter, missing API key → 503. |

---

## 4. Phase 2: Lead Verification

**Duration estimate:** 1–1.5 hours
**Purpose:** Verify the system prompt produces non-trivial responses for all 5 intent categories using real tool execution against the seed data. This is the quality gate for R-5.

### Verification Method

1. Start the Next.js dev server (`pnpm dev` from `apps/web/`).
2. For each of the 5 intent categories, send the example query to `POST /api/advisor/chat` via `curl` or a test script.
3. Inspect the response for:
   - **Tool calls:** Did the right tools fire? Did they fire in a useful order?
   - **Data accuracy:** Do the numbers in the response match what the seed data should produce?
   - **Analytical depth:** Is the response synthesizing, not just echoing raw data?
   - **Staleness check:** For queries involving prices, did the advisor check or mention freshness?
   - **Scope compliance:** No recommendations, no predictions, no disclaimers beyond what's necessary.

### Pass Criteria

| # | Intent Category | Query | Pass Condition |
|---|----------------|-------|---------------|
| 1 | Cross-holding synthesis | "Which positions are dragging my portfolio down over the last 90 days?" | Calls `getPortfolioSnapshot` with a window. Identifies specific underperformers by name with dollar/percentage figures. |
| 2 | Tax-aware reasoning | "If I sold my oldest VTI lots, what would the realized gain be?" | Calls `getHolding` for VTI. References specific lots by date and cost basis. Computes the gain amount. |
| 3 | Performance attribution | "How much of my total gain came from my top holding versus everything else?" | Calls `getPortfolioSnapshot`. Breaks down attribution by holding. Presents as percentages and dollar amounts. |
| 4 | Concentration awareness | "Am I overexposed to any single holding?" | Calls `getPortfolioSnapshot`. Identifies the largest allocation by percentage. Contextualizes whether it's unusual. |
| 5 | Staleness check | "Are any of my prices stale?" | Calls `getQuotes` with all symbols. Reports which quotes are stale with `asOf` timestamps. |

### Failure Response

If any intent category fails:
1. Identify the failure mode (tool not called, scope boundary too aggressive, data not synthesized).
2. Adjust the system prompt.
3. Re-test the failing category.
4. Do not proceed to Phase 3 until all 5 pass.

**⚠ WATCHPOINT W-11: Seed data content matters.** The seed data (AD-S6d) has 28 instruments and 30 transactions, but the transactions may not cover all intent categories well. For example, if no instrument has multiple buy lots at different prices, intent #2 (tax-aware reasoning about lots) can't produce a useful response. Before running verification, check that the seed data includes: (a) at least one instrument with 2+ buy lots, (b) at least one instrument with a sell (realized PnL exists), (c) at least 3 intentionally stale quotes (already confirmed per AD-S6d). If the seed data is insufficient, add a few transactions to the seed script before testing.

---

## 5. Phase 3: Advisor Frontend (Teammate 2: `advisor-frontend`)

**Duration estimate:** 3–4 hours
**Filesystem scope:** `apps/web/src/components/advisor/**`, `apps/web/src/hooks/useAdvisor*.ts`
**Does NOT touch:** `packages/advisor/**` (backend), any non-advisor component, any API route

### 5.1 Deliverable: Chat Panel (Slide-Out)

**File:** `apps/web/src/components/advisor/AdvisorPanel.tsx`

Panel specs from UX Plan §3.6:

- **Trigger:** The `AdvisorFAB` component already exists (Session 5). Wire its `onClick` to toggle panel open state.
- **Panel container:** Fixed position, slides from right. Width: 448px (`max-w-md`). Full viewport height. `bg-surface-raised`, `shadow-2xl`, `z-50`.
- **Backdrop:** `bg-black/30`, fixed. Click to close.
- **Close:** X button in header, Escape key, or backdrop click.
- **Transition:** `transform transition-transform duration-300`. Closed: `translate-x-full`. Open: `translate-x-0`.
- **Accessibility:** `role="dialog"`, `aria-label="Portfolio Advisor"`, focus trap when open.

**⚠ WATCHPOINT W-12: `"use client"` boundary.** The entire advisor panel subtree must be marked `"use client"`. This component manages local state (panel open/closed, active thread, messages, loading). Apply lesson AD-S7c — the `ToastProvider` pattern. The `AdvisorPanel` should be imported into the layout or Shell as a client component. Do not let any server component try to render it.

### 5.2 Deliverable: Panel Layout Components

**Files:**
- `apps/web/src/components/advisor/AdvisorHeader.tsx`
- `apps/web/src/components/advisor/AdvisorMessages.tsx`
- `apps/web/src/components/advisor/AdvisorInput.tsx`
- `apps/web/src/components/advisor/SuggestedPrompts.tsx`
- `apps/web/src/components/advisor/ToolCallIndicator.tsx`
- `apps/web/src/components/advisor/ThreadList.tsx`

#### AdvisorHeader

- Title: "Advisor" in Crimson Pro, `text-heading`.
- Buttons: `[New Thread]` `[Threads ▾]` `[✕]`.
- New Thread: `bg-interactive`, small button. Calls `POST /api/advisor/chat` with no `threadId` on first message.
- Threads: Dropdown toggle → renders `ThreadList`.
- Close: Lucide X icon, `text-muted`, hover `text-heading`.

#### AdvisorMessages

- Scrollable container, `flex-1 overflow-y-auto`.
- Auto-scroll to bottom on new message.
- Message rendering by role:
  - `user`: Right-aligned, `bg-interactive`, `rounded-lg p-3`, DM Sans 0.875rem.
  - `assistant`: Left-aligned, `bg-surface-overlay`, `border border-surface-border`, `rounded-lg p-3`, DM Sans 0.875rem.
  - `tool`: Rendered as `ToolCallIndicator` (see below).

#### ToolCallIndicator

- Left-aligned, `bg-surface-overlay`, `border border-surface-border`, `rounded-lg p-2`.
- Collapsed state: Icon (📊 or Lucide BarChart3) + "Looking up [tool description]..." in `text-muted`, 0.8rem.
- Expanded state (click to toggle): Monospace `text-subtle`, shows tool name, arguments, and truncated result.
- Tool name mapping for display:
  - `getPortfolioSnapshot` → "Looking up portfolio summary..."
  - `getHolding` → "Looking up [symbol] position..."
  - `getTransactions` → "Checking transaction history..."
  - `getQuotes` → "Checking current prices..."

#### AdvisorInput

- Fixed at panel bottom. `border-t border-surface-border`, `bg-surface-raised`, `p-3`.
- Textarea: `bg-surface`, `border border-surface-border`, `rounded-lg`, placeholder "Type a message about your portfolio...", auto-resize up to 4 lines.
- Send button: Arrow icon (Lucide SendHorizonal), `bg-interactive`, `rounded-lg`, 36px. Disabled when input is empty or request is in-flight.
- Submit on Enter (without Shift). Shift+Enter for newline.
- Disabled state when loading: input greyed, send button shows Loader2 spinner.

#### SuggestedPrompts

- Shown when: thread has no messages yet (new thread or first open with holdings).
- Three clickable cards (UX Plan §3.6):
  1. "Which positions are dragging my portfolio down this quarter?"
  2. "What would the realized gain be if I sold my oldest lots?"
  3. "Am I overexposed to any single holding?"
- Card style: `bg-surface`, `border border-surface-border`, `rounded-lg`, `p-3`, `cursor-pointer`.
- Hover: `bg-surface-overlay`, `text-text`.
- Click: sends the prompt text as the first message.

#### ThreadList

- Dropdown rendered below the Threads button.
- Lists threads from `GET /api/advisor/threads`, sorted by `updatedAt` desc.
- Each item: title (truncated, DM Sans 0.85rem), date (`text-subtle`).
- Click: loads that thread's messages via `GET /api/advisor/threads/[id]`.
- Empty state: "No previous conversations." in `text-muted`.

### 5.3 Deliverable: State Management Hook

**File:** `apps/web/src/hooks/useAdvisor.ts`

```typescript
function useAdvisor() {
  // State
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Actions
  async function sendMessage(text: string): Promise<void>;
  async function loadThread(threadId: string): Promise<void>;
  async function loadThreads(): Promise<void>;
  async function newThread(): void;
  async function deleteThread(threadId: string): Promise<void>;

  return { threads, activeThreadId, messages, isLoading, error,
           sendMessage, loadThread, loadThreads, newThread, deleteThread };
}
```

**`sendMessage` behavior:**
1. Set `isLoading = true`.
2. Append the user message to `messages` optimistically (so it renders immediately).
3. Call `POST /api/advisor/chat` with `{ threadId: activeThreadId, message: text }`.
4. On success: append all returned messages to state. Set `activeThreadId` if new thread.
5. On error: set `error` state. If `code === 'LLM_NOT_CONFIGURED'`, set a specific flag for the setup state.
6. Set `isLoading = false`.

### 5.4 Deliverable: Empty and Error States

#### Missing API Key (Spec §11.3, UX Plan §3.6)

Detected when: `POST /api/advisor/chat` returns `code: 'LLM_NOT_CONFIGURED'`.

Display:
- Crimson Pro heading: "Advisor Setup Required"
- DM Sans body: "To use the portfolio advisor, add your LLM API key to `.env.local`:"
- Code block (`font-mono`, `bg-surface`, `p-3`):
  ```
  LLM_PROVIDER=anthropic
  ANTHROPIC_API_KEY=your_key_here
  ```
- "Then restart the development server."
- No input field. No suggested prompts.

#### No Holdings (Spec §9.6)

Detected when: `GET /api/instruments` returns empty list (check on panel open).

Display: "Add some holdings first so the advisor has something to work with." Link to dashboard. No input field.

#### LLM Error

Detected when: `POST /api/advisor/chat` returns 502.

Display: Render an assistant-styled message in `text-muted`: "I encountered an error processing your request. Please try again."

### 5.5 Tests

Target: 10–15 new tests

| Area | Tests | Notes |
|------|-------|-------|
| `useAdvisor` hook | 4–6 | Mock fetch. Test: send message, load thread, new thread, API error → error state, LLM not configured → setup state. |
| Component rendering | 4–6 | SuggestedPrompts renders 3 cards. ToolCallIndicator collapsed/expanded. Empty states render correctly. ThreadList renders items. |
| Integration | 2–3 | Panel opens/closes. Message renders after send (mocked API). |

---

## 6. Exit Criteria

### Blocking (all must pass)

| # | Criterion | Source |
|---|-----------|--------|
| 1 | `pnpm build` exits 0 | H-5 |
| 2 | `tsc --noEmit` 0 errors | Quality gate |
| 3 | `pnpm test` all pass, 0 regressions | Quality gate |
| 4 | Mutation routes trigger snapshot rebuild | H-1 |
| 5 | GET snapshot is read-only when cached data exists | H-2 |
| 6 | Search route returns `{ results: [] }` | H-3 |
| 7 | Provider fetches use timeout wrapper | H-4 |
| 8 | Fonts load from local files | H-5 |
| 9 | System prompt passes all 5 intent categories | Phase 2 |
| 10 | Advisor panel opens from FAB | Phase 3 |
| 11 | User message sends and assistant response renders | Phase 3 |
| 12 | Tool call indicators display during execution | Phase 3 |
| 13 | Suggested prompts display on empty thread | Phase 3 |
| 14 | Thread list loads and thread switching works | Phase 3 |
| 15 | Missing API key shows setup instructions | Phase 3 |
| 16 | No holdings shows empty state with dashboard link | Phase 3 |
| 17 | New thread button creates fresh conversation | Phase 3 |
| 18 | LLM error renders graceful error message | Phase 3 |

### Non-Blocking Targets

| # | Target | Notes |
|---|--------|-------|
| 1 | New tests: 45+ (15 hardening + 30 advisor) | Total target: 460+ |
| 2 | Example conversations document complete | `data/test/advisor-examples.md` |
| 3 | Escape key closes panel | Accessibility |
| 4 | Focus trap in panel | Accessibility |
| 5 | Auto-scroll to newest message | UX |

### Scope Cut Priority (if session runs long)

Cut in this order (last = cut first):

| Priority | Item | Impact of Deferral |
|----------|------|--------------------|
| 1 (never cut) | Phase 0 hardening (H-1–H-5) | Data consistency, build stability |
| 2 (never cut) | System prompt + 5 intent categories | Advisor is useless without a good prompt |
| 3 (never cut) | Core chat: send message, receive response, tool indicators | Core advisor functionality |
| 4 | Thread persistence + thread list | Can use single ephemeral thread for MVP demo |
| 5 | Suggested prompts | Nice-to-have, user can type their own question |
| 6 | Thread deletion | Threads accumulate harmlessly |
| 7 | Focus trap + Escape key | Accessibility polish, defer to S9 |

---

## 7. Watchpoint Summary

All watchpoints collected in one place for quick reference during execution.

| ID | Phase | Risk | Mitigation |
|----|-------|------|------------|
| W-1 | 0 | Font CSS variable names change during local migration | Verify visually on dashboard after swap. Grep for `--font-` in Tailwind config. |
| W-2 | 0 | Rebuild function name/signature differs from spec | `grep -r` before coding. Use whatever `packages/analytics/` exposes. |
| W-3 | 0 | Snapshot rebuild not in same Prisma transaction as mutation | Acceptable for MVP if not trivial. Document as known gap. |
| W-4 | 0 | `queryPortfolioWindow` tightly coupled to builder | Minimum fix: check-then-rebuild. Full decoupling in S9 if needed. |
| W-5 | 1 | Anthropic tool calling format differs from internal format | Adapter must translate `tool_use`/`tool_result` content blocks. Test against real API. |
| W-6 | 1 | Anthropic SDK version drift | Pin exact version. Verify TypeScript types before writing code. |
| W-7 | 1 | Tool executors returning mock data instead of real data | Executors must call analytics/Prisma against seed data. |
| W-8 | 1 | Decimal objects in tool results sent to LLM | Serialize all Decimals as formatted strings via shared formatters. |
| W-9 | 2 | System prompt fails intent categories | Common failures: scope too aggressive, staleness not checked, raw data echoed. Iterate before Phase 3. |
| W-10 | 1 | Chat route response not JSON-serializable | All Decimals as strings, all Dates as ISO strings. |
| W-11 | 2 | Seed data insufficient for all 5 intent categories | Verify: 2+ lots on one instrument, 1+ sell, 3+ stale quotes. Add transactions to seed if needed. |
| W-12 | 3 | Missing `"use client"` on advisor panel subtree | Entire advisor component tree must be client-side. Apply AD-S7c pattern. |

---

## 8. Commit Plan

| Phase | Commit Message | Author |
|-------|---------------|--------|
| 0 | `Session 8 Phase 0: Code review hardening (H-1 through H-5)` | Lead |
| 1 | `Session 8: Advisor backend — LLM adapter, tools, system prompt, API routes` | advisor-backend |
| 2 | (no commit — verification only, or minor prompt tweaks amended into Phase 1 commit) | Lead |
| 3 | `Session 8: Advisor frontend — chat panel, thread management, suggested prompts` | advisor-frontend |
| Integration | `Session 8: Lead integration — wiring, docs, final verification` | Lead |

---

## 9. Files Changed / Created

### Phase 0 (Lead)

| Action | File |
|--------|------|
| Modify | `apps/web/src/app/layout.tsx` (fonts) |
| Create | `apps/web/public/fonts/` or `apps/web/src/fonts/` (font files) |
| Modify | `apps/web/src/app/api/market/search/route.ts` |
| Modify | `apps/web/src/components/instruments/SymbolSearchInput.tsx` |
| Create | `packages/market-data/src/fetch-with-timeout.ts` |
| Modify | `packages/market-data/src/providers/fmp.ts` |
| Modify | `packages/market-data/src/providers/alpha-vantage.ts` |
| Modify | `packages/market-data/src/providers/stooq.ts` |
| Modify | `apps/web/src/app/api/transactions/route.ts` |
| Modify | `apps/web/src/app/api/transactions/[id]/route.ts` |
| Modify | `apps/web/src/app/api/instruments/[id]/route.ts` |
| Modify | `apps/web/src/app/api/portfolio/snapshot/route.ts` |
| Create | New test files for hardening |

### Phase 1 (advisor-backend)

| Action | File |
|--------|------|
| Create | `packages/advisor/src/llm-adapter.ts` |
| Create | `packages/advisor/src/anthropic-adapter.ts` |
| Create | `packages/advisor/src/tools/index.ts` |
| Create | `packages/advisor/src/tools/get-portfolio-snapshot.ts` |
| Create | `packages/advisor/src/tools/get-holding.ts` |
| Create | `packages/advisor/src/tools/get-transactions.ts` |
| Create | `packages/advisor/src/tools/get-quotes.ts` |
| Create | `packages/advisor/src/tool-loop.ts` |
| Create | `packages/advisor/src/system-prompt.ts` |
| Modify | `packages/advisor/src/index.ts` (re-exports) |
| Modify | `packages/advisor/package.json` (add @anthropic-ai/sdk) |
| Modify | `apps/web/src/app/api/advisor/chat/route.ts` |
| Modify | `apps/web/src/app/api/advisor/threads/route.ts` |
| Modify | `apps/web/src/app/api/advisor/threads/[id]/route.ts` |
| Create | `data/test/advisor-examples.md` |
| Create | New test files for advisor backend |

### Phase 3 (advisor-frontend)

| Action | File |
|--------|------|
| Create | `apps/web/src/components/advisor/AdvisorPanel.tsx` |
| Create | `apps/web/src/components/advisor/AdvisorHeader.tsx` |
| Create | `apps/web/src/components/advisor/AdvisorMessages.tsx` |
| Create | `apps/web/src/components/advisor/AdvisorInput.tsx` |
| Create | `apps/web/src/components/advisor/SuggestedPrompts.tsx` |
| Create | `apps/web/src/components/advisor/ToolCallIndicator.tsx` |
| Create | `apps/web/src/components/advisor/ThreadList.tsx` |
| Create | `apps/web/src/hooks/useAdvisor.ts` |
| Modify | `apps/web/src/components/shell/AdvisorFAB.tsx` (wire onClick) |
| Modify | `apps/web/src/components/shell/Shell.tsx` (mount AdvisorPanel) |
| Create | New test files for advisor frontend |

### Integration (Lead)

| Action | File |
|--------|------|
| Modify | `CLAUDE.md` |
| Modify | `AGENTS.md` |
| Modify | `HANDOFF.md` |
