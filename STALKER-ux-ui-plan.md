# STALKER — UX/UI Design Plan

**Application:** Stock & Portfolio Tracker + LLM Advisor
**Codename:** STALKER
**Version:** 1.0
**Date:** 2026-02-20
**Audience:** Engineering Lead, Product Management
**Inputs:** SPEC v4.0, Product Brief v3.1, Bookworm Style Guide v1.0

---

## 0. Executive Summary

STALKER is a local-first, single-user portfolio tracker that must deliver three things in sequence: accurate numbers, fast comprehension, and analytical depth via an LLM advisor. The design system adapts the Bookworm dark-theme foundation — surface hierarchy, status semantics, serif/sans pairing — to a financial domain where trust is earned through precision, and lost through a single misaligned decimal.

This plan covers the complete UX surface: information architecture, page-level layouts, component specifications, interaction patterns, empty and error states, charting conventions, advisor chat design, and the token system that binds them. Every recommendation is traceable to a spec section or product brief criterion.

---

## 1. Design Direction

### 1.1 Objective

Enable a single user to go from first launch to seeing portfolio value in under three minutes, and to trust every number on every screen from that point forward.

### 1.2 Assumptions

- The user is a developer or technically literate individual tracking 15–20 ETFs and stocks.
- They are not day-trading; they check the portfolio daily or weekly.
- They have historical trades in a spreadsheet or brokerage statement.
- They will run this on a Mac in a browser at desktop resolution (1280px+). Mobile is secondary.
- They have low tolerance for incorrect numbers and high tolerance for information density.

### 1.3 Design Principles (Domain-Adapted)

| Principle | Application |
|-----------|-------------|
| **Numbers Are the Product** | Financial values get the strongest typographic weight and the most generous whitespace. Every dollar amount, percentage, and quantity must be instantly scannable without ambiguity. Right-align all numeric columns. Use tabular-nums for alignment. |
| **Status at a Glance** | Adapt Bookworm's five-state status system (running/complete/blocked/attention/paused) to financial semantics: positive gain, negative loss, stale data, warning, and neutral. The user should know portfolio health in under two seconds. |
| **Progressive Disclosure** | Dashboard shows portfolio-level aggregates. Click a holding to see lots. Click the advisor to get synthesis. Never force detail; always make it one interaction away. |
| **Dark and Focused** | Retain Bookworm's deep dark surfaces. Financial data on dark backgrounds with controlled color creates a "terminal" feeling that signals precision and seriousness. Green/red for gain/loss are the dominant semantic signals. |
| **Bookish Character, Financial Gravity** | Keep Crimson Pro for page titles and section headers — it lends editorial authority. DM Sans for body and data — clean, highly legible at small sizes with tabular figure support. Monospace for raw values where alignment matters (lot tables, transaction logs). |

### 1.4 Color Semantics: Financial Mapping

The Bookworm status system maps to financial states as follows:

| Bookworm Status | STALKER Financial Meaning | Foreground | Tinted Background |
|-----------------|---------------------------|------------|-------------------|
| Complete (green) | Positive gain / profit | `#34D399` | `#1A2D28` |
| Blocked (red) | Negative loss / deficit | `#F87171` | `#2D1A1A` |
| Attention (amber) | Stale data / warning | `#FBBF24` | `#2A2515` |
| Running (blue) | Active/interactive / links | `#60A5FA` | `#1A2A3D` |
| Paused (purple) | Neutral / no change / market closed | `#A78BFA` | — |

**Critical rule:** Gain/loss color is applied only to PnL values and change indicators, never to prices themselves. A stock price of $150 is neutral; the unrealized PnL of +$2,400 is green.

---

## 2. Information Architecture

### 2.1 Navigation Model

STALKER uses a **top-level tab bar** with five destinations. No sidebar — the content area needs full width for tables and charts. The advisor is accessed via a floating action button that opens a slide-out panel, consistent with the Bookworm pattern.

```
┌──────────────────────────────────────────────────────────────────┐
│  [STALKER logo]   Dashboard │ Holdings │ Transactions │ Charts  │
│                                                          [⚙]    │
└──────────────────────────────────────────────────────────────────┘
│                                                                  │
│                     < Page Content Area >                        │
│                                                                  │
│                                                                  │
│                                                                  │
│                                                                  │
│                                                    ┌────┐        │
│                                                    │ 💬 │ FAB    │
│                                                    └────┘        │
├──────────────────────────────────────────────────────────────────┤
│  Data Health Footer: 15 instruments · Polling 30m · 183/250     │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 Page Map

| Tab | Route | Primary Content | Spec Section |
|-----|-------|-----------------|--------------|
| Dashboard | `/` | Portfolio value, chart, holdings table, summary cards | 9.1 |
| Holdings | `/holdings` | All holdings with PnL; clicking a row navigates to detail | 9.1, 9.2 |
| Holding Detail | `/holdings/[symbol]` | Candlestick chart, lots table, instrument transactions | 9.2 |
| Transactions | `/transactions` | Full transaction log, add/edit/delete, bulk paste | 9.3 |
| Charts | `/charts` | Single-instrument chart viewer with symbol selector | 9.2 (adapted) |
| Advisor (panel) | Overlay | Slide-out chat panel | 9.5 |
| Settings (modal) | Overlay | API keys, provider status | 12 |

### 2.3 User Flow: First Run

This is the most critical flow in the application (Product Brief Rec. 2). The design must funnel a new user from zero data to seeing portfolio value in under three minutes.

```
1. User opens STALKER for the first time
   → Dashboard renders empty state:
     "Add your first holding to start tracking your portfolio."
     [ + Add Instrument ] (prominent button)

2. User clicks "Add Instrument"
   → Inline modal or panel opens with symbol search input
   → User types "VTI", autocomplete shows results via /api/market/search
   → User selects "VTI — Vanguard Total Stock Market ETF"
   → System creates instrument, triggers historical backfill
   → Toast: "VTI added. Backfilling price history..."

3. User is prompted to add a transaction
   → Inline transaction form pre-filled with the instrument
   → User enters: BUY, 50 shares, $220.00, 2025-06-15
   → System validates, creates transaction, rebuilds snapshots
   → Dashboard now shows: portfolio value, one holding, one data point on the chart

4. User repeats for additional instruments
   → Each add takes < 30 seconds
   → After 3–5 instruments, the dashboard is populated and useful
```

---

## 3. Page Specifications

### 3.1 Dashboard (Route: `/`)

**Primary user goal:** Understand portfolio health at a glance — total value, direction, and which holdings are contributing or detracting.

**Acceptance criteria (from Spec 13):** Criteria 3, 4, 6, 9, 10, 11.

#### Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  HEADER: Navigation tabs                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─── Hero Metric ────────────────────────────────────────────┐  │
│  │  $142,387.52          +$1,204.31 (+0.85%)                  │  │
│  │  Total Portfolio Value     Day Change                       │  │
│  │  [1D] [1W] [1M] [3M] [1Y] [ALL]                           │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─── Portfolio Chart (Area) ─────────────────────────────────┐  │
│  │                                                             │  │
│  │  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~│  │
│  │                                                             │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─── Summary Cards (3-col grid) ─────────────────────────────┐  │
│  │  Total Gain/Loss    │  Realized PnL    │  Unrealized PnL   │  │
│  │  +$12,847.20        │  +$3,210.00      │  +$9,637.20       │  │
│  │  +9.93%             │                  │                    │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─── Holdings Table ─────────────────────────────────────────┐  │
│  │  Symbol  Name      Qty   Price    Value     PnL     Alloc  │  │
│  │  VTI     Vanguard  120   $245.30  $29,436   +$2.1k  20.7% │  │
│  │  QQQ     Invesco   45    $488.10  $21,965   +$1.8k  15.4% │  │
│  │  ...                                                        │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─── Staleness Banner (conditional) ─────────────────────────┐  │
│  │  ⚠ Prices as of 2:35 PM ET — 3 instruments stale > 2 hrs  │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│  FOOTER: 15 instruments · Polling 30m · 183/250 FMP calls      │
└─────────────────────────────────────────────────────────────────┘
```

#### Component Specifications

**Hero Metric Block**

- Total value: Crimson Pro, 2rem/600, `text-heading` color. This is the single most important number on the screen.
- Day change: DM Sans, 1rem/500. Gain color (`status-complete-fg`) or loss color (`status-blocked-fg`). Includes absolute dollar and percentage.
- Day change calculation uses MarketCalendar to determine prior trading day close (Spec 2.3), not naive "yesterday."
- Window selector: Pill-style toggle group. Active pill uses `bg-interactive`, inactive uses `bg-surface` with `border-surface-border`. Options: 1D, 1W, 1M, 3M, 1Y, ALL.

**Portfolio Chart**

- Library: TradingView Lightweight Charts (Spec 10).
- Type: Area chart with gradient fill from `status-running-fg` (opacity 0.15) at top to transparent at bottom.
- Line color: `status-running-fg` (`#60A5FA`).
- Background: `surface` (`#0F1A24`).
- Crosshair: vertical line with value tooltip showing date and portfolio value.
- Grid: Horizontal lines only, `surface-border` color at 30% opacity.
- Time axis: `text-subtle` color. Date format adapts to window: "Feb 18" for short windows, "Jun 2025" for long.
- Height: 280px on desktop.

**Summary Cards**

- Three cards in a row, each on `bg-surface-raised` with `border-surface-border`.
- Card label: DM Sans, 0.75rem, `text-muted`.
- Card value: DM Sans, 1.25rem/600, gain/loss color.
- Card percentage (where applicable): DM Sans, 0.85rem, gain/loss color.

**Holdings Table**

- Container: `bg-surface-raised`, `border-surface-border`, `rounded-lg`.
- Header row: DM Sans, 0.75rem/600, uppercase, `text-muted`, `letter-spacing: 0.05em`.
- Data rows: DM Sans, 0.875rem. Hover: `bg-surface-overlay`. Clickable — navigates to holding detail.
- Columns: Symbol (bold, `text-heading`), Name (`text-muted`, truncated), Qty (right-aligned, tabular-nums), Price (right-aligned), Market Value (right-aligned, `text-heading`), Unrealized PnL (right-aligned, gain/loss color, includes $ and %), Allocation % (right-aligned, `text-muted`).
- Sort: Default by allocation descending. Column headers are clickable to sort.
- Staleness indicator per row: If a quote is older than 1 hour during market hours, show a small amber dot next to the price. Tooltip shows `asOf` timestamp.

**Staleness Banner**

- Conditional: Only appears when any held instrument has a quote older than the expected freshness window.
- Style: `bg-status-attention-surface`, `border-status-attention-border`, `text-status-attention-fg`.
- Icon: AlertCircle (Lucide), 16px.
- Placement: Between holdings table and footer. Not sticky — scrolls with content.

**Data Health Footer**

- Fixed at bottom of viewport. `bg-surface-raised`, `border-t border-surface-border`.
- Height: 36px.
- Content: Three segments separated by `·` dividers.
  1. Instrument count + polling status
  2. API budget (progress bar: `status-complete-fg` fill on `surface-overlay` track, same pattern as Bookworm)
  3. Overall freshness
- Typography: DM Sans, 0.75rem, `text-subtle`. Numbers in `text-muted` for emphasis.
- Data source: `GET /api/market/status` (Spec 8.4).

#### Empty State (Spec 9.6)

When no instruments exist:
- Hide chart, summary cards, holdings table, and footer.
- Show centered block: Crimson Pro heading "Add your first holding to start tracking your portfolio." at 1.25rem, `text-heading`.
- Below: DM Sans body text "Search for a ticker symbol to add an instrument and begin recording trades." at 0.875rem, `text-muted`.
- Below: Primary button `[ + Add Instrument ]` using `bg-interactive` style.
- Background: subtle radial gradient from `surface-raised` center to `surface` edges, creating a gentle focal point.

---

### 3.2 Holdings Table Page (Route: `/holdings`)

**Primary user goal:** See all positions with current performance, and drill into any one for detail.

This page is architecturally similar to the dashboard holdings table but given its own tab for dedicated access with enhanced functionality.

#### Differences from Dashboard Table

- Full-width layout (no chart or summary cards above).
- Additional columns: Day Change ($, %), Cost Basis, Realized PnL.
- Search/filter bar at top: text input to filter by symbol, dropdown for instrument type (STOCK/ETF/FUND).
- "Add Instrument" button in the top-right of the page header.
- Column sorting on all numeric columns.
- Totals row at bottom: sum of Market Value, Cost Basis, Unrealized PnL, Realized PnL. Weighted average for allocation. No sum for Price or Day Change (meaningless aggregates).

#### Empty State

Same as dashboard empty state. Single call-to-action.

---

### 3.3 Holding Detail (Route: `/holdings/[symbol]`)

**Primary user goal:** Understand a single position in depth — price history, lot structure, realized and unrealized PnL, and the transaction history that produced it.

**Acceptance criteria:** Criteria 5, 6, 7.

#### Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back to Holdings    VTI — Vanguard Total Stock Market ETF    │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─── Position Summary (4-col grid) ─────────────────────────┐  │
│  │  Shares     Avg Cost    Market Value    Unrealized PnL     │  │
│  │  120        $208.40     $29,436.00      +$2,428.00 +9.4%   │  │
│  ├────────────────────────────────────────────────────────────┤  │
│  │  Day Change   Realized PnL   Total Return   Cost Basis     │  │
│  │  +$1.20 +0.5% +$1,540.00    +$3,968.00     $25,008.00     │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─── Price Chart (Candlestick) ─────────────────────────────┐  │
│  │  Date range: [From] — [To]     [1M] [3M] [6M] [1Y] [ALL] │  │
│  │                                                             │  │
│  │  ┃┃ ┃┃┃┃  ┃┃  ┃┃┃┃  ┃┃┃┃  ┃┃  ┃┃┃┃  ┃┃  ┃┃┃┃  ┃┃       │  │
│  │                                                             │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─── Lots Table (FIFO) ─────────────────────────────────────┐  │
│  │  #   Opened      Orig Qty  Rem Qty  Cost Basis  Unreal PnL│  │
│  │  1   2025-06-15  50        50       $10,420.00  +$1,845.00│  │
│  │  2   2025-09-03  40        40       $8,720.00   +$1,092.00│  │
│  │  3   2026-01-10  30        30       $6,870.00   −$509.00  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─── Transaction History ────────────────────────────────────┐  │
│  │  Date         Type  Qty   Price     Fees    Notes           │  │
│  │  2026-01-10   BUY   30    $229.00   $0.00   Q1 DCA         │  │
│  │  2025-11-20   SELL  20    $235.50   $4.95   Rebalance      │  │
│  │  2025-09-03   BUY   40    $218.00   $0.00                  │  │
│  │  2025-06-15   BUY   50    $208.40   $0.00   Initial pos    │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

#### Component Specifications

**Page Header**

- Back arrow: Lucide ArrowLeft, 20px, `text-muted`. Hover: `bg-interactive` circle.
- Symbol: DM Sans, 1rem/600, `text-heading`.
- Name: DM Sans, 0.875rem, `text-muted`.
- Layout: Matches Bookworm sticky header pattern — `bg-surface-raised`, `border-b border-surface-border`, `sticky top-0 z-10`.

**Position Summary**

- Two-row, four-column grid on `bg-surface-raised`.
- Label: 0.75rem, `text-muted`, uppercase.
- Value: 1.125rem/500, `text-heading` for neutral values, gain/loss color for PnL.
- This is the densest information block on the page. Consistent column widths and right-alignment for all numeric values are essential.

**Candlestick Chart**

- Library: TradingView Lightweight Charts.
- Up candle: `status-complete-fg` fill, same color border.
- Down candle: `status-blocked-fg` fill, same color border.
- Wick: Same color as candle body.
- Background: `surface`.
- Grid: Horizontal only, `surface-border` at 20% opacity.
- Volume bars (if shown): Below chart, `surface-overlay` fill, 40% height of chart area. Use gain/loss color matching the candle direction.
- Date range picker: Two date inputs with flexible presets. Active preset pill: `bg-interactive`.
- Height: 340px.

**Lots Table**

- Container: `bg-surface-raised`, `rounded-lg`, `border-surface-border`.
- Header: DM Sans, 0.75rem, uppercase, `text-muted`.
- Lot number (#): Monospace, `text-subtle`.
- Opened date: DM Sans, 0.875rem, `text-text`.
- Quantities: Right-aligned, tabular-nums.
- Cost Basis: Right-aligned, `text-text`.
- Unrealized PnL: Right-aligned, gain/loss color.
- Totals row at bottom: Sum of Remaining Qty, Cost Basis, Unrealized PnL.
- If instrument has no price data: Show cost basis only, PnL column shows "—" with amber text "No price data" (Spec 5.5).

**Transaction History**

- Same table styling as lots table.
- Sorted by `tradeAt` descending (most recent first).
- Type column: BUY in `status-running-fg`, SELL in `text-text`. Not gain/loss color — the transaction type is factual, not evaluative.
- Row actions: Edit (pencil icon) and Delete (trash icon) on hover, right-aligned. Both are `text-muted`, hover to `text-heading` (edit) or `status-blocked-fg` (delete).
- Delete requires confirmation modal (Bookworm pattern: `bg-black/60` backdrop, centered modal, danger button).

#### Unpriced Warning (Spec 5.5, 9.2)

If `firstBarDate` is null (no price data at all):
- Position summary shows cost basis only. Market Value and Unrealized PnL show "—".
- Amber callout below position summary: "No price data available for [SYMBOL]. Market value and PnL cannot be calculated. Cost basis is shown for reference."
- Chart area shows a centered message: "Price history unavailable."

#### Unreachable State (Spec 9.6)

If accessed via direct URL with no holdings: Redirect to dashboard.

---

### 3.4 Transactions Page (Route: `/transactions`)

**Primary user goal:** View, add, edit, and delete transactions across all instruments. Bulk-enter historical trades via paste.

**Acceptance criteria:** Criteria 2, 11 (post-core).

#### Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  Transactions                              [ + Add Transaction ] │
├─────────────────────────────────────────────────────────────────┤
│  Filter: [All Instruments ▾]  [All Types ▾]  [Date Range]       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─── Transaction Table ──────────────────────────────────────┐  │
│  │  Date         Symbol  Type  Qty     Price      Fees  Notes │  │
│  │  2026-01-10   VTI     BUY   30     $229.00    $0.00  Q1.. │  │
│  │  2025-11-20   VTI     SELL  20     $235.50    $4.95  Reb..│  │
│  │  2025-11-15   QQQ     BUY   15     $478.25    $0.00       │  │
│  │  ...                                                        │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─── Bulk Paste Area (collapsible) ─────────────────────────┐  │
│  │  ▼ Bulk Import                                             │  │
│  │  [ Paste tab-separated rows here...                      ] │  │
│  │  [ Parse ] → Preview table with error highlighting         │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

#### Add Transaction Form

Opens as an inline panel or modal. Fields:

1. **Symbol** — Autocomplete input. Searches via `GET /api/market/search`. Shows results in a dropdown: symbol (bold) + name + exchange. If the instrument doesn't exist yet, offer to create it on selection (triggers backfill).
2. **Type** — Toggle: BUY / SELL. Two-button toggle, not a dropdown. BUY is default. BUY button: `bg-interactive` when active. SELL button: `bg-surface-overlay` when active.
3. **Quantity** — Numeric input. Supports fractional (Spec 2.5). Label: "Shares."
4. **Price** — Numeric input with `$` prefix. Label: "Price per share."
5. **Date** — Date input with calendar picker. Defaults to today. Supports backdating. Label: "Trade date."
6. **Fees** — Numeric input, optional, defaults to $0.00. Label: "Fees."
7. **Notes** — Text input, optional. Label: "Notes."
8. **Submit** — Button: "Add Transaction" using `bg-interactive`.

**Validation error display:** If the transaction would create a negative position (Spec 11.2), show an inline error below the form in `status-blocked-fg` on `status-blocked-bg`:

> "This sell would create a negative position for VTI on 2025-09-15. Position would be −5 shares. Adjust the quantity or date."

#### Bulk Paste Input (Spec 9.3.1 — Next Priority)

- Collapsed by default under a "Bulk Import" disclosure heading.
- Expanded: Multi-line textarea with placeholder text showing the expected format:
  ```
  VTI  BUY  50  220.00  2025-06-15
  QQQ  BUY  30  465.00  2025-07-01
  VTI  SELL  20  235.50  2025-11-20  4.95  Rebalance
  ```
- "Parse" button: Parses input, displays a preview table below.
- Preview table: Same columns as transaction table. Error rows highlighted with `status-blocked-bg` background and `status-blocked-fg` text explaining the issue (unknown symbol, invalid date, negative position).
- Valid rows: Normal styling with a checkmark icon in a status column.
- "Import N Transactions" confirmation button: `bg-status-complete-bg`, `text-status-complete-fg`. Only enabled when at least one valid row exists.
- On success: Toast notification "Imported N transactions. Portfolio snapshots rebuilt."

#### Empty State (Spec 9.6)

"No transactions yet. Add an instrument first, then record your trades." Primary CTA: `[ + Add Instrument ]`.

---

### 3.5 Charts Page (Route: `/charts`)

**Primary user goal:** View detailed price history for any instrument in the portfolio.

This is a lightweight page that provides the candlestick chart experience in a dedicated view, separated from the holding detail context. It serves users who want to look at price action without the lot and transaction detail.

#### Layout

- Symbol selector: Dropdown or searchable select listing all tracked instruments. Default: first instrument alphabetically.
- Date range controls: Same as holding detail (presets + custom range).
- Chart: Full-width candlestick chart, same spec as holding detail (Section 3.3).
- Below chart: Current price, day change, 52-week high/low (if available from cached data).

---

### 3.6 Advisor Chat (Slide-Out Panel — Spec 9.5)

**Primary user goal:** Get analytical synthesis that the dashboard cannot provide — cross-holding performance attribution, tax-aware lot reasoning, concentration analysis.

**Acceptance criteria:** Criterion 8.

#### Panel Specifications

- Trigger: Floating Action Button (FAB), bottom-right, fixed position. 56x56px circle, `bg-interactive`, shadow-lg. Icon: MessageSquare (Lucide). Hover: `scale(1.05)`, `bg-interactive-hover`.
- Panel: Slides in from right. Width: 448px (`max-w-md`). Full viewport height. `bg-surface-raised`, `shadow-2xl`. Backdrop: `bg-black/30`.
- Close: X button in panel header, or click backdrop.

#### Panel Layout

```
┌──────────────────────────────────┐
│  Advisor        [New] [Threads] [X]│
├──────────────────────────────────┤
│                                    │
│  ┌─ Assistant message ──────────┐ │
│  │ I can help you analyze your  │ │
│  │ portfolio. Here are some     │ │
│  │ things I can do:             │ │
│  └──────────────────────────────┘ │
│                                    │
│       ┌─── User message ───────┐  │
│       │ Which positions are    │  │
│       │ dragging my portfolio  │  │
│       │ down this quarter?     │  │
│       └────────────────────────┘  │
│                                    │
│  ┌─ Tool call indicator ────────┐ │
│  │ 📊 Looking up portfolio...   │ │
│  └──────────────────────────────┘ │
│                                    │
│  ┌─ Assistant message ──────────┐ │
│  │ Based on your Q1 holdings,  │ │
│  │ three positions have been   │ │
│  │ detracting from returns...  │ │
│  └──────────────────────────────┘ │
│                                    │
├──────────────────────────────────┤
│  [Type a message about your      │
│   portfolio...               ] ➤  │
└──────────────────────────────────┘
```

#### Chat Message Styling

Follows Bookworm chat bubble pattern exactly:

- **User messages:** `bg-interactive`, no border, align right. DM Sans, 0.875rem.
- **Assistant messages:** `bg-surface-overlay`, `border-surface-border`, align left. DM Sans, 0.875rem.
- **Tool call indicator:** `bg-surface-overlay`, `border-surface-border`, align left. Shows icon + "Looking up [tool description]..." in `text-muted` with spinner. Collapsible — clicking expands to show raw tool call/result (monospace, `text-subtle`).
- **Loading state:** Three-dot animation or Loader2 spinner in `text-muted`.
- Auto-scroll to newest message.

#### Suggested Prompts (Spec 9.5)

When holdings exist but no active thread, display three clickable prompt cards above the input:

1. "Which positions are dragging my portfolio down this quarter?"
2. "What would the realized gain be if I sold my oldest lots?"
3. "Am I overexposed to any single holding?"

Cards: `bg-surface`, `border-surface-border`, `rounded-lg`, `p-3`. Text: DM Sans, 0.85rem, `text-muted`. Hover: `bg-surface-overlay`, `text-text`. Clicking a card sends it as the first message.

#### Thread Management

- "New Thread" button: `bg-interactive`, small. Creates a new thread, clears the chat area.
- "Threads" button: Opens a dropdown listing past threads by title and date. Clicking one loads that thread's messages.
- Thread titles: Auto-generated from the first user message (truncated to 60 characters).

#### Missing API Key State (Spec 11.3)

If `LLM_PROVIDER` or the corresponding API key is not configured:
- Chat input is disabled.
- Panel body shows: Crimson Pro heading "Advisor Setup Required" + DM Sans body text explaining how to add the API key to `.env.local`. Include the specific environment variable names.
- No suggested prompts.

#### No Holdings State (Spec 9.6)

"Add some holdings first so the advisor has something to work with." No input field. Link to dashboard.

---

## 4. Component Library

### 4.1 Token System

The following tokens extend Bookworm's system for financial domain use. All are consumed via Tailwind semantic classes.

#### Surface Tokens (Unchanged from Bookworm)

| Token | Hex | Usage |
|-------|-----|-------|
| `surface` | `#0F1A24` | Page background |
| `surface-raised` | `#162029` | Cards, panels, header, footer |
| `surface-overlay` | `#1E2D3A` | Hover, code blocks, assistant bubbles |
| `surface-border` | `#2A3A47` | All borders and dividers |

#### Text Tokens (Unchanged from Bookworm)

| Token | Hex | Usage |
|-------|-----|-------|
| `text-heading` | `#E8F0F6` | Headings, hero numbers, strong emphasis |
| `text` | `#C8D6E0` | Body text, data values |
| `text-muted` | `#8A9DAD` | Labels, secondary text, descriptions |
| `text-subtle` | `#5A6F80` | Timestamps, placeholders, hints |

#### Financial Semantic Tokens (New)

| Token | Hex | Usage |
|-------|-----|-------|
| `gain-fg` | `#34D399` | Positive PnL values, positive change |
| `gain-bg` | `#1A2D28` | Background for gain indicators |
| `loss-fg` | `#F87171` | Negative PnL values, negative change |
| `loss-bg` | `#2D1A1A` | Background for loss indicators |
| `stale-fg` | `#FBBF24` | Stale data warnings |
| `stale-bg` | `#2A2515` | Background for stale indicators |
| `stale-border` | `#5A4A1A` | Border for stale callouts |
| `interactive` | `#1E3A52` | Buttons, user bubbles, active controls |
| `interactive-hover` | `#264A66` | Hover state for interactive elements |
| `interactive-border` | `#3A6080` | Focus borders on inputs |

#### Typography Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `font-display` | `'Crimson Pro', Georgia, serif` | Page titles, section headings |
| `font-body` | `'DM Sans', -apple-system, sans-serif` | All body text, data, labels |
| `font-mono` | `'SF Mono', 'Fira Code', monospace` | Raw values, lot tables, code |

### 4.2 Typography Scale

| Name | Font | Size | Weight | Usage |
|------|------|------|--------|-------|
| Hero Value | Crimson Pro | 2rem | 600 | Portfolio total value |
| Page Title | Crimson Pro | 1.25rem | 600 | Page headings |
| Section Head | Crimson Pro | 1.125rem | 500 | Section headings, panel titles |
| Card Title | Crimson Pro | 1rem | 500 | Card headings, holding name |
| Body | DM Sans | 0.875rem | 400 | All body text, table data |
| Body Medium | DM Sans | 0.875rem | 500 | Button labels, emphasized text |
| Label | DM Sans | 0.75rem | 600 | Table headers, card labels (uppercase, tracked) |
| Subtle | DM Sans | 0.75rem | 400 | Timestamps, hints, footer text |
| Mono Data | SF Mono | 0.8rem | 400 | Lot numbers, technical metadata |

### 4.3 Numeric Formatting Rules

These rules apply globally to all financial values displayed in the UI. They are the single most important consistency rule in the entire design system.

| Data Type | Format | Example | Alignment |
|-----------|--------|---------|-----------|
| Dollar amount (< $100K) | `$XX,XXX.XX` | `$29,436.00` | Right |
| Dollar amount (>= $100K) | `$XXX,XXX.XX` | `$142,387.52` | Right |
| Dollar change | `+$X,XXX.XX` or `−$X,XXX.XX` | `+$1,204.31` | Right |
| Percentage | `+X.XX%` or `−X.XX%` | `+0.85%` | Right |
| Share quantity (whole) | `XXX` | `120` | Right |
| Share quantity (fractional) | `XXX.XXXX` | `12.5000` | Right |
| Price per share | `$XXX.XX` | `$245.30` | Right |

**Critical implementation notes:**

- Use `tabular-nums` (`font-variant-numeric: tabular-nums`) on all numeric table columns. This ensures digits align vertically regardless of value.
- Use the minus sign character `−` (U+2212), not the hyphen `-` (U+002D), for negative values. The minus sign is the same width as a digit in tabular-nums, preventing misalignment.
- Gain/loss sign prefix: Always show `+` for positive, `−` for negative. Zero values show no sign.
- The hero portfolio value does not show a sign prefix — it is the total, not a change.

### 4.4 Component Catalog

#### Buttons

Four variants, consistent with Bookworm:

| Variant | BG | Text | Border | Use Case |
|---------|-----|------|--------|----------|
| Interactive | `interactive` | `text` | None | Primary actions: Add Instrument, Add Transaction, Send |
| Success | `gain-bg` | `gain-fg` | None | Confirmatory: Import Transactions, Mark Complete |
| Outline | `surface` | `text` | `surface-border` | Secondary: Cancel, Download, Filter |
| Danger | `#dc2626` | White | None | Destructive: Delete Transaction (confirmation modal only) |

All buttons: `rounded-lg`, DM Sans 0.875rem/500, `transition-colors 150ms`, icon + label layout, disabled state at 50% opacity.

#### Inputs

- Background: `surface`.
- Border: `surface-border`. Focus: `interactive-border`.
- Text: `text`. Placeholder: `text-subtle`.
- Rounded: `rounded-lg`.
- Height: 40px for standard inputs, 36px for compact (filter bar).

#### Tables

- Container: `bg-surface-raised`, `rounded-lg`, `border-surface-border`.
- Header: `text-muted`, 0.75rem, uppercase, `letter-spacing: 0.05em`. Bottom border.
- Rows: `border-b border-surface-border/50`. Hover: `bg-surface-overlay`.
- Numeric cells: Right-aligned, `tabular-nums`.
- Text cells: Left-aligned, truncate with ellipsis if needed.
- Totals row: `border-t-2 border-surface-border`. Values in `text-heading` weight.

#### Badges / Pills

- Gain badge: `gain-bg` background, `gain-fg` text, `rounded` (small radius).
- Loss badge: `loss-bg` background, `loss-fg` text, `rounded`.
- Stale badge: `stale-bg` background, `stale-fg` text, `stale-border`.
- BUY type: `status-running-bg` background, `status-running-fg` text.
- SELL type: `surface-overlay` background, `text-muted` text.

#### Tooltips

- Background: `surface-overlay`.
- Border: `surface-border`.
- Text: `text`, 0.75rem.
- Arrow: 6px, matching background.
- Shadow: `shadow-lg`.
- Max width: 280px.
- Use for: staleness details per instrument, lot cost basis breakdown, allocation percentage explanation.

#### Toasts / Notifications

- Position: Bottom-center, `fixed bottom-4 left-1/2 -translate-x-1/2`.
- Success: `gain-bg`, `gain-fg`.
- Error: `loss-bg`, `loss-fg`, `border loss-fg/30`.
- Warning: `stale-bg`, `stale-fg`, `stale-border`.
- Info: `status-running-bg`, `status-running-fg`.
- Auto-dismiss after 5 seconds. No manual dismiss button (non-blocking).
- Animation: Fade-in from below (Bookworm's `fade-in` keyframe).

#### Confirmation Modal

Used for delete actions (transactions, instruments). Follows Bookworm pattern exactly:

- Backdrop: `bg-black/60`.
- Modal: `bg-surface-raised`, `rounded-xl`, `shadow-xl`, max-width 420px, centered.
- Header: Warning icon (AlertCircle, `status-blocked-fg`) + Crimson Pro heading.
- Body: DM Sans body text describing the consequence. "This action cannot be undone." in `status-blocked-fg`.
- Actions: Cancel (outline button) + Confirm (danger button), right-aligned.

---

## 5. Interaction Patterns

### 5.1 Add Instrument Flow

1. User clicks "Add Instrument" (available from dashboard, holdings, or transaction form).
2. Modal opens with a search input, auto-focused.
3. User types. After 2+ characters, debounced search (300ms) calls `GET /api/market/search?q=...`.
4. Results appear in dropdown: Symbol (bold), Name, Exchange, Type.
5. User selects a result. Modal shows confirmation: "Add VTI (Vanguard Total Stock Market ETF)?"
6. User confirms. API call to `POST /api/instruments`.
7. Modal closes. Toast: "VTI added. Backfilling price history..." Background backfill begins.
8. If search returns no results: "No instruments found for 'XYZ'. Try a different ticker or name."

### 5.2 Transaction CRUD

**Add:** Form validation is live (debounced). Submit is disabled until all required fields are valid. On submit, if position invariant is violated, the error appears inline without clearing the form — the user can adjust and retry.

**Edit:** Click pencil icon on transaction row. Same form opens pre-populated. Changes trigger re-validation and snapshot rebuild.

**Delete:** Click trash icon. Confirmation modal. On confirm, delete + rebuild. If deletion would cause a position invariant violation for remaining transactions (e.g., deleting a BUY that a later SELL depends on), show an error explaining why the deletion is blocked.

### 5.3 Window Selector Behavior (Dashboard)

- Clicking a window preset (1D, 1W, 1M, 3M, 1Y, ALL) fetches the corresponding time series via `GET /api/portfolio/timeseries`.
- Chart animates to new data range. Summary cards update to reflect the window's starting and ending values.
- "1D" shows intraday if available (post-MVP); in MVP, shows last two trading days as a line.
- Active preset: `bg-interactive`, `text-heading`. Inactive: `bg-surface`, `text-muted`, `border-surface-border`.
- Selection is persisted in URL query param (`?window=3M`) for shareable state.

### 5.4 Manual Refresh

- "Refresh Quotes" button in the data health footer (or a small refresh icon next to the staleness banner).
- On click: Sends `POST /api/market/refresh`.
- Button shows spinner during refresh. Disabled if a refresh is already in progress.
- On completion: Toast with result ("Quotes refreshed. 15/15 updated." or "Quotes refreshed. 12/15 updated — 3 rate-limited.").
- Respects rate limits (Spec 6.3). If rate-limited, toast shows: "Rate limit reached. Retry in X minutes."

### 5.5 Sorting and Filtering

- **Table sorting:** Click column header to sort. First click: descending. Second click: ascending. Third click: default order. Active sort column shows a small arrow icon (ChevronUp/ChevronDown from Lucide) in `text-muted`.
- **Transaction filters:** Instrument dropdown, type dropdown (BUY/SELL/ALL), date range picker. Filters are applied client-side for small datasets, server-side if pagination is needed (unlikely in single-user MVP).
- **URL state:** Sort column, sort direction, and active filters are reflected in URL query params.

---

## 6. Charting Specifications

### 6.1 TradingView Lightweight Charts Configuration

All charts use the TradingView Lightweight Charts library (Spec 10). The following configuration ensures visual consistency with the STALKER design system.

#### Shared Chart Options

```
Layout:
  background: { color: '#0F1A24' }         // surface
  textColor: '#8A9DAD'                      // text-muted
  fontSize: 12
  fontFamily: 'DM Sans'

Grid:
  vertLines: { visible: false }
  horzLines: { color: '#2A3A47', style: 2 } // surface-border, dashed

Crosshair:
  mode: 0 (Normal)
  vertLine: { color: '#5A6F80', width: 1 }  // text-subtle
  horzLine: { color: '#5A6F80', width: 1 }

TimeScale:
  borderColor: '#2A3A47'                    // surface-border
  timeVisible: false (daily bars)

RightPriceScale:
  borderColor: '#2A3A47'
```

#### Area Chart (Portfolio Value)

```
Series options:
  topColor: 'rgba(96, 165, 250, 0.15)'     // status-running-fg at 15%
  bottomColor: 'rgba(96, 165, 250, 0.0)'
  lineColor: '#60A5FA'                       // status-running-fg
  lineWidth: 2
  crosshairMarkerRadius: 4
```

#### Candlestick Chart (Instrument Price)

```
Series options:
  upColor: '#34D399'                         // gain-fg
  downColor: '#F87171'                       // loss-fg
  borderUpColor: '#34D399'
  borderDownColor: '#F87171'
  wickUpColor: '#34D399'
  wickDownColor: '#F87171'
```

### 6.2 Chart Interaction

- Crosshair tooltip: Shows date, OHLC values (candlestick) or value + date (area chart). Tooltip background: `surface-overlay`, border: `surface-border`. Text: DM Sans 0.75rem.
- Scroll to zoom: Enabled. Mouse wheel zooms time axis.
- Drag to pan: Enabled. Click-and-drag pans time axis.
- Reset zoom: Double-click resets to fit all visible data.
- Responsive: Charts fill container width. Minimum height enforced (280px for dashboard, 340px for detail).

---

## 7. Error Handling and Edge Cases

### 7.1 Error State Patterns

Every error state uses one of three visual treatments:

| Severity | Treatment | Example |
|----------|-----------|---------|
| Blocking | Inline error with `loss-bg`/`loss-fg`, replaces the affected content area | Transaction validation failure, API key missing |
| Warning | Amber banner with `stale-bg`/`stale-fg`, shown adjacent to affected content | Stale quotes, missing price data |
| Informational | Toast notification, auto-dismissing | Rate limit hit, background backfill in progress |

### 7.2 Specific Error States

| Scenario | Location | Display |
|----------|----------|---------|
| Negative position on transaction add/edit | Transaction form | Inline error below form: specific date, deficit qty (Spec 11.2) |
| Negative position on transaction delete | Confirmation modal | Block deletion. Modal text explains which later SELL depends on this BUY. |
| Provider rate-limited | Dashboard footer | Toast: "FMP rate limit reached. Using cached data." Staleness banner appears. |
| Provider down | Dashboard footer | Toast: "Market data temporarily unavailable." Staleness indicators on all affected instruments. |
| Symbol not found on search | Add Instrument modal | "No results for 'XYZ'. Check the ticker symbol or try the full company name." |
| LLM API error | Advisor panel | Assistant message: "I encountered an error processing your request. Please try again." in `text-muted`. |
| LLM rate-limited | Advisor panel | "Thinking..." indicator persists with a subtle timeout message after 30 seconds. |
| Context too long | Advisor panel | Transparent to user — system truncates oldest messages (Spec 7.3). |
| Snapshot cache stale/missing | Transparent | Rebuilt on demand. User may see a brief loading indicator on first dashboard load. |

### 7.3 Loading States

| Context | Pattern |
|---------|---------|
| Dashboard first load | Skeleton shimmer on hero metric, chart area, and table. `surface-overlay` rectangles pulsing at 2s interval (Bookworm's `animate-pulse-slow`). |
| Data refresh | Spinner on refresh button. Existing data remains visible — never blank the screen during a refresh. |
| Add Instrument backfill | Toast persists: "Backfilling VTI history..." with spinner. Dashboard updates incrementally as data arrives. |
| Advisor response | "Thinking..." bubble with Loader2 spinner. Tool call indicators appear as they fire. |
| Chart render | Chart container shows at full height with `surface` background. Data appears once loaded — no spinner inside the chart itself (TradingView handles this). |

---

## 8. Accessibility

### 8.1 Keyboard Navigation

- All interactive elements are focusable via Tab.
- Focus ring: 2px solid `#60A5FA`, 2px offset (Bookworm standard).
- Modal traps focus. Escape closes modals and the advisor panel.
- Table rows: Arrow keys navigate between rows when table is focused.
- Window selector: Arrow keys cycle between presets.
- Charts: Not keyboard-navigable (TradingView limitation). Provide an accessible data table alternative as a "View as table" link below each chart.

### 8.2 Screen Readers

- All tables use proper `<table>`, `<thead>`, `<th>` (with `scope="col"`), `<tbody>`, `<tr>`, `<td>` markup.
- Gain/loss color is supplemented with text: "+$1,204.31" is readable without seeing the green color. Do not rely on color alone.
- Staleness icons have `aria-label`: "Price stale — last updated 2 hours ago."
- Chart images have `aria-label` describing the trend: "Portfolio value chart showing +2.3% gain over the last month."
- Advisor panel: `role="dialog"`, `aria-label="Portfolio Advisor"`.
- Live regions: Toast notifications use `aria-live="polite"`.

### 8.3 Contrast

All text/background combinations meet WCAG AA (4.5:1 for body text, 3:1 for large text and UI components):

- `text-heading` (#E8F0F6) on `surface` (#0F1A24): 12.8:1
- `text` (#C8D6E0) on `surface` (#0F1A24): 9.5:1
- `text-muted` (#8A9DAD) on `surface` (#0F1A24): 5.6:1
- `text-subtle` (#5A6F80) on `surface` (#0F1A24): 3.2:1 (used only for non-essential decorative text; never for actionable content)
- `gain-fg` (#34D399) on `surface` (#0F1A24): 8.7:1
- `loss-fg` (#F87171) on `surface` (#0F1A24): 5.8:1
- `stale-fg` (#FBBF24) on `surface` (#0F1A24): 9.1:1

### 8.4 Reduced Motion

- Respect `prefers-reduced-motion: reduce`. Disable spinner animations, chart transitions, and toast slide-ins.
- Status dots (pulsing) become static when reduced motion is preferred.

---

## 9. Responsive Behavior

### 9.1 Breakpoints

| Breakpoint | Width | Behavior |
|------------|-------|----------|
| Desktop (default) | 1280px+ | Full layout as specified above. |
| Tablet | 768px–1279px | Holdings table hides Allocation % column. Summary cards stack to 2+1. Advisor panel width: 100% (full overlay). |
| Mobile | < 768px | Holdings table shows only Symbol, Value, PnL. Tap row for detail. Navigation becomes bottom tab bar. Summary cards stack vertically. Charts: 200px height minimum. |

### 9.2 Container Widths

| Page | Max Width | Padding |
|------|-----------|---------|
| Dashboard | `max-w-7xl` (1280px) | `px-3 sm:px-4 md:px-6` |
| Holdings | `max-w-7xl` | `px-3 sm:px-4 md:px-6` |
| Holding Detail | `max-w-6xl` (1152px) | `px-3 sm:px-4 md:px-6` |
| Transactions | `max-w-6xl` | `px-3 sm:px-4 md:px-6` |
| Charts | `max-w-7xl` | `px-3 sm:px-4 md:px-6` |

---

## 10. Advisor System Prompt UX Guidance

The advisor's system prompt (Spec 7.5) defines the personality and scope of the chat experience. The following UX constraints feed into the prompt design:

### 10.1 What the Advisor Should Do

- Synthesize across holdings (which positions contribute to or detract from performance).
- Reason about FIFO lots and cost basis (tax implications of hypothetical sells).
- Attribute performance (how much of total gain came from position X vs. Y).
- Identify concentration risk (overexposure to a single holding or sector).
- Flag data quality issues (stale quotes, missing price bars).

### 10.2 What the Advisor Should Not Do

- Give financial advice ("you should buy/sell X").
- Predict market direction.
- Trigger external API calls or web searches (MVP scope — Spec 7.1).
- Display raw tool call JSON to the user (the collapsible tool indicator is sufficient).

### 10.3 Tone

The advisor should read like a knowledgeable analyst reviewing a personal portfolio with its owner: precise, direct, occasionally surfacing insights the owner hadn't considered. Not a chatbot. Not a salesperson. Not a financial advisor with legal disclaimers.

### 10.4 Data Staleness Protocol

Before presenting any price-dependent analysis, the advisor should check `asOf` timestamps via `getQuotes` and proactively disclose if any relevant prices are stale. Example: "Note: VTI's price is 3 hours old. The following analysis uses that cached value."

---

## 11. Validation and Testing Plan

### 11.1 Design Acceptance Criteria

Each criterion maps to a Spec 13 MVP criterion:

| ID | Test | Pass Condition |
|----|------|---------------|
| D1 | Add instrument flow | User can search, select, and add an instrument in under 30 seconds. Instrument appears in holdings table with backfill toast. |
| D2 | Transaction with backdating | User can add a BUY for a past date. Dashboard updates. Validation error appears for impossible SELL. |
| D3 | Dashboard comprehension | Cold-open the dashboard with 5+ holdings. Can the user identify total value, day change, best performer, and worst performer within 10 seconds? |
| D4 | Staleness visibility | With one stale quote (> 2 hours), the user can identify which instrument is stale and when it was last updated within 5 seconds. |
| D5 | Lot detail accuracy | Lots table shows correct FIFO ordering, correct remaining quantities, correct per-lot PnL, matching the reference portfolio fixture (Spec 13.1). |
| D6 | Advisor first interaction | With no prior threads and 5+ holdings, the advisor panel shows suggested prompts. Clicking one produces a non-trivial analytical response. |
| D7 | Empty states | Every page renders correctly with zero data. No blank screens. No error states. Clear CTA on each page. |
| D8 | Data health footer | Footer shows instrument count, polling interval, API budget, and freshness summary. Values match `GET /api/market/status`. |
| D9 | Numeric formatting | All dollar values, percentages, and quantities are formatted consistently per Section 4.3. No floating-point artifacts visible anywhere. |
| D10 | Keyboard navigation | All interactive elements reachable via Tab. Modals trap focus. Escape dismisses overlays. |

### 11.2 PnL Cross-Validation (Spec 13.1)

Before design signoff, the reference portfolio (5+ instruments, 20+ transactions) must be loaded through the full UI, and every displayed value — lot cost basis, realized PnL, unrealized PnL, portfolio total — must match the expected outputs in `data/test/expected-outputs.json` to the cent. Any discrepancy blocks signoff.

---

## 12. Implementation Sequence

The following sequence aligns with the spec's phased approach and the product brief's prioritization.

### Phase 0: Foundation

1. Set up Tailwind config with full token system (Section 4.1).
2. Implement typography scale and numeric formatting utilities.
3. Build base components: buttons, inputs, tables, badges, tooltips, toasts, modals.
4. Build page shell: navigation tabs, footer, FAB.
5. Implement empty states for all pages.

### Phase 1: Core Pages

6. Dashboard: hero metric, area chart, summary cards, holdings table.
7. Holding Detail: position summary, candlestick chart, lots table, transaction history.
8. Transactions: transaction table, add/edit form with validation.
9. Staleness indicators and data health footer.

### Phase 2: Advisor

10. Write and test system prompt against five intent categories.
11. Build advisor panel: chat UI, tool call indicators, thread management.
12. Implement suggested prompts.

### Phase 3: Polish (Next Priority)

13. Bulk transaction paste input.
14. Charts page (dedicated chart viewer).
15. Responsive refinements for tablet/mobile.
16. Full accessibility audit and remediation.

---

## Appendix A: Bookworm Adaptation Notes

The following Bookworm design system elements are adopted directly, adapted, or excluded for STALKER:

| Element | Decision | Rationale |
|---------|----------|-----------|
| Surface hierarchy (3-tier) | Adopted | Same dark-theme elevation model works perfectly for financial data density. |
| Crimson Pro / DM Sans pairing | Adopted | Serif headings lend authority; DM Sans is excellent for tabular data. |
| Status color system | Adapted | Five states map to financial semantics (gain/loss/stale/active/neutral). |
| Accordion layout | Excluded | Financial dashboards need simultaneous visibility, not progressive accordion blocks. |
| Floating Action Button | Adopted | Advisor access point, identical pattern. |
| Slide-out panel | Adopted | Advisor chat panel, identical dimensions and behavior. |
| Chat bubble styling | Adopted | User/assistant message styling transfers directly. |
| Progress bar | Adopted | Used for API budget in data health footer. |
| Confirmation modal | Adopted | Used for delete actions on transactions and instruments. |
| Unsaved changes toast | Adapted | Toast pattern reused for success/error/warning notifications. |
| Dashboard accordion with phases | Excluded | No pipeline phases in a portfolio tracker. |
| Markdown rendering overrides | Deferred | May be needed if advisor responses include structured markdown. Adopt Bookworm's react-markdown overrides if so. |

---

## Appendix B: Open Questions for Engineering Review

1. **Tabular-nums support in DM Sans.** DM Sans supports tabular figures via OpenType, but Tailwind's `tabular-nums` utility must be verified against the Google Fonts build. If not supported, use explicit `font-feature-settings: 'tnum'` override or consider JetBrains Mono for numeric table columns.

2. **TradingView Lightweight Charts theming granularity.** The chart library supports custom colors for most elements, but tooltip styling may be limited. Verify whether tooltip background/border/font can be overridden to match the design system, or if a custom tooltip overlay is needed.

3. **Advisor panel vs. dedicated page.** The spec (9.5) and Bookworm pattern both point to a slide-out panel. However, if advisor conversations become long or if the user wants to reference portfolio data while chatting, a dedicated page with a side-by-side layout (chat left, dashboard right) may be more usable. This is a post-MVP consideration.

4. **Chart accessibility.** TradingView Lightweight Charts does not provide built-in screen reader support. The "View as table" alternative described in Section 8.1 needs a data table component that mirrors the chart's visible data range. Confirm this is feasible with the existing time series API.

5. **Decimal rendering edge case.** Prisma Decimal serialized as string in JSON (Spec 2.5). The UI layer must convert these strings to display format at render time. Confirm a utility function exists or will be built in `packages/shared` to handle formatting consistently.
