# Session 19 Report — Advisor Context Window Management

**Date:** 2026-02-27
**Type:** Solo Session
**Status:** Complete — All 6 phases delivered, zero scope cuts

---

## Objective

Implement advisor context window management to resolve the last two functional limitations (KL-2 and KL-3). Long advisor threads should automatically trim older messages to stay within the LLM's context window, and trimmed messages should be compressed into rolling summaries.

---

## What Was Delivered

### Phase 1: Token Estimation + Context Budget

- **`packages/advisor/src/token-estimator.ts`** — Character-ratio heuristic (3.0–3.5 chars/token). Functions: `estimateTokens()`, `estimateMessageTokens()`, `estimateConversationTokens()`. Conservative overestimation is the safe failure mode.
- **`packages/advisor/src/context-budget.ts`** — Budget allocation constants. 200K model window → 174,700 token budget for conversation messages after reserving system prompt (3,500), summary (800), response headroom (16,000), and safety margin (5,000).

### Phase 2: Message Windowing

- **`packages/advisor/src/context-window.ts`** — Core windowing algorithm. Groups messages into turns (user + assistant/tool response pairs). Trims oldest turns when conversation exceeds budget. Never orphans tool calls from their results. Minimum 3 turns (6 messages) always preserved. Returns `WindowResult` with windowed messages, trimmed messages, and `shouldGenerateSummary` signal.

### Phase 3: Summary Generation

- **`packages/advisor/src/summary-generator.ts`** — LLM-generated rolling summaries using same adapter. Filters out tool messages. Merges with existing summary for rolling updates. `formatSummaryPreamble()` wraps summary with `[Context from earlier in this conversation]` markers. Returns existing summary on LLM failure (graceful fallback).

### Phase 4: Chat Route Integration

- **`apps/web/src/app/api/advisor/chat/route.ts`** — Major changes:
  - Loads ALL messages (removed `take: 50` limit)
  - Windows messages via `windowMessages()` before sending to tool loop
  - Prepends summary preamble when `thread.summaryText` exists
  - Fire-and-forget summary generation triggered when messages are trimmed
  - New `windowableToMessage()` converter (separate from `prismaMessageToInternal` which expects JSON strings)

### Phase 5: Frontend Indicator

- **`apps/web/src/app/api/advisor/threads/[id]/route.ts`** — Added `hasSummary: thread.summaryText !== null`
- **`apps/web/src/lib/hooks/useAdvisor.ts`** — Added `hasSummary` state, set from API response
- **`apps/web/src/components/advisor/AdvisorMessages.tsx`** — Info banner: "Older messages have been summarized to maintain conversation quality."
- **`apps/web/src/components/advisor/AdvisorPanel.tsx`** — Wires `hasSummary` through

### Phase 6: Documentation Sync

- **`KNOWN-LIMITATIONS.md`** — Closed KL-2 and KL-3 in new "Resolved in Session 19" section
- **`HANDOFF.md`** — Full rewrite with Session 19 changes, updated metrics
- **`CLAUDE.md`** — Added Session 19 section with architecture decisions
- **`AGENTS.md`** — Updated test count (718), advisor package description, context window management decision

---

## Architecture Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| AD-S19-1 | Token estimation via character-ratio heuristic (3.0–3.5 chars/token) | Conservative overestimation is the safe failure mode. No external dependency. |
| AD-S19-2 | Message windowing trims at turn boundaries, not individual messages | Prevents orphaned tool results or context-free assistant responses. |
| AD-S19-3 | Summary generation triggered by `shouldGenerateSummary` signal from windowing | Decouples the "when" from the "how". Clean separation of concerns. |
| AD-S19-4 | Summary generation uses same LLM adapter, minimal prompt, no tools | Keeps summary cost low (~1,800 tokens per summary). Reuses existing infrastructure. |
| AD-S19-5 | Summary generation is fire-and-forget, non-blocking | User gets their answer immediately. Summary failure degrades gracefully. |
| AD-S19-6 | `summaryText` not exposed to frontend | Internal to LLM context preparation. Users see an indicator, not the raw summary. |

---

## Test Summary

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Test count | 683 | 718 | +35 |
| Test files | 59 | 62 | +3 |
| TypeScript errors | 0 | 0 | 0 |

### New Test Files

| File | Tests | Scope |
|------|-------|-------|
| `packages/advisor/__tests__/token-estimator.test.ts` | 10 | estimateTokens, estimateMessageTokens, estimateConversationTokens, CONTEXT_BUDGET |
| `packages/advisor/__tests__/context-window.test.ts` | 11 | groupIntoTurns, windowMessages (budget, trimming, tool orphan prevention, MIN_RECENT_MESSAGES) |
| `packages/advisor/__tests__/summary-generator.test.ts` | 6 | generateSummary (happy path, rolling merge, null fallback, tool filtering), formatSummaryPreamble |

### Modified Test Files

| File | Change |
|------|--------|
| `packages/advisor/__tests__/exports.test.ts` | +2 tests for context window management exports |
| `apps/web/__tests__/api/advisor/chat.test.ts` | +4 tests (windowing no-op, summary preamble, summary persistence, summary failure resilience) |
| `apps/web/__tests__/api/advisor/threads.test.ts` | +2 tests (hasSummary true/false) |

---

## Bugs Fixed During Session

1. **Context window test failures** — `MIN_RECENT_MESSAGES` guard with only 2 turns forced keeping all messages. Fixed by using 4+ turns in tests so trimming still satisfies the minimum.
2. **Type mismatch** — `prismaMessageToInternal` expects JSON strings from Prisma but `WindowableMessage` has parsed objects. Created separate `windowableToMessage()` converter.
3. **threads.test.ts syntax error** — Edit accidentally truncated a test function signature. Restored the full `it('parses toolCalls JSON in messages', async () => {` line.

---

## Known Limitations Status

| ID | Status | Notes |
|----|--------|-------|
| KL-2 | RESOLVED | Message windowing with token estimation |
| KL-3 | RESOLVED | LLM-generated rolling summaries |
| KL-4 | Open | Bulk paste noon UTC (acceptable) |
| KL-5 | Open | Single provider for history (Tiingo only) |
| KL-6 | Open | In-process rate limiter (single user, acceptable) |

**Zero open functional limitations.** KL-4–6 are operational trade-offs with documented mitigations.

---

## Files Changed

24 files changed, ~2,000 lines added.

**New files (7):**
- `packages/advisor/src/token-estimator.ts`
- `packages/advisor/src/context-budget.ts`
- `packages/advisor/src/context-window.ts`
- `packages/advisor/src/summary-generator.ts`
- `packages/advisor/__tests__/token-estimator.test.ts`
- `packages/advisor/__tests__/context-window.test.ts`
- `packages/advisor/__tests__/summary-generator.test.ts`

**Modified files (17):**
- `packages/advisor/src/index.ts` (barrel exports)
- `packages/advisor/__tests__/exports.test.ts`
- `apps/web/src/app/api/advisor/chat/route.ts`
- `apps/web/src/app/api/advisor/threads/[id]/route.ts`
- `apps/web/__tests__/api/advisor/chat.test.ts`
- `apps/web/__tests__/api/advisor/threads.test.ts`
- `apps/web/src/components/advisor/AdvisorMessages.tsx`
- `apps/web/src/components/advisor/AdvisorPanel.tsx`
- `apps/web/src/lib/hooks/useAdvisor.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `HANDOFF.md`
- `KNOWN-LIMITATIONS.md`
- `SESSION-19-KICKOFF.md` (new, planning doc)
- `SESSION-19-PLAN.md` (new, planning doc)
- `Planning/SESSION-18-KICKOFF.md` (moved)
- `Planning/SESSION-18-PLAN.md` (moved)

---

## Commit

```
b0646c1 Session 19: Advisor context window management — token estimation, windowing, summary generation
```

Pushed to `origin/main`.
