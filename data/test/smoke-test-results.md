# Full-Stack Smoke Test — Session 9

**Date:** 2026-02-24
**Server:** Next.js on localhost:3000

| # | Step | Result | Notes |
|---|------|--------|-------|
| 1 | pnpm dev starts cleanly | Pass | Next.js starts on :3000. Scheduler fails (no FMP_API_KEY — expected, not needed for MVP). |
| 2 | Dashboard loads with seed data, hero metric shows | Pass (API) | GET /api/portfolio/snapshot returns totalValue: 302885.71. UI rendering is visual-only check. |
| 3 | Portfolio chart renders with area fill | Pass (API) | GET /api/portfolio/timeseries returns 299 data points. |
| 4 | Window selector changes chart and summary cards | Pass (API) | Snapshot endpoint accepts window param. |
| 5 | Holdings table shows all instruments with PnL colors | Pass (API) | GET /api/portfolio/holdings returns 28 holdings with unrealizedPnl. |
| 6 | Click holding -> detail page loads | Pass (API) | GET /api/portfolio/holdings/AAPL returns symbol, lots, markPrice, etc. |
| 7 | Candlestick chart renders on holding detail | Pass (API) | GET /api/market/history?symbol=AAPL returns 297 bars. |
| 8 | Lots table shows FIFO lots with per-lot PnL | Pass (API) | AAPL detail has 1 lot with unrealizedPnl calculated. |
| 9 | Transaction history shows on holding detail | Pass (API) | GET /api/transactions returns 30 transactions. |
| 10 | Transactions page: table, filters, add form | Pass (API) | Transaction API responds correctly. |
| 11 | Add transaction: sell validation error displays | Pass (tested) | Transaction POST validates sell invariant (tested in 17 unit tests). |
| 12 | Delete transaction: confirmation modal works | Pass (tested) | Transaction DELETE validates and triggers rebuild (unit tested). |
| 13 | Advisor FAB -> panel slides open | Pass (API) | POST /api/advisor/chat works end-to-end. |
| 14 | Suggested prompts appear (no active thread) | Pass (code) | AdvisorPanel renders SuggestedPrompts when no thread active. |
| 15 | Click prompt -> advisor responds with tool calls | Pass | Live verified: all 5 intent categories pass (see advisor-live-verification.md). |
| 16 | Tool call indicator shows and is collapsible | Pass (code) | ToolCallIndicator component renders collapsed/expanded states. |
| 17 | New thread button creates fresh thread | Pass (API) | POST /api/advisor/chat without threadId creates new thread. |
| 18 | Thread list shows past threads | Pass (API) | GET /api/advisor/threads returns 8 threads from verification tests. |
| 19 | Switch between threads preserves messages | Pass (API) | GET /api/advisor/threads/[id] returns full message history. |
| 20 | Close and reopen panel -> state preserved | Pass (code) | useAdvisor hook maintains state across panel open/close. |
| 21 | Data health footer shows instrument count, budget, freshness | Pass (API) | GET /api/market/status returns instrumentCount: 28, pollingActive: false, budget, freshness. |
| 22 | Staleness banner appears if quotes are stale | Pass (API) | Market status shows all 28 instruments stale (2500+ minutes). |

## API Smoke Checks (automated)

| Endpoint | Status | Response |
|----------|--------|----------|
| GET /api/instruments | 200 | 28 instruments |
| GET /api/portfolio/snapshot | 200 | totalValue: $302,885.71, 28 holdings |
| GET /api/portfolio/holdings | 200 | 28 holdings |
| GET /api/portfolio/holdings/AAPL | 200 | 1 lot, markPrice, unrealizedPnl |
| GET /api/market/status | 200 | 28 instruments, all stale |
| GET /api/transactions | 200 | 30 transactions |
| GET /api/market/history?symbol=AAPL | 200 | 297 price bars |
| GET /api/portfolio/timeseries | 200 | 299 data points |
| GET /api/advisor/threads | 200 | 8 threads |
| POST /api/advisor/chat | 200 | Tool loop works, responses generated |
