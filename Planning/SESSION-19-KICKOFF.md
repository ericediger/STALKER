# SESSION-19-KICKOFF.md — Advisor Context Window Management

**Paste this into Claude Code to start Session 19.**

---

## Context

You are the **Lead Engineer** for STALKER Session 19. This is a **solo session** — no teammates. You will implement advisor context window management, resolving the last two functional limitations in the system (KL-2 and KL-3).

## Document Reading Order

Read these documents in this exact order before writing any code:

1. `CLAUDE.md` — Architecture rules, Decimal precision, advisor package structure
2. `AGENTS.md` — Package inventory, test patterns, tech stack
3. `HANDOFF.md` — Current state (post-Session 18, 683 tests, 83 instruments)
4. `KNOWN-LIMITATIONS.md` — KL-2 and KL-3 are your targets
5. `SESSION-19-PLAN.md` — **This is your implementation spec. Follow it phase by phase.**

## What This Session Delivers

**Six phases, in order:**

1. **Token estimation utility** — `packages/advisor/src/token-estimator.ts` + `context-budget.ts`. Character-ratio heuristic (3.0–3.5 chars/token). Conservative overestimation is the safe failure mode.

2. **Message windowing** — `packages/advisor/src/context-window.ts`. Trims oldest conversational turns when approaching context budget. Never orphans tool calls from their results. Trims at turn boundaries only.

3. **Summary generation** — `packages/advisor/src/summary-generator.ts`. LLM-generated rolling summaries stored in `AdvisorThread.summaryText`. Uses same adapter, minimal prompt, no tools.

4. **Chat route integration** — Wire windowing + summary into `POST /api/advisor/chat`. Windowed messages sent to tool loop. Summary preamble prepended when `summaryText` exists. Summary generation is fire-and-forget after response returns.

5. **Frontend indicator** — `hasSummary` field on thread detail response. Info banner in `AdvisorMessages` when older messages have been summarized.

6. **Documentation sync** — Close KL-2/KL-3 in `KNOWN-LIMITATIONS.md`. Update `HANDOFF.md`, `CLAUDE.md`, `AGENTS.md`.

## Critical Constraints

- **Turn-boundary trimming only.** Never split a user message from its assistant/tool responses. A "turn" = user message + all responses until the next user message.
- **Short threads must be identical to pre-S19 behavior.** The fast path (all messages fit in budget) returns everything unchanged. No regressions for normal-length conversations.
- **Summary generation is non-blocking.** Return the response to the user first. Generate the summary asynchronously. If summary fails, log and continue — windowing still works.
- **Do not expose raw `summaryText` to the frontend.** Users see a "messages summarized" indicator, not the summary content.

## Quality Gates

Run after every phase:

```bash
pnpm tsc --noEmit        # 0 errors
pnpm test                # 712+ tests (683 + ~29 new)
```

## Scope Cut Order (if session runs long)

```
LAST CUT:  Phase 6 (docs)              — Post-session
           Phase 5 (frontend indicator) — Cosmetic
MODERATE:  Phase 3 (summary generation) — Windowing works without it
NEVER CUT: Phase 1 (token estimation)   — Foundation
           Phase 2 (message windowing)  — Core mechanism
           Phase 4 (integration)        — Without wiring, nothing works
```

## Exit Criteria

**Must pass:** Token estimation returns reasonable values. Windowing returns all messages when under budget. Windowing trims oldest turns when over budget. Tool calls never orphaned. Chat route uses windowed messages. Short threads work identically. `tsc` 0 errors. 712+ tests, 0 failures.

**Should pass:** Summary generation produces coherent output. Summary stored in thread. Summary preamble prepended. `hasSummary` in API response. Context banner renders. All docs updated.

## Post-Session

```bash
pnpm tsc --noEmit
pnpm test
git add -A
git commit -m "Session 19: Advisor context window management — token estimation, windowing, summary generation"
git push origin main
```

Then write `SESSION-19-REPORT.md`.
