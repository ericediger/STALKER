# SESSION-20-KICKOFF: Hardening, Bug Fixes & Project Close-Out

## Read First (in order)

1. `CLAUDE.md` — Architecture rules, Decimal precision, advisor package structure
2. `AGENTS.md` — Package inventory, test patterns, tech stack
3. `HANDOFF.md` — Current state (post-Session 19)
4. `KNOWN-LIMITATIONS.md` — All functional KLs now resolved
5. `SESSION-20-PLAN.md` — Full implementation spec for this session

## Session Objective

Fix the rolling summary trigger bug, add a missing integration test, consolidate message converters, add calibration logging, and bring all project documentation current. **No new features. No UI changes. No schema changes.**

## Agent Team

**Solo session.** No teammates.

## Session Type

Hardening + Documentation Close-Out.

---

## Phase 1: Fix Rolling Summary Trigger (CRITICAL — Do First)

### Step 1: Investigate

```bash
grep -n "shouldGenerateSummary" packages/advisor/src/context-window.ts
```

Determine if the implementation uses `&& !summaryText` (broken — rolling summaries never fire) or if it diverges from the plan (may already be correct).

### Step 2: Fix (if bug confirmed)

In `packages/advisor/src/context-window.ts`, change the `shouldGenerateSummary` logic:

```typescript
// BEFORE (broken — blocks rolling summaries):
shouldGenerateSummary: trimmedMessages.length > 0 && !summaryText,

// AFTER (correct — fires on every trim):
shouldGenerateSummary: trimmedMessages.length > 0,
```

The fire-and-forget wiring in `apps/web/src/app/api/advisor/chat/route.ts` already passes `thread?.summaryText` to `generateSummary()`, so the merge path activates naturally.

### Step 3: Update Tests

The existing test in `packages/advisor/__tests__/context-window.test.ts` that asserts `shouldGenerateSummary` is `false` when messages are trimmed and a summary exists — **this test must be updated to expect `true`**. This is the behavioral fix, not a test regression.

Verify:
- `shouldGenerateSummary` is `true` when messages trimmed + no existing summary (first trim)
- `shouldGenerateSummary` is `true` when messages trimmed + existing summary present (rolling)
- `shouldGenerateSummary` is `false` when no messages trimmed

**Architecture Decision AD-S20-1:** Rolling summary trigger fires on every trim, not just the first. The `!summaryText` guard made the rolling merge path in `summary-generator.ts` unreachable.

### Quality Gate

```bash
pnpm tsc --noEmit    # 0 errors
pnpm test            # 718 tests, 0 failures (1 test modified, net count unchanged)
```

---

## Phase 2: Add Missing Integration Test

### Step 1: Add Windowed Long Thread Test

In `apps/web/__tests__/api/advisor/chat.test.ts`, add a test that:

1. Creates a thread with enough messages to exceed `CONTEXT_BUDGET.MESSAGE_BUDGET`
2. Calls the chat endpoint
3. Asserts the LLM adapter receives **fewer messages** than total in thread
4. Asserts the most recent messages are present (windowing trims from oldest)
5. Asserts the response is successful

Use token-heavy messages (long content strings and/or tool results with large JSON payloads) to push past the budget threshold. Reference the existing test patterns in that file for mock setup.

### Step 2: Verify Rolling Summary Wiring (if not already covered)

Check whether existing tests cover the trigger → generation → persistence wiring for the case where `summaryText` already exists. If Phase 1 changed the trigger and the existing "summary persistence" test only covers the first-summary case, add:

```typescript
it('triggers rolling summary when messages trimmed and summary already exists', async () => {
  // Setup: Thread with existing summaryText + enough messages to trigger windowing
  // Assert: generateSummary called with existingSummary parameter populated
});
```

### Quality Gate

```bash
pnpm tsc --noEmit    # 0 errors
pnpm test            # 719-720 tests, 0 failures
```

---

## Phase 3: Consolidate Message Converters

### Step 1: Investigate

```bash
grep -n "prismaMessageToInternal\|windowableToMessage" apps/web/src/app/api/advisor/chat/route.ts
```

Map both conversion paths. Understand where Prisma rows enter, where JSON parsing happens, and where `Message` objects are produced.

### Step 2: Create Single Pipeline

Create a clear two-step conversion:

```
Prisma row → parsePrismaMessage() → WindowableMessage → windowableToMessage() → Message
```

Specifically:
1. Create `parsePrismaMessage()` that converts Prisma rows (JSON strings) to `WindowableMessage` (parsed objects)
2. Keep `windowableToMessage()` as the single converter to LLM `Message` type
3. Retire or reduce `prismaMessageToInternal()` — it should compose the two steps above or be removed

### Step 3: Update Call Sites

Update `apps/web/src/app/api/advisor/chat/route.ts` to use the single pipeline. All messages enter as Prisma rows, get parsed once, then flow through windowing and conversion uniformly.

### Step 4: Verify

```bash
pnpm tsc --noEmit    # 0 errors
pnpm test            # Same count as Phase 2, 0 failures
```

No new tests needed — existing tests cover both conversion paths. The refactor must be transparent.

---

## Phase 4: Token Estimation Calibration Logging

### Step 1: Add Development-Mode Log

In `apps/web/src/app/api/advisor/chat/route.ts`, after the tool loop returns a response, add:

```typescript
if (process.env.NODE_ENV === 'development') {
  const estimated = windowResult.estimatedTokens;
  const actual = response.usage?.inputTokens;
  if (actual) {
    const ratio = estimated / actual;
    console.log(
      `[advisor] Token calibration: estimated=${estimated}, actual=${actual}, ` +
      `ratio=${ratio.toFixed(2)} (${ratio > 1 ? 'overestimate' : 'UNDERESTIMATE'} ` +
      `by ${Math.abs((ratio - 1) * 100).toFixed(0)}%)`
    );
  }
}
```

No tests needed. Development-only observability.

**Architecture Decision AD-S20-3:** Token calibration logging in development mode only. Zero production overhead.

### Quality Gate

```bash
pnpm tsc --noEmit    # 0 errors
pnpm test            # Same count, 0 failures
```

---

## Phase 5: Documentation Sync (Project Close-Out)

### 5.1 STALKER_MASTER-PLAN.md → v5.0

This is the largest single artifact. The Master Plan is at v4.0 (covers through Session 11). Update to v5.0:

| Section | Action |
|---------|--------|
| Changelog | Add v5.0 entry covering S12–S20 |
| Status line | → "Complete — Production Ready" |
| Current State Summary | Rewrite for S12–S19 progression |
| Session Overview table | Add S12–S20 rows with test counts |
| Session Status Tracker | Complete through S20 |
| Test Progression | Update ASCII chart to 720+ |
| Current Metrics | Post-S20 values (720+ tests, 62+ files, 22 endpoints, 83 instruments, 5 advisor tools) |
| Remaining Path | → "Production use — active" |
| Architecture Decisions | Add AD-S12 through AD-S20 from session reports |
| Risks | Close remaining open risks |
| Lessons Learned | Add any new lessons from S12–S19 |
| Not in Roadmap | Remove completed items (advisor context window, holiday calendar) |
| Post-MVP Priorities | Mark item 13 complete, item 14 deferred |
| Epics | Mark Epic 11 complete. Add post-Phase II section for S14–S19 |

**Source material:** Session reports for S12–S19 (check `Planning/` directory and repo root for report files). Cross-reference HANDOFF.md and KNOWN-LIMITATIONS.md for accuracy.

### 5.2 HANDOFF.md

| Section | Action |
|---------|--------|
| Last Updated | `2026-02-27 (Post-Session 20)` |
| Last Session | Session 20 — Hardening, Bug Fixes & Project Close-Out |
| Status | Production Ready — Project Complete |
| What Exists | Add context window management (S19), rolling summary fix (S20) |
| What Does Not Exist Yet | Only responsive refinements (accepted deferral) |
| Metrics | Update test count, test files, utility modules |
| Post-MVP Priorities | Mark 13 complete |
| Architecture Decisions | Add S19 + S20 decisions |

### 5.3 CLAUDE.md

Add Session 20 section documenting:
- Rolling summary trigger fix (AD-S20-1)
- Message converter consolidation (AD-S20-2)
- Token calibration logging (AD-S20-3)

### 5.4 AGENTS.md

- Update test count to S20 final
- Update advisor package description to reflect context window management
- Add S19 and S20 to session tracker

### 5.5 KNOWN-LIMITATIONS.md

Verify S19 already closed KL-2 and KL-3. If yes, no changes. If anything was missed, complete it.

### Quality Gate (Final)

```bash
pnpm tsc --noEmit    # 0 errors
pnpm test            # 719-720 tests, 0 failures
```

---

## Exit Criteria

### Blocking (all must pass)

- [ ] Rolling summary trigger fires on subsequent trims — verified by test
- [ ] Existing context window tests pass (modified assertion for rolling case)
- [ ] Windowed long-thread integration test passes in `chat.test.ts`
- [ ] `tsc --noEmit` — 0 errors
- [ ] `pnpm test` — 719+ tests, 0 failures

### Non-Blocking (best effort)

- [ ] Single message conversion pipeline (no dual converters)
- [ ] Token calibration log emits in development mode
- [ ] `STALKER_MASTER-PLAN.md` updated to v5.0
- [ ] `HANDOFF.md` reflects post-S20 state
- [ ] `CLAUDE.md` includes S20 section
- [ ] `AGENTS.md` test count and package descriptions current

---

## Scope Cut Order (if session runs long)

```
LAST CUT:  Phase 5.1 (Master Plan v5.0)     — Largest doc, can be post-session
           Phase 5.2–5.4 (Other docs)        — Mechanical
MODERATE:  Phase 4 (calibration logging)      — Nice to have
           Phase 3 (converter consolidation)  — Refactor, not a bug
NEVER CUT: Phase 1 (rolling summary fix)     — Bug fix
           Phase 2 (missing integration test) — Coverage gap
```

---

## Commit

After all phases complete:

```bash
pnpm tsc --noEmit
pnpm test

git add -A
git commit -m "Session 20: Hardening — rolling summary fix, test gap, converter consolidation, docs close-out"
git push origin main
```

---

## Post-Session

Generate `SESSION-20-REPORT.md` covering:
- Phase-by-phase delivery status
- Rolling summary bug: confirmed or not, fix applied or not needed
- Converter consolidation outcome
- Token calibration — first data point if available
- Test count delta
- Architecture decisions applied
- Documentation artifacts updated
- Scope cuts (if any)
- Exit criteria checklist (copy the checklist above and mark each item)
- Final project metrics
- Project completion statement
