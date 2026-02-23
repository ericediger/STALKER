# SESSION-7-PLAN: Holding Detail + Transactions + Charts UI

**Date:** 2026-02-23
**Epic:** 6B — Holding Detail + Transactions + Charts
**Depends on:** Session 6 (Dashboard + Holdings UI) ✅
**Mode:** PARALLEL (detail-engineer + transactions-engineer), Three-Phase Execution
**Estimated Complexity:** High
**Checklists Applied:** Frontend: All sections, UX/UI: All sections

---

## 1. Session Objective

Build the remaining three core UI pages: holding detail (per-instrument deep dive with lots), transactions (full CRUD with sell-validation UX), and charts (single-instrument candlestick viewer). After this session, every page in the spec except the advisor chat is functional with live data.

This session's highest-risk item is the **transaction form validation UX** — the sell validation invariant produces a structured error (offending transaction, first negative date, deficit quantity) that must be surfaced clearly enough that the user understands *why* their sell was rejected and *what to fix*.

This session also has more **cross-component coupling** than any prior session. The lead integration pass is heavier than Sessions 1–6 and is documented explicitly in Section 6.

---

## 2. Pre-Flight (Lead, Before Session Starts)

Before launching teammates, the lead must complete these two verification steps:

### 2.1 Verify Sell Validation Error Shape

The master plan documents AD-S4 as the binding decision:

> Sell validation returns HTTP 422 with structured error body: `{ error, details: { instrumentSymbol, firstNegativeDate, deficitQuantity } }`

**Action:** Run the following manual test against the Session 4 API to confirm the exact response body:

```bash
# 1. Find an instrument with a BUY of N shares
# 2. POST a SELL for N+5 shares at the same or later date
# 3. Capture the full 422 response body
curl -s -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{"instrumentId":"<id>","type":"SELL","quantity":"999","price":"100","tradeAt":"2026-01-01T00:00:00Z"}' \
  | jq .
```

**If the shape matches AD-S4:** Proceed as planned. The `SellValidationError` component can be built against this shape.

**If the shape differs:** Update the `SELL_VALIDATION_ERROR_SHAPE` constant in Section 8.2 of this plan and in the kickoff document before launching the transactions-engineer.

**Why this matters:** The transactions-engineer builds `SellValidationError` first (Phase 1) with hardcoded mock data. If the mock shape doesn't match the real API, the component will need rework during lead integration. Two minutes of pre-flight prevents ten minutes of rework.

### 2.2 Verify Session 6 Area Chart Hook Location

Confirm where the Session 6 area chart lifecycle code lives (component file, `useRef`/`useEffect` pattern, ResizeObserver). The detail-engineer needs this exact file path to extract the shared `useChart` hook. Document the path in the kickoff if it differs from the expected location.

---

## 3. Prior Session State

### Available Infrastructure (from Sessions 1–6)
- Full API layer: instruments CRUD, transactions CRUD (with sell validation + snapshot rebuild), portfolio analytics (snapshot, timeseries, holdings, holdings/[symbol]), market data (quote, history, search, refresh, status)
- TradingView Lightweight Charts v5 integration (area chart pattern with `useRef` lifecycle)
- 4 data hooks: `usePortfolioSnapshot`, `usePortfolioTimeseries`, `useHoldings`, `useMarketStatus`
- 3 utility modules: `window-utils`, `chart-utils`, `holdings-utils`
- Full component library: Button, Input, Select, Table, Badge, Tooltip, Toast, Modal, PillToggle, Skeleton
- Numeric formatters: `formatCurrency`, `formatPercent`, `formatQuantity`, `formatDate`
- Enriched seed: 28 instruments, 30 transactions, 8300+ price bars, 3 intentionally stale quotes
- 363 tests passing, 0 TypeScript errors, clean build

### API Endpoints This Session Consumes
| Endpoint | Used By |
|----------|---------|
| `GET /api/portfolio/holdings/[symbol]` | Holding detail page (lots, transactions, PnL) |
| `GET /api/market/history?symbol=&startDate=&endDate=` | Candlestick chart |
| `GET /api/market/quote?symbol=` | Holding detail (latest price) |
| `GET /api/transactions` | Transactions page (full list) |
| `POST /api/transactions` | Add transaction form |
| `PUT /api/transactions/[id]` | Edit transaction form |
| `DELETE /api/transactions/[id]` | Delete transaction |
| `GET /api/market/search?q=` | Add instrument modal (symbol search) |
| `POST /api/instruments` | Add instrument flow (create + backfill) |
| `GET /api/instruments` | Symbol autocomplete in transaction form |

---

## 4. Three-Phase Execution Model

Session 7 has more cross-component coupling than any prior session. Three pages need cross-navigation wiring, the shared chart hook refactors Session 6 code, and the AddInstrumentModal must be accessible from multiple pages. The three-phase model keeps teammates parallel on isolated work while concentrating all coupling in the lead integration pass.

### Phase 1: Foundation (~15 min, both teammates parallel)

Each teammate builds their highest-risk, most isolated deliverable first. These are testable without any page component and de-risk the session's two hardest problems.

| Teammate | Phase 1 Deliverable | Why First |
|----------|--------------------|----|
| detail-engineer | Shared `useChart` hook + `chart-candlestick-utils.ts` with unit tests | De-risks TradingView v5 candlestick integration. Prevents two divergent chart lifecycles. Must exist before any chart component. |
| transactions-engineer | `SellValidationError` component (hardcoded mock) + `transaction-utils.ts` with unit tests | De-risks the session's most critical UX element. Uses the verified error shape from pre-flight. Must be correct before form wiring. |

### Phase 2: Page Build (~20 min, both teammates parallel)

Both teammates build their page components using Phase 1 outputs. Filesystem scopes are fully non-overlapping.

| Teammate | Phase 2 Deliverables |
|----------|---------------------|
| detail-engineer | Holding detail page (PositionSummary, CandlestickChart, LotsTable, HoldingTransactions, UnpricedWarning), data hooks, Charts page |
| transactions-engineer | Transactions page (TransactionsTable, TransactionFilters, TransactionFormModal, DeleteConfirmation), AddInstrumentModal + SymbolSearchInput, data hooks |

### Phase 3: Lead Integration (~10 min, lead solo)

Heavier than any prior session. All cross-component wiring happens here.

See Section 6 for the full integration checklist.

---

## 5. Teammate Specifications

### Teammate 1: `detail-engineer`

**Scope:** Holding detail page (`/holdings/[symbol]`), standalone charts page (`/charts`), shared chart hook

**Filesystem scope:**
```
apps/web/src/app/(pages)/holdings/[symbol]/page.tsx
apps/web/src/components/holding-detail/
  ├── PositionSummary.tsx
  ├── CandlestickChart.tsx
  ├── LotsTable.tsx
  ├── HoldingTransactions.tsx
  └── UnpricedWarning.tsx
apps/web/src/app/(pages)/charts/page.tsx
apps/web/src/components/charts/
  ├── ChartViewer.tsx
  └── SymbolSelector.tsx
apps/web/src/hooks/useChart.ts              ← SHARED HOOK (Phase 1)
apps/web/src/hooks/useHoldingDetail.ts
apps/web/src/hooks/useMarketHistory.ts
apps/web/src/lib/chart-candlestick-utils.ts
apps/web/src/lib/__tests__/chart-candlestick-utils.test.ts
```

**Build order:**

1. **Phase 1: Shared `useChart` hook** — Extract from Session 6 area chart. The hook handles create chart → attach to container ref → ResizeObserver → dispose on unmount. It accepts a series factory callback so both area and candlestick charts share the same lifecycle. **Do not modify the Session 6 area chart component yet** — the lead will do that during integration to avoid filesystem scope overlap.
2. **Phase 1: `chart-candlestick-utils.ts`** — Transform PriceBar → TradingView candlestick format `{ time, open, high, low, close }`. `Number()` conversion (same exception pattern as Session 6 AD-S6c). Unit tests for the transform.
3. **Phase 2: `useHoldingDetail` + `useMarketHistory` hooks** — Data fetching. Use `Promise.all` in `useHoldingDetail` to fetch holding + quote concurrently.
4. **Phase 2: CandlestickChart component** — TradingView v5 `addSeries(CandlestickSeries, opts)`. Dark theme tokens. Date range selector (1M/3M/6M/1Y/ALL presets).
5. **Phase 2: Holding detail page** — Compose: PositionSummary, CandlestickChart, LotsTable, HoldingTransactions, UnpricedWarning.
6. **Phase 2: Charts page** — SymbolSelector + full-width CandlestickChart reuse. **This is the first scope cut if time pressure hits — drop it without asking.**

**Deliverable details:**

- **PositionSummary** — Two-row, four-column grid on `bg-surface-raised`. Row 1: shares, avg cost, market value, unrealized PnL ($, %). Row 2: day change, realized PnL, total return, cost basis. Labels: 0.75rem, `text-muted`, uppercase. Values: 1.125rem/500, `text-heading` for neutral, gain/loss color for PnL. All values via formatters. ValueChange coloring on PnL and change fields.
- **CandlestickChart** — Uses `useChart` hook. Candlestick-specific config: `upColor: '#22c55e'` (gain-fg), `downColor: '#ef4444'` (loss-fg), matching wick colors, `borderVisible: false`. Date range presets via PillToggle. Height: 340px.
- **LotsTable** — Open FIFO lots: lot # (monospace), openedAt, original qty, remaining qty, cost basis per lot, unrealized PnL per lot. `font-mono` right-aligned numerics. ValueChange coloring on unrealized column. Totals row at bottom (sum of remaining qty, cost basis, unrealized PnL). If no price data: PnL column shows "—" with amber text "No price data".
- **HoldingTransactions** — Transaction list filtered to this instrument, sorted by `tradeAt` desc. Reuses Table component. BUY type in `status-running-fg`, SELL in `text-text`. Each row has Edit (pencil) and Delete (trash) icons — **render the icons but do not wire onClick handlers**. The lead will wire these to the transactions-engineer's modals during integration.
- **UnpricedWarning** — Conditional amber banner when `firstBarDate` is null. Style: `stale-bg` background, `stale-fg` text, `stale-border`. Text: "No price data available for [SYMBOL]. Market value and PnL cannot be calculated. Cost basis is shown for reference." Position summary shows cost basis only; market value and unrealized PnL show "—". Chart area shows centered: "Price history unavailable."
- **Empty state / redirect** — If `[symbol]` returns 404 from the API, redirect to `/` (dashboard) per Spec 9.6.

---

### Teammate 2: `transactions-engineer`

**Scope:** Transactions page (`/transactions`), add/edit transaction forms, add instrument modal, delete confirmation

**Filesystem scope:**
```
apps/web/src/app/(pages)/transactions/page.tsx
apps/web/src/components/transactions/
  ├── TransactionsTable.tsx
  ├── TransactionFilters.tsx
  ├── TransactionForm.tsx
  ├── TransactionFormModal.tsx
  ├── SellValidationError.tsx    ← PHASE 1 (build first)
  └── DeleteConfirmation.tsx
apps/web/src/components/instruments/
  ├── AddInstrumentModal.tsx
  └── SymbolSearchInput.tsx
apps/web/src/hooks/useTransactions.ts
apps/web/src/hooks/useSymbolSearch.ts
apps/web/src/hooks/useInstrumentCreate.ts
apps/web/src/lib/transaction-utils.ts
apps/web/src/lib/__tests__/transaction-utils.test.ts
```

**Build order:**

1. **Phase 1: SellValidationError component** — ⚠️ BUILD THIS FIRST with hardcoded mock data using the verified error shape from pre-flight (Section 2.1). Get the layout and copy right before touching any API. This is the session's most critical UX element.
2. **Phase 1: `transaction-utils.ts`** — Validation helpers (required fields, positive numbers, date parsing), transaction display formatting, filter application logic. Unit tests.
3. **Phase 2: `useTransactions`, `useSymbolSearch`, `useInstrumentCreate` hooks** — Data fetching + mutation functions.
4. **Phase 2: TransactionForm + TransactionFormModal** — Create and edit modes. Symbol autocomplete from held instruments. BUY/SELL toggle. Date picker with backdating. Client-side validation. Server-side error handling (422 → SellValidationError, other → toast).
5. **Phase 2: TransactionsTable + TransactionFilters** — Sortable table, filter bar (instrument, type, date range). **Filters are the second scope cut if time pressure hits.**
6. **Phase 2: Transactions page** — Compose: table, filters, add button, empty state.
7. **Phase 2: DeleteConfirmation modal** — With SellValidationError handling on delete failure.
8. **Phase 2: AddInstrumentModal + SymbolSearchInput** — Multi-step async flow. **Render the modal as a standalone component with its own trigger button for testing. The lead will wire it into holdings and dashboard pages during integration.**

**Deliverable details:**

- **SellValidationError** — Structured error display for HTTP 422 rejections. Layout:
  - Headline: "This sell would create a negative position" (in `loss-fg`)
  - Body: "Position for **[symbol]** would go negative on **[date]** by **[deficit] shares**."
  - Suggested fix: "Reduce the sell quantity by at least [deficit] shares, or add a buy transaction before [date]."
  - Container: `loss-bg` background, `loss-fg` border, `rounded-lg`, `p-4`.
  - Placed inline below the transaction form when triggered.
  - **Error shape consumed (from AD-S4):**
    ```typescript
    interface SellValidationErrorData {
      error: "SELL_VALIDATION_FAILED";
      details: {
        instrumentSymbol: string;
        firstNegativeDate: string;  // ISO datetime
        deficitQuantity: string;    // Decimal as string
      };
    }
    ```

- **TransactionForm fields:**
  1. Symbol — Autocomplete dropdown of held instruments (from `GET /api/instruments`). Not a free-text search — the user must have already added the instrument.
  2. Type — BUY/SELL toggle (two-button, BUY default). BUY: `bg-interactive` when active. SELL: `bg-surface-overlay` when active.
  3. Quantity — Numeric input, supports fractional. Label: "Shares."
  4. Price — Numeric input with `$` prefix. Label: "Price per share."
  5. Date — Date input with calendar picker. Defaults to today. Supports backdating.
  6. Fees — Numeric input, optional, defaults to $0.00.
  7. Notes — Text input, optional.
  8. Submit — "Add Transaction" / "Save Changes" button (`bg-interactive`).

- **Form submit flow:**
  1. Client-side validate (all required fields present, quantity > 0, price > 0, valid date)
  2. Submit to `POST /api/transactions` (create) or `PUT /api/transactions/[id]` (edit)
  3. If 200/201: toast success + close modal + call `refetch()` on transactions hook
  4. If 422 (sell validation): render SellValidationError inline below form. Do **not** close the modal — let the user adjust and retry.
  5. If other error: toast error message

- **AddInstrumentModal — Multi-step async flow:**
  1. **Search:** User types → debounced (300ms) `GET /api/market/search?q=`. Dropdown shows results: symbol (bold), name, exchange.
  2. **Select:** User clicks a result. Modal shows confirmation: "Add [SYMBOL] ([Name])?"
  3. **Create:** `POST /api/instruments` → modal shows loading state: "Adding [SYMBOL]... fetching historical prices."
  4. **Done:** On success → toast "[SYMBOL] added successfully" + close modal + call `refetch()`.
  5. If search returns nothing: "No instruments found for '[query]'. Check the ticker symbol or try the full company name."

- **DeleteConfirmation** — Modal text: "Delete this [BUY/SELL] transaction for [qty] shares of [symbol] on [date]?" Cancel + Delete buttons. Delete is danger variant. On 422 failure (deleting a BUY that a later SELL depends on): show SellValidationError in the modal body.

- **Empty state** — "No transactions yet. Add an instrument first, then record your trades." CTA: `[ + Add Instrument ]` button.

---

## 6. Lead Integration Pass (Phase 3)

This is the heaviest integration pass in the project so far. Session 7 has more cross-component wiring than any prior session because three pages need navigation links, the shared chart hook refactors Session 6 code, and the AddInstrumentModal is used from multiple pages.

### Integration Checklist

**Cross-page navigation:**
- [ ] Holdings table rows (both dashboard and `/holdings`) → `<Link href="/holdings/[symbol]">`
- [ ] Holding detail page back arrow → `<Link href="/holdings">`
- [ ] Holding detail transaction Edit icon → open TransactionFormModal in edit mode
- [ ] Holding detail transaction Delete icon → open DeleteConfirmation modal

**Shared component wiring:**
- [ ] AddInstrumentModal accessible from dashboard "Add Instrument" button
- [ ] AddInstrumentModal accessible from holdings page "Add Instrument" button
- [ ] AddInstrumentModal accessible from transactions page (if natural placement exists)

**Chart hook refactor:**
- [ ] Refactor Session 6 `PortfolioChart` component to use `useChart` hook from `hooks/useChart.ts`
- [ ] Verify area chart still renders correctly after refactor (visual check)
- [ ] Verify candlestick chart renders correctly (visual check)
- [ ] If refactor proves risky, leave Session 6 chart as-is and note as tech debt for S9

**Post-mutation refetch:**
- [ ] After transaction create → refetch transactions list, refetch holdings, refetch dashboard snapshot
- [ ] After transaction edit → same refetch chain
- [ ] After transaction delete → same refetch chain
- [ ] After instrument create → refetch instruments list, show new instrument in holdings

**Sell validation end-to-end test:**
- [ ] Seed a BUY for 10 shares of an instrument
- [ ] Attempt to SELL 15 shares → verify SellValidationError renders with deficit = 5
- [ ] Verify the form stays open (not dismissed) so the user can adjust
- [ ] Edit an existing BUY to reduce quantity below what a later SELL consumed → verify rejection
- [ ] Delete a BUY that a later SELL depends on → verify rejection in DeleteConfirmation modal

**Decimal discipline check:**
- [ ] `Number()` appears only in `chart-utils.ts` and `chart-candlestick-utils.ts`
- [ ] No `parseFloat()` or `Number()` in any component, hook, or other utility
- [ ] All displayed values route through Session 5 formatters

**Documentation:**
- [ ] Update AGENTS.md with Session 7 filesystem additions
- [ ] Update HANDOFF.md with Session 7 completion state

---

## 7. Exit Criteria

### Blocking (must pass before session closes)

| # | Criterion | Owner |
|---|-----------|-------|
| 1 | Holding detail page renders at `/holdings/[symbol]` with position summary, lots table, transaction history | detail-engineer |
| 2 | Candlestick chart renders with TradingView for any held instrument | detail-engineer |
| 3 | Candlestick chart responds to date range selector (at minimum 3M, 1Y, ALL) | detail-engineer |
| 4 | Candlestick chart uses dark theme consistent with STALKER design tokens | detail-engineer |
| 5 | Lots table shows FIFO lots with per-lot unrealized PnL and ValueChange coloring | detail-engineer |
| 6 | Unpriced warning renders when instrument has no price data | detail-engineer |
| 7 | Holding detail redirects to dashboard when symbol not found | detail-engineer |
| 8 | Charts page renders with symbol selector and full-width candlestick chart | detail-engineer |
| 9 | Transactions page renders with sortable table and filters | transactions-engineer |
| 10 | Transaction add form creates a new transaction via `POST /api/transactions` | transactions-engineer |
| 11 | Transaction edit form updates via `PUT /api/transactions/[id]` with pre-filled values | transactions-engineer |
| 12 | Transaction delete triggers `DELETE /api/transactions/[id]` with confirmation modal | transactions-engineer |
| 13 | Sell validation error displays structured rejection: negative date, deficit qty, suggested fix | transactions-engineer |
| 14 | Add instrument modal: search → select → create → backfill → toast success | transactions-engineer |
| 15 | Symbol search debounces and shows results from `GET /api/market/search` | transactions-engineer |
| 16 | Transaction form date input supports backdating (any past date) | transactions-engineer |
| 17 | Empty state renders on transactions page when no transactions exist | transactions-engineer |
| 18 | All Decimal values displayed via Session 5 formatters (no `parseFloat`) | both |
| 19 | All numeric table columns use `font-mono`, right-aligned | both |
| 20 | `tsc --noEmit` — 0 errors | lead |
| 21 | `pnpm test` — 380+ tests, 0 regressions | lead |

### Targets (non-blocking)

| Metric | Target |
|--------|--------|
| New tests | 30+ |
| Total tests | 395+ |
| Regressions | 0 |
| Holdings → detail navigation working | Yes |
| Cross-page refetch after mutation | Yes |
| Session 6 area chart refactored to shared hook | Yes |

---

## 8. Reference Information

### 8.1 API Response Shapes

**`GET /api/portfolio/holdings/[symbol]` — Expected Response:**
```typescript
{
  symbol: string;
  name: string;
  quantity: string;          // Decimal as string
  averageCost: string;
  marketValue: string;
  costBasis: string;
  unrealizedPnl: string;
  unrealizedPnlPercent: string;
  realizedPnl: string;
  dayChange: string;
  dayChangePercent: string;
  lots: Array<{
    openedAt: string;        // ISO datetime
    originalQty: string;
    remainingQty: string;
    costBasis: string;
    unrealizedPnl: string;
  }>;
  transactions: Array<{
    id: string;
    type: "BUY" | "SELL";
    quantity: string;
    price: string;
    fees: string;
    tradeAt: string;         // ISO datetime
    notes: string | null;
  }>;
}
```

### 8.2 Sell Validation Error Shape (from AD-S4)

**Expected HTTP 422 response from `POST/PUT/DELETE /api/transactions`:**
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

> ⚠️ **Pre-flight required:** The lead must verify this shape against the actual Session 4 API before launching teammates (Section 2.1). If the shape differs, update this section and notify the transactions-engineer.

### 8.3 TradingView v5 Candlestick Pattern

```typescript
import { createChart, CandlestickSeries } from 'lightweight-charts';

const chart = createChart(container, { /* dark theme opts */ });
const series = chart.addSeries(CandlestickSeries, {
  upColor: '#22c55e',
  downColor: '#ef4444',
  wickUpColor: '#22c55e',
  wickDownColor: '#ef4444',
  borderVisible: false,
});
series.setData(candlestickData); // { time, open, high, low, close }[]
```

---

## 9. Scope Cut Priorities

If time pressure hits, cut in this order (last = cut first):

| Priority | Item | Consequence of Cutting |
|----------|------|----------------------|
| 1 ✅ Keep | Sell validation error display | Core UX, master plan explicitly flags it. Cannot cut. |
| 2 ✅ Keep | Transaction CRUD (add/edit/delete) | MVP acceptance criterion 2. Cannot cut. |
| 3 ✅ Keep | Holding detail with lots table | MVP acceptance criteria 5, 6, 7. Cannot cut. |
| 4 ✅ Keep | Candlestick chart on holding detail | MVP acceptance criterion 5. Cannot cut. |
| 5 🟡 Cut if needed | Charts standalone page | Holding detail already has the chart. Loss: dedicated chart viewer. Recoverable in S9. |
| 6 🟡 Cut if needed | Transaction filters | Table still works without filters. Loss: convenience. Recoverable in S9. |
| 7 🟡 Cut if needed | Add Instrument modal | Users can add instruments via API directly. Loss: significant UX degradation. Strongly prefer keeping. |

**Rule for detail-engineer:** If you finish LotsTable and start running low on time, skip the Charts page entirely. Don't ask — just skip it and note it in your completion report.

---

## 10. Risk Items

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Sell validation error shape mismatch | Low (if pre-flight done) | Pre-flight verification (Section 2.1). If skipped: medium likelihood of rework during integration. |
| Candlestick series API differs from area series in TradingView v5 | Medium | detail-engineer reads v5 docs first. Likely `addSeries(CandlestickSeries, opts)` mirroring area pattern. |
| Add Instrument backfill blocks the UI too long | Low | Session 2 built the backfill. Show loading during backfill. If `POST /api/instruments` blocks until complete, show spinner. If returns immediately, close modal and let backfill run in background. |
| Multi-fetch waterfall on holding detail page | Medium | `Promise.all` in `useHoldingDetail` for concurrent fetches (holding + quote). Market history fetched separately by CandlestickChart component. |
| Transaction form date/timezone handling | Medium | API expects UTC. Form displays and accepts dates as YYYY-MM-DD (exchange date). Use `date-fns-tz` for conversion, matching Session 1 MarketCalendar pattern. |
| Chart hook refactor breaks Session 6 area chart | Low | Lead does this during integration, not detail-engineer. If refactor proves risky, leave Session 6 chart as-is and note as tech debt for S9. |

---

## 11. Definition of Done

Session 7 is complete when:
- All 21 blocking exit criteria pass
- The user can navigate from dashboard → holdings table → holding detail → see lots, chart, transactions
- The user can add, edit, and delete transactions with appropriate validation feedback
- The user can add a new instrument via symbol search
- Sell validation rejections display a clear, actionable error message
- All charts render with dark theme and design token consistency
- `tsc --noEmit` passes with 0 errors
- `pnpm test` passes with 380+ tests and 0 regressions
- `next build` compiles successfully
