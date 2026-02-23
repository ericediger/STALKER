# SESSION-7-KICKOFF: Holding Detail + Transactions + Charts UI

**Paste this into Claude Code to launch Session 7.**

---

## Context

You are the lead engineer for Session 7 of STALKER (Stock & Portfolio Tracker + LLM Advisor). Sessions 1–6 are complete: 363 tests passing, full API layer, dashboard + holdings pages live, TradingView v5 area chart working, enriched seed data (28 instruments, 30 transactions, 8300+ price bars, 3 stale quotes).

Session 7 builds the remaining core UI pages: holding detail, transactions, and charts. After this session, every page except the advisor chat is functional.

**Read these before starting:**
- `SESSION-7-PLAN.md` — Full specification, exit criteria, risk items
- `STALKER_MASTER-PLAN.md` — Architecture decisions AD-S1 through AD-S7
- `SPEC_v4.md` — Sections 5.2 (lots), 8.2 (transactions API), 9.2 (holding detail), 9.3 (transactions page)
- `STALKER-ux-ui-plan.md` — Sections 3.3 (holding detail), 3.4 (transactions), 3.5 (charts), 4.3 (numeric formatting)

---

## Pre-Flight (MANDATORY — Do Before Launching Teammates)

### Step 1: Verify Sell Validation Error Shape

The transactions-engineer builds `SellValidationError` first using this shape. If it's wrong, the component needs rework.

```bash
# Find any instrument ID from the seed data
INSTRUMENT_ID=$(curl -s http://localhost:3000/api/instruments | jq -r '.[0].id')

# Attempt an impossible SELL — should return 422
curl -s -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d "{\"instrumentId\":\"$INSTRUMENT_ID\",\"type\":\"SELL\",\"quantity\":\"99999\",\"price\":\"100\",\"tradeAt\":\"2026-01-01T00:00:00Z\"}" \
  | jq .
```

**Expected shape (AD-S4):**
```json
{
  "error": "SELL_VALIDATION_FAILED",
  "details": {
    "instrumentSymbol": "AAPL",
    "firstNegativeDate": "2025-06-15T00:00:00Z",
    "deficitQuantity": "5.00"
  }
}
```

**If the shape matches:** Proceed.
**If the shape differs:** Update the error shape in BOTH the `detail-engineer` and `transactions-engineer` prompts below before pasting them.

### Step 2: Verify Session 6 Area Chart Location

```bash
# Find the file with the TradingView chart lifecycle (useRef, createChart, ResizeObserver)
grep -rl "createChart" apps/web/src/
```

Record the file path. The detail-engineer needs it to extract the shared `useChart` hook. Update the path in the detail-engineer prompt below if it differs from the expected location.

---

## Execution Model: Three Phases

| Phase | Duration | Who | What |
|-------|----------|-----|------|
| 1 — Foundation | ~15 min | Both parallel | detail-engineer: shared chart hook + candlestick utils. transactions-engineer: SellValidationError + transaction utils. |
| 2 — Page Build | ~20 min | Both parallel | detail-engineer: holding detail + charts page. transactions-engineer: transactions page + add instrument modal. |
| 3 — Integration | ~10 min | Lead solo | Cross-page navigation, shared component wiring, chart hook refactor, post-mutation refetch, sell validation e2e test. |

---

## Teammate 1 Prompt: `detail-engineer`

```
You are `detail-engineer` on Session 7 of STALKER. Your scope: holding detail page, charts page, and shared chart hook.

READ FIRST:
- SESSION-7-PLAN.md (Sections 4, 5 — your full spec)
- STALKER-ux-ui-plan.md Section 3.3 (holding detail layout)
- STALKER-ux-ui-plan.md Section 6 (chart configuration)

PHASE 1 — Build these first, before any page component:

1. `apps/web/src/hooks/useChart.ts` — Shared chart hook extracted from Session 6.
   Look at [SESSION_6_CHART_FILE_PATH] for the existing pattern.
   The hook signature:
   ```typescript
   interface UseChartOptions {
     container: React.RefObject<HTMLDivElement>;
     options?: DeepPartial<ChartOptions>;
   }
   interface UseChartReturn {
     chart: IChartApi | null;
   }
   function useChart(opts: UseChartOptions): UseChartReturn
   ```
   Hook handles: createChart on mount → ResizeObserver → dispose on unmount.
   DO NOT modify the Session 6 area chart component — the lead will refactor it.

2. `apps/web/src/lib/chart-candlestick-utils.ts` — Transform API PriceBar to TradingView format:
   ```typescript
   // Input: { date: string, open: string, high: string, low: string, close: string }
   // Output: { time: string, open: number, high: number, low: number, close: number }
   ```
   `Number()` is permitted ONLY in this file (AD-S6c exception). Unit tests required.

PHASE 2 — Build pages using Phase 1 outputs:

3. Data hooks:
   - `useHoldingDetail(symbol)` — Fetches `GET /api/portfolio/holdings/${symbol}` and `GET /api/market/quote?symbol=${symbol}` using Promise.all. Returns { holding, quote, loading, error }.
   - `useMarketHistory(symbol, startDate, endDate)` — Fetches `GET /api/market/history?symbol=${symbol}&startDate=${startDate}&endDate=${endDate}`. Returns { bars, loading, error }.

4. Components in `apps/web/src/components/holding-detail/`:
   - PositionSummary.tsx — Two-row, four-column grid. bg-surface-raised.
     Row 1: Shares, Avg Cost, Market Value, Unrealized PnL ($ and %)
     Row 2: Day Change, Realized PnL, Total Return, Cost Basis
     Labels: 0.75rem, text-muted, uppercase. Values: 1.125rem/500.
     Gain/loss color on PnL and change values only.
   - CandlestickChart.tsx — Uses useChart hook. Config:
     ```
     upColor: '#22c55e', downColor: '#ef4444'
     wickUpColor: '#22c55e', wickDownColor: '#ef4444'
     borderVisible: false
     ```
     TradingView v5: `chart.addSeries(CandlestickSeries, opts)`
     Date range: PillToggle with 1M, 3M, 6M, 1Y, ALL presets. Height: 340px.
   - LotsTable.tsx — FIFO lots. Columns: #, Opened, Orig Qty, Rem Qty, Cost Basis, Unrealized PnL.
     font-mono on numerics, right-aligned, tabular-nums. ValueChange coloring on PnL.
     Totals row at bottom. If no price data: PnL shows "—" with amber "No price data".
   - HoldingTransactions.tsx — Filtered to instrument, sorted tradeAt desc.
     BUY in status-running-fg, SELL in text-text.
     Render Edit (pencil) and Delete (trash) icons on hover but DO NOT wire onClick.
     The lead will wire these during integration.
   - UnpricedWarning.tsx — Amber banner when firstBarDate is null.
     "No price data available for [SYMBOL]. Market value and PnL cannot be calculated."
     Position summary shows cost basis only, PnL columns show "—".
     Chart area: centered "Price history unavailable."

5. Holding detail page: `apps/web/src/app/(pages)/holdings/[symbol]/page.tsx`
   Dynamic route uses [symbol] NOT [id].
   Back arrow links to /holdings.
   If API returns 404 → redirect to / (dashboard).
   Compose: PositionSummary → CandlestickChart → LotsTable → HoldingTransactions.
   Show UnpricedWarning when appropriate.

6. Charts page: `apps/web/src/app/(pages)/charts/page.tsx`
   SymbolSelector (dropdown of held instruments from GET /api/instruments) + full-width CandlestickChart.
   THIS IS THE FIRST SCOPE CUT — skip without asking if running low on time.

YOUR FILESYSTEM (do not create files outside this):
  apps/web/src/app/(pages)/holdings/[symbol]/page.tsx
  apps/web/src/components/holding-detail/*
  apps/web/src/app/(pages)/charts/page.tsx
  apps/web/src/components/charts/*
  apps/web/src/hooks/useChart.ts
  apps/web/src/hooks/useHoldingDetail.ts
  apps/web/src/hooks/useMarketHistory.ts
  apps/web/src/lib/chart-candlestick-utils.ts
  apps/web/src/lib/__tests__/chart-candlestick-utils.test.ts

RULES:
- Number() ONLY in chart-candlestick-utils.ts. Everywhere else: Decimal formatters from Session 5.
- All numeric table columns: font-mono, right-aligned, tabular-nums.
- All dollar/percent values: formatCurrency, formatPercent, formatQuantity from existing utils.
- Use existing components: Table, Badge, PillToggle, Skeleton, Toast, Button.
- Dark theme tokens from tailwind.config.ts — do not hardcode colors outside chart config.
- Run `tsc --noEmit` and `pnpm test` before reporting done.
```

---

## Teammate 2 Prompt: `transactions-engineer`

```
You are `transactions-engineer` on Session 7 of STALKER. Your scope: transactions page, add/edit/delete forms, sell validation error UX, and add instrument modal.

READ FIRST:
- SESSION-7-PLAN.md (Sections 4, 5 — your full spec)
- STALKER-ux-ui-plan.md Section 3.4 (transactions layout)
- STALKER-ux-ui-plan.md Section 5.1 (add instrument flow)
- STALKER-ux-ui-plan.md Section 5.2 (transaction CRUD)

PHASE 1 — Build these first, before any page component:

1. `apps/web/src/components/transactions/SellValidationError.tsx`
   ⚠️ THIS IS THE SESSION'S MOST CRITICAL UX ELEMENT. Build it first with hardcoded mock data.

   Error shape from API (HTTP 422):
   ```typescript
   interface SellValidationErrorData {
     error: "SELL_VALIDATION_FAILED";
     details: {
       instrumentSymbol: string;      // e.g. "AAPL"
       firstNegativeDate: string;     // ISO datetime e.g. "2025-06-15T00:00:00Z"
       deficitQuantity: string;       // Decimal as string e.g. "5.00"
     };
   }
   ```

   Layout:
   - Container: bg-[#2D1A1A] (loss-bg), border border-[#F87171]/30 (loss-fg), rounded-lg, p-4
   - Headline: "This sell would create a negative position" — text-[#F87171] (loss-fg), font-medium
   - Body: "Position for **{symbol}** would go negative on **{date}** by **{deficit} shares**."
   - Suggested fix: "Reduce the sell quantity by at least {deficit} shares, or add a buy transaction before {date}."
   - Format the date as a readable date (not raw ISO). Format deficit via formatQuantity.
   - Placed inline below the form. Appears on 422, disappears when user modifies any form field.

   Build this component with a hardcoded mock first. Verify the layout looks right. Then wire to the API.

2. `apps/web/src/lib/transaction-utils.ts` + tests:
   - validateTransactionForm(fields) → { valid: boolean, errors: Record<string, string> }
     Required: instrumentId, type, quantity (> 0), price (> 0), tradeAt (valid date)
   - formatTransactionForDisplay(tx) → display-ready object with formatted dates, currencies
   - filterTransactions(txs, filters) → filtered array
   - sortTransactions(txs, column, direction) → sorted array
   Unit tests for all functions.

PHASE 2 — Build pages using Phase 1 outputs:

3. Data hooks:
   - `useTransactions(filters?)` — GET /api/transactions with query params. Returns { transactions, loading, error, refetch }.
   - `useSymbolSearch(query)` — Debounced (300ms) GET /api/market/search?q={query}. Returns { results, loading }.
   - `useInstrumentCreate()` — POST /api/instruments. Returns { create: (data) => Promise, loading }.

4. TransactionForm.tsx + TransactionFormModal.tsx:
   Mode: "create" or "edit" (pre-fills all fields from existing transaction).
   Fields:
   - Symbol: Autocomplete dropdown from GET /api/instruments (held instruments only)
   - Type: BUY/SELL two-button toggle. BUY default. BUY=bg-interactive, SELL=bg-surface-overlay.
   - Quantity: numeric, supports fractional. Label "Shares"
   - Price: numeric with $ prefix. Label "Price per share"
   - Date: date picker, defaults today, supports backdating
   - Fees: numeric, optional, default $0.00
   - Notes: text, optional
   - Submit: "Add Transaction" (create) / "Save Changes" (edit). bg-interactive.

   Submit flow:
   - Client-side validate → show field-level errors
   - POST /api/transactions (create) or PUT /api/transactions/{id} (edit)
   - 200/201 → toast success, close modal, refetch()
   - 422 → render SellValidationError INLINE below form. DO NOT close modal.
   - Other error → toast error

5. TransactionsTable.tsx + TransactionFilters.tsx:
   Table columns: Date, Symbol, Type, Qty, Price, Fees, Notes, Actions (edit/delete icons).
   Sortable columns (click header). Default: tradeAt desc.
   Filters: instrument dropdown (from /api/instruments), type dropdown (BUY/SELL/ALL), date range.
   FILTERS ARE SECOND SCOPE CUT if running low on time. Table without filters still works.

6. Transactions page: `apps/web/src/app/(pages)/transactions/page.tsx`
   Layout: "Transactions" heading + [+ Add Transaction] button → TransactionFilters → TransactionsTable.
   Empty state: "No transactions yet. Add an instrument first, then record your trades." CTA: [+ Add Instrument].

7. DeleteConfirmation.tsx:
   Modal: "Delete this {BUY/SELL} transaction for {qty} shares of {symbol} on {date}?"
   Cancel (outline) + Delete (danger). On 422: show SellValidationError inside modal body.

8. AddInstrumentModal.tsx + SymbolSearchInput.tsx:
   Four states:
   a) SEARCH: Text input → debounced GET /api/market/search?q=. Dropdown: symbol (bold), name, exchange.
   b) CONFIRM: "Add {SYMBOL} ({Name})?" with Confirm + Cancel buttons.
   c) LOADING: "Adding {SYMBOL}... fetching historical prices." Spinner.
   d) SUCCESS: Toast "{SYMBOL} added successfully", close modal, refetch instruments.
   No results: "No instruments found for '{query}'. Check the ticker or try the full company name."
   Render modal with its own trigger button for standalone testing. Lead will wire into other pages.

YOUR FILESYSTEM (do not create files outside this):
  apps/web/src/app/(pages)/transactions/page.tsx
  apps/web/src/components/transactions/*
  apps/web/src/components/instruments/*
  apps/web/src/hooks/useTransactions.ts
  apps/web/src/hooks/useSymbolSearch.ts
  apps/web/src/hooks/useInstrumentCreate.ts
  apps/web/src/lib/transaction-utils.ts
  apps/web/src/lib/__tests__/transaction-utils.test.ts

RULES:
- NO Number() or parseFloat() anywhere. All display values via Decimal formatters from Session 5.
- All numeric columns: font-mono, right-aligned, tabular-nums.
- Use existing components: Button, Input, Select, Table, Badge, Modal, Toast, Skeleton.
- Dark theme tokens from tailwind.config.ts — no hardcoded colors.
- Transaction dates: form accepts YYYY-MM-DD, API expects ISO UTC datetime.
- Run `tsc --noEmit` and `pnpm test` before reporting done.
```

---

## Lead Integration Checklist (Phase 3)

After both teammates report done, execute these in order:

### 1. Cross-Page Navigation
```bash
# Verify these links work:
# Holdings table row click → /holdings/[symbol]
# Holding detail back arrow → /holdings
# Holding detail Edit icon → TransactionFormModal (edit mode)
# Holding detail Delete icon → DeleteConfirmation modal
```
- Wire holdings table rows in both dashboard and `/holdings` to `<Link href="/holdings/{symbol}">`
- Wire HoldingTransactions Edit/Delete icons to transactions-engineer's modals
- Import TransactionFormModal + DeleteConfirmation into holding detail page

### 2. AddInstrumentModal Wiring
- Import AddInstrumentModal into dashboard empty state's "Add Instrument" button
- Import into holdings page's "Add Instrument" button
- Import into transactions page if there's a natural placement

### 3. Chart Hook Refactor
- Refactor Session 6 PortfolioChart to use `useChart` from `hooks/useChart.ts`
- Test: Dashboard area chart still renders correctly
- Test: Holding detail candlestick chart renders correctly
- **If refactor breaks area chart:** Revert. Leave as tech debt for S9. Not worth risking the dashboard.

### 4. Post-Mutation Refetch
- After transaction create/edit/delete: call refetch on transactions + holdings + dashboard data
- After instrument create: call refetch on instruments list
- Pattern: pass refetch callbacks through modal props or use a simple event bus

### 5. Sell Validation E2E
```bash
# Manual test sequence:
# 1. Open transaction form, select an instrument with existing BUYs
# 2. Create a SELL for more shares than available
# 3. Verify: SellValidationError appears inline, form stays open
# 4. Reduce quantity, resubmit → succeeds
# 5. Try to delete a BUY that a later SELL depends on → verify rejection in modal
```

### 6. Decimal Discipline
```bash
# Must return results ONLY in chart-utils.ts and chart-candlestick-utils.ts
grep -rn "Number(" apps/web/src/ --include="*.ts" --include="*.tsx" | grep -v chart | grep -v node_modules
grep -rn "parseFloat(" apps/web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules
```

### 7. Final Checks
```bash
npx tsc --noEmit          # 0 errors
pnpm test                 # 380+ tests, 0 regressions
pnpm build                # clean build
```

### 8. Documentation
- Update AGENTS.md with new files/directories from Session 7
- Update HANDOFF.md with Session 7 completion state

---

## Exit Criteria Quick Reference

21 blocking criteria. Full list in SESSION-7-PLAN.md Section 7.

**detail-engineer (8):** Holding detail renders with position summary + lots + chart + transactions. Chart responds to date range selector with dark theme. Lots show FIFO with per-lot PnL coloring. Unpriced warning works. 404 redirects. Charts page with symbol selector.

**transactions-engineer (9):** Transactions page with sortable table + filters. Add/edit/delete via API. Sell validation error renders with date + deficit + suggested fix. Add instrument: search → select → create → toast. Symbol search debounces. Backdating works. Empty state.

**both (2):** Decimal formatters everywhere, font-mono right-aligned numerics.

**lead (2):** `tsc --noEmit` 0 errors, `pnpm test` 380+ / 0 regressions.

**Test target:** 395+ total (30+ new).

---

## Scope Cuts (if needed)

Cut last → first:
1. Add Instrument modal (strongly prefer keeping)
2. Transaction filters (table works without them)
3. Charts standalone page (detail page has the chart)

**detail-engineer rule:** If you finish LotsTable and are running low, skip Charts page. Don't ask.
