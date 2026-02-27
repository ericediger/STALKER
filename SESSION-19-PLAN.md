# SESSION-19-PLAN.md — Advisor Context Window Management

**Date:** 2026-02-27
**Input:** SESSION-18-REPORT.md, HANDOFF.md, KNOWN-LIMITATIONS.md, SPEC_v4.md §7.2–7.4, CLAUDE.md
**Session Type:** Feature Build (Backend + Frontend)
**Team Shape:** Solo
**Estimated Duration:** ~2–3 hours

---

## 0. Session 18 Assessment

Session 18 was a clean sweep — all 6 phases delivered, 0 scope cuts, 683 tests passing, and the visual UAT punch list is fully resolved. The 10-year backfill decision (AD-S18-1) was the right call; it eliminates an entire class of "why is my chart empty" bugs. The Phase 2 investigation was honest — the hypothesis was wrong, but the defensive retry pattern is the correct mitigation for transient SQLite contention.

The project is now in the final stretch. 12 of 14 post-MVP priorities are complete. Two items remain:

| # | Item | Priority | Rationale |
|---|------|----------|-----------|
| 13 | **Advisor context window management** | **High** | KL-2/KL-3 are the only functional limitations remaining. Long advisor threads will hit the Anthropic context limit and fail opaquely. |
| 14 | Responsive refinements | **Low** | User is on desktop. Explicitly deferred since S15 assessment. |

**Recommendation:** Session 19 tackles advisor context window management (KL-2/KL-3). This is the last feature-level gap. After this, the system has no known functional limitations — only UX polish items.

---

## 1. Read First

1. `CLAUDE.md` — Architecture rules, Decimal precision, advisor package structure
2. `AGENTS.md` — Package inventory, test patterns, tech stack
3. `HANDOFF.md` — Current state (post-Session 18)
4. `KNOWN-LIMITATIONS.md` — KL-2 and KL-3 are the targets
5. This plan

---

## 2. Context

### The Problem

The advisor currently sends **all messages** from a thread to the LLM on every turn. With 5 tools that return rich portfolio data (83 instruments, FIFO lots, transaction histories), a single tool-heavy exchange can consume 5,000–15,000 tokens. After 8–12 exchanges, a thread will exceed Claude's context window and the API will return an error. The user sees a generic failure and has to manually create a new thread.

### What the Spec Says

From Spec §7.3:
> *Context window management: send last N messages. If thread is long, prepend the `summaryText` from the thread record.*
> *Summary generation is post-MVP (manual thread clearing is fine for now).*

The spec designed two mechanisms:
1. **Message windowing** — Send only the most recent N messages, not all of them
2. **Thread summary** — The `summaryText` column on `AdvisorThread` provides context compression for older messages

KL-2 says "context window not managed." KL-3 says "`summaryText` column exists but is never populated." Both are resolved by this session.

### What Exists Today

| Component | Current Behavior |
|-----------|-----------------|
| `AdvisorThread.summaryText` | Column exists in Prisma schema, always `null` |
| `POST /api/advisor/chat` | Loads **all** messages for thread, sends all to LLM |
| `LLMAdapter.chat()` | Returns `usage: { inputTokens, outputTokens }` — available but unused |
| `AdvisorMessage` | Stores all messages including tool calls/results |
| `tool-loop.ts` | Max 5 iterations, returns all generated messages |

### Architecture Approach

The context window problem has three layers. This session implements all three:

```
Layer 1: Token Counting        — Know how big the context is before sending
Layer 2: Message Windowing      — Trim old messages when context is too large  
Layer 3: Summary Generation     — Compress trimmed messages into summaryText
```

**Why all three?** Token counting without windowing just tells you when you'll fail. Windowing without summaries loses context permanently. Summaries without counting can't trigger at the right time. The three work together as a feedback loop.

---

## 3. Phase 1: Token Estimation Utility (Foundation)

### Why Not Exact Counting?

Exact token counting requires the model's tokenizer (tiktoken for OpenAI, Anthropic's internal tokenizer). These are external dependencies, model-specific, and add complexity. For context window management, a conservative estimate is sufficient — we're managing a budget, not billing.

### Step 1: Create Token Estimation Module

Create `packages/advisor/src/token-estimator.ts`:

```typescript
/**
 * Conservative token estimation for context window management.
 * 
 * Rule of thumb: ~4 characters per token for English text.
 * We use 3.5 chars/token to be conservative (overestimates slightly,
 * which means we trim earlier rather than later — safe failure mode).
 * 
 * Tool call JSON and structured data is less token-efficient than prose,
 * so we use 3.0 chars/token for tool messages.
 */

const CHARS_PER_TOKEN_TEXT = 3.5;
const CHARS_PER_TOKEN_STRUCTURED = 3.0;

export function estimateTokens(text: string, isStructured = false): number {
  const ratio = isStructured ? CHARS_PER_TOKEN_STRUCTURED : CHARS_PER_TOKEN_TEXT;
  return Math.ceil(text.length / ratio);
}

export function estimateMessageTokens(message: { 
  role: string; 
  content: string | null;
  toolCalls?: unknown;
  toolResults?: unknown;
}): number {
  let total = 0;
  
  // Content text
  if (message.content) {
    total += estimateTokens(message.content, message.role === 'tool');
  }
  
  // Tool calls (JSON)
  if (message.toolCalls) {
    total += estimateTokens(JSON.stringify(message.toolCalls), true);
  }
  
  // Tool results (JSON)
  if (message.toolResults) {
    total += estimateTokens(JSON.stringify(message.toolResults), true);
  }
  
  // Per-message overhead (role, formatting)
  total += 4;
  
  return total;
}

export function estimateConversationTokens(
  messages: Array<{ role: string; content: string | null; toolCalls?: unknown; toolResults?: unknown }>
): number {
  return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
}
```

### Step 2: Define Context Budget Constants

Create `packages/advisor/src/context-budget.ts`:

```typescript
/**
 * Context window budget allocation for the advisor.
 * 
 * Claude Sonnet has a 200K token context window, but we budget conservatively:
 * - System prompt + tool definitions: ~3,000 tokens (measured)
 * - Summary prefix: ~500 tokens (when present)
 * - Response headroom: 16,000 tokens (max_tokens setting)
 * - Safety margin: 5,000 tokens (estimation error buffer)
 * 
 * Available for conversation history: 200,000 - 3,000 - 500 - 16,000 - 5,000 = 175,500
 * 
 * We round down to 150,000 to be safe. This is generous — most threads
 * won't get near this. The windowing exists for the edge case.
 */

export const CONTEXT_BUDGET = {
  /** Total context window for the model */
  MODEL_CONTEXT_WINDOW: 200_000,
  
  /** Estimated tokens for system prompt + tool definitions */
  SYSTEM_PROMPT_RESERVE: 3_500,
  
  /** Max tokens for summary text prepended to windowed conversations */
  SUMMARY_RESERVE: 800,
  
  /** Max tokens allocated for LLM response (matches max_tokens in adapter) */
  RESPONSE_RESERVE: 16_000,
  
  /** Buffer for estimation inaccuracy */
  SAFETY_MARGIN: 5_000,
  
  /** Available tokens for conversation messages */
  get MESSAGE_BUDGET(): number {
    return this.MODEL_CONTEXT_WINDOW 
      - this.SYSTEM_PROMPT_RESERVE 
      - this.SUMMARY_RESERVE 
      - this.RESPONSE_RESERVE 
      - this.SAFETY_MARGIN;
  },
  
  /** Threshold for triggering summary generation (% of MESSAGE_BUDGET used) */
  SUMMARY_TRIGGER_RATIO: 0.7,
  
  /** Target message count to keep in window after trimming */
  MIN_RECENT_MESSAGES: 6,
  
  /** Maximum messages to summarize in one pass */
  MAX_MESSAGES_PER_SUMMARY: 30,
} as const;
```

**Architecture Decision AD-S19-1:** Token estimation uses character-ratio heuristic (3.0–3.5 chars/token), not a model-specific tokenizer. Overestimation is the safe failure mode — it means we trim slightly earlier than necessary, never later. The `LLMResponse.usage` field provides actual token counts after each call, which can be used for calibration logging but are not used for windowing decisions (they arrive too late — we need to know *before* sending).

### Tests

| Test | What It Verifies |
|------|-----------------|
| `estimateTokens` returns reasonable count for English text | Baseline accuracy |
| `estimateTokens` uses tighter ratio for structured data | JSON gets higher estimate |
| `estimateMessageTokens` sums content + toolCalls + toolResults | All message parts counted |
| `estimateConversationTokens` sums across messages | Aggregate works |
| `CONTEXT_BUDGET.MESSAGE_BUDGET` computes correctly | Derived constant |
| `MESSAGE_BUDGET` is positive and > 100,000 | Sanity check |

**Target: 6 tests**

---

## 4. Phase 2: Message Windowing (Core Mechanism)

### Step 1: Create Context Window Manager

Create `packages/advisor/src/context-window.ts`:

```typescript
import { estimateMessageTokens, estimateConversationTokens } from './token-estimator';
import { CONTEXT_BUDGET } from './context-budget';

interface WindowableMessage {
  id: string;
  role: string;
  content: string | null;
  toolCalls?: unknown;
  toolResults?: unknown;
  createdAt: Date;
}

interface WindowResult {
  /** Messages to send to the LLM */
  messages: WindowableMessage[];
  /** Messages that were trimmed (oldest first) */
  trimmed: WindowableMessage[];
  /** Whether summary generation should be triggered */
  shouldGenerateSummary: boolean;
  /** Estimated token count of windowed messages */
  estimatedTokens: number;
}

/**
 * Selects which messages to include in the LLM context window.
 * 
 * Algorithm:
 * 1. Start with all messages
 * 2. If total estimated tokens <= MESSAGE_BUDGET, send all
 * 3. Otherwise, keep the most recent N messages that fit within budget
 * 4. Never trim below MIN_RECENT_MESSAGES
 * 5. Always trim at conversation boundaries (user message starts a turn)
 * 
 * Tool calls and their results are always kept together as a unit.
 * A "turn" is: user message + [assistant response + tool calls + tool results]*
 */
export function windowMessages(
  allMessages: WindowableMessage[],
  summaryText: string | null
): WindowResult {
  const totalTokens = estimateConversationTokens(allMessages);
  const budget = CONTEXT_BUDGET.MESSAGE_BUDGET;
  
  // Fast path: everything fits
  if (totalTokens <= budget) {
    return {
      messages: allMessages,
      trimmed: [],
      shouldGenerateSummary: totalTokens >= budget * CONTEXT_BUDGET.SUMMARY_TRIGGER_RATIO,
      estimatedTokens: totalTokens,
    };
  }
  
  // Need to trim. Work backwards from the most recent message.
  // Group messages into "turns" (user message + all responses until next user message)
  const turns = groupIntoTurns(allMessages);
  
  // Keep adding turns from most recent until we exceed budget
  let tokenCount = 0;
  let keepFromTurn = turns.length;
  
  for (let i = turns.length - 1; i >= 0; i--) {
    const turnTokens = turns[i].reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
    if (tokenCount + turnTokens > budget && keepFromTurn < turns.length) {
      break; // This turn would exceed budget
    }
    tokenCount += turnTokens;
    keepFromTurn = i;
  }
  
  // Ensure we keep at least MIN_RECENT_MESSAGES worth of turns
  const minTurnsToKeep = Math.ceil(CONTEXT_BUDGET.MIN_RECENT_MESSAGES / 2); // ~3 turns = 6 messages
  if (turns.length - keepFromTurn < minTurnsToKeep) {
    keepFromTurn = Math.max(0, turns.length - minTurnsToKeep);
    tokenCount = turns.slice(keepFromTurn).flat()
      .reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
  }
  
  const keptMessages = turns.slice(keepFromTurn).flat();
  const trimmedMessages = turns.slice(0, keepFromTurn).flat();
  
  return {
    messages: keptMessages,
    trimmed: trimmedMessages,
    shouldGenerateSummary: trimmedMessages.length > 0 && !summaryText,
    estimatedTokens: tokenCount,
  };
}

/**
 * Groups messages into conversational turns.
 * A turn starts with a user message and includes all subsequent
 * assistant/tool messages until the next user message.
 */
function groupIntoTurns(messages: WindowableMessage[]): WindowableMessage[][] {
  const turns: WindowableMessage[][] = [];
  let currentTurn: WindowableMessage[] = [];
  
  for (const msg of messages) {
    if (msg.role === 'user' && currentTurn.length > 0) {
      turns.push(currentTurn);
      currentTurn = [];
    }
    currentTurn.push(msg);
  }
  
  if (currentTurn.length > 0) {
    turns.push(currentTurn);
  }
  
  return turns;
}

export { groupIntoTurns }; // Exported for testing
```

**Architecture Decision AD-S19-2:** Message windowing trims at turn boundaries, not individual messages. A "turn" is a user message plus all assistant/tool responses until the next user message. This prevents orphaned tool results (tool result without its call) or orphaned assistant messages (response without the question that prompted it). The LLM always sees complete conversational exchanges.

**Architecture Decision AD-S19-3:** When messages are trimmed and no summary exists, `shouldGenerateSummary` is set to `true`. The chat route uses this signal to trigger async summary generation after returning the response to the user. Summary generation is non-blocking — the user gets their answer immediately.

### Tests

| Test | What It Verifies |
|------|-----------------|
| All messages returned when under budget | Fast path works |
| Messages trimmed from oldest when over budget | Windowing direction correct |
| Trimming happens at turn boundaries | No orphaned tool results |
| At least MIN_RECENT_MESSAGES kept | Floor enforced |
| `shouldGenerateSummary` true when messages trimmed + no summary | Trigger logic |
| `shouldGenerateSummary` false when messages trimmed + summary exists | Don't re-summarize |
| `groupIntoTurns` groups correctly | Turn boundary detection |
| Tool calls and results stay in same turn | Atomic tool handling |
| Empty message list returns empty | Edge case |

**Target: 9 tests**

---

## 5. Phase 3: Summary Generation (Context Compression)

### Step 1: Create Summary Generator

Create `packages/advisor/src/summary-generator.ts`:

```typescript
import type { LLMAdapter, Message } from './llm-adapter';
import { CONTEXT_BUDGET } from './context-budget';

const SUMMARY_SYSTEM_PROMPT = `You are a conversation summarizer for a portfolio analysis advisor.

Summarize the conversation below into a concise briefing that captures:
1. Key portfolio questions the user asked
2. Important findings or insights the advisor provided
3. Specific instruments, lots, or metrics discussed
4. Any ongoing analysis threads or follow-up items

Keep the summary under 400 words. Use factual statements, not conversational tone.
Do not include greetings, pleasantries, or meta-commentary about the conversation.
Focus on information that would be needed to continue the conversation coherently.`;

/**
 * Generates a summary of trimmed messages to preserve context.
 * 
 * This is called asynchronously after a windowed response is returned.
 * The summary is stored in AdvisorThread.summaryText and prepended
 * to future LLM calls as a "Previously discussed:" preamble.
 */
export async function generateSummary(
  adapter: LLMAdapter,
  messagesToSummarize: Message[],
  existingSummary: string | null
): Promise<string> {
  // Build the content to summarize
  const conversationText = messagesToSummarize
    .filter(m => m.role === 'user' || (m.role === 'assistant' && m.content))
    .map(m => `${m.role === 'user' ? 'User' : 'Advisor'}: ${m.content}`)
    .join('\n\n');
  
  const prompt = existingSummary
    ? `Here is the existing summary of earlier conversation:\n\n${existingSummary}\n\n---\n\nHere are additional messages to incorporate into an updated summary:\n\n${conversationText}\n\nProduce an updated summary that merges the existing summary with the new messages.`
    : `Summarize this conversation:\n\n${conversationText}`;

  const response = await adapter.chat(
    [{ role: 'user', content: prompt }],
    [], // No tools for summary generation
    { maxTokens: 800 }
  );
  
  return response.content || existingSummary || '';
}

/**
 * Formats the summary text as a preamble for the LLM context.
 */
export function formatSummaryPreamble(summaryText: string): string {
  return `[Context from earlier in this conversation]\n${summaryText}\n[End of earlier context — recent messages follow]`;
}
```

**Architecture Decision AD-S19-4:** Summary generation uses the same LLM adapter but with a minimal prompt (no tools, no system prompt). This keeps summary costs low (~1,000 input + ~800 output tokens per summary). Summaries are rolling — when a second trim happens, the new summary incorporates the old one, so the `summaryText` column always contains the full compressed history.

**Architecture Decision AD-S19-5:** Summary generation is fire-and-forget from the user's perspective. The chat route kicks it off after returning the response. If summary generation fails (LLM error, timeout), the thread continues without a summary — windowing still works, the user just loses older context instead of having it compressed. This is a graceful degradation, not a failure.

### Tests

| Test | What It Verifies |
|------|-----------------|
| Generates summary from messages (mock LLM) | Happy path |
| Merges with existing summary when present | Rolling summary |
| Returns existing summary if LLM returns null | Graceful fallback |
| `formatSummaryPreamble` wraps text with context markers | Correct formatting |
| Filters out tool messages from summary input | Only user/assistant content |

**Target: 5 tests**

---

## 6. Phase 4: Wire into Chat Route (Integration)

### Step 1: Update the Chat Route

Modify `apps/web/src/app/api/advisor/chat/route.ts`:

**Current flow:**
```
1. Load all thread messages
2. Send all to tool-loop (which sends to LLM)
3. Store response messages
4. Return response
```

**New flow:**
```
1. Load all thread messages
2. Window messages (Phase 2) → get trimmed set + shouldGenerateSummary
3. If thread has summaryText, prepend as first user message
4. Send windowed messages to tool-loop
5. Store response messages
6. Return response to client
7. If shouldGenerateSummary, fire-and-forget summary generation
8. Store summary in thread.summaryText
```

### Step 2: Modify Message Preparation

The key change is in how messages are prepared before being passed to the tool loop.

```typescript
// In the chat route handler:

// 1. Load all messages
const allMessages = await prisma.advisorMessage.findMany({
  where: { threadId },
  orderBy: { createdAt: 'asc' },
});

// 2. Load thread for summary
const thread = await prisma.advisorThread.findUnique({ where: { id: threadId } });

// 3. Window messages
const windowResult = windowMessages(allMessages, thread?.summaryText ?? null);

// 4. Build LLM message array
const llmMessages: Message[] = [];

// 4a. Prepend summary if exists
if (thread?.summaryText) {
  llmMessages.push({
    role: 'user',
    content: formatSummaryPreamble(thread.summaryText),
  });
  llmMessages.push({
    role: 'assistant', 
    content: 'Understood. I have context from our earlier discussion. How can I help?',
  });
}

// 4b. Add windowed messages (converted to LLM Message format)
llmMessages.push(...windowResult.messages.map(toMessage));

// 5. Run tool loop with windowed messages
const response = await toolLoop(adapter, llmMessages, tools);

// 6. Store and return response (unchanged)

// 7. Fire-and-forget summary if needed
if (windowResult.shouldGenerateSummary && windowResult.trimmed.length > 0) {
  generateSummary(adapter, windowResult.trimmed.map(toMessage), thread?.summaryText ?? null)
    .then(async (summary) => {
      await prisma.advisorThread.update({
        where: { id: threadId },
        data: { summaryText: summary },
      });
    })
    .catch((err) => {
      console.error(`[advisor] Summary generation failed for thread ${threadId}:`, err);
    });
}
```

### Step 3: Update Tool Loop Signature (if needed)

Check if `tool-loop.ts` accepts an arbitrary message array or if it constructs its own. It should accept the windowed message array and pass it through to the adapter.

```bash
grep -n "export.*function.*toolLoop\|export.*function.*runToolLoop" packages/advisor/src/tool-loop.ts
```

If the tool loop builds its own message array from raw thread data, refactor it to accept a pre-built `Message[]` array. This is a small change — the tool loop shouldn't be responsible for message selection.

### Step 4: Export New Modules

Update `packages/advisor/src/index.ts` barrel export:

```typescript
export { estimateTokens, estimateMessageTokens, estimateConversationTokens } from './token-estimator';
export { CONTEXT_BUDGET } from './context-budget';
export { windowMessages } from './context-window';
export { generateSummary, formatSummaryPreamble } from './summary-generator';
```

### Tests

| Test | What It Verifies |
|------|-----------------|
| Chat route sends windowed messages when thread is long | Integration |
| Summary preamble prepended when `summaryText` exists | Summary injection |
| Summary generation triggered when `shouldGenerateSummary` is true | Trigger wiring |
| Summary stored in thread after generation | Persistence |
| Summary generation failure doesn't break chat response | Fire-and-forget resilience |
| Short threads send all messages (no windowing) | No regression |

**Target: 6 tests**

---

## 7. Phase 5: Frontend Indicators (UX)

### Step 1: Thread Context Indicator

When a thread has been summarized (i.e., `summaryText` is not null), the UI should indicate this to the user so they understand the advisor is working with compressed context.

**Option A (Minimal — recommended):** Add a small info banner at the top of the message list when messages have been trimmed:

```
ℹ️ Older messages in this thread have been summarized to maintain conversation quality.
```

This appears above the first visible message. It's dismissible and non-intrusive.

**Implementation:** The `GET /api/advisor/threads/[id]` endpoint already returns the thread. Add a `hasSummary: boolean` field (derived from `summaryText !== null`) to the response. The `AdvisorMessages` component renders the banner conditionally.

### Step 2: Update Thread Detail Response

Modify the thread detail endpoint to include context metadata:

```typescript
// In GET /api/advisor/threads/[id]/route.ts
return NextResponse.json({
  ...thread,
  messages,
  hasSummary: thread.summaryText !== null,
  // Don't expose the raw summaryText — it's internal to the LLM context
});
```

### Step 3: Update AdvisorMessages Component

```typescript
// In AdvisorMessages.tsx
{hasSummary && (
  <div className="mx-4 mt-2 mb-4 flex items-center gap-2 rounded-md bg-bg-tertiary px-3 py-2 text-xs text-text-tertiary">
    <Info className="h-3.5 w-3.5 shrink-0" />
    <span>Older messages have been summarized to maintain conversation quality.</span>
  </div>
)}
```

### Tests

| Test | What It Verifies |
|------|-----------------|
| `hasSummary` field included in thread detail response | API shape |
| Summary banner renders when `hasSummary` is true | UI rendering |
| Summary banner does not render when `hasSummary` is false | No false positive |

**Target: 3 tests**

---

## 8. Phase 6: Documentation Sync

### HANDOFF.md

| Section | Updates |
|---------|---------|
| Last Updated | `2026-02-27 (Post-Session 19)` |
| Current State | Add S19 context window management |
| What Does Not Exist Yet | Remove "Advisor context window management" — it now exists |
| Known Limitations | Close KL-2 and KL-3 |
| Metrics table | Update test count, utility module count |
| Post-MVP priorities | Mark item 13 complete |

### KNOWN-LIMITATIONS.md

Close KL-2 and KL-3:

```
## Resolved in Session 19

| ID | Limitation | Resolution |
|----|-----------|------------|
| KL-2 | Advisor context window not managed | Message windowing with token estimation. Trims oldest turns when approaching budget. |
| KL-3 | No summary generation for long threads | LLM-generated summaries stored in `summaryText`. Rolling updates on subsequent trims. |
```

### CLAUDE.md

- Add Session 19 section documenting:
  - `token-estimator.ts` — utility catalog
  - `context-budget.ts` — constants
  - `context-window.ts` — windowing algorithm
  - `summary-generator.ts` — summary generation
  - Chat route changes (windowed message preparation)
  - `hasSummary` field on thread detail response

### AGENTS.md

- Update test count to S19 final
- Note new advisor package files

---

## 9. Scope Cut Order

If session runs long, cut in reverse phase order:

```
LAST CUT:  Phase 6 (docs)                — Can be done post-session
           Phase 5 (frontend indicator)   — Cosmetic, UX-only
MODERATE:  Phase 3 (summary generation)   — Windowing works without it (just loses old context)
NEVER CUT: Phase 2 (message windowing)    — Core mechanism, prevents context overflow
           Phase 1 (token estimation)     — Foundation for Phase 2
           Phase 4 (integration)          — Without wiring, nothing works
```

**Minimum viable session:** Phases 1 + 2 + 4 = Token estimation + windowing + integration. This closes KL-2 (context window managed). Summary generation (KL-3) can be deferred to S20 if needed.

---

## 10. Quality Gates

Run after every major change:

```bash
pnpm tsc --noEmit        # 0 errors
pnpm test                # 712+ tests (683 current + ~29 new)
```

---

## 11. Exit Criteria

### Blocking

| # | Criterion | Phase |
|---|-----------|-------|
| EC-1 | Token estimation functions return reasonable values for sample messages | P1 |
| EC-2 | `windowMessages()` returns all messages when under budget | P2 |
| EC-3 | `windowMessages()` trims oldest turns when over budget | P2 |
| EC-4 | Tool calls and results are never orphaned by trimming | P2 |
| EC-5 | Chat route uses windowed messages for LLM calls | P4 |
| EC-6 | Short threads (< budget) work identically to pre-S19 behavior | P4 |
| EC-7 | `tsc --noEmit` — 0 errors | All |
| EC-8 | `pnpm test` — 712+ tests, 0 failures | All |

### Non-Blocking

| # | Criterion | Phase |
|---|-----------|-------|
| EC-9 | Summary generation produces coherent summary (manual verification) | P3 |
| EC-10 | Summary stored in `AdvisorThread.summaryText` | P3 |
| EC-11 | Summary preamble prepended to windowed context | P4 |
| EC-12 | `hasSummary` indicator in thread detail response | P5 |
| EC-13 | Context summary banner renders in AdvisorMessages | P5 |
| EC-14 | HANDOFF.md, KNOWN-LIMITATIONS.md, CLAUDE.md, AGENTS.md updated | P6 |

---

## 12. Architecture Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| AD-S19-1 | Token estimation via character-ratio heuristic, not model-specific tokenizer | Conservative overestimation is the safe failure mode. No external dependency. Calibratable via LLMResponse.usage if needed. |
| AD-S19-2 | Message windowing trims at turn boundaries, not individual messages | Prevents orphaned tool results or context-free assistant responses. The LLM always sees complete conversational exchanges. |
| AD-S19-3 | Summary generation triggered by `shouldGenerateSummary` signal from windowing | Decouples the "when" (windowing detects) from the "how" (summary generator executes). Clean separation of concerns. |
| AD-S19-4 | Summary generation uses same LLM adapter, minimal prompt, no tools | Keeps summary cost low (~1,800 tokens per summary). Reuses existing infrastructure. |
| AD-S19-5 | Summary generation is fire-and-forget, non-blocking | User gets their answer immediately. Summary failure degrades gracefully (windowing still works, just without context compression). |
| AD-S19-6 | `summaryText` not exposed to frontend | Internal to LLM context preparation. Users see a "messages summarized" indicator, not the raw summary. Avoids confusing UX. |

---

## 13. Risk Assessment

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R-S19-1 | Token estimation significantly underestimates actual usage | Low | Medium | 3.0–3.5 chars/token is conservative. 5,000 token safety margin provides buffer. Calibrate post-session using `usage` from LLM responses. |
| R-S19-2 | Summary generation produces poor quality summaries | Medium | Low | Degraded but functional — windowing still works. Summary quality can be improved iteratively by tuning the prompt. |
| R-S19-3 | Fire-and-forget summary silently fails every time | Low | Medium | Error logging ensures failures are visible in console. Can add retry in future session if observed. |
| R-S19-4 | Windowing changes break existing advisor behavior | Low | High | Short threads (< budget) take the fast path — identical to current behavior. Only long threads are affected. Test suite covers both paths. |

---

## 14. Post-Session

```bash
# Final quality check
pnpm tsc --noEmit
pnpm test

# Update docs (Phase 6)
# HANDOFF.md, KNOWN-LIMITATIONS.md, CLAUDE.md, AGENTS.md

# Commit
git add -A
git commit -m "Session 19: Advisor context window management — token estimation, windowing, summary generation"
git push origin main
```

### Generate Report

Write `SESSION-19-REPORT.md` covering:
- Phase-by-phase delivery status
- Token estimation calibration notes (compare estimates vs actual `usage` values)
- Windowing behavior with sample thread lengths
- Summary generation quality assessment
- Test count delta
- Architecture decisions applied
- Scope cuts (if any)
- Exit criteria checklist
- Updated metrics

---

## 15. What Remains After Session 19

If Session 19 delivers full scope:

| # | Item | Status |
|---|------|--------|
| KL-2 | Context window management | ✅ Resolved (S19) |
| KL-3 | Summary generation | ✅ Resolved (S19) |
| KL-4 | Bulk paste date conversion (noon UTC) | Accepted — no action needed |
| KL-5 | Single provider for historical bars | Accepted — architectural limitation |
| KL-6 | In-process rate limiter | Accepted — single user |
| 14 | Responsive refinements | Low priority — user is on desktop |

At this point, STALKER has **zero open functional limitations**. The remaining items are either accepted trade-offs or low-priority cosmetic work. The system is production-ready for its single-user, desktop deployment target.
