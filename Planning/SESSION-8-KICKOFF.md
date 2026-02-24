# SESSION-8-KICKOFF.md — Hardening + LLM Advisor

**Paste-ready prompts for each phase of Session 8.**

Read `SESSION-8-PLAN.md` first for full context, watchpoints, and exit criteria.

---

## Phase 0 Prompt: Code Review Hardening (Lead)

Paste this to begin Phase 0.

```
You are the lead engineer on STALKER, a local-first portfolio tracker (Next.js + SQLite + Prisma). Session 8 begins with hardening fixes from a SWAT code review before building the LLM advisor.

Read these files first:
- SESSION-8-PLAN.md (full session plan — especially Section 2 and Watchpoints W-1 through W-4)
- SESSION-8-HARDENING-ADDENDUM.md (detailed fix descriptions for H-1 through H-5)
- CLAUDE.md, AGENTS.md, HANDOFF.md (project conventions and current state)

## Current State
- 407 tests passing, 0 failures
- `tsc --noEmit` clean
- `pnpm build` FAILS — Google Fonts DNS resolution (H-5 fixes this)
- Seed data: 28 instruments, 30 transactions, 8300+ price bars, 3 stale quotes
- Sessions 1–7 complete. All pages except advisor chat are functional.

## Your Task: Execute 5 hardening fixes in this exact order

### H-5: Local Fonts
- Download Crimson Pro (400/500/600), DM Sans (400/500/600), JetBrains Mono (400) as .woff2 files
- Place in `apps/web/public/fonts/` or `apps/web/src/fonts/`
- Replace `next/font/google` imports in `apps/web/src/app/layout.tsx` with `next/font/local`
- CRITICAL (W-1): The CSS variable names produced by next/font must match what Tailwind config references. Grep for `--font-` in tailwind.config to find the expected variable names. If next/font/local produces different names, update either the font config or Tailwind config so they match.
- Verify: `pnpm build` exits 0

### H-3: Search Route Response Shape
- Change `apps/web/src/app/api/market/search/route.ts` to return `Response.json({ results: [] })` instead of `Response.json([])`
- Add defensive parsing in `apps/web/src/components/instruments/SymbolSearchInput.tsx`: `const results = Array.isArray(data?.results) ? data.results : []`
- Add test: GET /api/market/search returns `{ results: [] }` with 200

### H-4: Provider Fetch Timeouts
- Create `packages/market-data/src/fetch-with-timeout.ts`: AbortController wrapper, 10s default timeout
- Replace bare `fetch()` calls in `packages/market-data/src/providers/fmp.ts`, `alpha-vantage.ts`, `stooq.ts`
- Verify existing provider tests still pass
- Add test: fetchWithTimeout rejects with AbortError after timeout

### H-1: Wire Snapshot Rebuild on Mutations (MOST IMPORTANT)
- FIRST: Run `grep -r "rebuildSnapshot\|buildPortfolioValue\|deleteFrom\|rebuildFrom" packages/analytics/src/` to find the exact rebuild function name and signature (W-2)
- In transaction POST handler (`apps/web/src/app/api/transactions/route.ts`): call rebuild from tradeAt after successful creation
- In transaction PUT handler (`apps/web/src/app/api/transactions/[id]/route.ts`): call rebuild from min(oldTradeAt, newTradeAt)
- In transaction DELETE handler: call rebuild from deleted transaction's tradeAt
- In instrument DELETE handler (`apps/web/src/app/api/instruments/[id]/route.ts`): full rebuild from earliest remaining transaction
- Remove ALL "skip rebuild" / "TODO: rebuild" comments from mutation routes
- Add integration tests: POST tx → GET snapshot → assert reflected; DELETE tx → GET snapshot → assert removed

### H-2: Make GET Snapshot Read-Only
- Depends on H-1 being complete
- Modify GET `/api/portfolio/snapshot` route to read cached snapshots without triggering rebuild
- FIRST: Check how `queryPortfolioWindow` and `buildPortfolioValueSeries` are coupled (W-4). If tightly coupled, the minimum acceptable fix is: check for existing snapshots first, only rebuild if none exist for the window.
- If no cached snapshots exist: compute on-the-fly from transactions + price bars WITHOUT writing to snapshot table
- Add test: mock deleteFrom/writeBatch, call GET, assert neither invoked when cached data exists

## Quality Gate (must pass before proceeding to Phase 1)
- `pnpm build` exits 0
- `tsc --noEmit` 0 errors
- All 407+ existing tests pass, 0 regressions
- 10–15 new hardening tests pass
- No mutation route contains skip-rebuild comments
- GET snapshot doesn't invoke delete/rebuild when cached data exists

Commit message: `Session 8 Phase 0: Code review hardening (H-1 through H-5)`
```

---

## Phase 1 Prompt: Advisor Backend (Teammate 1: `advisor-backend`)

Paste this after Phase 0 is complete and committed.

```
You are advisor-backend, a teammate engineer on STALKER. Your job is to build the complete LLM advisor backend: adapter, tools, execution loop, system prompt, API routes, and example conversations.

Read these files first:
- SESSION-8-PLAN.md (Section 3 — your full deliverable spec, Watchpoints W-5 through W-11)
- SPEC_v4.md §7.1–7.5 (Advisor spec), §8.5 (API endpoints), §11.3 (Error handling)
- STALKER-ux-ui-plan.md §10 (System prompt UX guidance)
- CLAUDE.md, AGENTS.md, HANDOFF.md (project conventions)

## Current State
- Phase 0 hardening is complete. Build passes. Tests pass.
- `packages/advisor/` exists as an empty shell from Session 1.
- Prisma schema has AdvisorThread and AdvisorMessage models.
- Seed data: 28 instruments, 30 transactions, 8300+ price bars, 3 stale quotes.
- `ANTHROPIC_API_KEY`, `LLM_PROVIDER=anthropic`, and `LLM_MODEL` are set in `.env.local`.

## Your Filesystem Scope
CREATE/MODIFY ONLY these paths:
- `packages/advisor/src/**`
- `packages/advisor/package.json`
- `packages/advisor/__tests__/**`
- `apps/web/src/app/api/advisor/**`
- `apps/web/__tests__/api/advisor/**` (if test dir exists here)
- `data/test/advisor-examples.md`

DO NOT TOUCH: components, hooks, non-advisor API routes, analytics package source, market-data package source.

## Deliverables (in build order)

### 1. LLM Adapter (`packages/advisor/src/llm-adapter.ts` + `anthropic-adapter.ts`)
- Install: `pnpm add @anthropic-ai/sdk --filter @stalker/advisor` — PIN EXACT VERSION (W-6)
- Interface: LLMAdapter with chat(messages, tools, options) → LLMResponse
- Anthropic implementation using `client.messages.create()` (NOT streaming — SD decision)
- CRITICAL (W-5): Anthropic uses `tool_use` content blocks and expects `tool_result` in user messages. Your adapter must translate between the internal Message format and Anthropic's format. The internal format uses role='tool' messages — the adapter must convert these to Anthropic's expected format (user message with tool_result content block).
- Read ANTHROPIC_API_KEY and LLM_MODEL from process.env
- Default max_tokens: 4096

### 2. Tool Definitions + Executors (`packages/advisor/src/tools/`)
Four tools: getPortfolioSnapshot, getHolding, getTransactions, getQuotes.
See SESSION-8-PLAN.md §3.2 for exact JSON Schema definitions.
- CRITICAL (W-7): Executors must call REAL analytics/Prisma functions against the database, not mock data. Import from @stalker/analytics and use Prisma client directly. The seed data has 28 instruments to test against.
- CRITICAL (W-8): All Decimal values in tool results MUST be serialized as formatted strings. The LLM cannot reason about raw Decimal objects. Use the formatters in packages/shared/ (formatCurrency, formatQuantity, formatPercent or equivalent). Check what formatters exist with: `grep -r "export.*format" packages/shared/src/`

### 3. Tool Execution Loop (`packages/advisor/src/tool-loop.ts`)
- Loop: call LLM → if tool_calls, execute tools, append results, call LLM again → max 5 iterations
- If tool executor throws: catch error, return error as tool result string. Do NOT throw out of the loop.
- If adapter throws (API error): propagate up to caller.
- Return: all messages generated (assistant + tool) and the final text response.

### 4. System Prompt (`packages/advisor/src/system-prompt.ts`)
This is the MOST IMPORTANT deliverable. The prompt must produce non-trivial analytical responses for 5 intent categories. Read SPEC §7.5 and UX Plan §10 carefully.

Required elements:
1. Role: "You are a portfolio analyst assistant with read-only access to the user's portfolio data."
2. Capabilities: Describe what each of the 4 tools provides.
3. Synthesis directive: Compare across holdings, compute derived metrics, don't just echo raw numbers.
4. Staleness protocol: Check getQuotes asOf timestamps before price-dependent analysis. Disclose stale data.
5. Scope boundaries: No recommendations, no predictions, no tax advice. Reframe as analysis.
6. Response style: Precise, direct, use specific numbers, format dollars and percentages.

WATCHPOINT (W-9): Common failure modes — scope boundary too aggressive (LLM refuses to compute tax scenarios), staleness not checked, raw data echoed instead of synthesized. The prompt will be tested against all 5 intent categories in Phase 2 before the frontend is built. It must pass.

### 5. API Routes
- POST `/api/advisor/chat`: See SESSION-8-PLAN.md §3.5 for full spec. Create thread if no threadId. Load last 50 messages. Run tool loop. Persist all messages. Return generated messages.
  - Missing API key → 503 with `{ error, code: 'LLM_NOT_CONFIGURED' }`
  - LLM error → 502 with `{ error, code: 'LLM_ERROR' }`
  - CRITICAL (W-10): Response must be fully JSON-serializable. No Decimal objects, no Date objects — strings only.
- GET `/api/advisor/threads`: List threads, sorted by updatedAt desc, with messageCount.
- GET `/api/advisor/threads/[id]`: Thread + all messages.
- DELETE `/api/advisor/threads/[id]`: Delete thread + messages, return 204.

### 6. Example Conversations (`data/test/advisor-examples.md`)
Five conversations, one per intent category (Spec §7.5):
1. Cross-holding synthesis
2. Tax-aware reasoning
3. Performance attribution
4. Concentration awareness
5. Staleness/data quality

Each: user query → expected tool calls → representative advisor response.

## Tests (target: 25–30 new)
- Anthropic adapter: 5–8 (mock SDK responses)
- Tool executors: 8–12 (each tool against seed data patterns)
- Tool loop: 5–8 (mock adapter, test direct response / tool chains / errors / max iterations)
- API routes: 4–6 (thread CRUD, chat with mock adapter, missing key → 503)

## Quality Checks Before Committing
- `tsc --noEmit` 0 errors
- `pnpm test` all pass, 0 regressions
- New tests: 25+
- All tool executors tested against realistic data shapes (not just empty mocks)

Commit message: `Session 8: Advisor backend — LLM adapter, tools, system prompt, API routes`
```

---

## Phase 2: Lead Verification (No Prompt Needed)

Phase 2 is manual verification by the lead. No teammate prompt is needed. The lead:

1. Starts the dev server: `pnpm dev`
2. Sends 5 curl requests to `POST /api/advisor/chat`, one per intent category
3. Inspects tool calls and response quality against the pass criteria in SESSION-8-PLAN.md §4
4. If any category fails: adjusts system prompt and re-tests
5. Signs off when all 5 pass

**Verification curl template:**

```bash
# Intent 1: Cross-holding synthesis
curl -s -X POST http://localhost:3000/api/advisor/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Which positions are dragging my portfolio down over the last 90 days?"}' | jq .

# Intent 2: Tax-aware reasoning
curl -s -X POST http://localhost:3000/api/advisor/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "If I sold my oldest VTI lots, what would the realized gain be?"}' | jq .

# Intent 3: Performance attribution
curl -s -X POST http://localhost:3000/api/advisor/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "How much of my total gain came from my top holding versus everything else?"}' | jq .

# Intent 4: Concentration awareness
curl -s -X POST http://localhost:3000/api/advisor/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Am I overexposed to any single holding?"}' | jq .

# Intent 5: Staleness
curl -s -X POST http://localhost:3000/api/advisor/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Are any of my prices stale?"}' | jq .
```

**W-11 check:** Before running verification, confirm seed data has:
```bash
# At least one instrument with 2+ buy transactions (for lot reasoning)
# At least one instrument with a SELL (for realized PnL)
# At least 3 stale quotes (already confirmed per AD-S6d)
```

---

## Phase 3 Prompt: Advisor Frontend (Teammate 2: `advisor-frontend`)

Paste this after Phase 2 verification is complete.

```
You are advisor-frontend, a teammate engineer on STALKER. Your job is to build the advisor chat panel UI — the slide-out panel, message rendering, thread management, suggested prompts, and all empty/error states.

Read these files first:
- SESSION-8-PLAN.md (Section 5 — your full deliverable spec, Watchpoint W-12)
- STALKER-ux-ui-plan.md §3.6 (Advisor Chat panel specs), §10 (Prompt UX guidance)
- SPEC_v4.md §9.5 (Advisor Chat page spec), §9.6 (Empty states)
- CLAUDE.md, AGENTS.md, HANDOFF.md (project conventions)

## Current State
- Phase 0 hardening + Phase 1 advisor backend are complete.
- The advisor API works: POST /api/advisor/chat sends messages and receives analytical responses with tool calls.
- The `AdvisorFAB` component exists in `apps/web/src/components/shell/` — you need to wire its onClick.
- `ToastProvider` is already in Shell (from Session 7).
- Design tokens, base components, and the full dark theme are in place from Sessions 5–6.

## Your Filesystem Scope
CREATE/MODIFY ONLY these paths:
- `apps/web/src/components/advisor/**` (create this directory)
- `apps/web/src/hooks/useAdvisor.ts`
- `apps/web/src/components/shell/AdvisorFAB.tsx` (wire onClick)
- `apps/web/src/components/shell/Shell.tsx` (mount AdvisorPanel)
- `apps/web/__tests__/components/advisor/**`

DO NOT TOUCH: packages/advisor (backend), API routes, non-advisor components (except Shell and AdvisorFAB as noted).

## CRITICAL: `"use client"` Boundary (W-12)
The entire advisor panel subtree MUST be marked "use client". This component manages local state (open/closed, thread, messages, loading). Do NOT let any server component try to render advisor components.

Pattern (from Session 7 lesson AD-S7c):
- AdvisorPanel.tsx has `"use client"` at top
- Shell.tsx imports AdvisorPanel (Shell is already "use client")
- All advisor child components can use hooks freely

## Deliverables

### 1. State Management Hook (`apps/web/src/hooks/useAdvisor.ts`)
Manages: threads[], activeThreadId, messages[], isLoading, error, isConfigured
Actions: sendMessage(text), loadThread(id), loadThreads(), newThread(), deleteThread(id)

sendMessage behavior:
1. Set isLoading = true
2. Append user message to messages[] optimistically (renders immediately)
3. POST /api/advisor/chat with { threadId: activeThreadId, message: text }
4. On success: append all returned messages. Set activeThreadId if new thread.
5. On error: if code === 'LLM_NOT_CONFIGURED', set isConfigured = false. Otherwise set error message.
6. Set isLoading = false

### 2. AdvisorPanel (`apps/web/src/components/advisor/AdvisorPanel.tsx`)
- Receives `isOpen` and `onClose` props (or manages state internally with FAB wiring)
- Fixed position, right side, width 448px, full height, z-50
- bg-surface-raised, shadow-2xl
- Backdrop: bg-black/30, click to close
- Transition: translate-x transform, 300ms
- Accessibility: role="dialog", aria-label="Portfolio Advisor"
- Escape key closes panel
- Contains: AdvisorHeader, AdvisorMessages (or empty states), AdvisorInput

### 3. AdvisorHeader
- Title: "Advisor" in Crimson Pro (font-display), text-heading
- Buttons: [New Thread] bg-interactive small, [Threads ▾] toggles ThreadList dropdown, [✕] closes panel

### 4. AdvisorMessages
- Scrollable flex-1 overflow-y-auto
- Auto-scroll to bottom on new message (useEffect + ref.scrollIntoView)
- User messages: right-aligned, bg-interactive, rounded-lg p-3
- Assistant messages: left-aligned, bg-surface-overlay, border border-surface-border, rounded-lg p-3
- Tool messages: rendered as ToolCallIndicator

### 5. ToolCallIndicator
- Collapsed: icon + "Looking up portfolio summary..." (or holding/transactions/prices based on tool name) in text-muted 0.8rem
- Expanded (click to toggle): monospace text-subtle showing tool name, args, truncated result
- Tool display name mapping:
  - getPortfolioSnapshot → "Looking up portfolio summary..."
  - getHolding → "Looking up {symbol} position..."
  - getTransactions → "Checking transaction history..."
  - getQuotes → "Checking current prices..."

### 6. AdvisorInput
- Fixed at panel bottom, border-t, bg-surface-raised, p-3
- Textarea: bg-surface, rounded-lg, placeholder "Type a message about your portfolio..."
- Auto-resize up to 4 lines
- Enter to send (Shift+Enter for newline)
- Send button: Lucide SendHorizonal icon, bg-interactive, disabled when empty or loading
- Loading: input greyed, send button shows Loader2 spinner

### 7. SuggestedPrompts
- Show when thread has no messages
- Three clickable cards:
  1. "Which positions are dragging my portfolio down this quarter?"
  2. "What would the realized gain be if I sold my oldest lots?"
  3. "Am I overexposed to any single holding?"
- Style: bg-surface, border border-surface-border, rounded-lg p-3
- Hover: bg-surface-overlay
- Click: sends prompt as first message

### 8. ThreadList
- Dropdown below Threads button
- Items from GET /api/advisor/threads (sorted updatedAt desc)
- Each: title (truncated), date (text-subtle)
- Click loads thread via GET /api/advisor/threads/[id]
- Empty: "No previous conversations."

### 9. Empty States
- No API key: Crimson Pro "Advisor Setup Required" + instructions showing env var names + "restart server". No input field.
- No holdings (GET /api/instruments returns []): "Add some holdings first so the advisor has something to work with." Link to dashboard. No input.
- LLM error (502): Render assistant-styled message in text-muted: "I encountered an error processing your request. Please try again."

### 10. Wire to Shell
- In AdvisorFAB.tsx: wire onClick to toggle panel open state
- In Shell.tsx: mount <AdvisorPanel> (it's already a "use client" component)
- Panel state can live in Shell or in a shared context — your choice

## Design Token Reference (from apps/web/tailwind.config)
- surface: #0F1A24 (page bg)
- surface-raised: #162029 (panels, cards)
- surface-overlay: #1E2D3A (hover, assistant bubbles)
- surface-border: #2A3A47 (all borders)
- interactive: #1E3A52 (buttons, user bubbles)
- interactive-hover: #264A66
- text-heading: #E8F0F6
- text: #C8D6E0 (body)
- text-muted: #8A9DAD
- text-subtle: #5A6F80
- font-display: Crimson Pro (headings)
- font-body: DM Sans (body)
- font-mono: JetBrains Mono (code, tool details)

## Tests (target: 10–15 new)
- useAdvisor hook: 4–6 (mock fetch: send message, load thread, error states)
- Component rendering: 4–6 (SuggestedPrompts cards, ToolCallIndicator toggle, empty states)
- Integration: 2–3 (panel open/close, message render after send with mocked API)

## Quality Checks Before Committing
- `tsc --noEmit` 0 errors
- `pnpm test` all pass, 0 regressions
- New tests: 10+
- Panel opens from FAB click
- Escape closes panel
- Messages render correctly by role (user right, assistant left, tool as indicator)
- Empty states render for: no API key, no holdings, new thread (suggested prompts)

Commit message: `Session 8: Advisor frontend — chat panel, thread management, suggested prompts`
```

---

## Integration Prompt (Lead)

Paste this after all phases are committed.

```
You are the lead engineer on STALKER. Session 8 phases 0–3 are complete. Perform final integration and documentation.

## Integration Checklist

1. Verify end-to-end: Open browser → click AdvisorFAB → panel opens → type question → response renders with tool indicators → thread persists on reload.

2. Verify all 5 intent categories work through the UI (not just curl). Suggested prompts should cover 3 of the 5.

3. Check visual consistency:
   - User bubbles: bg-interactive, right-aligned
   - Assistant bubbles: bg-surface-overlay, left-aligned
   - Tool indicators: collapsible, correct display names
   - Panel matches dark theme

4. Check edge cases:
   - Close panel mid-response (should not crash)
   - Send empty message (should be prevented)
   - Rapid-fire messages (should queue, not duplicate)
   - Switch threads while loading (should cancel or handle gracefully)

5. Update documentation:
   - CLAUDE.md: Add advisor package to architecture, document "use client" boundary pattern for advisor
   - AGENTS.md: Add advisor package details, Anthropic SDK version
   - HANDOFF.md: Session 8 results, current state

6. Run full quality gate:
   - `tsc --noEmit` 0 errors
   - `pnpm test` all pass
   - `pnpm build` exits 0
   - Count new tests (target: 45+ across all phases → total 460+)

Commit message: `Session 8: Lead integration — wiring, docs, final verification`
```
