# Deep Technical Review Report (SWAT)

Date: 2026-02-23  
Repository: `STALKER`  
Requested playbook reference: `DEEP_CODE_REVIEW_PLAN.md`

## 1) Review Scope and Reality Check

The referenced playbook (`DEEP_CODE_REVIEW_PLAN.md`) is written for a Chrome extension repository ("SPEAKEASY"), but the inspected repository is a Next.js + pnpm monorepo for STALKER.

Adjusted in-scope end-to-end boundaries for this repo:

- UI pages/components/hooks -> Next.js API routes
- API routes -> analytics engine -> Prisma/SQLite
- Scheduler -> market-data providers -> quote cache/snapshots
- Data model and mutation/read consistency
- Build, test, and release ergonomics

No claims are made for browser extension surfaces because they do not exist in this repository.

## 2) Baseline Command Evidence

### 2.1 `npm run build`

Command:

```bash
npm run build
```

Result: **Failed** (exit 1)

Evidence summary:

- `next build` attempted to fetch Google Fonts and failed DNS resolution:
  - `getaddrinfo ENOTFOUND fonts.googleapis.com`
- Build errors:
  - `Failed to fetch Crimson Pro`
  - `Failed to fetch DM Sans`
  - `Failed to fetch JetBrains Mono`

Relevant source:

- `apps/web/src/app/layout.tsx:2`

### 2.2 `npx tsc --noEmit`

Command:

```bash
npx tsc --noEmit
```

Result: **Passed** (exit 0, no diagnostics)

### 2.3 `npm audit --omit=dev`

Command:

```bash
npm audit --omit=dev
```

Result: **Failed** (exit 1)

Evidence summary:

- `ENOLOCK` (requires `package-lock.json`)
- This repository uses pnpm lockfiles, not npm lockfiles.

### 2.4 Audit fallback (`pnpm audit --prod`)

Command:

```bash
pnpm audit --prod
```

Result: **Failed in environment** (exit 1)

Evidence summary:

- DNS/network failure:
  - `ENOTFOUND registry.npmjs.org`

Implication:

- Dependency vulnerability posture is **unverified in this environment**.

### 2.5 `pnpm test`

Command:

```bash
pnpm test
```

Result: **Passed**

Evidence summary:

- `Test Files 30 passed (30)`
- `Tests 407 passed (407)`

## 3) Architecture and Coupling Map

## 3.1 High-level flow

```text
Pages/Components/Hooks
  -> /api/* routes (Next App Router)
    -> @stalker/analytics (lot engine, series rebuild, window query)
    -> Prisma (SQLite)
    -> @stalker/market-data (calendar/providers/rate-limits/cache)
    -> @stalker/scheduler (polling process)
```

### 3.2 Coupling hotspots

1. Read path coupled to write path:
   - `GET /api/portfolio/snapshot` calls `queryPortfolioWindow`
   - `queryPortfolioWindow` calls `buildPortfolioValueSeries`
   - `buildPortfolioValueSeries` deletes + rewrites snapshots
2. Duplicate transaction conversion/serialization logic:
   - Repeated in `transactions/route.ts` and `transactions/[id]/route.ts`
3. Status endpoint blends UX display with backend internals and hardcoded budget constants.
4. Placeholder modules/routes are wired into runtime surface (advisor/search/refresh/bulk), increasing ambiguity.

## 4) De-duplicated Risk Register

Severity model used:

- Critical: release-blocking/exploitable high-impact defect
- High: major user/business risk; next sprint
- Medium: meaningful risk; planned remediation
- Low: cleanup/preventive hardening

| ID | Severity | Category | Owner Recommendation | Exact Location(s) | Evidence |
|---|---|---|---|---|---|
| R-001 | High | Reliability/Performance | Backend Data Platform | `apps/web/src/app/api/portfolio/snapshot/route.ts:164`, `packages/analytics/src/window-query.ts:68`, `packages/analytics/src/value-series.ts:60`, `packages/analytics/src/value-series.ts:221` | Snapshot GET triggers full delete/rebuild/write cycle |
| R-002 | High | Data Consistency | Backend API | `apps/web/src/app/api/transactions/route.ts:125`, `apps/web/src/app/api/transactions/[id]/route.ts:181`, `apps/web/src/app/api/transactions/[id]/route.ts:228`, `apps/web/src/app/api/instruments/[id]/route.ts:69` | Mutation routes explicitly skip snapshot rebuild |
| R-003 | High | Defect/API Contract | Frontend + API | `apps/web/src/app/api/market/search/route.ts:16`, `apps/web/src/components/instruments/SymbolSearchInput.tsx:49`, `apps/web/src/components/instruments/SymbolSearchInput.tsx:54` | Route returns `[]`; UI expects `{ results: [] }` and dereferences `data.results.length` |
| R-004 | High | Reliability | Market Data + Scheduler | `packages/market-data/src/providers/fmp.ts:160`, `packages/market-data/src/providers/alpha-vantage.ts:199`, `packages/market-data/src/providers/stooq.ts:30`, `packages/scheduler/src/poller.ts:168` | No timeout/abort on provider fetch; sequential polling amplifies stuck call impact |
| R-005 | High | Delivery/DevEx | Web Platform | `apps/web/src/app/layout.tsx:2` | Build blocked by remote font fetch dependency |
| R-006 | Medium | Performance/Observability | Backend API | `apps/web/src/app/api/market/status/route.ts:28`, `apps/web/src/app/api/market/status/route.ts:29`, `apps/web/src/app/api/market/status/route.ts:60`, `apps/web/src/app/api/market/status/route.ts:64`, `apps/web/src/app/api/market/status/route.ts:65` | N+1 quote lookups + hardcoded budget/interval values |
| R-007 | Medium | Security | Platform/Security | `README.md:3`, no auth checks in `apps/web/src/app/api/*`, no header/middleware config in `apps/web/next.config.mjs` | Local-first assumption only; no guardrails if exposed beyond localhost |
| R-008 | Medium | Reliability/Input Validation | Backend API | `apps/web/src/app/api/transactions/route.ts:155`, `apps/web/src/app/api/transactions/route.ts:158`, `apps/web/src/app/api/portfolio/snapshot/route.ts:103` | Query params can become invalid Date and trigger Prisma validation errors |
| R-009 | Medium | QA/Delivery | QA + Backend | Route coverage heuristic over `apps/web/src/app/api/**` vs imports in `apps/web/__tests__` | Many live routes appear untested (market/portfolio/advisor/bulk) |
| R-010 | Low | Bloat/Dead Paths | Platform + Product | `apps/web/src/lib/market-data-client.ts:9`, `packages/advisor/src/index.ts:1`, advisor routes, market refresh/search stubs | Runtime-facing placeholders and unused wrappers |

## 5) Finding Cards (Repro + Fix + Verification)

## FC-R-001

- ID: `R-001`
- Severity: High
- Category: Reliability/Performance
- Location:
  - `apps/web/src/app/api/portfolio/snapshot/route.ts:164`
  - `packages/analytics/src/window-query.ts:68`
  - `packages/analytics/src/value-series.ts:60`
- Evidence:
  - `GET /api/portfolio/snapshot` calls `queryPortfolioWindow(...)`
  - `queryPortfolioWindow` calls `buildPortfolioValueSeries(...)`
  - `buildPortfolioValueSeries` performs `snapshotStore.deleteFrom(startDate)` then writes snapshots
- Risk statement / blast radius:
  - Read requests cause write-heavy rebuild work, increasing latency and race susceptibility under concurrent reads.
  - Blast radius: dashboard loads, any snapshot consumers, database churn.
- Reproduction trigger:
  1. Hit `/api/portfolio/snapshot?window=ALL` repeatedly.
  2. Observe repeated rebuild path and write activity.
- Minimal safe fix:
  - Add a read-only mode for snapshot retrieval in GET route; do not rebuild inside request path.
- Ideal fix:
  - Move rebuild to background/incremental pipeline keyed by dirty date ranges from mutations/scheduler updates.
- Verification:
  - Add route test asserting no `deleteFrom`/`writeBatch` invoked during GET.
  - Benchmark latency before/after under repeated snapshot calls.

## FC-R-002

- ID: `R-002`
- Severity: High
- Category: Data Consistency
- Location:
  - `apps/web/src/app/api/transactions/route.ts:125`
  - `apps/web/src/app/api/transactions/[id]/route.ts:181`
  - `apps/web/src/app/api/transactions/[id]/route.ts:228`
  - `apps/web/src/app/api/instruments/[id]/route.ts:69`
- Evidence:
  - Comments in mutation routes indicate snapshot rebuild is skipped.
  - Search showed no call sites to `rebuildSnapshotsFrom` in mutation routes.
- Risk statement / blast radius:
  - Portfolio caches can remain stale after create/update/delete operations.
  - Blast radius: holdings, snapshot, timeseries, dashboard metrics.
- Reproduction trigger:
  1. Mutate transaction/instrument data.
  2. Compare snapshot/timeseries without forcing explicit rebuild path.
- Minimal safe fix:
  - Invoke rebuild from earliest affected trading date after each successful mutation transaction.
- Ideal fix:
  - Job-queue based snapshot invalidation with deduplication and idempotent workers.
- Verification:
  - Add integration tests: mutate -> query snapshot/timeseries -> assert expected values.

## FC-R-003

- ID: `R-003`
- Severity: High
- Category: Defect/API Contract
- Location:
  - `apps/web/src/app/api/market/search/route.ts:16`
  - `apps/web/src/components/instruments/SymbolSearchInput.tsx:49`
  - `apps/web/src/components/instruments/SymbolSearchInput.tsx:54`
- Evidence:
  - Route returns `Response.json([])`.
  - UI code expects `data.results` and accesses `.length`.
  - Runtime repro equivalent in Node: dereferencing `.length` on undefined throws `TypeError`.
- Risk statement / blast radius:
  - Add Instrument search path can hard-fail in user flow.
  - Blast radius: onboarding instrument creation UX.
- Reproduction trigger:
  1. Open Add Instrument modal.
  2. Type into search input.
  3. Endpoint returns `[]`; component attempts `data.results.length`.
- Minimal safe fix:
  - Standardize route response shape: `{ results: [] }`.
  - Defensive parsing with `Array.isArray(data?.results)`.
- Ideal fix:
  - Implement real provider-backed search and formal API schema contract tests.
- Verification:
  - Add tests for empty results, malformed payload, and non-200 responses.

## FC-R-004

- ID: `R-004`
- Severity: High
- Category: Reliability
- Location:
  - `packages/market-data/src/providers/fmp.ts:160`
  - `packages/market-data/src/providers/alpha-vantage.ts:199`
  - `packages/market-data/src/providers/stooq.ts:30`
  - `packages/scheduler/src/poller.ts:168`
- Evidence:
  - Provider fetches do not use timeout/abort.
  - Poller loops sequentially over instruments awaiting each quote.
- Risk statement / blast radius:
  - A hanging upstream request can stall poll cycles and increase staleness.
  - Blast radius: quote freshness, holdings accuracy, status page.
- Reproduction trigger:
  1. Simulate unresolved network call in provider.
  2. Observe poller blocked on await in sequence.
- Minimal safe fix:
  - Add `AbortController` timeout wrappers for all provider HTTP calls.
- Ideal fix:
  - Add bounded concurrency, retries with jitter, and circuit breaker per provider.
- Verification:
  - Scheduler tests for timeout path, fallback behavior, and cycle completion SLA.

## FC-R-005

- ID: `R-005`
- Severity: High
- Category: Delivery/DevEx
- Location:
  - `apps/web/src/app/layout.tsx:2`
- Evidence:
  - `npm run build` failed with `getaddrinfo ENOTFOUND fonts.googleapis.com`.
- Risk statement / blast radius:
  - Build is non-deterministic in offline/restricted network environments.
  - Blast radius: CI/CD, release readiness, reproducible builds.
- Reproduction trigger:
  1. Run `npm run build` without internet/DNS access to Google Fonts.
  2. Build fails.
- Minimal safe fix:
  - Use `next/font/local` with checked-in font assets.
- Ideal fix:
  - Ensure all build-time assets are local and checksum-pinned.
- Verification:
  - Add offline build CI lane; confirm successful `npm run build`.

## FC-R-006

- ID: `R-006`
- Severity: Medium
- Category: Performance/Observability
- Location:
  - `apps/web/src/app/api/market/status/route.ts:28`
  - `apps/web/src/app/api/market/status/route.ts:29`
  - `apps/web/src/app/api/market/status/route.ts:60`
  - `apps/web/src/app/api/market/status/route.ts:64`
  - `apps/web/src/app/api/market/status/route.ts:65`
- Evidence:
  - Per-instrument quote query in loop (`findFirst` each).
  - Response fields include hardcoded polling interval and budget values.
- Risk statement / blast radius:
  - Degrades as instrument count scales; user sees potentially inaccurate status telemetry.
- Reproduction trigger:
  1. Increase number of instruments.
  2. Observe increased latency and unchanged static budget values.
- Minimal safe fix:
  - Batch quote retrieval and compute freshness in-memory.
  - Source budget values from actual limiter/config.
- Ideal fix:
  - Dedicated status projection table refreshed by scheduler.
- Verification:
  - Measure endpoint latency vs instrument count; assert telemetry values match runtime config.

## FC-R-007

- ID: `R-007`
- Severity: Medium
- Category: Security
- Location:
  - `README.md:3` plus API routes under `apps/web/src/app/api/**`
- Evidence:
  - Repository intentionally states no auth/cloud/multi-tenancy.
  - No auth checks or security headers/middleware detected.
- Risk statement / blast radius:
  - Safe only under strict localhost trust boundary; accidental exposure raises risk.
- Reproduction trigger:
  1. Bind app to non-local interface/proxy.
  2. API routes are callable without auth barriers.
- Minimal safe fix:
  - Add optional deployment guard flag requiring local loopback or shared secret header.
- Ideal fix:
  - Add auth/session model + CSRF posture + hardened headers for any non-local deployment mode.
- Verification:
  - Security tests for blocked unauthenticated access when guard enabled.

## FC-R-008

- ID: `R-008`
- Severity: Medium
- Category: Reliability/Input Validation
- Location:
  - `apps/web/src/app/api/transactions/route.ts:155`
  - `apps/web/src/app/api/transactions/route.ts:158`
  - `apps/web/src/app/api/portfolio/snapshot/route.ts:103`
- Evidence:
  - Direct `new Date(...)` parsing from query values without strict validation.
  - Prisma rejects invalid Date objects (observed with `PrismaClientValidationError`).
  - Snapshot `asOf` can become invalid and produce malformed date strings.
- Risk statement / blast radius:
  - Unexpected 500s on malformed params; inconsistent error semantics.
- Reproduction trigger:
  1. Request `GET /api/transactions?startDate=not-a-date`.
  2. Observe Prisma validation failure path.
- Minimal safe fix:
  - Validate all date query params with Zod and return 400 consistently.
- Ideal fix:
  - Shared query param validators + centralized error taxonomy.
- Verification:
  - Add route tests for invalid date inputs returning deterministic 400 responses.

## FC-R-009

- ID: `R-009`
- Severity: Medium
- Category: QA/Delivery
- Location:
  - Route inventory vs test imports
- Evidence:
  - Heuristic route coverage shows several routes are untested by direct route-import tests:
    - `market/{history,quote,refresh,search,status}`
    - `portfolio/{snapshot,timeseries,holdings,holdings/[symbol]}`
    - `advisor/*`
    - `transactions/bulk`
- Risk statement / blast radius:
  - Regression risk concentrated in user-facing portfolio/market APIs.
- Reproduction trigger:
  - Introduce route behavior change in untested endpoint; no direct route-test catch.
- Minimal safe fix:
  - Add route-level tests for all production endpoints except intentional placeholders.
- Ideal fix:
  - Contract tests + integration matrix across key user journeys.
- Verification:
  - CI enforces route coverage threshold for non-placeholder API routes.

## FC-R-010

- ID: `R-010`
- Severity: Low
- Category: Bloat/Dead Paths
- Location:
  - `apps/web/src/lib/market-data-client.ts:9` (unused wrapper)
  - `packages/advisor/src/index.ts:1` (placeholder package)
  - advisor and bulk/search/refresh placeholder routes
- Evidence:
  - Search references show wrapper not consumed.
  - Placeholder package/routes are runtime-visible.
- Risk statement / blast radius:
  - Increases confusion and maintenance drag; may mislead UI/API consumers.
- Reproduction trigger:
  - Discover endpoints return 501 or stubs in live UI paths.
- Minimal safe fix:
  - Feature-flag or hide placeholder routes/components from production nav/flows.
- Ideal fix:
  - Implement or remove placeholders with explicit roadmap gates.
- Verification:
  - Endpoint inventory check in CI for accidental stub exposure.

## 6) Top 10 Systemic Risks (Executive Summary)

1. Read path triggers write-side rebuilds (`/api/portfolio/snapshot`).
2. Snapshot invalidation not wired on transaction/instrument mutations.
3. Broken search payload contract in add-instrument path.
4. Provider network calls lack timeout/abort safeguards.
5. Build fails in restricted networks due remote font fetch.
6. Status endpoint N+1 lookup pattern and synthetic telemetry fields.
7. Security posture depends entirely on local-only deployment assumptions.
8. Date query parameters not uniformly validated.
9. Gaps in direct API route test coverage for key portfolio/market routes.
10. Runtime-facing placeholders and unused wrappers increase operational ambiguity.

## 7) Remediation Backlog

## 7.1 Quick Wins (0-2 days)

1. Fix `/api/market/search` response shape to `{ results: [] }` and harden UI parsing.
2. Add Zod query validation for `startDate`, `endDate`, and `asOf` across affected routes.
3. Add provider fetch timeouts (e.g., 8-12s) with `AbortController`.
4. Swap Google Fonts loading to local assets in `next/font/local`.
5. Mark/compute market status budget fields from actual config/state (remove hardcoded constants).
6. Add smoke tests for `market/status`, `portfolio/snapshot`, `portfolio/timeseries`, `portfolio/holdings`.

## 7.2 Short-Term Fixes (Sprint)

1. Wire snapshot rebuild from mutations (transactions/instruments).
2. Decouple GET snapshot route from destructive rebuild logic.
3. Refactor market status route to batch quote retrieval.
4. Eliminate duplicate transaction mapper/serializer logic via shared helper module.
5. Add deployment guard mode for non-local access (header token or loopback enforcement).

## 7.3 Strategic Refactors (Quarter)

1. Incremental snapshot engine with dirty-range queue and idempotent workers.
2. Scheduler resilience model: bounded concurrency, retries, circuit breaker, and telemetry.
3. Formal API contracts (OpenAPI/Zod schemas) with contract-test enforcement.
4. Placeholder governance: feature flags and CI checks to prevent accidental stub exposure.

## 8) Owners and Verification for High Severity Items

| Risk ID | Proposed Owner | Completion Criteria | Verification |
|---|---|---|---|
| R-001 | Backend Data Platform | Snapshot GET is read-only | Route tests + DB write assertions under GET load |
| R-002 | Backend API | Mutation routes trigger consistent snapshot invalidation/rebuild | Integration tests from CRUD to portfolio outputs |
| R-003 | Frontend + API | Search contract is stable and null-safe | Component + route tests for empty/error/success payloads |
| R-004 | Market Data + Scheduler | Provider timeouts and no cycle hangs | Scheduler timeout/fallback tests |
| R-005 | Web Platform | Offline/restricted build succeeds | Offline CI build lane passes |

## 9) Residual Risk and Explicit Uncertainty

1. Dependency CVE status is not established in this environment because:
   - `npm audit --omit=dev` cannot run without `package-lock`.
   - `pnpm audit --prod` failed due DNS/network (`ENOTFOUND registry.npmjs.org`).
2. Extension-specific review procedures in `DEEP_CODE_REVIEW_PLAN.md` could not be applied literally because this repo is not a browser extension codebase.

## 10) Command Appendix (Executed)

```bash
npm run build
npx tsc --noEmit
npm audit --omit=dev
pnpm audit --prod
pnpm test
```

Additional evidence collection commands used:

- file inventory and route mapping (`find`, `rg`, `nl -ba`, `sed`)
- test-surface heuristic checks over `apps/web/src/app/api/**` vs `apps/web/__tests__`
- runtime behavior probes for payload mismatch and invalid Date handling

