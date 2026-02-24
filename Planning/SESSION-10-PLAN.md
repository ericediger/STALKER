# SESSION-10-PLAN.md — Hardening + Bulk Paste + CI

**Project:** STALKER (Stock & Portfolio Tracker + LLM Advisor)
**Session:** 10 (Post-MVP Hardening)
**Date:** 2026-02-24
**Author:** Systems Architect
**Inputs:** Session 9 Report, SPEC v4.0 (§9.3.1, §6.3, §8.2), UX Plan (§3.4), KNOWN-LIMITATIONS.md, Architecture Review Notes
**Status:** Ready for execution

---

## 1. Session Objective

Session 9 shipped the MVP. Session 10 closes every known data-integrity gap, delivers the first post-MVP feature (bulk transaction paste — the spec's designated "Next" priority), and establishes CI so the 469-test regression suite runs on every push. This is a "harden and extend" session, not a feature sprint.

### Priority Order (Session-Specific)

```
Data integrity fixes > CI pipeline > Bulk paste feature > Performance benchmark > Polish
```

This reflects the global priority stack: **Correctness > Core CRUD > everything else.** The bulk paste feature is the highest-value user-facing addition, but it is not useful if snapshot rebuilds can corrupt data under concurrent writes.

### Exit Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| EC-1 | Snapshot rebuild wrapped in Prisma `$transaction` | Unit test: concurrent write during rebuild doesn't produce partial snapshot |
| EC-2 | `GET /api/portfolio/snapshot` has no write side effects | Code inspection + test: GET returns 200 with cached data or empty object, never triggers rebuild |
| EC-3 | Cross-validation script runs as part of `pnpm test` | `pnpm test` output includes cross-validation test file |
| EC-4 | GitHub Actions CI config passes: test, build, type-check | Green CI run on push to main |
| EC-5 | `POST /api/transactions/bulk` validates and inserts batch | Integration test: 10-row batch with 2 invalid rows → 8 inserted, 2 errors returned |
| EC-6 | Bulk paste UI: parse → preview → confirm → import flow | Manual verification: paste 5 tab-separated rows, see preview, confirm, see toast |
| EC-7 | Snapshot rebuild benchmark with 200+ transactions completes sub-second | Benchmark script output: < 1000ms for full replay |
| EC-8 | All existing tests still pass (zero regressions) | `pnpm test`: 469+ tests, 0 failures |
| EC-9 | `pnpm build` clean | Zero TypeScript errors, all pages compile |
| EC-10 | `prefers-reduced-motion` respected for animations | CSS audit: all animations gated behind media query |

### Scope Cuts (If Time Pressure)

If the session runs long, cut in this order (last item cut first):

1. ~~EC-10: `prefers-reduced-motion`~~ — cosmetic, no data impact
2. ~~EC-7: Performance benchmark~~ — informational, not blocking
3. ~~EC-4: GitHub Actions CI~~ — can be added in a follow-up commit
4. **Never cut EC-1, EC-2, EC-5, EC-6, EC-8, EC-9** — these are the session's reason for existing

---

## 2. Phase 0: Data Integrity Fixes (Lead — Blocking Gate)

Phase 0 must be completed and verified before teammates begin. These fixes protect the correctness guarantees that 9 sessions built.

### 2.1 W-3: Snapshot Rebuild Transaction Boundary

**Problem:** The snapshot rebuild path (delete snapshots from affected date forward → recompute → insert new snapshots) is not wrapped in a database transaction. If the scheduler writes a `LatestQuote` and triggers its own rebuild concurrently with a user-initiated transaction write, partial snapshots can result.

**Fix:** Wrap the delete-recompute-insert cycle in `prisma.$transaction()`.

**Location:** Wherever the snapshot rebuild is invoked — likely in the analytics package or the API route handler that calls it after transaction CRUD.

**Search pattern:** Look for the delete-then-insert sequence on `PortfolioValueSnapshot`:
```
prisma.portfolioValueSnapshot.deleteMany({ where: { date: { gte: ... } } })
// ... recompute ...
prisma.portfolioValueSnapshot.createMany(...)
```

**Target state:**
```typescript
await prisma.$transaction(async (tx) => {
  await tx.portfolioValueSnapshot.deleteMany({ where: { date: { gte: affectedDate } } });
  // ... recompute using tx for any reads needed ...
  await tx.portfolioValueSnapshot.createMany({ data: newSnapshots });
});
```

**SQLite note:** SQLite serializes writes via a single-writer lock, so the `$transaction` wrapper is cheap. But it's still necessary — without it, a process crash between delete and insert leaves the database in a state where snapshots are missing and the next read returns incomplete data. The transaction ensures atomicity.

**Test:** Write a test that verifies the snapshot count is consistent before and after a rebuild, and confirms that if the recompute throws mid-flight, no snapshots are deleted (the transaction rolls back).

### 2.2 W-4: Remove GET Side Effect

**Problem:** `GET /api/portfolio/snapshot` triggers a snapshot rebuild on cold start (when no snapshots exist). GETs should be safe and idempotent — they should never write to the database.

**Fix (Option A — preferred: Explicit rebuild endpoint):**
- `GET /api/portfolio/snapshot` reads from cache only. If no snapshots exist, return an empty/null response with a flag indicating rebuild is needed (e.g., `{ data: null, needsRebuild: true }`).
- Add `POST /api/portfolio/rebuild` (or reuse the existing refresh mechanism) to trigger rebuild explicitly.
- The UI detects the empty/needsRebuild state and either auto-triggers a POST rebuild or shows a "Rebuild" button.

**Why not Option B (startup hook):** Moving rebuild to a startup initializer couples database writes to the server boot sequence. If the app restarts frequently during development, unnecessary rebuilds fire on every restart. The explicit POST is cleaner, testable, and predictable.

**Test:** Confirm `GET /api/portfolio/snapshot` with an empty `PortfolioValueSnapshot` table returns a well-shaped empty response (not an error) and does not create any rows.

### 2.3 W-8: Decimal Formatting in Advisor Tool Executors

**Problem:** The Session 9 numeric audit found that `formatNum()` in the advisor chat route uses `parseFloat(value.toFixed(2))` for LLM-facing text. While not user-facing UI, this can produce floating-point artifacts in the advisor's responses (e.g., "$10,000.004999999" instead of "$10,000.00").

**Fix:** Use `Decimal.toFixed(2)` instead of the `parseFloat(value.toFixed(2))` pattern. The LLM receives a string either way — make it a correct string.

**Location:** Advisor tool executor functions that format numeric values for inclusion in tool results sent to the LLM.

### 2.4 Intentional Code Comments

Add comments to locations where future contributors might "fix" intentional choices:

1. **`packages/advisor/src/tool-loop.ts:94`** — Add: `// Intentional: || (not ??) catches empty strings from LLM, not just null/undefined`
2. **`apps/web/src/lib/chart-utils.ts`** — Verify existing AD-S6c comment. If absent, add: `// AD-S6c: Number() exception — TradingView requires native numbers. Do not convert to Decimal.`
3. **`apps/web/src/lib/chart-candlestick-utils.ts`** — Same as above.

### 2.5 W-5: Document Anthropic Tool Result Workaround

**Problem:** The Session 9 report lists W-5 (Anthropic tool_result message translation workaround) as a known limitation but doesn't describe the workaround. Undocumented translation logic is a maintenance landmine.

**Fix:** Add a block comment in `packages/advisor/src/anthropic-adapter.ts` at the point where tool results are translated, explaining:
- What the Anthropic API expects for tool_result messages
- What the internal STALKER message format looks like
- The specific transformation being applied
- Why this workaround exists (API format mismatch)

### Phase 0 Verification Gate

Before teammates start, all five items must be complete and verified:
- [ ] `pnpm test` — 469/469 still pass (plus any new tests from 2.1/2.2)
- [ ] `pnpm build` — clean
- [ ] `pnpm tsc --noEmit` — zero errors
- [ ] Manual: `GET /api/portfolio/snapshot` with empty DB returns empty response, no writes
- [ ] Manual: Transaction create triggers snapshot rebuild within `$transaction`

---

## 3. Phase 1: Parallel Teammates

### Teammate 1: `bulk-paste-engineer`

**Scope:** Build the `POST /api/transactions/bulk` endpoint and the bulk paste UI on the transactions page.

**Filesystem scope (non-overlapping with Teammate 2):**
- `apps/web/src/app/api/transactions/bulk/route.ts` (new)
- `apps/web/src/components/transactions/BulkPastePanel.tsx` (new)
- `apps/web/src/components/transactions/BulkPreviewTable.tsx` (new)
- `apps/web/src/lib/bulk-parser.ts` (new)
- `apps/web/src/lib/hooks/useBulkImport.ts` (new)
- `packages/analytics/src/bulk-validation.ts` (new, if separate from existing sell validation)
- `apps/web/src/app/(pages)/transactions/page.tsx` (modify — add BulkPastePanel)
- Tests for all new files

#### 3.1.1 Tab-Separated Parser (`bulk-parser.ts`)

**Input:** Raw string (pasted text).

**Processing:**
1. Split by newlines. Trim each line. Skip empty lines.
2. Split each line by tab characters. Fallback: split by 2+ consecutive spaces (users paste from various sources).
3. Map to fields in positional order: `symbol`, `type`, `quantity`, `price`, `date`. Optional trailing: `fees`, `notes`.
4. Return array of `ParsedRow` objects with original line number for error reporting.

**Output type:**
```typescript
interface ParsedRow {
  lineNumber: number;
  raw: string;
  parsed: {
    symbol: string;
    type: 'BUY' | 'SELL';
    quantity: string;   // Decimal string
    price: string;      // Decimal string
    date: string;       // YYYY-MM-DD
    fees: string;       // Decimal string, default "0"
    notes: string;
  } | null;
  errors: string[];     // Empty array if valid
}
```

**Per-row validation:**
- `symbol`: Required, non-empty. Uppercase after parse.
- `type`: Required, must be `BUY` or `SELL` (case-insensitive on input).
- `quantity`: Required, must parse to positive Decimal.
- `price`: Required, must parse to positive Decimal.
- `date`: Required, must match `YYYY-MM-DD` and be a valid calendar date.
- `fees`: Optional. If present, non-negative Decimal. Default: `"0"`.
- `notes`: Optional. Remainder of the line after fees.

**Tests (minimum 8):**
1. Happy path — 3 valid rows parse correctly
2. Missing required field — row with 3 fields returns error
3. Invalid date format — `02-15-2025` returns error
4. Invalid date value — `2025-13-45` returns error
5. Non-numeric quantity — `"abc"` returns error
6. BUY/SELL case insensitive — `buy`, `Buy`, `BUY` all valid
7. Extra whitespace — leading/trailing spaces stripped
8. Optional fees and notes — row with 7 fields parses fees and notes
9. Empty lines skipped — input with blank lines between rows
10. Negative quantity — returns error

#### 3.1.2 Bulk API Endpoint (`POST /api/transactions/bulk/route.ts`)

**Request body:**
```typescript
interface BulkTransactionRequest {
  rows: Array<{
    symbol: string;
    type: 'BUY' | 'SELL';
    quantity: string;
    price: string;
    date: string;
    fees?: string;
    notes?: string;
  }>;
  dryRun?: boolean;
}
```

**Processing logic:**
1. For each row, resolve `symbol` to an `instrumentId` via database lookup. Unknown symbol → row error: `"Unknown symbol: XYZ. Add the instrument first."`
2. Convert each valid row's `date` to UTC `tradeAt` using the instrument's `exchangeTz` (per Spec §2.1).
3. Collect all resolvable rows. Run the sell validation invariant against **existing transactions + all new rows combined**, sorted chronologically by `tradeAt`. If any point goes negative for any instrument, mark the offending row(s) with the date and deficit quantity.
4. **If sell validation fails → reject the entire batch.** Return 422 with per-row errors. Zero rows inserted. Rationale (AD-S10c): partial imports create confusing intermediate states.
5. If `dryRun: true` → return validation results, zero inserts.
6. If `dryRun: false` → insert all valid rows in a single Prisma `$transaction`. Then trigger ONE snapshot rebuild from the earliest `tradeAt` in the batch (using the Phase 0 transactional rebuild).

**Response shape:**
```typescript
interface BulkTransactionResponse {
  inserted: number;
  errors: Array<{
    lineNumber: number;
    symbol: string;
    error: string;
  }>;
  earliestDate: string | null;
}
```

**Tests (minimum 6):**
1. Happy path: 5 valid rows → `inserted: 5`, `errors: []`
2. Unknown symbols: 2 of 5 rows have unknown symbols → `inserted: 0`, 2 errors (batch rejected because the remaining 3 valid rows still need sell validation against the full set)
3. Sell validation failure: batch includes SELL exceeding cumulative BUYs → `inserted: 0`, error identifies the specific row and deficit
4. Dry run: valid batch with `dryRun: true` → `inserted: 0`, `errors: []` (validation passes but nothing inserted)
5. Empty batch: `rows: []` → `inserted: 0`, `errors: []`, 200 OK
6. Date conversion: row with date `2025-06-15` for NYSE instrument → `tradeAt` in UTC at correct offset

#### 3.1.3 Bulk Paste UI Components

**`BulkPastePanel.tsx`** — Collapsible disclosure panel on the transactions page.

- **Collapsed:** "▶ Bulk Import" heading. DM Sans, 0.875rem, `text-muted`. Lucide ChevronRight icon rotates on expand.
- **Expanded:**
  - Multi-line `<textarea>`, 6 rows minimum height. Placeholder text from UX Plan §3.4:
    ```
    VTI  BUY  50  220.00  2025-06-15
    QQQ  BUY  30  465.00  2025-07-01
    VTI  SELL  20  235.50  2025-11-20  4.95  Rebalance
    ```
  - "Parse" button (`bg-interactive`). Disabled while textarea is empty.
  - On click: call `parseBulkInput()` from `bulk-parser.ts`. Display `<BulkPreviewTable>`.

**`BulkPreviewTable.tsx`** — Preview table with per-row validation.

- **Columns:** Status icon, Line #, Symbol, Type, Qty, Price, Date, Fees, Notes, Error message
- **Valid rows:** Normal table styling. Green checkmark (Lucide Check icon, `gain-fg`) in status column.
- **Error rows:** `loss-bg` background on the entire row. Red X (Lucide X icon, `loss-fg`) in status column. Error message in the Error column using `loss-fg`.
- **Below table:**
  - Summary: "N of M rows valid." — DM Sans, 0.875rem, `text-muted`.
  - Button row: "Import N Transactions" (`gain-bg`, `gain-fg`, disabled if N = 0) + "Cancel" (outline).
- **Import flow:**
  1. Click "Import N Transactions" → call `POST /api/transactions/bulk` with valid rows, `dryRun: false`.
  2. Show spinner on button during request.
  3. On success → Toast: "Imported N transactions. Portfolio snapshots rebuilt." Close panel. Trigger transaction table refresh.
  4. On 422 → Display returned errors in the preview table (re-render with server-side errors merged).

**`useBulkImport.ts`** — Hook encapsulating the API call, loading state, and error handling.

**Design compliance:** Use existing Button, Table, Toast, Badge components from Session 5. Follow numeric formatting rules from UX Plan §4.3 for quantity and price columns in the preview table.

---

### Teammate 2: `ci-hardening-engineer`

**Scope:** CI pipeline, cross-validation integration, performance benchmark, reduced-motion support.

**Filesystem scope (non-overlapping with Teammate 1):**
- `.github/workflows/ci.yml` (new)
- `data/test/cross-validate.test.ts` (new — Vitest wrapper around existing script)
- `data/test/benchmark-rebuild.ts` (new)
- `apps/web/src/styles/globals.css` (or equivalent — reduced-motion media query)
- Tests for new files

#### 3.2.1 Cross-Validation as Vitest Test

**Problem:** `data/test/cross-validate.ts` runs 749 checks across three independent validation paths. It's a standalone script — not in the test suite, not in CI. The regression guard it provides is only as reliable as someone remembering to run it manually.

**Fix:** Create `data/test/cross-validate.test.ts` that wraps the three paths as Vitest tests.

**Approach:**
1. Read `cross-validate.ts` to understand its dependencies (does it hit Prisma? Read fixture files? Require a running server?).
2. If it reads fixture JSON files directly and uses pure analytics functions → wrap directly in `describe`/`it` blocks.
3. If it requires Prisma/DB access → extract the pure computation logic and test that. The DB-dependent parts can remain as a manual script.
4. Do NOT modify `cross-validate.ts` itself. Create a new `.test.ts` file that imports from it.

**Structure:**
```typescript
import { describe, it, expect } from 'vitest';

describe('PnL Cross-Validation (749 checks)', () => {
  it('Path A: Analytics engine matches expected outputs', async () => {
    const result = await runPathA();
    expect(result.failures).toEqual([]);
    expect(result.checksRun).toBeGreaterThanOrEqual(200);
  });

  it('Path B: Independent FIFO engine matches expected outputs', async () => {
    const result = await runPathB();
    expect(result.failures).toEqual([]);
    expect(result.checksRun).toBeGreaterThanOrEqual(200);
  });

  it('Path C: Engine vs independent consistency', async () => {
    const result = await runPathC();
    expect(result.failures).toEqual([]);
    expect(result.checksRun).toBeGreaterThanOrEqual(200);
  });
});
```

**Test count impact:** +3 tests minimum.

#### 3.2.2 GitHub Actions CI Configuration

**File:** `.github/workflows/ci.yml`

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - name: Type check
        run: pnpm tsc --noEmit
      - name: Test
        run: pnpm test
      - name: Build
        run: pnpm build
```

**Notes:**
- `--frozen-lockfile` prevents surprise dependency upgrades in CI.
- No secrets needed — SQLite is file-based, all external API calls are mocked in tests.
- `timeout-minutes: 10` prevents runaway builds.
- Verify the pnpm version matches the project's `packageManager` field or `.npmrc`.

#### 3.2.3 Snapshot Rebuild Performance Benchmark

**File:** `data/test/benchmark-rebuild.ts`

**Purpose:** Validate risk R-6 (snapshot rebuild performance at scale) with a transaction volume 6–7x higher than current seed data.

**Approach:**
1. Programmatically generate 20 instruments with 200+ transactions (mix of BUYs and SELLs, spanning 2 years).
2. Generate corresponding mock daily price bars (one per trading day per instrument).
3. Time a full snapshot rebuild from scratch (delete all snapshots → recompute entire history).
4. Assert elapsed time < 1000ms.
5. Print summary: instrument count, transaction count, price bar count, date range, elapsed ms.

**This is a standalone benchmark script, not a Vitest test.** Benchmark timing depends on machine and is too variable for CI assertions. Run manually, log result in session report.

**Execution:** `npx tsx data/test/benchmark-rebuild.ts`

#### 3.2.4 `prefers-reduced-motion` Support

**Scope:** CSS-only. No JavaScript changes required.

**Implementation:** Add to the global stylesheet:
```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

**Affected animations (verify each is gated):**
- Toast slide-in/fade-in
- Loading spinner (Loader2 rotation)
- Skeleton shimmer (`animate-pulse-slow`)
- Advisor panel slide-in transition
- Chart transitions (TradingView manages its own — verify no CSS overrides)

**Verification:** Chrome DevTools → Rendering tab → `Emulate CSS media feature prefers-reduced-motion` → verify no visible animations.

---

## 4. Phase 2: Lead Integration

### 4.1 Integration Checklist

- [ ] `pnpm test` — all tests pass (target: 490+, 42+ files)
- [ ] `pnpm build` — clean, zero errors
- [ ] `pnpm tsc --noEmit` — zero TypeScript errors
- [ ] Cross-validation appears in `pnpm test` output
- [ ] Manual: paste 5 valid tab-separated rows → parse → preview shows 5 green rows → confirm → toast + table refresh
- [ ] Manual: paste rows with errors (bad date, unknown symbol) → errors highlighted in red, valid rows shown in green
- [ ] Manual: paste rows where a SELL exceeds position → entire batch rejected, clear error message
- [ ] Manual: `GET /api/portfolio/snapshot` with empty DB → empty response, 0 new rows in DB
- [ ] Manual: bulk import triggers snapshot rebuild reflecting all new transactions
- [ ] Manual: GitHub Actions CI syntax valid (push to branch, verify green run)
- [ ] Manual: DevTools `prefers-reduced-motion: reduce` → no animations visible
- [ ] Benchmark: 200+ transaction rebuild < 1000ms (log result)

### 4.2 Document Updates

| Document | Changes |
|----------|---------|
| `CLAUDE.md` | Add AD-S10a through AD-S10d, bulk paste endpoint, CI reference |
| `AGENTS.md` | Update test count, file count, endpoint count (19 → 20 endpoints) |
| `HANDOFF.md` | Post-Session 10 state. All known data-integrity issues resolved. |
| `KNOWN-LIMITATIONS.md` | Remove W-3, W-4, W-5, W-8. Document any new items. |
| `Planning/STALKER_MASTER-PLAN.md` | Session 10 row in status tracker, risk register updates (close R-1, R-6 if benchmark passes), lessons learned |

### 4.3 Architecture Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| AD-S10a | Snapshot rebuild in `prisma.$transaction()` | Atomic delete + reinsert. Prevents partial snapshots on crash or concurrent write. Zero performance cost on SQLite. |
| AD-S10b | `GET /api/portfolio/snapshot` is read-only | HTTP semantic correctness. Rebuild triggered explicitly via POST or on transaction write. Empty state handled by UI. |
| AD-S10c | Bulk insert: all-or-none if sell validation fails | If the combined batch + existing transactions violates the sell invariant, zero rows insert. Prevents confusing partial imports. |
| AD-S10d | Cross-validation in CI via Vitest wrapper | 749-check regression guard must run automatically. A standalone script is not a regression guard. |

---

## 5. Risk Assessment

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|-----------|
| R-10 | Bulk sell validation complexity (batch + existing transactions) | Medium | Medium | Reuse existing sell validation function with a merged, chronologically sorted transaction list. Don't write new validation logic. |
| R-11 | Cross-validation script has implicit DB dependencies | Medium | Low | Inspect before wrapping. If DB-dependent, mock data layer in test. If pure computation, wrap directly. |
| R-12 | GitHub Actions pnpm version mismatch | Low | Low | Match version to project's `packageManager` field. Use `pnpm/action-setup@v4`. |
| R-13 | Bulk paste textarea splitting unreliable across OS clipboard formats | Low | Medium | Split on `\n` after normalizing `\r\n` → `\n`. Test with Windows-style line endings in parser tests. |

---

## 6. Test Targets

| Category | Current (S9) | Target (S10) |
|----------|-------------|-------------|
| Total tests | 469 | 490+ |
| Test files | 39 | 42+ |
| New: bulk-parser | — | 10+ |
| New: bulk API endpoint | — | 6+ |
| New: cross-validation wrapper | — | 3 |
| New: snapshot $transaction | — | 1+ |
| New: GET snapshot read-only | — | 1+ |
