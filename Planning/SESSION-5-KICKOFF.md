# SESSION-5-KICKOFF: UI Foundation

**Read SESSION-5-PLAN.md first.** This document is the execution checklist.

---

## Quick Context

You're building the design system and component library that Sessions 6–8 depend on. **No API calls. No data fetching. No business logic.** Everything is stateless, prop-driven, and styled with Tailwind tokens.

**Baseline:** 275 tests passing, `tsc --noEmit` clean. Verify before starting.

---

## Lead: Pre-Teammate Setup

```bash
# 1. Verify baseline
pnpm test              # 275 tests, 0 failures
pnpm tsc --noEmit      # 0 errors

# 2. Install UI deps
cd apps/web
pnpm add clsx tailwind-merge

# 3. Create directory structure
mkdir -p src/components/ui
mkdir -p src/components/layout
mkdir -p src/components/empty-states
mkdir -p src/app/\(pages\)/holdings
mkdir -p src/app/\(pages\)/transactions
mkdir -p src/app/\(pages\)/charts

# 4. Verify Tailwind + Next.js dev server starts
pnpm dev  # Confirm no build errors
```

**Then launch both teammates in parallel.**

---

## Teammate 1: `design-system-engineer`

### Your files (nobody else touches these):
```
apps/web/tailwind.config.ts       — Extend with full token system
apps/web/src/app/layout.tsx       — Google Fonts via next/font
apps/web/src/app/globals.css      — CSS variables, base styles
apps/web/src/lib/format.ts        — Numeric formatting utilities
apps/web/src/lib/format.test.ts   — 20+ tests
apps/web/src/lib/cn.ts            — clsx + tailwind-merge utility
```

### Task sequence:

**Step 1: Tailwind config**
Extend (not override) `tailwind.config.ts`:

Colors — dark financial theme (Bookworm-adapted):
- Backgrounds: `bg-primary` (near-black), `bg-secondary` (dark card), `bg-tertiary` (hover/elevated)
- Text: `text-primary` (off-white), `text-secondary` (gray), `text-tertiary` (disabled)
- Borders: `border-primary` (subtle dark line)
- Accents: `accent-primary` (brand/gold), `accent-positive` (green), `accent-negative` (red), `accent-warning` (amber), `accent-info` (blue)

Typography:
- `font-heading`: Crimson Pro
- `font-body`: DM Sans
- `font-mono`: JetBrains Mono
- Font size scale: xs through 4xl, base ~14px (information-dense dashboard)

Spacing semantic aliases: `space-card`, `space-section`, `space-page`

**Step 2: Google Fonts**
In `layout.tsx`, use `next/font/google` to load:
- Crimson Pro (400, 600, 700)
- DM Sans (400, 500, 600)
- JetBrains Mono (400, 500)

Set CSS variables: `--font-heading`, `--font-body`, `--font-mono`. Map in Tailwind config.

**⚠️ CRITICAL CHECK:** After fonts load, render numbers in DM Sans and verify `font-variant-numeric: tabular-nums` works. If digits don't align vertically, document this and note that numeric columns will use JetBrains Mono instead.

**Step 3: `cn()` utility**
```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
```

**Step 4: Numeric formatting (`format.ts`)**

All functions accept **string** inputs (Decimal serialization from API). Never use `parseFloat()` or `Number()` for intermediate math — use `Decimal.js`.

Functions to implement:
| Function | Example Output |
|----------|---------------|
| `formatCurrency("12345.67")` | `$12,345.67` |
| `formatCurrency("-567.89", { showSign: true })` | `-$567.89` |
| `formatPercent("5.678", { showSign: true })` | `+5.68%` |
| `formatQuantity("1234")` | `1,234` |
| `formatQuantity("0.5000")` | `0.5000` |
| `formatCompact("1234567.89")` | `$1.2M` |
| `formatDate("2026-02-18T16:00:00Z")` | `Feb 18, 2026` |
| `formatRelativeTime(recentIso)` | `5 min ago` |

**Rules:**
- Negative: `-$1,234.56` (minus before $)
- Zero: `$0.00` and `0.00%` — never `-$0.00`
- Invalid input (empty string, "NaN"): return `"—"` (em dash)
- Thousands separator: comma
- Currency: `$` prefix (hardcoded for MVP)

**Step 5: Tests (20+ minimum)**
Cover every function with positive, negative, zero, large, fractional, and invalid inputs.

---

## Teammate 2: `component-engineer`

### Your files (nobody else touches these):
```
apps/web/src/components/ui/         — All base components
apps/web/src/components/layout/     — Shell, NavTabs, Footer, FAB
apps/web/src/components/empty-states/ — Per-page empty states
apps/web/src/app/(pages)/           — Page route stubs
```

### Task sequence:

**Step 1: Base components** (`src/components/ui/`)

Build each in its own file. Import `cn` from `@/lib/cn`. Use Tailwind token classes from the config (you can reference token names before Teammate 1 finishes — they'll resolve at build time).

**Must-build (10 components):**

1. **`Button.tsx`** — `variant`: primary | secondary | ghost | danger. `size`: sm | md | lg. `loading` shows spinner. `disabled` grays out.
2. **`Input.tsx`** — `label`, `error` (red text below), `hint`, standard HTML input props. Dark background, light border, focus ring.
3. **`Select.tsx`** — `label`, `options: {label, value}[]`, `error`, `placeholder`. Native select styled for dark theme.
4. **`Table.tsx`** — `columns: {key, label, align?, sortable?, numeric?}[]`, `data: Record[]`, `onSort`, `emptyMessage`. Right-align + `font-mono` on `numeric` columns.
5. **`Badge.tsx`** — `variant`: positive | negative | warning | info | neutral. `size`: sm | md. Pill-shaped.
6. **`Tooltip.tsx`** — CSS-only or very lightweight. `content`, `side`, wraps `children`.
7. **`Toast.tsx`** — Global toast container + `useToast()` hook or simple event bus. `variant`: success | error | info. Auto-dismiss.
8. **`Modal.tsx`** — `open`, `onClose`, `title`, `children`. Backdrop + Escape key + focus trap. Transition animation.
9. **`PillToggle.tsx`** — `options: {label, value}[]`, `value`, `onChange`. Horizontal pill selector. Active pill highlighted with `accent-primary`.
10. **`Card.tsx`** — `title?`, `children`, `className`. `bg-secondary` + `border-primary` + `rounded-lg`.

**Bonus (if time allows):**
11. **`Skeleton.tsx`** — Loading placeholder. Pulse animation. Configurable width/height.
12. **`ValueChange.tsx`** — Shows a numeric value colored green (positive) or red (negative) with ▲/▼ arrow.

**Component rules:**
- Every component accepts `className` prop for extension
- Explicit TypeScript prop interfaces (not inline)
- No `any` types
- No `style={{}}` — Tailwind only
- No data fetching, no API imports
- Keyboard accessible: Tab, Enter, Escape where relevant
- Focus ring: `ring-2 ring-accent-primary` (or similar)

**Step 2: Page shell** (`src/components/layout/`)

**`NavTabs.tsx`:**
- Four tabs: Dashboard (`/`), Holdings (`/holdings`), Transactions (`/transactions`), Charts (`/charts`)
- Use Next.js `Link` + `usePathname()` for active state
- Active: `accent-primary` underline + `text-primary`
- Inactive: `text-secondary` → hover `text-primary`
- `font-body`, medium weight

**`DataHealthFooter.tsx`:**
- Fixed bottom bar
- Three segments separated by `|` or `·`:
  - "15 instruments · Polling every 30 min" (mock)
  - "183 / 250 daily calls" (mock)
  - "All quotes updated within 35 min" (mock)
- All `text-tertiary`, font-size small
- **Static mock data this session.** Add a `// TODO: Wire to GET /api/market/status in Session 6` comment.

**`AdvisorFAB.tsx`:**
- Fixed position, bottom-right, above footer
- Circular button, `accent-primary` background
- Chat bubble icon (use a simple SVG inline — no icon library needed)
- `onClick`: no-op (`// TODO: Wire to advisor panel in Session 8`)
- Subtle pulse animation on mount (CSS `@keyframes`)

**`Shell.tsx`:**
- Wraps `NavTabs` (top) + `{children}` (main content area) + `DataHealthFooter` (bottom) + `AdvisorFAB`
- Main content has proper padding and min-height to not overlap fixed elements

**Step 3: Empty states** (`src/components/empty-states/`)

| Component | Content | CTA |
|-----------|---------|-----|
| `DashboardEmpty.tsx` | "Add your first holding to start tracking your portfolio." | `<Button variant="primary">Add Instrument</Button>` (onClick: no-op, wired in Session 7) |
| `HoldingsEmpty.tsx` | Same as Dashboard | Same button |
| `TransactionsEmpty.tsx` | "No transactions yet. Add an instrument first, then record your trades." | No button (user goes to Holdings first) |
| `AdvisorEmpty.tsx` | Prop: `hasHoldings`. If false: "Add some holdings first so the advisor has something to work with." If true: "Ask me anything about your portfolio." + 3 suggested prompt `Button variant="ghost"`: "Which positions are dragging my portfolio down?", "What would my realized gain be if I sold my oldest lots?", "Am I overexposed to any single holding?" |

All empty states: centered, generous vertical whitespace, `text-secondary` text, no loading spinners, no chart skeletons.

**Step 4: Page route stubs** (`src/app/(pages)/`)

**`(pages)/layout.tsx`:**
```tsx
import { Shell } from "@/components/layout/Shell";
export default function PagesLayout({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>;
}
```

**`(pages)/page.tsx`:** (Dashboard)
```tsx
import { DashboardEmpty } from "@/components/empty-states/DashboardEmpty";
export default function DashboardPage() {
  return <DashboardEmpty />;
}
```

Same pattern for `/holdings/page.tsx`, `/transactions/page.tsx`, `/charts/page.tsx`.

Charts page: simple "Charts coming soon" or a minimal placeholder. Not an empty state per spec — charts don't have a defined empty state.

---

## Lead: Post-Teammate Verification

### Run gates:
```bash
pnpm tsc --noEmit      # 0 errors
pnpm test              # 295+ tests, 0 failures (275 existing + 20+ new)
```

### Visual verification (pnpm dev):
- [ ] Navigate to `/` — dark theme, no white flash, DashboardEmpty renders
- [ ] Navigate to `/holdings` — HoldingsEmpty renders
- [ ] Navigate to `/transactions` — TransactionsEmpty renders
- [ ] Navigate to `/charts` — placeholder renders
- [ ] Nav tabs highlight correct active page on each navigation
- [ ] Footer shows mock data health info at bottom
- [ ] FAB visible bottom-right with pulse animation
- [ ] Fonts: Crimson Pro visible in headings, DM Sans in body text, JetBrains Mono in any numeric preview
- [ ] Resize to 768px width — layout doesn't break (no horizontal overflow)

### Tabular nums check:
Render a test column of numbers. Verify digits align. Document outcome for Risk R-7.

### Update docs:
- **CLAUDE.md:** Add component catalog (list all components, their import paths, key props). Add formatting utility API reference. Add note about font verification result.
- **HANDOFF.md:** Rewrite for post-Session 5 state. List all available components and their usage patterns for Session 6 engineers.
- **AGENTS.md:** Update test count.

---

## Exit Criteria Quick Reference

### Blocking (all must pass):
- [ ] Tailwind config: full color tokens, typography, spacing
- [ ] 3 Google Fonts loading correctly
- [ ] Font CSS variables mapped to Tailwind fontFamily
- [ ] `formatCurrency()` — positive, negative, zero, large values
- [ ] `formatPercent()` — positive, negative, zero with sign toggle
- [ ] `formatQuantity()` — preserves fractional precision
- [ ] 10+ base UI components render without errors
- [ ] Table: right-aligned numeric columns in `font-mono`
- [ ] PillToggle: selectable options with active state
- [ ] Page shell: nav tabs (4) + footer (placeholder) + FAB
- [ ] Empty states: Dashboard, Holdings, Transactions, Advisor
- [ ] "Add Instrument" CTA on empty Dashboard + Holdings
- [ ] `tsc --noEmit` — 0 errors
- [ ] `pnpm test` — 295+ tests, 0 regressions

### Targets:
- New tests: 20+
- Total tests: 295+
- Regressions: 0
