# SESSION-8-HARDENING-ADDENDUM.md

**Date:** 2026-02-23
**Author:** Systems Architect (Review)
**Source:** DEEP_REVIEW_REPORT.md (SWAT Code Review, 2026-02-23)
**Scope:** Remediation items agreed upon from code review, to be executed in Session 8 Phase 0

---

## Context

A deep technical review of the STALKER codebase was conducted after Session 7. The review identified 10 findings (R-001 through R-010). This addendum documents the findings that were validated and agreed upon by the engineering architecture review, assigns them to specific session phases, and defines acceptance criteria for each.

Findings **not** accepted for remediation are documented with rationale in the updated Master Plan (Section 9 "Not in Roadmap" and Section 7 "Risk Register").

---

## Triage Summary

| Review ID | Severity (Review) | Agreed Severity | Disposition | Target |
|-----------|-------------------|-----------------|-------------|--------|
| R-001 | High | High | **Remediate** | S8 Phase 0 |
| R-002 | High | **Critical** | **Remediate** | S8 Phase 0 |
| R-003 | High | High | **Remediate** | S8 Phase 0 |
| R-004 | High | Medium | **Remediate** | S8 Phase 0 |
| R-005 | High | High | **Remediate** | S8 Phase 0 |
| R-006 | Medium | Low | **Remediate** | S9 |
| R-007 | Medium | — | **Rejected** | Post-MVP |
| R-008 | Medium | Medium | **Remediate** | S9 |
| R-009 | Medium | Medium (partial) | **Remediate** (live routes only) | S9 |
| R-010 | Low | — | **Rejected** | N/A |

---

## Session 8 Phase 0: Hardening Tasks

Phase 0 is executed by the **Lead only**, before any teammate work begins. All changes go into a single commit with the message prefix `Session 8 Phase 0: Code review remediation`. All existing tests must continue to pass. New tests are required for each fix.

Estimated Phase 0 duration: **2.5–3.5 hours**.

---

### H-1: Wire Snapshot Rebuild on Transaction/Instrument Mutations

**Source:** R-002 (review) — upgraded to **Critical**
**Spec contract:** §4.2 ("On any transaction insert/edit/delete, delete all snapshots from the earliest affected `tradeAt` date forward and recompute"), §8.2 ("triggers snapshot rebuild from tradeAt forward")

**Problem:** Transaction mutation routes (POST, PUT, DELETE) and instrument DELETE contain comments indicating snapshot rebuild is intentionally skipped. This violates the spec contract. The system currently masks this by having the GET snapshot route perform a full rebuild on every read (R-001), but this is an accidental compensation pattern, not a design choice.

**Fix:**

1. In `apps/web/src/app/api/transactions/route.ts` (POST handler), after successful transaction creation and sell validation, call `rebuildSnapshotsFrom(earliestAffectedDate)` where `earliestAffectedDate` is the new transaction's `tradeAt` date.

2. In `apps/web/src/app/api/transactions/[id]/route.ts` (PUT handler), after successful update, call `rebuildSnapshotsFrom(min(oldTradeAt, newTradeAt))`.

3. In `apps/web/src/app/api/transactions/[id]/route.ts` (DELETE handler), after successful deletion and re-validation, call `rebuildSnapshotsFrom(deletedTransaction.tradeAt)`.

4. In `apps/web/src/app/api/instruments/[id]/route.ts` (DELETE handler), after deleting the instrument and its transactions, call a full snapshot rebuild from the earliest remaining transaction date (or delete all snapshots if no transactions remain).

**Import note:** The `rebuildSnapshotsFrom` function (or equivalent) should already exist in `packages/analytics/`. If the function signature differs from what's described here, use whatever the analytics package exposes. The key contract is: "delete snapshots from date X forward, then recompute."

**Tests required:**
- Integration test: POST transaction → GET snapshot → verify snapshot reflects the new transaction without a second rebuild call.
- Integration test: DELETE transaction → GET snapshot → verify snapshot no longer reflects the deleted transaction.
- Integration test: PUT transaction (change tradeAt date) → GET snapshot → verify both old and new date ranges are correct.

**Acceptance:** All three integration tests pass. No `TODO: trigger snapshot rebuild` or equivalent skip-comments remain in any mutation route.

---

### H-2: Make GET Snapshot Route Read-Only

**Source:** R-001 (review)
**Depends on:** H-1 (must be wired first, otherwise GET returns stale data)

**Problem:** `GET /api/portfolio/snapshot` calls `queryPortfolioWindow` which calls `buildPortfolioValueSeries`, which performs `deleteFrom()` + write operations. A GET request should never cause database writes. This is an HTTP semantic violation and a race condition risk between the Next.js process and the scheduler.

**Fix:**

1. Modify the GET snapshot route to read from the `PortfolioValueSnapshot` table directly, without invoking the build pipeline.

2. If no snapshots exist for the requested window (cold start / empty state), return an empty response with a flag indicating snapshots need building — do **not** trigger a synchronous rebuild inside the GET handler.

3. The rebuild pipeline is now exclusively triggered by:
   - Transaction mutations (H-1)
   - Scheduler post-close cycle (already implemented)
   - Manual refresh endpoint (already a POST)

**Fallback behavior:** If the GET route finds no cached snapshots for the requested window, it should compute the response on-the-fly from transactions + price bars **without writing to the snapshot table**. This preserves the "always shows data" user experience while keeping the GET side-effect-free. The computed-on-the-fly path is acceptable for MVP because the single-user dataset is small (sub-second replay per Spec §5.4).

**Alternative (simpler, acceptable for MVP):** If separating the read-only computation path from the write path is too invasive for Phase 0, the minimum acceptable fix is to make the GET route **check for existing snapshots first** and only rebuild if none exist for the window. This avoids the "every GET triggers a full delete+rebuild" behavior while still providing data on cold start. Document this as a known compromise and schedule the full decoupling for Session 9.

**Tests required:**
- Unit test: Mock the snapshot store's `deleteFrom` and `writeBatch` methods. Call the GET handler. Assert neither is invoked when cached snapshots exist.
- Integration test: Pre-populate snapshots via a POST transaction (which triggers rebuild per H-1). Then call GET snapshot. Verify response matches and no additional rebuild occurred.

**Acceptance:** GET `/api/portfolio/snapshot` never invokes `deleteFrom` or `writeBatch` when cached snapshots exist for the requested window.

---

### H-3: Fix Search Route Response Shape

**Source:** R-003 (review)

**Problem:** `GET /api/market/search` returns `Response.json([])` (bare array). The `SymbolSearchInput` component expects `{ results: [] }` and dereferences `data.results.length`, which throws `TypeError: Cannot read properties of undefined` at runtime.

**Fix:**

1. Change the search route stub to return `Response.json({ results: [] })`.

2. Add defensive parsing in `SymbolSearchInput.tsx`:
   ```typescript
   const results = Array.isArray(data?.results) ? data.results : [];
   ```

3. When the search route is fully implemented (Session 9 or when API keys are configured), ensure the response shape remains `{ results: SymbolSearchResult[] }`.

**Tests required:**
- Route test: GET `/api/market/search?q=VTI` returns `{ results: [] }` with 200 status.
- Component test (if test infrastructure supports it): `SymbolSearchInput` renders without error when API returns `{ results: [] }`.

**Acceptance:** Add Instrument modal → type in search input → no runtime TypeError. Route returns `{ results: [] }`.

---

### H-4: Add Fetch Timeouts to Market Data Providers

**Source:** R-004 (review) — downgraded from High to **Medium**

**Problem:** All three provider implementations (`fmp.ts`, `alpha-vantage.ts`, `stooq.ts`) use `fetch()` without a timeout. A hanging upstream response blocks the scheduler's sequential polling loop indefinitely, preventing all subsequent instruments from being updated.

**Fix:**

1. Create a shared utility in `packages/market-data/src/fetch-with-timeout.ts`:
   ```typescript
   export async function fetchWithTimeout(
     url: string,
     options: RequestInit = {},
     timeoutMs: number = 10000
   ): Promise<Response> {
     const controller = new AbortController();
     const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
     try {
       const response = await fetch(url, {
         ...options,
         signal: controller.signal,
       });
       return response;
     } finally {
       clearTimeout(timeoutId);
     }
   }
   ```

2. Replace all `fetch()` calls in `fmp.ts`, `alpha-vantage.ts`, and `stooq.ts` with `fetchWithTimeout()`.

3. Default timeout: 10 seconds. Configurable via environment variable `PROVIDER_FETCH_TIMEOUT_MS` (optional — hardcoded default is acceptable for MVP).

4. When a timeout fires, the provider should throw a descriptive error that the fallback chain (Spec §6.5) can catch and handle normally (fall back to cached data or secondary provider).

**Tests required:**
- Unit test: `fetchWithTimeout` rejects with `AbortError` after timeout.
- Unit test: Each provider's `getQuote` method handles timeout error gracefully (returns cached data or throws a typed error the fallback chain can catch).

**Acceptance:** No `fetch()` call in `packages/market-data/src/providers/` lacks a timeout. Scheduler polling cycle completes even if one provider hangs.

---

### H-5: Fix Google Fonts Build Dependency

**Source:** R-005 (review) — repo migration artifact

**Problem:** `apps/web/src/app/layout.tsx` uses `next/font/google` which requires network access to `fonts.googleapis.com` at build time. After repo migration to a new machine (or in any restricted network), `pnpm build` fails with `getaddrinfo ENOTFOUND fonts.googleapis.com`.

**Fix:**

1. Download the three font families:
   - Crimson Pro (weights: 400, 500, 600) — display/heading font
   - DM Sans (weights: 400, 500, 600) — body font
   - JetBrains Mono (weight: 400) — monospace/numeric font

2. Place font files in `apps/web/public/fonts/` (or `apps/web/src/fonts/` if using Next.js `next/font/local` import pattern).

3. Replace `next/font/google` imports in `layout.tsx` with `next/font/local` pointing to the local files.

4. Verify the Tailwind config's font-family tokens still reference these fonts correctly (UX Plan §4.1).

**Tests required:**
- `pnpm build` succeeds with no network access to Google Fonts (verified by the fact that the build environment doesn't have access).

**Acceptance:** `pnpm build` exits 0. All three fonts render correctly on all pages.

---

## Session 9 Scope Additions

The following items from the code review are agreed but deferred to Session 9 due to scope/priority. They are added to the Session 9 plan as explicit deliverables.

### S9-CR-1: Zod Date Parameter Validation (R-008)

Add Zod validation for all date query parameters (`startDate`, `endDate`, `asOf`) across all routes that accept them. Invalid dates return HTTP 400 with a structured error body. Create a shared validator in `packages/shared/` or `apps/web/src/lib/`.

Routes affected:
- `GET /api/transactions` (`startDate`, `endDate`)
- `GET /api/portfolio/snapshot` (`asOf`)
- `GET /api/portfolio/timeseries` (`startDate`, `endDate`)
- `GET /api/portfolio/holdings/[symbol]` (if date params exist)

Test: `GET /api/transactions?startDate=not-a-date` returns 400, not 500.

### S9-CR-2: Batch Quote Retrieval in Status Endpoint (R-006)

Refactor `GET /api/market/status` to fetch all latest quotes in a single Prisma query instead of N individual `findFirst` calls. Read polling interval and budget values from environment/config instead of hardcoded constants.

Test: Endpoint latency does not increase linearly with instrument count.

### S9-CR-3: Route-Level Smoke Tests for Live Endpoints (R-009)

Add route-level tests for production endpoints that currently lack direct route-import tests:
- `GET /api/portfolio/snapshot`
- `GET /api/portfolio/timeseries`
- `GET /api/portfolio/holdings`
- `GET /api/portfolio/holdings/[symbol]`
- `GET /api/market/status`
- `GET /api/market/quote`
- `GET /api/market/history`

Do **not** test placeholder/stub routes (advisor, bulk, search-when-unimplemented). Those are tested when implemented.

Each test: seed data → call route → assert 200 + correct response shape.

---

## Phase 0 Execution Order

The hardening tasks have dependencies and should be executed in this order:

```
H-5 (fonts)          — unblocks `pnpm build` validation for all subsequent work
    ↓
H-3 (search shape)   — trivial, 15 min, clears a runtime crash
    ↓
H-4 (fetch timeouts) — isolated to market-data package, no cross-cutting deps
    ↓
H-1 (mutation rebuild) — core data consistency fix, most complex
    ↓
H-2 (GET read-only)  — depends on H-1 being wired first
    ↓
Verify: `tsc --noEmit` 0 errors, `pnpm test` all pass, `pnpm build` exits 0
```

After Phase 0, the lead verifies all quality gates before proceeding to Session 8 Phase 1 (advisor backend).

---

## Acceptance Gate

Phase 0 is complete when:

1. `pnpm build` succeeds (H-5).
2. `tsc --noEmit` reports 0 errors.
3. All existing 407 tests pass with 0 regressions.
4. New tests from H-1 through H-5 pass (target: 10–15 new tests).
5. No mutation route contains a "skip rebuild" comment or TODO.
6. GET `/api/portfolio/snapshot` does not invoke `deleteFrom`/`writeBatch` when cached snapshots exist.
7. GET `/api/market/search` returns `{ results: [] }`, not `[]`.
8. All provider `fetch()` calls use `fetchWithTimeout()`.
9. `layout.tsx` uses `next/font/local`, not `next/font/google`.
