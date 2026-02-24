# SESSION-10-KICKOFF.md — Hardening + Bulk Paste + CI

**Paste this prompt into Claude Code to launch Session 10.**

---

## Context

You are the engineering lead for STALKER, a local-first stock portfolio tracker. The MVP shipped in Session 9 (469 tests, 21/21 acceptance criteria, 749/749 PnL cross-validation checks). This session closes data-integrity gaps, delivers bulk transaction paste (the spec's "Next" priority feature), and adds CI.

**Read these files first, in order:**
1. `CLAUDE.md` — architecture rules, coding conventions, what NOT to do
2. `AGENTS.md` — package inventory, test commands, tech stack
3. `HANDOFF.md` — current project state (post-Session 9)
4. `KNOWN-LIMITATIONS.md` — the items this session resolves (W-3, W-4, W-5, W-8)
5. `Planning/SESSION-10-PLAN.md` — full implementation spec for this session

**Three invariants that must never be violated:**
1. **Event-sourced core:** Transactions + PriceBars are truth. Everything else is a rebuildable cache.
2. **Decimal precision:** No `number` type for money or quantity in business logic. All financial arithmetic uses `Decimal.js`. The ONLY approved `Number()` exceptions are in `chart-utils.ts` and `chart-candlestick-utils.ts` (AD-S6c).
3. **Sell validation:** At every point in chronological order, per instrument: `cumulative_buy_qty >= cumulative_sell_qty`.

**Priority order when making trade-offs:**
```
Correctness (PnL math) > Core CRUD > Market Data > Dashboard UI > Advisor > Polish
```

---

## Phase 0: Data Integrity Fixes (YOU — Blocking Gate)

Complete ALL of these before spawning teammates. These protect the correctness guarantees from 9 sessions of work.

### Fix 1: Snapshot Rebuild Transaction Boundary (W-3)

Find the snapshot rebuild logic. It currently does:
```
delete snapshots from affected date forward
recompute snapshots
insert new snapshots
```

Wrap this in `prisma.$transaction()`:
```typescript
await prisma.$transaction(async (tx) => {
  await tx.portfolioValueSnapshot.deleteMany({ where: { date: { gte: affectedDate } } });
  const newSnapshots = await computeSnapshots(tx, affectedDate); // pass tx for reads
  await tx.portfolioValueSnapshot.createMany({ data: newSnapshots });
});
```

Write a test confirming: if the recompute function throws mid-flight, zero snapshots are deleted (transaction rolls back).

### Fix 2: Remove GET Side Effect (W-4)

`GET /api/portfolio/snapshot` currently triggers a rebuild when no snapshots exist. Fix:
- Make the GET **read-only**. If no snapshots exist, return `{ data: null, needsRebuild: true }` (or equivalent empty response).
- Add `POST /api/portfolio/rebuild` to trigger rebuild explicitly.
- Update any UI code that calls the snapshot GET to handle the empty case (it should already — Session 5 built empty states).

Write a test: `GET /api/portfolio/snapshot` with empty DB → 200 response, zero new rows in `PortfolioValueSnapshot` table.

### Fix 3: Decimal Formatting in Advisor Tools (W-8)

Find `parseFloat(value.toFixed(2))` patterns in advisor tool executors. Replace with `new Decimal(value).toFixed(2)` or equivalent Decimal-native formatting. The LLM receives a string — make it a precision-correct string.

### Fix 4: Code Comments for Intentional Choices

Add protective comments:
1. `packages/advisor/src/tool-loop.ts` line ~94: `// Intentional: || (not ??) catches empty strings from LLM, not just null/undefined`
2. `apps/web/src/lib/chart-utils.ts`: Verify AD-S6c comment exists. If not: `// AD-S6c: Number() exception — TradingView requires native numbers. Do not convert to Decimal.`
3. `apps/web/src/lib/chart-candlestick-utils.ts`: Same.

### Fix 5: Document Anthropic Tool Result Workaround (W-5)

In `packages/advisor/src/anthropic-adapter.ts`, find where tool_result messages are translated for the Anthropic API. Add a block comment explaining:
- What format Anthropic expects
- What STALKER's internal format looks like
- The transformation being applied
- Why this workaround exists

### Phase 0 Gate

Run and verify before proceeding:
```bash
pnpm test          # 469+ pass, 0 fail
pnpm build         # clean
pnpm tsc --noEmit  # 0 errors
```

Then manually verify:
- `curl localhost:3000/api/portfolio/snapshot` with empty DB → empty response, no writes
- Create a transaction via the existing UI → verify snapshot rebuild completes atomically

---

## Phase 1: Spawn Teammates

After Phase 0 passes, spawn two teammates in parallel.

### Teammate 1: `bulk-paste-engineer`

**Launch prompt:**

> You are `bulk-paste-engineer` working on STALKER, a portfolio tracking app. Your task is to build the bulk transaction paste feature — both the API endpoint and the UI components.
>
> **Read first:** `CLAUDE.md`, `AGENTS.md`, `Planning/SESSION-10-PLAN.md` (Section 3, Teammate 1).
>
> **Your filesystem scope (do NOT touch files outside this):**
> - `apps/web/src/app/api/transactions/bulk/route.ts` (new)
> - `apps/web/src/components/transactions/BulkPastePanel.tsx` (new)
> - `apps/web/src/components/transactions/BulkPreviewTable.tsx` (new)
> - `apps/web/src/lib/bulk-parser.ts` (new)
> - `apps/web/src/lib/hooks/useBulkImport.ts` (new)
> - `apps/web/src/app/(pages)/transactions/page.tsx` (modify — add BulkPastePanel)
> - Test files for all new code
>
> **Build order:**
> 1. `bulk-parser.ts` + tests (10+ tests). Parse tab-separated text into structured rows with validation.
> 2. `POST /api/transactions/bulk/route.ts` + tests (6+ tests). Validate batch against existing transactions using the sell invariant. All-or-none if sell validation fails.
> 3. `BulkPreviewTable.tsx` — preview table with per-row error highlighting. Use existing Table, Badge components.
> 4. `BulkPastePanel.tsx` — collapsible disclosure with textarea + parse button + preview table + confirm button.
> 5. `useBulkImport.ts` — hook for the API call with loading/error state.
> 6. Wire into the transactions page.
>
> **Critical rules:**
> - All quantity and price values are Decimal strings. Never use `Number()` for financial values.
> - The bulk insert AND the snapshot rebuild that follows must each use `prisma.$transaction()`.
> - If sell validation fails on the combined batch (existing + new transactions), reject the ENTIRE batch. Zero inserts.
> - Resolve symbols to instrumentIds via DB lookup. Unknown symbol → row-level error.
> - Convert dates to UTC tradeAt using instrument's `exchangeTz`.
> - Normalize `\r\n` to `\n` before splitting lines (Windows clipboard compatibility).
> - Follow existing component patterns from Session 5 (look at `apps/web/src/components/` for Button, Table, Toast, Badge conventions).
> - Follow UX Plan design tokens: `gain-fg`/`gain-bg` for valid rows, `loss-fg`/`loss-bg` for errors.
>
> **When done, run:**
> ```bash
> pnpm test
> pnpm build
> pnpm tsc --noEmit
> ```
> All must pass. Report your test count and any issues.

### Teammate 2: `ci-hardening-engineer`

**Launch prompt:**

> You are `ci-hardening-engineer` working on STALKER, a portfolio tracking app. Your task is to integrate the cross-validation script into CI, set up GitHub Actions, build a performance benchmark, and add `prefers-reduced-motion` support.
>
> **Read first:** `CLAUDE.md`, `AGENTS.md`, `Planning/SESSION-10-PLAN.md` (Section 3, Teammate 2).
>
> **Your filesystem scope (do NOT touch files outside this):**
> - `.github/workflows/ci.yml` (new)
> - `data/test/cross-validate.test.ts` (new)
> - `data/test/benchmark-rebuild.ts` (new)
> - `apps/web/src/styles/globals.css` (or equivalent — add reduced-motion media query only)
>
> **Build order:**
> 1. Read `data/test/cross-validate.ts` carefully. Understand its dependencies.
> 2. Create `data/test/cross-validate.test.ts` — Vitest wrapper with 3 test cases (Path A, B, C). If the script uses Prisma directly, mock the data layer. If it reads fixture files and uses pure computation, wrap directly.
> 3. Verify: `pnpm test` now includes cross-validation tests and still passes.
> 4. Create `.github/workflows/ci.yml` — three gates: `pnpm tsc --noEmit`, `pnpm test`, `pnpm build`. Use `pnpm/action-setup@v4`, Node 20, `--frozen-lockfile`.
> 5. Create `data/test/benchmark-rebuild.ts` — generate 20 instruments + 200 transactions + mock price bars. Time full snapshot rebuild. Assert < 1000ms. Print summary.
> 6. Add `prefers-reduced-motion` media query to global CSS. Verify all animations are gated.
>
> **Critical rules:**
> - Do NOT modify `data/test/cross-validate.ts`. Create a new `.test.ts` wrapper.
> - The benchmark is a standalone script (`npx tsx data/test/benchmark-rebuild.ts`), not a Vitest test.
> - For CI, no secrets are needed — all tests use mocked external APIs.
> - Check `package.json` for the `packageManager` field — use that pnpm version in the CI config.
>
> **When done, run:**
> ```bash
> pnpm test
> pnpm build
> pnpm tsc --noEmit
> npx tsx data/test/benchmark-rebuild.ts  # Log the timing result
> ```
> All must pass. Report your test count, benchmark timing, and any issues.

---

## Phase 2: Integration

After both teammates report completion:

### Step 1: Verify Clean State
```bash
pnpm test          # Target: 490+, 0 failures
pnpm build         # Clean
pnpm tsc --noEmit  # 0 errors
```

### Step 2: Manual Verification
1. Start dev server: `pnpm dev`
2. Navigate to Transactions page
3. Expand "Bulk Import" panel
4. Paste these rows:
   ```
   VTI	BUY	50	220.00	2025-06-15
   QQQ	BUY	30	465.00	2025-07-01
   AAPL	BUY	20	185.50	2025-08-01
   FAKE	BUY	10	100.00	2025-09-01
   VTI	SELL	999	250.00	2025-10-01
   ```
5. Click "Parse". Verify:
   - Rows 1–3: green checkmark (valid)
   - Row 4: red X, error "Unknown symbol: FAKE"
   - Row 5: red X, error about sell exceeding position
   - Summary shows "3 of 5 rows valid"
6. **Note: Due to all-or-none batch validation, the import button should reflect the batch rejection status if sell validation fails on the combined set. Verify the UX handles this clearly.**
7. Remove rows 4 and 5, re-parse, confirm import → toast appears, transactions table updates

### Step 3: Verify No Regressions
- Dashboard loads with correct portfolio value
- Holdings table shows all instruments
- Holding detail shows correct lots and PnL
- Advisor responds to a test query

### Step 4: Run Benchmark
```bash
npx tsx data/test/benchmark-rebuild.ts
```
Log the result. If > 1000ms, document as a known risk (not blocking).

### Step 5: Update Documents
- `CLAUDE.md`: AD-S10a through AD-S10d, bulk endpoint, CI
- `AGENTS.md`: Updated counts (tests, endpoints, files)
- `HANDOFF.md`: Post-Session 10 state
- `KNOWN-LIMITATIONS.md`: Remove W-3, W-4, W-5, W-8. Add any new items.
- `Planning/STALKER_MASTER-PLAN.md`: Session 10 row

### Step 6: Write Session Report
Create `SESSION-10-REPORT.md` with:
- Work completed per phase
- Files changed/created
- Test counts (before → after)
- Benchmark result
- Issues encountered
- Remaining items (if any scope was cut)

---

## Exit Criteria Checklist

| # | Criterion | Pass? |
|---|-----------|-------|
| EC-1 | Snapshot rebuild in `$transaction` | |
| EC-2 | GET snapshot is read-only | |
| EC-3 | Cross-validation in `pnpm test` | |
| EC-4 | GitHub Actions CI config valid | |
| EC-5 | Bulk API validates and inserts | |
| EC-6 | Bulk paste UI end-to-end | |
| EC-7 | Rebuild benchmark < 1000ms | |
| EC-8 | Zero test regressions | |
| EC-9 | `pnpm build` clean | |
| EC-10 | `prefers-reduced-motion` | |

All 10 must pass. If scope was cut per the prioritized cut list in SESSION-10-PLAN.md, note which criteria were deferred and why.
