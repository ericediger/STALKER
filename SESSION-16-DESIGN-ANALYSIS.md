# Session 16 — Design Analysis: UX Consolidation + Enhancements

**Date:** 2026-02-26
**Trigger:** Product stakeholder feedback during Visual UAT
**Author:** Systems Architect

---

## 1. Feedback Items

| # | Request | Source |
|---|---------|--------|
| F-1 | Dashboard table headers should be sortable | Parity gap — spec says sortable, transactions page has it, dashboard doesn't |
| F-2 | Add purchase date milestone markers on charts | New feature — visual transaction history on price charts |
| F-3 | Dashboard table should show purchase date | Enhancement — new column |
| F-4 | Dashboard, Holdings, and Transactions tabs feel redundant — consolidate? | UX architecture question |
| F-5 | Add option to delete instrument (also deletes transactions) | Gap — API exists (`DELETE /api/instruments/[id]`), UI doesn't expose it |

---

## 2. Tab Consolidation Analysis (F-4)

This is the most consequential decision. Let me lay out the current state and the options.

### Current State (5 Tabs)

```
Dashboard │ Holdings │ Transactions │ Charts │ [⚙ Settings]
```

| Tab | What It Shows | Unique Value |
|-----|---------------|--------------|
| Dashboard | Hero metric + chart + summary cards + top-20 holdings table | Portfolio overview, chart |
| Holdings | Full holdings table (83 rows) + search/filter + extra columns (Day Change, Cost Basis, Realized PnL) | All holdings, more columns, sorting |
| Transactions | Flat transaction log across ALL instruments + add/edit/delete + bulk paste | Cross-instrument transaction view, bulk import |
| Charts | Single-instrument candlestick chart | Dedicated chart viewer |
| Settings | API keys, provider status | Configuration |

### The Redundancy Problem

At the current 83-instrument scale, the user's observation is accurate:

1. **Dashboard ↔ Holdings overlap:** The dashboard holdings table and the holdings page show the same data. The only differences are: dashboard truncates to top 20, holdings page has 4 extra columns and search/filter. With S15's truncation, the user constantly bounces between them.

2. **Holdings ↔ Transactions overlap:** Both show tables of financial data. The transactions page's main unique feature — add/edit/delete — is ALSO available on Holding Detail. The only unique capability is the cross-instrument flat log and bulk paste.

3. **The mental model gap:** For a user checking their portfolio, the natural flow is "see everything → drill into one instrument." The current 5-tab structure forces the user to think about WHERE data lives (is it on Dashboard? Holdings? Transactions?) rather than just navigating a hierarchy.

### Recommended: 3-Tab Structure

```
Portfolio │ Charts │ [⚙ Settings]
                                     [💬 Advisor FAB]
```

**Tab 1: Portfolio (merged Dashboard + Holdings)**

The single portfolio view combines what was split across Dashboard and Holdings:

```
┌─────────────────────────────────────────────────────────────────┐
│  [STALKER]   Portfolio │ Charts                          [⚙]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─── Hero Metric ────────────────────────────────────────────┐  │
│  │  $142,387.52          +$1,204.31 (+0.85%)                  │  │
│  │  Total Portfolio Value     Day Change                       │  │
│  │  [1D] [1W] [1M] [3M] [1Y] [ALL]                           │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─── Portfolio Chart (Area) ─────────────────────────────────┐  │
│  │  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~│  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─── Summary Cards ──────────────────────────────────────────┐  │
│  │  Total Gain    │  Realized PnL  │  Unrealized PnL          │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─── Holdings Table (FULL — sortable, filterable) ──────────┐  │
│  │  Filter: [search...] [Type ▾]    [+ Add Instrument]  [↻]  │  │
│  │                                                             │  │
│  │  Symbol  Name      1st Buy   Qty   Price    Value    PnL $ │  │
│  │  ▲       ·         ·         ·     ·        ▼        ·     │  │
│  │  VTI     Vanguard  Jun '25   120   $245.30  $29,436  +$2.1k│  │
│  │  QQQ     Invesco   Jul '25   45    $488.10  $21,965  +$1.8k│  │
│  │  ...               ...                                      │  │
│  │                                                             │  │
│  │  TOTALS                       —     —     $142,387  +$12.8k│  │
│  │                                                             │  │
│  │  Showing 83 of 83 · Sort by Allocation ↓                   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─── Bulk Import (collapsible) ──────────────────────────────┐  │
│  │  ▶ Bulk Import Transactions                                 │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│  FOOTER: 83 instruments · Tiingo 12/50 hourly · FMP 45/250     │
└─────────────────────────────────────────────────────────────────┘
```

Key changes:
- **No top-20 truncation.** Show all holdings with client-side pagination (20 per page) or virtual scroll.
- **All columns from Holdings page** are now here: including First Buy date, Day Change, Cost Basis, Realized PnL.
- **Full sorting and filtering** on the main table — no need for a separate page.
- **Bulk Import** lives as a collapsible section at the bottom — it's a power-user feature, not a primary view.
- Click any row → Holding Detail (unchanged — lots, transactions, candlestick chart, add/edit/delete transactions).

**Tab 2: Charts (unchanged)**

Dedicated chart viewer. This stays because the holding detail chart is contextual (tied to one instrument), while the Charts tab lets you freely explore any instrument.

**Tab 3: Settings (unchanged)**

API keys, provider status. Accessed via ⚙ icon.

### What Happens to the Transactions Tab?

**It's eliminated.** Here's where the transaction capabilities go:

| Capability | New Location | Rationale |
|------------|-------------|-----------|
| View transactions for an instrument | Holding Detail page (already exists) | Per-instrument context is more useful than a flat log |
| Add transaction | Holding Detail page (already exists) + "Add Transaction" action on Portfolio table row | Context-aware — you're always adding to a specific instrument |
| Edit/delete transaction | Holding Detail page (already exists) | Same |
| Bulk paste import | Collapsible section on Portfolio page | Cross-instrument import needs a top-level location |
| Cross-instrument transaction log | Removed (or add "Recent Transactions" section later if needed) | The flat log was the least useful view. Users think in terms of holdings, not transactions. |

### Delete Instrument (F-5)

Add to two locations:
1. **Holdings table row action:** Trash icon on hover (same pattern as transaction row actions). Confirmation modal: "Delete VTI and all its transactions? This cannot be undone."
2. **Holding Detail page header:** Delete button (danger variant) next to the instrument name.

Both call `DELETE /api/instruments/[id]`, which already cascades to transactions and rebuilds snapshots.

---

## 3. Purchase Date (F-3)

### Data Model Consideration

A holding can have multiple BUY transactions at different dates. "Purchase date" is ambiguous. Two interpretations:

| Interpretation | Value | Use Case |
|---------------|-------|----------|
| **First Buy** | Earliest BUY transaction's `tradeAt` | "When did I start this position?" — useful for holding period awareness |
| **Most Recent Buy** | Latest BUY transaction's `tradeAt` | "When did I last add to this?" |

**Recommendation: Show "First Buy" date.** This tells the user their holding period, which matters for tax purposes (short-term vs. long-term capital gains — 1-year boundary). Format: `MMM 'YY` (e.g., "Jun '25") in the table column, full date in tooltip.

### API Impact

The `GET /api/portfolio/holdings` response needs to include `firstBuyDate` per holding. This is derived from the earliest BUY transaction for that instrument — a simple `MIN(tradeAt) WHERE type='BUY'` query. Low-cost addition.

---

## 4. Chart Transaction Markers (F-2)

TradingView Lightweight Charts v5 supports the `markers` API:

```typescript
series.setMarkers([
  {
    time: '2025-06-15',
    position: 'belowBar',
    color: '#34D399',       // gain-fg (green)
    shape: 'arrowUp',
    text: 'BUY 50 @ $220'
  },
  {
    time: '2025-11-20',
    position: 'aboveBar',
    color: '#F87171',       // loss-fg (red)
    shape: 'arrowDown',
    text: 'SELL 20 @ $235.50'
  }
]);
```

This applies to:
- **Holding Detail candlestick chart** — show BUY/SELL markers for that instrument's transactions
- **Charts page candlestick chart** — same, if the instrument has transactions
- **Portfolio area chart** — markers for ALL transactions (may be too noisy at 83 instruments; consider showing only for the selected window)

**Recommendation:** Implement on Holding Detail and Charts page. Skip portfolio area chart for now — too noisy.

### Marker Design

| Transaction | Shape | Position | Color | Label |
|------------|-------|----------|-------|-------|
| BUY | `arrowUp` | `belowBar` | `#34D399` (gain-fg) | `B {qty}` |
| SELL | `arrowDown` | `aboveBar` | `#F87171` (loss-fg) | `S {qty}` |

Tooltip on hover shows full details: "BUY 50 shares @ $220.00 — Jun 15, 2025"

---

## 5. Implementation Impact Assessment

| Change | Backend | Frontend | Tests | Effort |
|--------|---------|----------|-------|--------|
| F-1: Sortable dashboard headers | None | Wire existing sort logic to dashboard table | 2-3 | Small |
| F-2: Chart transaction markers | Add transactions to chart data response (or fetch client-side) | `setMarkers()` on TradingView series | 4-6 | Medium |
| F-3: First Buy date column | Add `firstBuyDate` to holdings API response | New column in table | 2-3 | Small |
| F-4: Tab consolidation | None (API layer unchanged) | Merge pages, update nav, move bulk paste | 8-12 | Medium-Large |
| F-5: Delete instrument UI | None (API exists) | Row action + confirmation modal + detail page button | 3-4 | Small |

**Total estimated tests:** 19-28 new
**Total estimated session time:** Medium session (2-3 hours with Lead + 1 teammate)

---

## 6. Risks

| # | Risk | Mitigation |
|---|------|-----------|
| R-16-1 | Consolidation breaks existing holding detail navigation | Holding Detail route (`/holdings/[symbol]`) is unchanged. Only the entry point changes (from Holdings tab to Portfolio table row). |
| R-16-2 | 83-row table performance on consolidated Portfolio page | Client-side pagination (20 per page) or virtual scroll. Test render time. |
| R-16-3 | Bulk paste loses discoverability | Collapsible section at bottom of Portfolio page. Label it clearly. |
| R-16-4 | Chart markers too noisy with many transactions | Keep labels short (`B 50`, `S 20`). Only show markers for transactions within the visible chart range. |
| R-16-5 | First Buy date query adds latency to holdings endpoint | Single aggregate query, negligible cost. Index on `(instrumentId, type, tradeAt)` already exists. |

---

## 7. Decision Required

Before Session 16 begins, confirm:

1. **Tab consolidation scope:** Full consolidation (3 tabs) as recommended, or partial (keep Transactions tab)?
2. **Purchase date interpretation:** "First Buy" date as recommended, or "Most Recent Buy"?
3. **Chart markers scope:** Holding Detail + Charts page only, or also portfolio area chart?
