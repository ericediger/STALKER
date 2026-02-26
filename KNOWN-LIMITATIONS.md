# KNOWN-LIMITATIONS.md — STALKER Known Gaps

**Last Updated:** 2026-02-26 (Session 18)

This document catalogues known limitations in STALKER. Each entry includes the impact assessment and any existing mitigations.

---

## Resolved in Session 10

| ID | Limitation | Resolution |
|----|-----------|------------|
| W-3 | Snapshot rebuild outside Prisma transaction | AD-S10a: Wrapped in `prisma.$transaction()` with 30s timeout |
| W-4 | GET snapshot writes to DB on cold start | AD-S10b: GET is read-only; explicit POST /api/portfolio/rebuild added |
| W-5 | Anthropic tool_result message translation | Block comment added documenting the translation and rationale |
| W-8 | Decimal formatting in tool executors | `formatNum()` uses `Decimal.toFixed(2)` instead of `parseFloat()` |

## Resolved in Session 11

| ID | Limitation | Resolution |
|----|-----------|------------|
| -- | FMP `/api/v3/` endpoints dead for new accounts | Migrated all FMP calls to `/stable/` endpoints (search-symbol, quote) |
| -- | Stooq unreliable (no formal API, CAPTCHA risk) | Replaced with Tiingo provider; Stooq code deprecated |
| -- | No per-hour rate limit bucket | Added sliding window per-hour bucket to RateLimiter for Tiingo (50/hr) |
| -- | Tiingo HTTP 200 with text body on rate limit | TiingoProvider uses text-first JSON parsing to detect non-JSON error bodies |

## Resolved in Session 17

| ID | Limitation | Resolution |
|----|-----------|------------|
| KL-1 | No holiday/half-day market calendar | NYSE observed holidays for 2025-2026 added. `isTradingDay()` skips holidays for US exchanges. Half-days not tracked (negligible waste). Update annually. |

## Current Limitations

| ID | Limitation | Impact | Mitigation |
|----|-----------|--------|------------|
| KL-2 | Advisor context window not managed | Long threads may exceed token limit | Transparent error from LLM; user can start new thread |
| KL-3 | No summary generation for long threads | `summaryText` column exists but is never populated | Manual thread clearing is the workaround |
| KL-4 | Bulk paste date conversion uses noon UTC | Timezone-specific trading session times not captured | Matches existing single-transaction pattern; acceptable for daily-resolution data |
| KL-5 | Single provider dependency for historical bars | Tiingo is the sole history provider; no fallback if Tiingo is down | FMP free tier has no history support; AV free tier too limited. If Tiingo is unreachable, `getHistory()` returns empty array. Existing price bars in the database are unaffected. |
| KL-6 | Rate limiter is in-process only | Scheduler and Next.js maintain separate rate limiter states | Single user, manual refresh is rare, providers have tolerance. Post-MVP: track call counts in SQLite `ProviderCallLog` table. |
