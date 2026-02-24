# KNOWN-LIMITATIONS.md — STALKER Known Gaps

**Last Updated:** 2026-02-24 (Session 10)

This document catalogues known limitations in STALKER. Each entry includes the impact assessment and any existing mitigations.

---

## Resolved in Session 10

| ID | Limitation | Resolution |
|----|-----------|------------|
| W-3 | Snapshot rebuild outside Prisma transaction | AD-S10a: Wrapped in `prisma.$transaction()` with 30s timeout |
| W-4 | GET snapshot writes to DB on cold start | AD-S10b: GET is read-only; explicit POST /api/portfolio/rebuild added |
| W-5 | Anthropic tool_result message translation | Block comment added documenting the translation and rationale |
| W-8 | Decimal formatting in tool executors | `formatNum()` uses `Decimal.toFixed(2)` instead of `parseFloat()` |

## Current Limitations

| ID | Limitation | Impact | Mitigation |
|----|-----------|--------|------------|
| -- | No holiday/half-day market calendar | Polling on holidays wastes API calls | No incorrect data produced; staleness indicator covers the gap |
| -- | Advisor context window not managed | Long threads may exceed token limit | Transparent error from LLM; user can start new thread |
| -- | No summary generation for long threads | `summaryText` column exists but is never populated | Manual thread clearing is the workaround |
| -- | Bulk paste date conversion uses noon UTC | Timezone-specific trading session times not captured | Matches existing single-transaction pattern; acceptable for daily-resolution data |
