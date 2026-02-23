# SESSION-5-PLAN: UI Foundation

**Date:** 2026-02-22
**Session:** 5 of 9
**Epic:** 5 (full)
**Complexity:** Medium
**Mode:** PARALLEL (Lead + 2 teammates)
**Depends on:** Epic 0 (project structure), Session 4 (API layer — shapes only, not live data)
**Blocks:** Session 6 (Dashboard + Holdings), Session 7 (Detail + Transactions + Charts), Session 8 (Advisor UI)

---

## 1. Session Objective

Build the complete design system, component library, layout shell, numeric formatting utilities, and empty states that every UI session (6, 7, 8) depends on. This is the only session where the primary reference documents are the **UX/UI Design Plan** and **Bookworm Style Guide**, not the Spec. No API calls are made from components in this session — components are stateless, prop-driven, and tested in isolation.

**Success looks like:** A teammate starting Session 6 can import `<Table>`, `<Badge>`, `<PillToggle>`, call `formatCurrency("12345.67")`, and get pixel-perfect Bookworm-themed output without writing any CSS or formatting logic.

---

## 2. Pre-Session State

### What Exists (from Sessions 1–4)
- pnpm monorepo with `apps/web/` (Next.js App Router) and `packages/` (analytics, market-data, shared, scheduler)
- Prisma schema, all 6 tables migrated
- 275 passing tests across 24 files
- Full API layer: 18 endpoints with correct response shapes
- `packages/shared/` — TypeScript types, Decimal utils, ULID, constants
- `apps/web/src/lib/` — Zod validators, error factory, Prisma implementations
- Tailwind CSS installed (default config only — no custom tokens yet)

### What Does NOT Exist
- No custom Tailwind config (colors, typography, spacing)
- No Google Fonts setup
- No base UI components
- No page shell (navigation, footer, FAB)
- No numeric formatting utilities (Decimal string → display)
- No empty state components
- No responsive breakpoint configuration

### Session 4 Scope Cuts Affecting This Session
- **Historical backfill deferred** → `firstBarDate` is null for all instruments → empty states and "no data" warnings are critical path, not edge cases.
- **Symbol search is a stub** → the "Add Instrument" flow in empty states should link to a button/action that will work once Session 7 wires it.
- **On-read rebuild pattern** → no implications for Session 5 (components are stateless).

---

## 3. Teammate Assignments

### Teammate 1: `design-system-engineer`

**Scope:** Tailwind configuration, typography, color tokens, numeric formatting, responsive foundation.

**Filesystem scope:**
```
apps/web/tailwind.config.ts          — Full token system
apps/web/src/app/layout.tsx          — Google Fonts integration, base HTML
apps/web/src/app/globals.css         — Base styles, font-face, CSS variables
apps/web/src/lib/format.ts           — Numeric formatting utilities
apps/web/src/lib/format.test.ts      — Formatting tests
apps/web/src/lib/cn.ts               — className merge utility (clsx + twMerge)
```

**Deliverables:**

#### D1: Tailwind Config — Full Token System
Extend `tailwind.config.ts` with the STALKER design token system adapted from the Bookworm style guide:

**Colors (dark theme):**
| Token | Role | Value (approximate) |
|-------|------|---------------------|
| `bg-primary` | Page background | Near-black (e.g., `#0a0a0f`) |
| `bg-secondary` | Card/panel background | Dark gray (e.g., `#12121a`) |
| `bg-tertiary` | Elevated surface / hover | Medium-dark (e.g., `#1a1a25`) |
| `border-primary` | Default borders | Subtle (e.g., `#2a2a35`) |
| `text-primary` | Primary text | Off-white (e.g., `#e8e6e3`) |
| `text-secondary` | Secondary/muted text | Gray (e.g., `#8b8a88`) |
| `text-tertiary` | Disabled/hint text | Dark gray (e.g., `#5a5a5f`) |
| `accent-primary` | Primary actions, links | Brand color (e.g., warm gold `#c9a84c` or similar) |
| `accent-positive` | Gains, positive PnL | Green (e.g., `#22c55e`) |
| `accent-negative` | Losses, negative PnL | Red (e.g., `#ef4444`) |
| `accent-warning` | Staleness, warnings | Amber (e.g., `#f59e0b`) |
| `accent-info` | Informational badges | Blue (e.g., `#3b82f6`) |

> **Note:** Exact hex values should be derived from the Bookworm Style Guide. The above are directional — the design-system-engineer should map Bookworm tokens to financial domain semantics.

**Typography:**
| Token | Font | Usage |
|-------|------|-------|
| `font-heading` | Crimson Pro | Page headings, hero metrics |
| `font-body` | DM Sans | Body text, labels, navigation |
| `font-mono` | JetBrains Mono | Numeric tables, prices, quantities, PnL values |

**Font sizes:** Define a scale (xs through 4xl) using rem units. Financial dashboards are information-dense — lean toward smaller base sizes than typical web apps. `text-base` should be ~14px equivalent.

**Spacing:** Use the default Tailwind scale (4px base) but define semantic aliases:
- `space-card` — internal card padding
- `space-section` — gap between page sections
- `space-page` — page-level horizontal padding

**Responsive breakpoints:**
| Name | Width | Target |
|------|-------|--------|
| `sm` | 640px | — |
| `md` | 768px | Tablet |
| `lg` | 1024px | Small desktop |
| `xl` | 1280px | Primary desktop target |
| `2xl` | 1536px | Wide desktop |

> **Primary target:** `xl` (1280px). The user is on a Mac at desktop resolution. Design for `xl` first, responsive down.

#### D2: Google Fonts Integration
Configure Next.js font loading in `layout.tsx` using `next/font/google`:
- Crimson Pro: weights 400, 600, 700
- DM Sans: weights 400, 500, 600
- JetBrains Mono: weights 400, 500

Set CSS variables (`--font-heading`, `--font-body`, `--font-mono`) and map to Tailwind's `fontFamily` config.

**Critical check:** Verify DM Sans `font-variant-numeric: tabular-nums` works via Google Fonts. If it doesn't, numeric columns fall back to JetBrains Mono (Risk R-7 in master plan).

#### D3: Numeric Formatting Utilities
Create `apps/web/src/lib/format.ts` with functions that take **Decimal string inputs** (matching API response format) and return display strings:

```typescript
// All inputs are string (from API Decimal serialization)
formatCurrency(value: string, opts?: { decimals?: number; showSign?: boolean }): string
// "$12,345.67", "+$1,234.56", "-$567.89"

formatPercent(value: string, opts?: { decimals?: number; showSign?: boolean }): string
// "12.34%", "+5.67%", "-2.10%"

formatQuantity(value: string, opts?: { decimals?: number }): string
// "1,234", "0.5000" (preserves fractional share precision)

formatCompact(value: string): string
// "$1.2M", "$456K", "$789" (for hero metrics)

formatDate(isoString: string): string
// "Feb 18, 2026"

formatDateTime(isoString: string): string
// "Feb 18, 2026 4:00 PM"

formatRelativeTime(isoString: string): string
// "5 min ago", "2 hours ago", "Yesterday"
```

**Rules:**
- Never call `parseFloat()` or `Number()` on inputs. Use `Decimal.js` for any intermediate math (e.g., computing sign for `showSign`), then format the result.
- Thousands separator: comma.
- Currency symbol: `$` prefix (hardcoded for MVP, single-currency).
- Negative values: `-$1,234.56` (minus before dollar sign).
- Zero: `$0.00`, `0.00%` — never display as `-$0.00` or `-0.00%`.

#### D4: className Merge Utility
Create `cn()` utility combining `clsx` and `tailwind-merge` for conditional class composition. Install both as dependencies.

**Tests for D3:** Minimum 20 tests covering:
- Positive, negative, zero for each format function
- Large values (millions)
- Small fractional values (0.0001 shares)
- Sign display toggle
- Edge case: empty string input, "NaN" input → graceful fallback ("—")

---

### Teammate 2: `component-engineer`

**Scope:** Base UI components, page shell, empty states.

**Filesystem scope:**
```
apps/web/src/components/ui/          — All base components
apps/web/src/components/layout/      — Shell, navigation, footer, FAB
apps/web/src/components/empty-states/ — Per-page empty states
apps/web/src/app/(pages)/            — Page route stubs with empty states
apps/web/src/app/(pages)/layout.tsx  — Page shell wrapper
```

**Deliverables:**

#### D5: Base UI Components
All components are client-side React, accept props, use Tailwind tokens from Teammate 1's config. Each component gets its own file. Use `cn()` for class merging.

| Component | Key Props | Notes |
|-----------|-----------|-------|
| `Button` | `variant` (primary, secondary, ghost, danger), `size` (sm, md, lg), `loading`, `disabled` | Primary uses `accent-primary`. Danger uses `accent-negative`. |
| `Input` | `label`, `error`, `hint`, `type` | Includes label, error message display. Dark theme input styling. |
| `Select` | `label`, `options`, `error`, `placeholder` | Styled dropdown. Dark theme. |
| `Table` | `columns`, `data`, `sortable`, `onSort`, `emptyMessage` | `font-mono` on numeric columns (detected via column config). Right-align numbers. |
| `Badge` | `variant` (positive, negative, warning, info, neutral), `size` | Color maps to gain/loss/stale/info semantic tokens. |
| `Tooltip` | `content`, `side`, `children` | CSS-only or lightweight. No heavy tooltip library. |
| `Toast` | `variant` (success, error, info), `message`, `duration` | Global toast container. Auto-dismiss. |
| `Modal` | `open`, `onClose`, `title`, `children`, `size` | Backdrop click to close. Escape key. Focus trap. |
| `PillToggle` | `options`, `value`, `onChange` | Used for window selector (1D/1W/1M/3M/1Y/ALL). Compact, inline. |
| `Card` | `title`, `children`, `className` | `bg-secondary` with `border-primary`. Standard card wrapper. |
| `Skeleton` | `width`, `height`, `variant` | Loading placeholder. Pulse animation. Matches dark theme. |
| `ValueChange` | `value`, `previousValue`, `format` | Renders value with green/red coloring and up/down arrow based on sign. Used for PnL display. |

**Interaction requirements:**
- All interactive components must be keyboard accessible (Tab, Enter, Escape).
- Focus states use `accent-primary` ring.
- Disabled states use `text-tertiary` + `cursor-not-allowed`.
- All components use `font-body` by default. Numeric display components use `font-mono`.

#### D6: Page Shell
The layout wrapper that every page renders inside:

**Navigation tab bar (top):**
- Tabs: Dashboard, Holdings, Transactions, Charts
- Active tab: `accent-primary` underline + `text-primary`
- Inactive tab: `text-secondary`, hover → `text-primary`
- Fixed position, dark background
- `font-body`, medium weight

**Data Health Footer (bottom):**
- Fixed to bottom of viewport
- Three segments: instrument count + polling status | API budget | freshness
- All `text-secondary`, compact (12–14px)
- Amber highlight on stale instruments
- Wired to `GET /api/market/status` — but in this session, render a **static placeholder** with realistic mock data. Session 6 wires it live.

**Advisor FAB (floating action button):**
- Bottom-right corner, above footer
- Chat bubble icon
- `accent-primary` background
- Tooltip: "Ask the Advisor"
- Click handler: no-op in this session (Session 8 wires it)
- Subtle pulse animation on first visit (CSS only)

#### D7: Empty States
One component per page, matching Spec 9.6 exactly:

| Page | Component | Content |
|------|-----------|---------|
| Dashboard | `DashboardEmpty` | "Add your first holding to start tracking your portfolio." + prominent "Add Instrument" button |
| Holdings | `HoldingsEmpty` | Same as dashboard (shared CTA) |
| Transactions | `TransactionsEmpty` | "No transactions yet. Add an instrument first, then record your trades." |
| Advisor | `AdvisorEmpty` | Two states: (a) no holdings → "Add some holdings first so the advisor has something to work with." (b) has holdings, no thread → "Ask me anything about your portfolio." + 3 suggested prompt buttons |
| Holding Detail | N/A | Redirect to dashboard (handled in Session 7 route) |

**Design constraints from Spec 9.6:**
- No blank screens. No loading spinners on empty data.
- Meaningful message + clear next action.
- "Add Instrument" button in empty states uses `Button variant="primary"`.
- Empty states use centered layout, generous whitespace, `text-secondary` for messaging.

#### D8: Page Route Stubs
Create Next.js App Router page files that render the shell + empty state:

```
apps/web/src/app/(pages)/layout.tsx        — Shell (nav + footer + FAB)
apps/web/src/app/(pages)/page.tsx          — Dashboard (renders DashboardEmpty)
apps/web/src/app/(pages)/holdings/page.tsx — Holdings (renders HoldingsEmpty)
apps/web/src/app/(pages)/transactions/page.tsx — Transactions (renders TransactionsEmpty)
apps/web/src/app/(pages)/charts/page.tsx   — Charts (placeholder)
```

Each page is a server component that renders the empty state. Session 6+ replaces empty states with live data.

---

## 4. Lead Responsibilities

### Pre-Teammate Setup
1. Verify 275 baseline tests pass (`pnpm test`)
2. Verify `tsc --noEmit` clean
3. Install UI dependencies:
   - `clsx`, `tailwind-merge` (for `cn()`)
   - `decimal.js` in `apps/web` (for formatting utils — may already be available via workspace)
4. Verify `next/font/google` is available (should be with Next.js 14+)
5. Create directory structure:
   ```
   apps/web/src/components/ui/
   apps/web/src/components/layout/
   apps/web/src/components/empty-states/
   apps/web/src/app/(pages)/
   ```
6. Verify Tailwind CSS processes correctly with a basic smoke test

### Post-Teammate Verification
1. **Visual smoke test:** `pnpm dev` → navigate to each page stub → verify:
   - Dark theme renders (no white flash, no unstyled content)
   - Fonts load (Crimson Pro headings, DM Sans body, JetBrains Mono in any numeric preview)
   - Navigation tabs render and are clickable
   - Empty states display with correct messaging
   - Footer renders (static mock data)
   - FAB renders in bottom-right
2. **Tabular nums check:** Render a column of numbers (1,111.11 / 2,222.22 / etc.) and verify digits align vertically. If DM Sans doesn't support it, document the fallback to JetBrains Mono.
3. **Format utility spot check:** Run the format test suite, then manually verify a few edge cases in browser console.
4. **Responsive check:** Resize browser to `md` (768px) — layout shouldn't break (doesn't need to be optimized, just not broken).
5. Run `tsc --noEmit` — zero errors.
6. Run `pnpm test` — all 275 + new tests pass.
7. Update documentation (CLAUDE.md, HANDOFF.md, AGENTS.md).

---

## 5. Exit Criteria

### Must Pass (Blocking) — 14 items

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Tailwind config has full color token system (bg, text, accent, border) | Inspect `tailwind.config.ts` |
| 2 | Three Google Fonts loaded (Crimson Pro, DM Sans, JetBrains Mono) | Visual check in DevTools → Network → Fonts |
| 3 | Font CSS variables set and mapped to Tailwind `fontFamily` | `font-heading`, `font-body`, `font-mono` classes work |
| 4 | `formatCurrency()` handles positive, negative, zero, large values | Test suite |
| 5 | `formatPercent()` handles positive, negative, zero with sign toggle | Test suite |
| 6 | `formatQuantity()` preserves fractional precision | Test suite |
| 7 | All 10+ base components render without errors | Import and render in a test or page |
| 8 | Table component right-aligns numeric columns and uses `font-mono` | Visual check |
| 9 | PillToggle renders with selectable options | Visual check |
| 10 | Page shell renders: nav tabs (4), footer (placeholder), FAB | Visual check at `xl` breakpoint |
| 11 | Empty states render for Dashboard, Holdings, Transactions, Advisor | Navigate to each page stub |
| 12 | "Add Instrument" CTA visible on empty Dashboard and Holdings pages | Visual check |
| 13 | `tsc --noEmit` — zero errors | CI gate |
| 14 | `pnpm test` — all existing 275 + new tests pass, zero regressions | CI gate |

### Test Targets (Blocking)

| Target | Minimum |
|--------|---------|
| New tests (formatting utils) | 20+ |
| Total tests (cumulative) | 295+ |
| Regressions | 0 |

### Should Pass — 6 items

| # | Criterion | Notes |
|---|-----------|-------|
| 1 | DM Sans tabular-nums verified or JetBrains Mono fallback documented | Risk R-7 mitigation |
| 2 | `formatCompact()` produces human-readable abbreviations ($1.2M, $456K) | Test suite |
| 3 | `formatRelativeTime()` handles minutes, hours, days | Test suite |
| 4 | Modal has focus trap and Escape-to-close | Manual keyboard test |
| 5 | Toast auto-dismisses after configured duration | Manual test |
| 6 | Advisor FAB has pulse animation on first render | Visual check |

---

## 6. Checklist Application

Per master plan Section 5, Session 5 applies: **Frontend: General, Component Quality, UI/UX, Performance**

### Frontend: General
- [ ] TypeScript strict mode — no `any` types in component props
- [ ] All components have explicit prop interfaces (not inline)
- [ ] No hardcoded colors — all from Tailwind token system
- [ ] No hardcoded font sizes — all from Tailwind scale
- [ ] No `style={{}}` inline styles (Tailwind utilities only)

### Frontend: Component Quality
- [ ] Every component is in its own file
- [ ] Props have sensible defaults
- [ ] Components are composable (accept `className` prop for extension)
- [ ] No business logic in components (formatting logic lives in `format.ts`)
- [ ] Components handle edge cases: undefined/null props, empty arrays

### Frontend: UI/UX
- [ ] Dark theme: no white flashes, no unstyled content on load
- [ ] Sufficient contrast ratios (WCAG AA) between text and backgrounds
- [ ] Focus indicators visible on all interactive elements
- [ ] Consistent spacing (uses semantic space tokens, not arbitrary values)
- [ ] Numeric columns right-aligned with monospace font

### Frontend: Performance
- [ ] No unnecessary client-side JS (page stubs are server components where possible)
- [ ] Google Fonts loaded with `display: swap` (via next/font)
- [ ] No heavy dependencies (tooltip = CSS-only or lightweight, no Radix/Headless for MVP)
- [ ] Tailwind CSS purge configured (default in Next.js — verify not disabled)

---

## 7. Risk Mitigations

| Risk | Mitigation |
|------|------------|
| R-7: DM Sans tabular-nums not working | Test in Session 5. Fallback: JetBrains Mono for all numeric columns. Document decision. |
| Bookworm style guide color conflicts with financial semantics | Financial semantics (green=gain, red=loss) take priority. Bookworm provides the structural theme. |
| Component API incompatible with Session 6 needs | Components are prop-driven and accept `className`. Session 6 can extend, not rewrite. |
| Tailwind config too restrictive | Use `extend` (not `override`) so default Tailwind utilities remain available as escape hatch. |

---

## 8. Dependency Notes for Downstream Sessions

### Session 6 (Dashboard + Holdings) Will Need:
- `Table` component with sort support → column `sortable` config
- `PillToggle` for window selector → options as `{label, value}[]`
- `Badge` for staleness indicators → `variant="warning"`
- `Card` for summary metrics → accepts heading + child content
- `ValueChange` for PnL display → auto-colors based on sign
- `formatCurrency`, `formatPercent`, `formatQuantity` for all displayed numbers
- Data Health Footer wired to live `/api/market/status` (replace placeholder)
- Page shell already wrapping all pages

### Session 7 (Detail + Transactions + Charts) Will Need:
- `Input`, `Select` for transaction form
- `Modal` for confirmations and add-instrument flow
- `Toast` for success/error feedback
- `Table` reused for lots table, transaction table
- `Button` variants for form actions (submit, cancel, delete)

### Session 8 (Advisor) Will Need:
- `Modal` or slide-out panel pattern
- `Button` for suggested prompts
- `Skeleton` for "thinking" state
- `Badge` for tool call indicators
- Advisor FAB wired to panel toggle

---

## 9. Files Changed (Expected)

### New Files
```
apps/web/tailwind.config.ts                          — [Modified] Full token system
apps/web/src/app/globals.css                         — [Modified] Base styles, CSS vars
apps/web/src/app/layout.tsx                          — [Modified] Font loading
apps/web/src/lib/format.ts                           — NEW
apps/web/src/lib/format.test.ts                      — NEW
apps/web/src/lib/cn.ts                               — NEW
apps/web/src/components/ui/Button.tsx                 — NEW
apps/web/src/components/ui/Input.tsx                  — NEW
apps/web/src/components/ui/Select.tsx                 — NEW
apps/web/src/components/ui/Table.tsx                  — NEW
apps/web/src/components/ui/Badge.tsx                  — NEW
apps/web/src/components/ui/Tooltip.tsx                — NEW
apps/web/src/components/ui/Toast.tsx                  — NEW
apps/web/src/components/ui/Modal.tsx                  — NEW
apps/web/src/components/ui/PillToggle.tsx             — NEW
apps/web/src/components/ui/Card.tsx                   — NEW
apps/web/src/components/ui/Skeleton.tsx               — NEW
apps/web/src/components/ui/ValueChange.tsx            — NEW
apps/web/src/components/layout/Shell.tsx              — NEW
apps/web/src/components/layout/NavTabs.tsx            — NEW
apps/web/src/components/layout/DataHealthFooter.tsx   — NEW
apps/web/src/components/layout/AdvisorFAB.tsx         — NEW
apps/web/src/components/empty-states/DashboardEmpty.tsx    — NEW
apps/web/src/components/empty-states/HoldingsEmpty.tsx     — NEW
apps/web/src/components/empty-states/TransactionsEmpty.tsx — NEW
apps/web/src/components/empty-states/AdvisorEmpty.tsx      — NEW
apps/web/src/app/(pages)/layout.tsx                  — NEW
apps/web/src/app/(pages)/page.tsx                    — NEW
apps/web/src/app/(pages)/holdings/page.tsx           — NEW
apps/web/src/app/(pages)/transactions/page.tsx       — NEW
apps/web/src/app/(pages)/charts/page.tsx             — NEW
```

### Modified Files
```
apps/web/package.json                — Add clsx, tailwind-merge
CLAUDE.md                            — Session 5 component catalog, formatting API
HANDOFF.md                           — Post-Session 5 state
AGENTS.md                            — Updated test count
```

---

## 10. Anti-Patterns to Avoid

1. **Don't import from `packages/analytics` or `packages/market-data` in any UI component.** Components in this session are purely presentational. Data flows through props.
2. **Don't use `fetch()` in any component.** No API calls this session. Data fetching happens in Session 6+ page components.
3. **Don't install Radix UI, Headless UI, or other component libraries.** Build from Tailwind primitives. The component surface is small enough that library overhead isn't justified.
4. **Don't create a "theme provider" or React context for design tokens.** Tailwind CSS variables handle this. No runtime theme switching needed.
5. **Don't over-engineer the Table component.** It needs to render rows with sorting. Virtualization, pagination, and column resizing are not needed (portfolio has <100 rows).
