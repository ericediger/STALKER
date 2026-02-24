# SESSION-9-KICKOFF.md — Full-Stack Validation + Polish + MVP Signoff

**Paste this prompt to launch Session 9.**

---

## Context

You are the engineering lead for STALKER, a local-first portfolio tracker with an LLM-powered advisor. This is Session 9 — the final session. Sessions 1–8 are complete. The system has 469 tests across 39 files, `pnpm build` and `tsc --noEmit` are clean. The advisor backend and frontend were built in Session 8 but the system prompt has not been tested against a real LLM.

Your job is to validate everything, fix what's broken, polish what's correct, and sign off the MVP.

**Read these documents first:**
- `SESSION-9-PLAN.md` — full implementation plan with phase structure, task details, and exit criteria
- `SPEC.md` — Section 13 (MVP Acceptance Criteria) and Section 13.1 (PnL Validation Strategy)
- `STALKER-ux-ui-plan.md` — Section 11 (Validation and Testing Plan)
- `STALKER_MASTER-PLAN.md` — current state, risk register, architecture decisions
- `HANDOFF.md` — current project state post-Session 8
- `CLAUDE.md` — coding rules and architecture overview

**Three load-bearing invariants (NEVER violate):**
1. Event-sourced core — Transactions + PriceBars are sole source of truth
2. Decimal precision — no `number` type touches money or quantity in business logic
3. Sell validation — `cumulative_buy_qty >= cumulative_sell_qty` at every point in chronological order

**Priority order:** `Correctness > Core CRUD > Market Data > Dashboard UI > Advisor > Polish`

---

## Phase 0: Lead — Live LLM Verification + Smoke Test (BLOCKING)

Phase 0 must complete before releasing teammate work. Its results determine whether the advisor passes MVP criterion 8.

### Step 1: Environment Check

```bash
# Verify API key is set
grep ANTHROPIC_API_KEY .env.local

# Verify LLM model
grep LLM_MODEL .env.local
# Should be: LLM_MODEL=claude-sonnet-4-5-20250514 (or similar)

# Start the app
pnpm dev

# In a separate terminal, verify seed data
curl -s http://localhost:3000/api/instruments | jq '.length'
# Should show instrument count (28 with enriched seed)

curl -s http://localhost:3000/api/portfolio/snapshot | jq '.totalValue'
# Should show a dollar value
```

If `ANTHROPIC_API_KEY` is not set, add it to `.env.local`:
```
ANTHROPIC_API_KEY=sk-ant-...
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-5-20250514
```

### Step 2: Fix Tool Loop Empty String Fallback

**File:** `packages/advisor/src/tool-loop.ts`

Find the line where the final response content is extracted after the loop. Replace `??` with `||` to coalesce empty strings:

```typescript
// Replace this pattern:
// content ?? ''
// With:
// content || 'I wasn\'t able to complete the analysis. Please try rephrasing your question.'
```

Update the test in `packages/advisor/__tests__/tool-loop.test.ts` — the max-iterations test should now expect the fallback message instead of empty string.

Run: `pnpm test --filter advisor`

### Step 3: Live Advisor Verification — 5 Intent Categories

Test each query via curl against the running app:

```bash
# Intent 1: Cross-holding synthesis
curl -s -X POST http://localhost:3000/api/advisor/chat \
  -H 'Content-Type: application/json' \
  -d '{"message": "Which positions are dragging my portfolio down over the last 90 days?"}' | jq '.'

# Intent 2: Tax-aware reasoning
curl -s -X POST http://localhost:3000/api/advisor/chat \
  -H 'Content-Type: application/json' \
  -d '{"message": "If I sold my oldest VTI lots, what would the realized gain be?"}' | jq '.'

# Intent 3: Performance attribution
curl -s -X POST http://localhost:3000/api/advisor/chat \
  -H 'Content-Type: application/json' \
  -d '{"message": "How much of my portfolio gain this year came from my top holding versus everything else?"}' | jq '.'

# Intent 4: Concentration awareness
curl -s -X POST http://localhost:3000/api/advisor/chat \
  -H 'Content-Type: application/json' \
  -d '{"message": "Am I overexposed to any single holding based on my current allocations?"}' | jq '.'

# Intent 5: Staleness / data quality
curl -s -X POST http://localhost:3000/api/advisor/chat \
  -H 'Content-Type: application/json' \
  -d '{"message": "Are any of my holdings showing stale prices?"}' | jq '.'
```

**For each response, evaluate:**
- ✅ Correct tool(s) called?
- ✅ Response synthesizes data (not raw echo)?
- ✅ Non-trivial insight surfaced?
- ✅ Scope boundaries respected (no recommendations)?
- ✅ Staleness disclosed if relevant?

**Record results** in `data/test/advisor-live-verification.md`:

```markdown
# Advisor Live Verification — Session 9

**Date:** [date]
**Model:** [model from LLM_MODEL]
**Seed data:** Enriched (28 instruments, 30 transactions)

## Intent 1: Cross-holding synthesis
**Query:** "Which positions are dragging my portfolio down over the last 90 days?"
**Tools called:** [list]
**Response quality:** [1-2 sentences]
**Pass/Fail:** [Pass/Fail]
**Notes:** [if fail, what needs fixing in system prompt]

## Intent 2: Tax-aware reasoning
...
```

### Step 4: System Prompt Iteration (if needed)

If any intent category fails, edit `packages/advisor/src/system-prompt.ts`:

- **Wrong tool called:** Add explicit tool selection guidance for that intent category
- **Shallow response:** Add specificity requirements ("always quantify in dollars and percentages")
- **Scope violation:** Strengthen the scope boundaries section
- **Missing staleness check:** Reinforce the Data Freshness Protocol section

After each edit:
```bash
pnpm test --filter advisor  # Verify exports.test.ts still passes
# Re-run the failed curl query
```

### Step 5: Full-Stack Smoke Test

Walk through the UI manually and record in `data/test/smoke-test-results.md`:

```markdown
# Full-Stack Smoke Test — Session 9

| # | Step | Result | Notes |
|---|------|--------|-------|
| 1 | pnpm dev starts cleanly | ☐ | |
| 2 | Dashboard loads with seed data, hero metric shows | ☐ | |
| 3 | Portfolio chart renders with area fill | ☐ | |
| 4 | Window selector changes chart and summary cards | ☐ | |
| 5 | Holdings table shows all instruments with PnL colors | ☐ | |
| 6 | Click holding → detail page loads | ☐ | |
| 7 | Candlestick chart renders on holding detail | ☐ | |
| 8 | Lots table shows FIFO lots with per-lot PnL | ☐ | |
| 9 | Transaction history shows on holding detail | ☐ | |
| 10 | Transactions page: table, filters, add form | ☐ | |
| 11 | Add transaction: sell validation error displays | ☐ | |
| 12 | Delete transaction: confirmation modal works | ☐ | |
| 13 | Advisor FAB → panel slides open | ☐ | |
| 14 | Suggested prompts appear (no active thread) | ☐ | |
| 15 | Click prompt → advisor responds with tool calls | ☐ | |
| 16 | Tool call indicator shows and is collapsible | ☐ | |
| 17 | New thread button creates fresh thread | ☐ | |
| 18 | Thread list shows past threads | ☐ | |
| 19 | Switch between threads preserves messages | ☐ | |
| 20 | Close and reopen panel → state preserved | ☐ | |
| 21 | Data health footer shows instrument count, budget, freshness | ☐ | |
| 22 | Staleness banner appears if quotes are stale | ☐ | |
```

**After Phase 0 completes, release teammates for Phase 1 and Phase 2.**

---

## Phase 1: Teammate 1 — `validation-engineer`

**Your scope:** PnL cross-validation, regression tests, numeric display audit.
**Your filesystem:** `data/test/cross-validate.ts`, `data/test/cross-validation-results.md`, `data/test/numeric-display-audit.md`
**Do NOT modify:** `packages/`, `apps/web/src/components/`, `apps/web/src/lib/hooks/`

### Task 1.1: Cross-Validation Script

Create `data/test/cross-validate.ts` — a script that loads the reference portfolio through the API and verifies values.

```typescript
/**
 * PnL Cross-Validation Script
 *
 * Loads the reference portfolio fixtures through the full API stack
 * and compares every value to expected outputs.
 *
 * Usage: npx tsx data/test/cross-validate.ts
 *
 * Prerequisites:
 *   - pnpm dev running on localhost:3000
 *   - Fresh database (or reset before running)
 */

import { readFileSync } from 'fs';
import { Decimal } from 'decimal.js';

const BASE = 'http://localhost:3000/api';

const referencePortfolio = JSON.parse(
  readFileSync('data/test/reference-portfolio.json', 'utf-8')
);
const expectedOutputs = JSON.parse(
  readFileSync('data/test/expected-outputs.json', 'utf-8')
);

interface CheckResult {
  label: string;
  expected: string;
  actual: string;
  pass: boolean;
}

const results: CheckResult[] = [];

function check(label: string, expected: string, actual: string) {
  const pass = expected === actual;
  results.push({ label, expected, actual, pass });
  if (!pass) {
    console.error(`FAIL: ${label} — expected ${expected}, got ${actual}`);
  } else {
    console.log(`PASS: ${label}`);
  }
}

async function main() {
  // Step 1: Create instruments from fixtures
  for (const instrument of referencePortfolio.instruments) {
    const res = await fetch(`${BASE}/instruments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(instrument),
    });
    if (!res.ok) {
      console.error(`Failed to create instrument ${instrument.symbol}: ${res.status}`);
    }
  }

  // Step 2: Create transactions from fixtures (in chronological order)
  for (const txn of referencePortfolio.transactions) {
    const res = await fetch(`${BASE}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(txn),
    });
    if (!res.ok) {
      console.error(`Failed to create transaction: ${res.status}`);
      const body = await res.json();
      console.error(JSON.stringify(body, null, 2));
    }
  }

  // Step 3: Verify portfolio snapshot
  const snapshotRes = await fetch(`${BASE}/portfolio/snapshot`);
  const snapshot = await snapshotRes.json();

  check(
    'Portfolio total value',
    expectedOutputs.portfolio.totalValue,
    snapshot.totalValue
  );
  check(
    'Portfolio total cost basis',
    expectedOutputs.portfolio.totalCostBasis,
    snapshot.totalCostBasis
  );
  check(
    'Portfolio realized PnL',
    expectedOutputs.portfolio.realizedPnl,
    snapshot.realizedPnl
  );
  check(
    'Portfolio unrealized PnL',
    expectedOutputs.portfolio.unrealizedPnl,
    snapshot.unrealizedPnl
  );

  // Step 4: Verify per-instrument holdings
  for (const expected of expectedOutputs.holdings) {
    const holdingRes = await fetch(`${BASE}/portfolio/holdings/${expected.symbol}`);
    const holding = await holdingRes.json();

    check(
      `${expected.symbol} — total quantity`,
      expected.totalQuantity,
      holding.totalQuantity
    );
    check(
      `${expected.symbol} — realized PnL`,
      expected.realizedPnl,
      holding.realizedPnl
    );
    check(
      `${expected.symbol} — unrealized PnL`,
      expected.unrealizedPnl,
      holding.unrealizedPnl
    );

    // Verify lots
    if (expected.lots) {
      for (let i = 0; i < expected.lots.length; i++) {
        const eLot = expected.lots[i];
        const aLot = holding.lots?.[i];
        if (!aLot) {
          results.push({
            label: `${expected.symbol} lot ${i} — missing`,
            expected: 'exists',
            actual: 'missing',
            pass: false,
          });
          continue;
        }
        check(
          `${expected.symbol} lot ${i} — remaining qty`,
          eLot.remainingQty,
          aLot.remainingQty
        );
        check(
          `${expected.symbol} lot ${i} — cost basis`,
          eLot.costBasis,
          aLot.costBasis
        );
      }
    }
  }

  // Step 5: Verify checkpoint dates (portfolio value at specific dates)
  for (const checkpoint of expectedOutputs.checkpoints) {
    const tsRes = await fetch(
      `${BASE}/portfolio/timeseries?startDate=${checkpoint.date}&endDate=${checkpoint.date}`
    );
    const ts = await tsRes.json();
    const point = ts.series?.find((p: any) => p.date === checkpoint.date);
    if (point) {
      check(
        `Checkpoint ${checkpoint.date} — portfolio value`,
        checkpoint.totalValue,
        point.totalValue
      );
    } else {
      results.push({
        label: `Checkpoint ${checkpoint.date} — not found in timeseries`,
        expected: checkpoint.totalValue,
        actual: 'MISSING',
        pass: false,
      });
    }
  }

  // Summary
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log('\n========================================');
  console.log(`Cross-Validation Complete: ${passed} passed, ${failed} failed out of ${results.length}`);
  if (failed > 0) {
    console.log('\nFAILURES:');
    results.filter(r => !r.pass).forEach(r => {
      console.log(`  ${r.label}: expected="${r.expected}" actual="${r.actual}"`);
    });
  }
  console.log('========================================');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Cross-validation script error:', err);
  process.exit(1);
});
```

**Important:** This is a starting template. Adjust field names to match the actual API response shapes from Sessions 3–4. Check `apps/web/src/app/api/portfolio/snapshot/route.ts` and `holdings/[symbol]/route.ts` for the exact response structure.

**Run:**
```bash
# Reset database first
rm -f data/portfolio.db
pnpm prisma db push
# Seed price bars from fixture (may need custom seed script)
# Start app
pnpm dev
# In another terminal
npx tsx data/test/cross-validate.ts
```

Record results in `data/test/cross-validation-results.md`.

### Task 1.2: Regression Sweep

```bash
pnpm test                    # All tests pass
pnpm build                   # Clean exit
pnpm exec tsc --noEmit       # Zero errors
```

If any failures, investigate and fix. Report in cross-validation results.

### Task 1.3: Numeric Display Audit

Open the running app in a browser. For 10 specific values, compare the displayed string against the API response:

```bash
# Get raw API values for comparison
curl -s http://localhost:3000/api/portfolio/snapshot | jq '.'
curl -s http://localhost:3000/api/portfolio/holdings | jq '.'
curl -s http://localhost:3000/api/portfolio/holdings/VTI | jq '.'
```

Check:
- `$XX,XXX.XX` formatting (commas, two decimal places)
- `+`/`−` signs (U+2212 for negative, not hyphen)
- Gain color (#34D399) on positive, loss color (#F87171) on negative
- Right-alignment and `tabular-nums` on table columns

Record in `data/test/numeric-display-audit.md`.

---

## Phase 2: Teammate 2 — `polish-engineer`

**Your scope:** Focus trap, accessibility, bulk paste, documentation.
**Your filesystem:** `apps/web/src/lib/hooks/useFocusTrap.ts`, `apps/web/src/components/advisor/AdvisorPanel.tsx`, `apps/web/src/app/api/transactions/bulk/`, `apps/web/src/components/transactions/BulkPasteInput.tsx`, `KNOWN-LIMITATIONS.md`, `HANDOFF.md`
**Do NOT modify:** `packages/advisor/src/`, `packages/analytics/`, `data/test/cross-validate.ts`

### Task 2.1: Focus Trap (Priority 1)

Create `apps/web/src/lib/hooks/useFocusTrap.ts`:

```typescript
import { useEffect, RefObject } from 'react';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(
  containerRef: RefObject<HTMLElement>,
  isActive: boolean,
  returnFocusRef?: RefObject<HTMLElement>
) {
  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;
    const previouslyFocused = document.activeElement as HTMLElement;

    // Focus first focusable element
    const firstFocusable = container.querySelector(FOCUSABLE_SELECTOR) as HTMLElement;
    firstFocusable?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;

      const focusable = Array.from(
        container.querySelectorAll(FOCUSABLE_SELECTOR)
      ) as HTMLElement[];

      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    container.addEventListener('keydown', handleKeyDown);

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      // Return focus to trigger element (FAB) on close
      const returnTarget = returnFocusRef?.current ?? previouslyFocused;
      returnTarget?.focus();
    };
  }, [isActive, containerRef, returnFocusRef]);
}
```

Wire into `AdvisorPanel.tsx`:
- Add `useRef` for the panel container
- Add `useRef` for the FAB (pass from Shell as prop or use a ref callback)
- Call `useFocusTrap(panelRef, open, fabRef)`
- Ensure `aria-modal="true"` is set on the panel when open

Test: `apps/web/__tests__/components/advisor/focus-trap.test.ts`

```bash
pnpm test --filter focus-trap
```

### Task 2.2: ARIA Fixes

Check and fix these across component files:

```typescript
// AdvisorPanel.tsx — ensure these attributes
<div
  ref={panelRef}
  role="dialog"
  aria-label="Portfolio Advisor"
  aria-modal="true"
>

// Toast component — ensure
<div role="status" aria-live="polite">

// Delete confirmation modal — ensure
<div role="alertdialog" aria-label="Confirm deletion" aria-describedby="delete-description">
  <p id="delete-description">This action cannot be undone.</p>

// Staleness indicator — ensure
<span aria-label={`Price stale — last updated ${timeAgo}`}>

// Loading spinners — ensure
<div role="status" aria-label="Loading">
```

### Task 2.3: Bulk Paste (if time allows — first scope cut if tight)

**Backend:** `apps/web/src/app/api/transactions/bulk/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Decimal } from 'decimal.js';
// Import sell validation logic from existing transaction route patterns

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { rows } = body;

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
  }

  const errors: Array<{ row: number; message: string }> = [];
  const validRows: Array</* validated transaction data */> = [];

  // Validate each row
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // ... validate symbol exists, type is BUY/SELL, quantity/price are valid decimals
    // ... check sell validation invariant across batch + existing transactions
  }

  if (errors.length > 0 && validRows.length === 0) {
    return NextResponse.json({ imported: 0, errors }, { status: 422 });
  }

  // Insert all valid rows
  // ... create transactions in Prisma
  // ... trigger single snapshot rebuild from earliest tradeAt

  return NextResponse.json({
    imported: validRows.length,
    errors,
  });
}
```

**Frontend:** `apps/web/src/components/transactions/BulkPasteInput.tsx`

Follow the UX Plan §3.4 specification:
- Collapsed disclosure heading "Bulk Import"
- Textarea with placeholder showing tab-separated format
- Parse button → preview table
- Error rows: `bg-[#2D1A1A]` background, `text-[#F87171]` error text
- Valid rows: normal styling with checkmark
- "Import N Transactions" button: `bg-[#1A2D28]`, `text-[#34D399]`
- On success: toast "Imported N transactions. Portfolio snapshots rebuilt."

### Task 2.4: Known Limitations Doc

Create `KNOWN-LIMITATIONS.md` at project root. See SESSION-9-PLAN.md Task 2.5 for the complete table.

### Task 2.5: Update HANDOFF.md

Add Session 9 completion status, final test count, pointer to KNOWN-LIMITATIONS.md, and post-MVP priorities.

---

## Phase 3: Lead Integration + MVP Signoff

After both teammates complete:

```bash
# Pull all work
pnpm test          # All tests pass
pnpm build         # Clean
pnpm exec tsc --noEmit  # Clean
```

### Walk the MVP Checklist

Open the running app and check every criterion from Spec §13:

1. Add instrument by ticker search → verify backfill + timezone
2. Record BUY and SELL with backdating → verify sell validation error
3. Dashboard: total value, day change, window selector → verify MarketCalendar
4. Holdings table: all columns, staleness dots → verify
5. Single instrument candlestick chart → verify date range
6. Realized vs unrealized PnL at portfolio and per-holding → verify precision
7. Lot detail with FIFO cost basis → verify against fixtures
8. Advisor: all 5 intents verified in Phase 0 → confirm
9. Quote staleness timestamps and warnings → verify
10. Data health footer matches `/api/market/status` → verify
11. Empty states on all pages → verify with fresh database

### Create SESSION-9-REPORT.md

Include:
- Work completed (all phases)
- Final test count and progression (S1: 71 → ... → S9: target 500+)
- MVP acceptance criteria signoff table (all filled in)
- PnL cross-validation results summary
- Advisor live verification results summary
- Reference to KNOWN-LIMITATIONS.md
- Post-MVP priorities

### Update Project Documents

- `CLAUDE.md` — any new architecture decisions from S9
- `AGENTS.md` — final package inventory
- `STALKER_MASTER-PLAN.md` — Session 9 status row, close remaining risks, final test progression

---

## Quick Reference: Key File Paths

```
# Reference portfolio fixtures
data/test/reference-portfolio.json
data/test/expected-outputs.json

# System prompt
packages/advisor/src/system-prompt.ts

# Tool loop (empty string fix)
packages/advisor/src/tool-loop.ts

# Advisor panel (focus trap)
apps/web/src/components/advisor/AdvisorPanel.tsx

# Transaction routes (existing sell validation patterns)
apps/web/src/app/api/transactions/route.ts
apps/web/src/app/api/transactions/[id]/route.ts

# Snapshot rebuild helper
apps/web/src/lib/snapshot-rebuild-helper.ts

# API response shapes
apps/web/src/app/api/portfolio/snapshot/route.ts
apps/web/src/app/api/portfolio/holdings/[symbol]/route.ts
apps/web/src/app/api/portfolio/timeseries/route.ts

# Existing tests (patterns to follow)
apps/web/__tests__/api/advisor/chat.test.ts
apps/web/__tests__/api/transactions/transactions.test.ts
packages/advisor/__tests__/tool-loop.test.ts
```

---

## Completion Signal

Session 9 is done when you can say all of the following:

- "All automated tests pass"
- "Build and type-check are clean"
- "All 5 advisor intent categories produce useful, non-trivial responses"
- "Every PnL value matches the reference portfolio fixtures to the cent"
- "Every MVP acceptance criterion from Spec §13 has been verified"
- "Focus trap works on the advisor panel"
- "Known limitations are documented"
- "Project documents are updated"

**This is the final session. Ship it.**
