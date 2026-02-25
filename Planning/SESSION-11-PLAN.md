# SESSION 11 — Provider Integration Testing

**Project:** STALKER (Stock & Portfolio Tracker + LLM Advisor)
**Phase:** II (Pre-MVP Integration & Acceptance)
**Epic:** 10 — Provider Integration Testing
**Date:** 2026-02-24
**Author:** Systems Architect
**Inputs:** SPEC v4.0, Phase II Plan, Phase 0 Smoke Test Results
**Status:** Phase 0 Complete — Ready for Agent Execution

---

## 0. Session Summary

**Goal:** Migrate FMP from dead v3 API to stable API. Replace Stooq with Tiingo. Fix all response shape mismatches. Establish a real-data baseline.

**Phase 0 is done.** The human-executed smoke tests revealed three major findings that reshape this session's scope:

1. **FMP's `/api/v3/` namespace is dead** (discontinued for post-Aug-2025 accounts). Every FMP URL in the codebase must be rewritten to use `/stable/` endpoints with a new parameter format.
2. **FMP historical data is premium-only** on the free tier. FMP's role shrinks to search + quotes. Tiingo is the sole history provider.
3. **Tiingo works perfectly** as a Stooq replacement. JSON REST API, 30+ years of data, documented limits.

**Provider Role Matrix (Final):**

| Provider | Role | Endpoints Used | Free Tier |
|---|---|---|---|
| **FMP** | Symbol search + real-time quotes | `/stable/search-symbol`, `/stable/quote` | ✅ 250 req/day |
| **Tiingo** | Historical daily bars + backup quotes | `/tiingo/daily/{sym}/prices`, `/iex/{sym}` | ✅ 1,000 req/day, 50/hr |
| **Alpha Vantage** | Backup quotes only | `GLOBAL_QUOTE` | ✅ 25 req/day |

---

## 1. Session Structure

```
Phase 0: Manual Smoke Tests              ✅ COMPLETE
    ↓ (findings in data/test/provider-smoke-results.md)
Phase 1A: FMP Migration + Tiingo Build   Claude Code (Lead agent)
Phase 1B: Rate Limiter + Fallback        Claude Code (Teammate agent)
    ↓ (parallel)
Integration Verification                  Lead reviews
```

---

## 2. Scope of Work

### 2.1 FMP Migration (Critical Path)

Every FMP endpoint URL in the codebase is dead. The migration touches:

**URL rewrites:**

| Function | Dead Code | New Endpoint |
|---|---|---|
| Search | `/api/v3/search?query={q}&apikey={k}` | `/stable/search-symbol?query={q}&apikey={k}` |
| Quote | `/api/v3/quote/{symbol}?apikey={k}` | `/stable/quote?symbol={symbol}&apikey={k}` |
| History | `/api/v3/historical-price-full/{symbol}?from={s}&to={e}&apikey={k}` | **REMOVED — premium only** |

**Response shape changes (search):**
- New field: `exchangeFullName`
- Missing field: `type` (STOCK/ETF/FUND) — must be made optional
- `exchange` values may differ from v3 (e.g., `"AMEX"` for NYSE Arca ETFs)

**Response shape changes (quote):**
- `price` is JSON number (not string) — Decimal conversion must handle `number` input
- `changePercentage` — verify field name matches parser expectation
- `timestamp` is Unix epoch seconds
- `open` can be integer (`268`) — no trailing `.00`

**History removal:**
- FMP `getHistory()` method must either throw `NotImplementedError` or return empty
- All history calls route to Tiingo
- Fallback chain must be updated: FMP is no longer in the history provider chain

### 2.2 Tiingo Provider (New — Replaces Stooq)

Build `TiingoProvider` implementing `MarketDataProvider` interface.

**Endpoints:**

| Method | Endpoint | Notes |
|---|---|---|
| `getHistory()` | `GET /tiingo/daily/{symbol}/prices?startDate={s}&endDate={e}&token={k}` | Returns bare JSON array |
| `getQuote()` | `GET /iex/{symbol}?token={k}` | IEX quote for backup |
| `searchSymbols()` | N/A | Returns empty — Tiingo has no search |

**Implementation requirements from Phase 0:**
- Dates come as `"2025-01-02T00:00:00.000Z"` — extract `YYYY-MM-DD` for PriceBar.date
- All prices are JSON numbers — convert to Decimal via `new Decimal(String(value))`
- Use adjusted prices: `adjClose` → close, `adjOpen` → open, `adjHigh` → high, `adjLow` → low
- BRK-B uses hyphen in Tiingo (`BRK-B`), dot in FMP (`BRK.B`) — providerSymbolMap handles this
- Error handling: HTTP 200 with text body on rate limit. Must try/catch JSON.parse.
- Rate limits: 50/hr, 1,000/day — rate limiter needs per-hour bucket

### 2.3 Alpha Vantage Fixes (Minor)

Response shape matches existing mocks closely. Verify:
- Numbered key parsing works with real response
- `"10. change percent"` strips the `%` character
- BRK.B symbol accepted

### 2.4 Environment Variable Reconciliation

`.env.local` uses short names, code uses long names. Rename in `.env.local` to match code + spec:

| Current (.env.local) | Required |
|---|---|
| `FMP_KEY=...` | `FMP_API_KEY=...` |
| `AV_KEY=...` | `ALPHA_VANTAGE_API_KEY=...` |
| `TIINGO_KEY=...` | `TIINGO_API_KEY=...` |

Add new env vars for Tiingo rate limits:
```
TIINGO_RPH=50
TIINGO_RPD=1000
```

### 2.5 Mock Fixture Updates (Mandatory — AD-P2-5)

After all provider fixes, update mock response fixtures in test files to match real response shapes. All 506+ tests must pass against realistic fixtures.

### 2.6 Stooq Disposition

- Mark `stooq.ts` as deprecated with header comment
- Remove from active provider chain
- Do not delete — harmless reference code

---

## 3. Files Affected

### Create
- `packages/market-data/src/providers/tiingo.ts`
- `packages/market-data/src/__tests__/tiingo.test.ts`
- `packages/market-data/src/__tests__/fixtures/` (directory + real response shapes)

### Modify
- `packages/market-data/src/providers/fmp.ts` — URL migration + response parser rewrite
- `packages/market-data/src/providers/alpha-vantage.ts` — minor fixes if needed
- `packages/market-data/src/providers/index.ts` — add Tiingo, remove Stooq from chain
- `packages/market-data/src/service.ts` — update provider chain (FMP: search+quotes, Tiingo: history, AV: backup)
- `packages/market-data/src/rate-limiter.ts` — add per-hour bucket for Tiingo
- `packages/market-data/src/__tests__/fmp.test.ts` — update fixtures to stable API shapes
- `packages/market-data/src/__tests__/alpha-vantage.test.ts` — verify fixtures
- `packages/scheduler/src/config.ts` — add Tiingo env vars
- `apps/web/.env.local` — rename variables, add Tiingo config

### Deprecate
- `packages/market-data/src/providers/stooq.ts` — add deprecation comment

---

## 4. Exit Criteria

| # | Criterion | Verification |
|---|---|---|
| EC-11-1 | FMP search works via `/stable/search-symbol` | Parsed results for VTI, AAPL, BRK.B |
| EC-11-2 | FMP quotes work via `/stable/quote` | Parsed Quote objects with correct Decimal prices |
| EC-11-3 | Tiingo history returns correct daily bars | Bar count and date range for 5+ symbols |
| EC-11-4 | Tiingo BRK-B (hyphen) resolves correctly | Bars returned for BRK-B |
| EC-11-5 | Alpha Vantage backup quotes work | Parsed Quote for VTI |
| EC-11-6 | Rate limiter supports per-hour bucket (Tiingo) | Unit test passing |
| EC-11-7 | Fallback chain updated (FMP: search+quotes, Tiingo: history, AV: backup) | Integration test |
| EC-11-8 | Zero Decimal precision loss end-to-end | 5 prices spot-checked: provider response vs storage |
| EC-11-9 | All 506+ existing tests pass after fixture updates | `pnpm test` green |
| EC-11-10 | Stooq removed from active provider chain | Code review |
| EC-11-11 | `.env.local` variables match code expectations | App starts without "not set" errors |

---

## 5. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-11-1 | FMP stable search missing `type` field breaks instrument creation | High | High | Make `type` optional with default `"STOCK"` |
| R-11-2 | FMP price as JSON number loses precision in Decimal conversion | Medium | Critical | Convert via `new Decimal(String(value))` — never direct number-to-Decimal |
| R-11-3 | Tiingo HTTP 200 text error crashes JSON parser | High | Medium | Try/catch JSON.parse, check Content-Type |
| R-11-4 | Rate limiter has no per-hour bucket | Medium | Medium | Add if missing — scoped change |
| R-11-5 | FMP `exchange` values changed (e.g., "AMEX" vs "NYSE ARCA") | Medium | Low | Update exchange-to-timezone mapping if affected |
| R-11-6 | More FMP fields changed than observed in 2 test calls | Medium | Medium | Agent reviews full mock fixtures against real responses |

---

## 6. Architecture Decisions

**AD-S11-1: Tiingo replaces Stooq as historical daily bars provider.**
Rationale: Stooq has no formal API. Tiingo provides REST API with JSON, 30+ years of data, documented rate limits.

**AD-S11-2: FMP role reduced to search + quotes only.**
Rationale: Free tier no longer includes historical EOD data. No architecture impact — provider interface is function-level granular.

**AD-S11-3: Use Tiingo adjusted prices (`adjClose`, `adjOpen`, etc.) as default.**
Rationale: Adjusted prices account for splits and dividends. Matches user expectations for historical portfolio value.

**AD-S11-4: FMP price numbers convert via String intermediary.**
Rationale: `new Decimal(272.11)` risks float contamination. `new Decimal("272.11")` is exact. Always `new Decimal(String(jsonNumber))`.
