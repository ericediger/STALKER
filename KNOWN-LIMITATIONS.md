# KNOWN-LIMITATIONS.md — STALKER MVP Known Gaps

**Last Updated:** 2026-02-24 (Session 9)

This document catalogues known limitations in the STALKER MVP. Each entry includes the impact assessment and any existing mitigations.

---

| ID | Limitation | Impact | Mitigation |
|----|-----------|--------|------------|
| W-3 | Snapshot rebuild runs outside Prisma transaction | Race condition: user could see stale snapshot during rebuild | Self-corrects on next page load; sub-second rebuild makes the window tiny |
| W-4 | GET snapshot writes to DB on cold start | Side-effecting GET violates HTTP semantics | Acceptable for single-user local app; fix by moving rebuild to startup or first mutation |
| W-5 | Anthropic tool_result message translation | Tool results sent as user-role messages with content blocks | Works correctly with Anthropic API; would need adapter changes if switching to OpenAI |
| W-8 | Decimal formatting in tool executors | `formatNum()` truncates to 2 decimal places | Sufficient for dollar values; share quantities may lose sub-cent precision in advisor responses |
| -- | No holiday/half-day market calendar | Polling on holidays wastes API calls | No incorrect data produced; staleness indicator covers the gap |
| -- | No `prefers-reduced-motion` support | Animations always play regardless of user preference | Non-blocking; all animations are decorative |
| -- | Advisor context window not managed | Long threads may exceed token limit | Transparent error from LLM; user can start new thread |
| -- | No summary generation for long threads | `summaryText` column exists but is never populated | Manual thread clearing is the workaround |
