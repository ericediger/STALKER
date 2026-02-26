# MASTER-PLAN-UPDATE-S16-S17.md — Changes to Apply

When updating STALKER_MASTER-PLAN.md to v6.0, apply these changes:

## Session Status Tracker — Add Rows

| # | Session | Scope | Team Shape | Status |
|---|---------|-------|------------|--------|
| 16 | UX consolidation: 5 tabs → 3 tabs, paginated portfolio table, chart markers, delete instrument, purchase dates | Lead + 1 parallel | ✅ Complete (pending report) |
| 17 | Transaction CRUD on Holding Detail, advisor getTopHoldings, holiday calendar, visual UAT fixes | Solo | 🟡 Planned |

## Dependency Chain — Update

```
Session 15 (Quote Pipeline Unblock + Scale UX) ✅
    └──→ Session 16 (UX Consolidation — 5→3 tabs, unified Portfolio table) ✅
              └──→ Session 17 (Production Hardening — Transaction UX, Advisor Tuning) ← NEXT
                        └──→ Production use with real money tracking
```

## Architecture Decisions — Add

### Session 16 (Apply after reading S16 report)

| ID | Session | Decision | Rationale |
|----|---------|----------|-----------|
| AD-S16-1 | S16 | Navigation consolidated to 2 tabs + settings icon | 83-instrument scale made Holdings and Transactions tabs redundant with Dashboard. |
| AD-S16-2 | S16 | Dashboard becomes unified Portfolio page | Replaces S15's top-20 truncation (AD-S15-2) with full paginated table. |
| AD-S16-3 | S16 | `firstBuyDate` derived via MIN(tradeAt) WHERE type='BUY' | API returns ISO date; client formats as MMM 'YY. Keeps API semantics clean. |
| AD-S16-4 | S16 | `parseFloat()` exception in chart-marker-utils.ts | TradingView requires native numbers. Same justification as chart-utils.ts. |

### Session 17 (Proposed)

| ID | Session | Decision | Rationale |
|----|---------|----------|-----------|
| AD-S17-1 | S17 | Transaction CRUD moves to Holding Detail | Transactions page deleted in S16. Holding Detail is the natural per-instrument transaction surface. |
| AD-S17-2 | S17 | `getTopHoldings` advisor tool | 83 instruments in a single tool response wastes context window. Targeted queries improve response quality. |
| AD-S17-3 | S17 | Portfolio summary block in advisor snapshot | High-level facts without processing 83 rows. Reduces hallucination on aggregate questions. |
| AD-S17-4 | S17 | Static NYSE holiday list (if implemented) | Simplest correct implementation. ~10 holidays/year. Annual update is acceptable. |

## Navigation Architecture — Update

### Pre-S16 (5 tabs)
```
Dashboard │ Holdings │ Transactions │ Charts │ [⚙]
```

### Post-S16 (2 tabs + settings)
```
Portfolio │ Charts │ [⚙]
```

### Route Map (Post-S16)

| Tab/Route | Purpose | Notes |
|-----------|---------|-------|
| `/` (Portfolio) | Hero metric, chart, summary cards, full paginated holdings table, bulk paste | Unified view — was Dashboard + Holdings |
| `/holdings/[symbol]` | Holding Detail: candlestick chart, lots, transactions, Add/Edit/Delete txn (S17) | Per-instrument deep dive |
| `/charts` | Single-instrument chart viewer with symbol selector, transaction markers | Standalone chart exploration |
| `/holdings` | Redirect → `/` | S16 legacy redirect |
| `/transactions` | Redirect → `/` | S16 legacy redirect |
| Settings (⚙) | Modal/overlay — API keys, provider status | Not a route |
| Advisor (💬 FAB) | Slide-out panel — LLM chat | Not a route |

## Provider Architecture — No Changes from S15

Provider chain remains:
```
Symbol Search:    FMP only
Real-time Quotes: Tiingo IEX (batch) → FMP (single) → AV (single) → cache
Historical Bars:  Tiingo only
```

## Advisor Architecture — Update (S17)

### Tool Surface (Post-S17)

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `getPortfolioSnapshot` | Full portfolio with all holdings | Specific instrument queries, full detail needed |
| `getTopHoldings` (NEW) | Top N holdings by allocation/value/pnl | Overview questions, concentration, general queries |
| `getHolding` | Single instrument detail | Per-instrument questions |
| `getTransactions` | Transaction history | Tax, trade history questions |
| `getQuotes` | Current/cached prices | Price checks, staleness questions |

## Risks — Add

| ID | Risk | Severity | Impact | Mitigation |
|----|------|----------|--------|------------|
| R-S17-1 | Transaction form components deleted with Transactions page | Medium | Medium | Check git history. Rebuild from S7 patterns if needed (~20 min). |

## Lessons — Add (post-session)

| ID | Lesson |
|----|--------|
| L-12 | When deleting a page, audit all capabilities it hosted. The S16 Transactions page deletion orphaned the Add/Edit transaction flow — a production blocker discovered in planning. |
| L-13 | Advisor tools should scale with portfolio size. A single "get everything" tool works for 15 instruments but wastes context at 83. Granular tools (getTop, getHolding) are better. |

## Metrics — Update (Post-S17 Expected)

| Metric | S15 Value | S16 Expected | S17 Expected |
|--------|-----------|--------------|--------------|
| Test count | 631 | ~655 | ~670 |
| Test files | 54 | ~56 | ~58 |
| TypeScript errors | 0 | 0 | 0 |
| UI pages | 6 | 4 (+ 2 redirects) | 4 (+ 2 redirects) |
| Nav tabs | 5 | 2 + settings | 2 + settings |
| Advisor tools | 4 | 4 | 5 |
| Known limitations | 6 (KL-1 through KL-6) | 6 | 5 (if holiday calendar ships) |
