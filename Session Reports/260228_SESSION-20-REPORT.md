# SESSION-20-REPORT — Hardening, Bug Fixes & Project Close-Out

**Date:** 2026-02-28
**Session Type:** Hardening + Documentation (Solo)
**Duration:** ~1 session
**Commit:** `19942e7`

---

## Summary

Session 20 was the project's closing sprint. All five phases delivered with zero scope cuts:

1. **Rolling summary trigger fix** — Bug confirmed and fixed (AD-S20-1)
2. **Missing integration tests** — +2 tests for windowed long-thread and rolling summary wiring
3. **Message converter consolidation** — Single pipeline, dead code removed (AD-S20-2)
4. **Token calibration logging** — Development-mode observability added (AD-S20-3)
5. **Documentation close-out** — Master Plan v5.0, HANDOFF, CLAUDE.md, AGENTS.md all current

---

## Phase-by-Phase Delivery

### Phase 1: Rolling Summary Trigger Fix (CRITICAL)

**Bug confirmed.** Line 102 of `context-window.ts`:

```typescript
// BEFORE (broken):
shouldGenerateSummary: trimmedMessages.length > 0 && !summaryText,

// AFTER (fixed):
shouldGenerateSummary: trimmedMessages.length > 0,
```

The `!summaryText` guard prevented the rolling merge path in `summary-generator.ts` from ever executing. The `existingSummary` parameter was dead code. After the fix, rolling summaries fire on every trim — the merge path activates naturally because the chat route already passes `thread?.summaryText` to `generateSummary()`.

**Test updated:** Changed assertion from `shouldGenerateSummary = false` to `true` when messages trimmed and summary exists. This is the behavioral fix, not a regression.

**Architecture Decision AD-S20-1:** Rolling summary trigger fires on every trim, not just the first.

### Phase 2: Missing Integration Tests

Added two tests to `apps/web/__tests__/api/advisor/chat.test.ts`:

1. **`sends windowed messages when thread exceeds budget`** — Creates 20-message thread, mocks windowing to return 6 kept + 14 trimmed. Verifies tool loop receives fewer messages than total.

2. **`triggers rolling summary when messages trimmed and summary already exists`** — Creates thread with existing `summaryText`, triggers windowing. Verifies `generateSummary` called with the existing summary parameter. Verifies updated summary persisted to thread.

**Test count: 718 → 720 (+2)**

### Phase 3: Message Converter Consolidation

**Investigation:** `prismaMessageToInternal()` (lines 434–463 of route.ts) was defined but **never called**. Session 19 replaced it with inline parsing at lines 542–549 that produced `WindowableMessage[]` directly, then used `windowableToMessage()` for the final conversion.

**Consolidation:**
- Created `parsePrismaMessage()` — extracts the inline parsing into a named function
- Kept `windowableToMessage()` as the single LLM Message converter
- Removed unused `prismaMessageToInternal()`
- Replaced inline parsing with `historyMessages.map(parsePrismaMessage)`

**Result:** Single pipeline: `Prisma row → parsePrismaMessage() → WindowableMessage → windowableToMessage() → Message`

**Architecture Decision AD-S20-2:** Single message conversion pipeline eliminates dual converter maintenance risk.

### Phase 4: Token Calibration Logging

Extended `executeToolLoop` return type to include `usage` from the final LLM response. Added development-mode logging to the chat route:

```
[advisor] Token calibration: estimated=1234, actual=1100, ratio=1.12 (overestimate by 12%)
```

Logged only when `process.env.NODE_ENV === 'development'` and `result.usage?.inputTokens` is available. Zero production overhead.

**Architecture Decision AD-S20-3:** Token calibration logging in development mode only.

### Phase 5: Documentation Close-Out

| Document | Action |
|----------|--------|
| `STALKER_MASTER-PLAN.md` | Rewritten to v5.0. S12–S20 complete. All epics marked done. 36 architecture decisions documented. 17 lessons learned. All risks closed or accepted. Final metrics. |
| `HANDOFF.md` | Updated to post-S20. 720 tests, project complete status. S20 changes documented. |
| `CLAUDE.md` | Updated header date. Added AD-S20-1/2/3. Updated chat route internals description. |
| `AGENTS.md` | Updated header date. Test count 718→720. Advisor package description enhanced. |
| `KNOWN-LIMITATIONS.md` | Verified current — KL-2/KL-3 already closed by S19. No changes needed. |

---

## Architecture Decisions Applied

| # | Decision | Rationale |
|---|----------|-----------|
| AD-S20-1 | Rolling summary trigger fires on every trim, not just the first | Original `!summaryText` guard made the rolling merge path in `summary-generator.ts` unreachable. |
| AD-S20-2 | Single message conversion pipeline: `parsePrismaMessage → windowableToMessage` | Eliminates dual converter paths. One parse step, one conversion step. |
| AD-S20-3 | Token calibration logging in development mode only | Zero production overhead. Provides data to validate the 3.0–3.5 chars/token heuristic. |

---

## Test Count Delta

| Phase | Tests Added | Tests Modified | Net Change |
|-------|------------|----------------|------------|
| Phase 1 | 0 | 1 (assertion changed false→true) | 0 |
| Phase 2 | 2 (windowed thread, rolling summary wiring) | 0 | +2 |
| Phase 3 | 0 | 0 | 0 |
| Phase 4 | 0 | 0 | 0 |
| **Total** | **2** | **1** | **+2** |

**Final: 720 tests, 62 files, 0 failures, 0 TypeScript errors**

---

## Scope Cuts

**None.** All five phases delivered. Zero scope cuts maintained through 20 sessions.

---

## Exit Criteria Checklist

### Blocking

- [x] EC-1: Rolling summary trigger fires on subsequent trims — verified by test
- [x] EC-2: Existing context window tests pass (modified assertion for rolling case)
- [x] EC-3: Windowed long-thread integration test passes in `chat.test.ts`
- [x] EC-4: `tsc --noEmit` — 0 errors
- [x] EC-5: `pnpm test` — 720 tests, 0 failures

### Non-Blocking

- [x] EC-6: Single message conversion pipeline (no dual converters)
- [x] EC-7: Token calibration log emits in development mode
- [x] EC-8: STALKER_MASTER-PLAN.md updated to v5.0
- [x] EC-9: HANDOFF.md reflects post-S20 state
- [x] EC-10: CLAUDE.md includes S20 section
- [x] EC-11: AGENTS.md test count and package descriptions current

**All 11 exit criteria met.**

---

## Final Project Metrics

| Metric | Value |
|--------|-------|
| Sessions completed | 20 |
| Scope cuts | 0 |
| Test count | 720 |
| Test files | 62 |
| TypeScript errors | 0 |
| API endpoints | 22 |
| UI components | 49 |
| Data hooks | 12 |
| Advisor tools | 5 |
| Prisma tables | 7 |
| Packages | 5 |
| Architecture decisions | 36 (AD-S1 through AD-S20-3) |
| Lessons learned | 17 |
| Real portfolio | 83 instruments, 87 transactions, ~53,600 bars |
| Known limitations (functional) | 0 |
| Known limitations (operational, accepted) | 3 (KL-4/5/6) |
| Post-MVP priorities delivered | 13 of 14 (1 accepted deferral) |

---

## Project Completion Statement

STALKER is **complete**. The system tracks a real 83-instrument portfolio with correct FIFO lot accounting, Decimal-precise PnL computation, and an LLM advisor with context window management. Every planned feature has been delivered. Every known bug has been fixed. Every document reflects the true state of the system.

The arc from Session 1 (monorepo scaffolding + FIFO engine) to Session 20 (documentation close-out + last bug fix) spans 20 sessions with zero scope cuts, 71→720 tests (10× growth), and 0→22 API endpoints all implemented.

Future work is discretionary: responsive layout refinements for a user who is on desktop, or feature additions from the "Not in Roadmap" list if needs evolve.
