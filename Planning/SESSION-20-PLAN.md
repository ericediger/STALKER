# SESSION-20-PLAN.md — Hardening, Bug Fixes & Project Close-Out

**Date:** 2026-02-27
**Input:** SESSION-19-REPORT.md, SESSION-19-PLAN.md, HANDOFF.md, KNOWN-LIMITATIONS.md, STALKER_MASTER-PLAN.md, CLAUDE.md, AGENTS.md
**Session Type:** Hardening + Documentation (Backend + Docs)
**Team Shape:** Solo
**Estimated Duration:** ~2–3 hours

---

## 0. Session 19 Assessment

Session 19 was a clean sweep — all 6 phases, 35 new tests, zero scope cuts, zero TypeScript errors. KL-2 and KL-3 are resolved. STALKER now has **zero open functional limitations**. The remaining backlog is item 14 (responsive refinements), which has been deferred since S15 and the user is on desktop.

However, the S19 assessment identified **four issues** that should be addressed before the project is declared complete:

| # | Issue | Severity | Source |
|---|-------|----------|--------|
| 1 | **Rolling summary trigger logic may be broken** | High | `shouldGenerateSummary` is `true` only when `!summaryText`, meaning rolling updates never fire after the first summary. The `existingSummary` merge path in `summary-generator.ts` may be dead code. |
| 2 | **Missing integration test** — windowed long-thread path | Medium | Plan specified 6 chat integration tests, report delivered 4. The primary "windowed long thread" case is missing from `chat.test.ts`. |
| 3 | **Dual message converters** — maintenance risk | Low | `prismaMessageToInternal` (expects JSON strings) and `windowableToMessage` (expects parsed objects) do similar work with different input shapes. Future confusion likely. |
| 4 | **Token estimation uncalibrated** | Low | Plan called for calibration notes comparing estimates vs. `LLMResponse.usage` actuals. No calibration data in report. |

Additionally, the **Master Plan is at v4.0** (last updated S11) and is missing Sessions 12–19. HANDOFF.md needs the S19 update. The "Not in Roadmap" list still includes items that are now done.

**Recommendation:** Session 20 is a closing sprint. Fix the rolling summary bug, add the missing test, consolidate converters, add calibration logging, and bring all project documentation current. After this session, every artifact reflects the true state of the system and the project is formally complete.

---

## 1. Read First

1. `CLAUDE.md` — Architecture rules, advisor package structure
2. `AGENTS.md` — Package inventory, test patterns, tech stack
3. `HANDOFF.md` — Current state (post-Session 19)
4. `KNOWN-LIMITATIONS.md` — All functional KLs now resolved
5. `packages/advisor/src/context-window.ts` — Rolling summary trigger logic
6. `packages/advisor/src/summary-generator.ts` — Summary merge path
7. `apps/web/src/app/api/advisor/chat/route.ts` — Integration wiring
8. This plan

---

## 2. Context

### Why a Closing Sprint?

The system is functionally complete. 718 tests pass, zero TypeScript errors, zero functional limitations, 22 API endpoints all implemented, 83 instruments tracked with real data. But the engineering artifacts tell two stories:

1. **The code** is current (Session 19 committed to `origin/main`).
2. **The documentation** is stale — the Master Plan hasn't been updated since Session 11. There's a confirmed logic bug in the rolling summary trigger. One integration test is missing.

A system isn't production-complete when the code works. It's production-complete when the code works, the docs are accurate, the known bugs are fixed, and the next person who opens the codebase (including future-you) can understand the full picture without archaeology.

### Scope

This session has four categories of work:

```
Category A: Bug Fix          — Rolling summary trigger (1 issue, high severity)
Category B: Test Gap         — Missing integration test (1 test)
Category C: Code Quality     — Message converter consolidation + calibration logging
Category D: Documentation    — Master Plan v5.0, HANDOFF.md, AGENTS.md, CLAUDE.md
```

No new features. No UI changes. No schema changes.

---

## 3. Phase 1: Fix Rolling Summary Trigger (Bug Fix — Critical)

### The Problem

In `context-window.ts`, the `shouldGenerateSummary` logic from the S19 plan reads:

```typescript
shouldGenerateSummary: trimmedMessages.length > 0 && !summaryText
```

This means:
- **First trim** (no summary exists): `shouldGenerateSummary = true` ✅
- **Second trim** (summary exists): `shouldGenerateSummary = false` ❌

But the `summary-generator.ts` has an `existingSummary` parameter and a merge path. The intent — documented in AD-S19-4 — is that "summaries are rolling: when a second trim happens, the new summary incorporates the old one." The trigger and the generator disagree.

### Investigation Step

Before changing anything, **verify the actual implementation**:

```bash
grep -n "shouldGenerateSummary" packages/advisor/src/context-window.ts
```

If the implementation matches the plan (`!summaryText`), the bug is confirmed and the rolling merge path is dead code.

If the implementation diverged from the plan (e.g., `shouldGenerateSummary` is always `true` when messages are trimmed), the bug doesn't exist — document the divergence and move on.

### Fix (if bug confirmed)

Change the trigger logic in `context-window.ts`:

```typescript
// Before (broken):
shouldGenerateSummary: trimmedMessages.length > 0 && !summaryText,

// After (correct):
shouldGenerateSummary: trimmedMessages.length > 0,
```

This means:
- First trim → generate fresh summary ✅
- Subsequent trims → generate rolling summary that merges with existing ✅
- No trimming → no summary generation ✅

The fire-and-forget wiring in `chat/route.ts` already passes `thread?.summaryText` to `generateSummary()`, so the merge path will activate naturally.

### Tests

| Test | What It Verifies |
|------|-----------------|
| `shouldGenerateSummary` true when messages trimmed + NO existing summary | First trim triggers |
| `shouldGenerateSummary` true when messages trimmed + existing summary present | Rolling trigger fires |
| `shouldGenerateSummary` false when no messages trimmed | No unnecessary summaries |

**Verify existing tests still pass.** The S19 test "`shouldGenerateSummary` false when messages trimmed + summary exists" will need to be updated to expect `true` — this is the behavioral fix.

**Target: 0 net new tests (1 modified, existing count preserved at 718)**

**Architecture Decision AD-S20-1:** Rolling summary trigger fires on every trim, not just the first. The original `!summaryText` guard was a logic error that made the rolling merge path in `summary-generator.ts` unreachable. The correct behavior is: if messages were trimmed, offer them for summarization regardless of whether a summary already exists.

---

## 4. Phase 2: Add Missing Integration Test

### The Gap

The S19 plan specified 6 integration tests for `chat.test.ts`. The report delivered 4. The missing case is the **primary path** — sending a windowed (trimmed) message set for a long thread.

### Step 1: Add Windowed Long Thread Test

In `apps/web/__tests__/api/advisor/chat.test.ts`:

```typescript
it('sends windowed messages when thread exceeds budget', async () => {
  // Setup: Create a thread with enough messages to exceed CONTEXT_BUDGET.MESSAGE_BUDGET
  // Use token-heavy messages (long content + tool results) to trigger windowing
  // 
  // Assert:
  // 1. LLM adapter receives fewer messages than total in thread
  // 2. Most recent messages are present (windowing trims from oldest)
  // 3. Response is successful (windowed path works end-to-end)
});
```

### Step 2: Add Summary Trigger Wiring Test (if not covered by Phase 1)

Check whether the S19 tests already cover the trigger → generation → persistence wiring for the rolling case. If Phase 1 modified the trigger logic, the existing "summary persistence" test may already cover it. If not:

```typescript
it('triggers rolling summary when messages trimmed and summary exists', async () => {
  // Setup: Thread with existing summaryText + enough messages to trigger windowing
  // Assert: generateSummary called with existingSummary parameter
});
```

### Tests

**Target: +1 to +2 tests → 719–720 total**

---

## 5. Phase 3: Message Converter Consolidation (Code Quality)

### The Problem

Session 19 created `windowableToMessage()` alongside the existing `prismaMessageToInternal()`. Both convert message records to the internal `Message` type used by the LLM adapter, but they handle different input shapes:

- `prismaMessageToInternal` — expects Prisma rows where `toolCalls` and `toolResults` are JSON strings (because Prisma serializes JSON columns as strings)
- `windowableToMessage` — expects `WindowableMessage` where `toolCalls` and `toolResults` are already parsed objects

### Investigation Step

```bash
grep -n "prismaMessageToInternal\|windowableToMessage" apps/web/src/app/api/advisor/chat/route.ts
```

Understand both call sites. Map the data flow:

```
Prisma DB → findMany → Prisma rows (JSON as string)
                        ├─→ windowMessages() needs WindowableMessage (parsed objects)
                        │     └─→ windowableToMessage() → Message (for LLM)
                        └─→ prismaMessageToInternal() → Message (for LLM)
```

### Consolidation Approach

Create a single conversion pipeline:

```typescript
// Option A: Parse once at the boundary, use one converter downstream
function parsePrismaMessage(row: PrismaAdvisorMessage): WindowableMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    toolCalls: row.toolCalls ? JSON.parse(row.toolCalls as string) : undefined,
    toolResults: row.toolResults ? JSON.parse(row.toolResults as string) : undefined,
    createdAt: row.createdAt,
  };
}

// Then windowableToMessage() is the single converter to LLM Message type
// And prismaMessageToInternal() can be retired or reduced to:
//   parsePrismaMessage → windowableToMessage (composed)
```

This gives a clear data pipeline:

```
Prisma row → parsePrismaMessage() → WindowableMessage → windowableToMessage() → Message
```

No dual paths. One parse step. One conversion step.

### Risk

This is a refactor touching the critical chat path. Existing tests must continue to pass. Run the full suite before and after.

### Tests

No new tests needed — existing tests cover both conversion paths. The refactor should be transparent.

**Target: 0 net new tests**

---

## 6. Phase 4: Token Estimation Calibration Logging (Observability)

### The Goal

Add a debug log line in the chat route that compares the estimated token count (from `estimateConversationTokens()`) to the actual token count (from `LLMResponse.usage.inputTokens`). This doesn't change behavior — it provides calibration data for the heuristic.

### Implementation

In `apps/web/src/app/api/advisor/chat/route.ts`, after the tool loop returns:

```typescript
// After tool loop completes, log calibration data
if (process.env.NODE_ENV === 'development') {
  const estimated = windowResult.estimatedTokens;
  const actual = response.usage?.inputTokens;
  if (actual) {
    const ratio = estimated / actual;
    console.log(
      `[advisor] Token calibration: estimated=${estimated}, actual=${actual}, ratio=${ratio.toFixed(2)} ` +
      `(${ratio > 1 ? 'overestimate' : 'UNDERESTIMATE'} by ${Math.abs((ratio - 1) * 100).toFixed(0)}%)`
    );
  }
}
```

If the ratio is consistently > 1.0 (overestimate), the heuristic is safe. If it's < 1.0, the safety margin is doing its job but the char/token ratios should be tightened.

### Tests

No tests needed — this is a development-only log line.

**Target: 0 net new tests**

---

## 7. Phase 5: Documentation Sync (Project Close-Out)

This is the largest phase by artifact count but the most mechanical. Every document gets updated to reflect the true state of the system through Session 20.

### 7.1 STALKER_MASTER-PLAN.md → v5.0

The Master Plan is at v4.0 (covers through Session 11). It needs a major update.

| Section | Updates |
|---------|---------|
| **Changelog** | Add v5.0 entry: "S12–S20 complete. All post-MVP priorities delivered. Zero functional limitations. 720+ tests. Project close-out." |
| **Status line** | Change from "Phase II In Progress — Session 12 Ready" → "Complete — Production Ready" |
| **Current State Summary** | Rewrite to reflect S12–S19 progression, 83-instrument production use, zero functional gaps |
| **Session Overview table** | Add rows for Sessions 12–20 with test counts and status |
| **Session Status Tracker** | Update all sessions through S20 |
| **Test Progression** | Update ASCII chart through S20 (718–720) |
| **Current Metrics** | Update to post-S20 values |
| **Remaining Path** | Replace with "Production use — active" |
| **Dependency Chain** | Mark complete through S20 |
| **Architecture Decisions** | Add AD-S12 through AD-S20 (pull from individual session reports) |
| **Risks** | Close all open risks or mark as accepted |
| **Lessons Learned** | Add L-11 through any new lessons from S12–S19 |
| **Not in Roadmap** | Remove items now completed (advisor context window, holiday calendar). Keep truly deferred items. |
| **Post-MVP Priorities** | Mark items 13 complete. Note item 14 as deferred/accepted. |
| **Epic 11** | Mark complete |
| **Add Epics 12–14** | Sessions 14–19 work doesn't map to original epics. Add new epics or a "Post-Phase II" section covering S14–S19 scope. |

**This is a significant rewrite.** The Master Plan is the project's single source of strategic truth. It should read as a coherent narrative from S1 to S20, not as a document that was last maintained at S11 with mental notes for the rest.

### 7.2 HANDOFF.md

| Section | Updates |
|---------|---------|
| **Last Updated** | `2026-02-27 (Post-Session 20)` |
| **Last Session** | Session 20 — Hardening, Bug Fixes & Project Close-Out |
| **Status** | Production Ready — Project Complete |
| **Current State** | Add S19 context window management, S20 hardening |
| **What Exists** | Add: context window management (token estimation, windowing, summary generation) |
| **What Does Not Exist Yet** | Only responsive refinements remain (accepted deferral) |
| **Known Limitations** | Close KL-2 and KL-3 (if not already done by S19's doc sync) |
| **Metrics** | Update test count (720+), test files (62+), utility modules |
| **Post-MVP Priorities** | Mark item 13 complete |
| **Architecture Decisions** | Add S19 and S20 decisions |

### 7.3 CLAUDE.md

| Section | Updates |
|---------|---------|
| **Session 20 section** | Rolling summary fix, converter consolidation, calibration logging |
| **Advisor package files** | Ensure token-estimator, context-budget, context-window, summary-generator all documented |

### 7.4 AGENTS.md

| Section | Updates |
|---------|---------|
| **Test count** | Update to S20 final |
| **Advisor package description** | Ensure context window management is reflected |
| **Session Status Tracker** | Add S19 and S20 rows |

### 7.5 KNOWN-LIMITATIONS.md

Verify S19 already closed KL-2 and KL-3. If yes, no changes needed. If the S19 doc sync missed anything, complete it.

---

## 8. Scope Cut Order

If session runs long, cut in reverse phase order:

```
LAST CUT:  Phase 5.1 (Master Plan v5.0)  — Largest artifact, can be done post-session
           Phase 5.2–5.4 (Other docs)    — Mechanical, lower risk
MODERATE:  Phase 4 (calibration logging)  — Nice to have, not functional
           Phase 3 (converter consolidation) — Refactor, not a bug
NEVER CUT: Phase 1 (rolling summary fix)  — Bug fix, confirmed logic error
           Phase 2 (missing test)          — Coverage gap on critical path
```

**Minimum viable session:** Phases 1 + 2 = Fix the rolling summary bug + add the missing test. This ensures correctness. Everything else is quality and documentation.

---

## 9. Quality Gates

Run after every major change:

```bash
pnpm tsc --noEmit        # 0 errors
pnpm test                # 719+ tests (718 current + 1-2 new)
```

---

## 10. Exit Criteria

### Blocking

| # | Criterion | Phase |
|---|-----------|-------|
| EC-1 | Rolling summary trigger fires on subsequent trims (not just first) — verified by test | P1 |
| EC-2 | Existing context window tests still pass (modified assertion for rolling case) | P1 |
| EC-3 | Windowed long-thread integration test passes in `chat.test.ts` | P2 |
| EC-4 | `tsc --noEmit` — 0 errors | All |
| EC-5 | `pnpm test` — 719+ tests, 0 failures | All |

### Non-Blocking

| # | Criterion | Phase |
|---|-----------|-------|
| EC-6 | Single message conversion pipeline (no dual converters) | P3 |
| EC-7 | Token calibration log emits in development mode | P4 |
| EC-8 | STALKER_MASTER-PLAN.md updated to v5.0 | P5 |
| EC-9 | HANDOFF.md reflects post-S20 state | P5 |
| EC-10 | CLAUDE.md includes S20 section | P5 |
| EC-11 | AGENTS.md test count and package descriptions current | P5 |

---

## 11. Architecture Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| AD-S20-1 | Rolling summary trigger fires on every trim, not just the first | Original `!summaryText` guard made the rolling merge path unreachable. Correct behavior: any trim offers messages for summarization. |
| AD-S20-2 | Single message conversion pipeline: `parsePrismaMessage → windowableToMessage` | Eliminates dual converter paths. One parse step (JSON strings → objects), one conversion step (WindowableMessage → Message). |
| AD-S20-3 | Token calibration logging in development mode only | Zero production overhead. Provides data to validate or tighten the 3.0–3.5 chars/token heuristic over real usage. |

---

## 12. Risk Assessment

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R-S20-1 | Rolling summary fix changes behavior for existing threads with summaries | Low | Low | Only affects threads that have already been trimmed. The change makes them better (rolling updates instead of stale summaries). No data migration needed. |
| R-S20-2 | Converter consolidation breaks chat route | Low | High | Full test suite covers both paths. Run before and after. Refactor is mechanical — no logic changes, just pipeline restructuring. |
| R-S20-3 | Master Plan v5.0 rewrite introduces inaccuracies | Medium | Low | Cross-reference each session report. Master Plan is a planning doc, not runtime code — inaccuracies are correctable without system impact. |

---

## 13. Post-Session

```bash
# Final quality check
pnpm tsc --noEmit
pnpm test

# Update docs (Phase 5)
# STALKER_MASTER-PLAN.md, HANDOFF.md, CLAUDE.md, AGENTS.md

# Commit
git add -A
git commit -m "Session 20: Hardening — rolling summary fix, test gap, converter consolidation, docs close-out"
git push origin main
```

### Generate Report

Write `SESSION-20-REPORT.md` covering:
- Phase-by-phase delivery status
- Rolling summary bug: confirmed or not, fix applied or not needed
- Converter consolidation outcome
- Calibration logging — first data point if available
- Test count delta
- Architecture decisions applied
- Documentation artifacts updated
- Scope cuts (if any)
- Exit criteria checklist
- Final project metrics

---

## 14. What Remains After Session 20

| # | Item | Status |
|---|------|--------|
| KL-2 | Context window management | ✅ Resolved (S19, fixed S20) |
| KL-3 | Summary generation | ✅ Resolved (S19, rolling fix S20) |
| KL-4 | Bulk paste date conversion (noon UTC) | Accepted — no action needed |
| KL-5 | Single provider for historical bars | Accepted — architectural limitation |
| KL-6 | In-process rate limiter | Accepted — single user |
| 14 | Responsive refinements | Deferred — user is on desktop |

**Project status after Session 20:**

- **Zero open functional limitations**
- **Zero known bugs** (rolling summary fixed)
- **All documentation current** (Master Plan v5.0, HANDOFF, CLAUDE, AGENTS, KNOWN-LIMITATIONS)
- **720+ tests passing**, 0 TypeScript errors
- **19 sessions of zero scope cuts** maintained
- **Production-ready** for single-user desktop deployment

The project is **complete**. Future work is discretionary — responsive layout for a user who doesn't need it, or feature additions from the "Not in Roadmap" list if the user's needs evolve.

---

## 15. Session 20 as Project Capstone

This is likely the final planned session. The arc from Session 1 (monorepo scaffolding + FIFO engine) to Session 20 (documentation close-out + last bug fix) spans:

- **20 sessions**, zero scope cuts
- **71 → 720+ tests** (10× growth)
- **0 → 22 API endpoints**, all implemented
- **0 → 83 instruments** tracked with real portfolio data
- **0 → 5 advisor tools** with context window management
- **14 post-MVP priorities**, 13 completed, 1 accepted deferral
- **10 known limitations identified**, 7 resolved, 3 accepted as operational trade-offs

The system does what it was designed to do: track a real portfolio with correct math, provide analytical synthesis via LLM advisor, and degrade gracefully at every boundary.
