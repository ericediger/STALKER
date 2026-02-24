# Provider Smoke Test Results — Session 11 Phase 0

**Date:** 2026-02-24
**Tester:** Lead / Product Owner
**Environment:** macOS, zsh, API keys configured in `apps/web/.env.local`

---

## CRITICAL FINDING: FMP v3 API Is Dead

**The entire `/api/v3/` endpoint namespace is discontinued for accounts created after August 31, 2025.** Every FMP URL in the Session 2 codebase returns:

```json
{
  "Error Message": "Legacy Endpoint : Due to Legacy endpoints being no longer supported - This endpoint is only available for legacy users who have valid subscriptions prior August 31, 2025. Please visit our documentation page https://site.financialmodelingprep.com/developer/docs for our current APIs."
}
```

**FMP has migrated to `/stable/` endpoints.** The URL structure, parameter format, and response shapes have all changed.

---

## FMP (Financial Modeling Prep)

### Endpoint Migration Required

| Function | Dead (Session 2 code) | Working (stable API) |
|---|---|---|
| Search | `/api/v3/search?query=VTI&apikey=KEY` | `/stable/search-symbol?query=VTI&apikey=KEY` |
| Quote | `/api/v3/quote/VTI?apikey=KEY` | `/stable/quote?symbol=VTI&apikey=KEY` |
| History | `/api/v3/historical-price-full/VTI?from=...&to=...&apikey=KEY` | `/stable/historical-price-eod/full?symbol=VTI&from=...&to=...&apikey=KEY` |

**Key URL changes:**
- Base path: `/api/v3/` → `/stable/`
- Symbol: moved from URL path to `?symbol=` query parameter (quote, history)
- Search: endpoint renamed from `search` to `search-symbol`
- History: endpoint renamed from `historical-price-full` to `historical-price-eod/full`

### FMP History Is Premium-Only

**`/stable/historical-price-eod/full` is NOT available on the free tier.** Response:

```
Premium Query Parameter: 'Special Endpoint : This value set for 'symbol' is not available under your current subscription...
```

**Impact:** FMP can no longer serve as a history provider. Its role shrinks to **search + quotes only**. Tiingo handles all historical daily bars.

### FMP Search Response Shape (WORKING)

Endpoint: `GET /stable/search-symbol?query=VTI&apikey=KEY`

```json
[
  {
    "symbol": "VTI",
    "name": "Vanguard Total Stock Market Index Fund",
    "currency": "USD",
    "exchangeFullName": "New York Stock Exchange Arca",
    "exchange": "AMEX"
  }
]
```

**Changes from v3 mocks:**
- New field: `exchangeFullName`
- `exchange` value: `"AMEX"` (may differ from v3 values — verify against mock fixtures)
- No `type` field (STOCK/ETF/FUND) — if Session 2 code expects this, it must be made optional
- No `providerSymbol` field — symbol is the symbol

### FMP Quote Response Shape (WORKING)

Endpoint: `GET /stable/quote?symbol=AAPL&apikey=KEY`

```json
[
  {
    "symbol": "AAPL",
    "name": "Apple Inc.",
    "price": 272.11,
    "changePercentage": 2.22782,
    "change": 5.93,
    "volume": 31175156,
    "dayLow": 267.74,
    "dayHigh": 274.89,
    "yearHigh": 288.62,
    "yearLow": 169.21,
    "marketCap": 3999452374199.0005,
    "priceAvg50": 266.1126,
    "priceAvg200": 241.17575,
    "exchange": "NASDAQ",
    "open": 268,
    "previousClose": 266.18,
    "timestamp": 1771965875
  }
]
```

**Key observations:**
- Returns JSON array (even for single symbol)
- `price` is a JSON **number** (not string) — Decimal conversion must handle this
- `timestamp` is Unix epoch (seconds)
- `changePercentage` (not `changesPercentage` or `changePercent` — verify against mock)
- `marketCap` has floating point artifacts: `3999452374199.0005` — do NOT use for financial math
- `open` comes as integer `268` (no decimal) — Decimal conversion must handle this too

---

## Tiingo (NEW — Replaces Stooq)

### Daily History Response Shape (WORKING)

Endpoint: `GET /tiingo/daily/VTI/prices?startDate=2025-01-01&endDate=2025-01-31&token=KEY`

```json
[
  {
    "date": "2025-01-02T00:00:00.000Z",
    "close": 289.26,
    "high": 292.545,
    "low": 287.345,
    "open": 291.45,
    "volume": 3799816,
    "adjClose": 285.7787708514,
    "adjHigh": 289.0242360462,
    "adjLow": 283.8868177774,
    "adjOpen": 287.9424143146,
    "adjVolume": 3799816,
    "divCash": 0.0,
    "splitFactor": 1.0
  }
]
```

**Key observations:**
- Returns **bare JSON array** (NOT wrapped in object — unlike FMP)
- Dates: ISO-8601 with `.000Z` suffix (not `+00:00` as originally assumed)
- All prices are JSON **numbers** (not strings)
- Both raw and adjusted prices present
- `adjClose` has high precision: `285.7787708514` (10 decimal places)
- `divCash` and `splitFactor` included — useful for detecting corporate actions
- 20 bars returned for January 2025 (correct — 20 trading days)

### BRK-B Symbol Format

**`BRK-B` (hyphen) works.** Returned 6 bars for Jan 1–10, 2025.

This differs from FMP which uses `BRK.B` (dot). The `providerSymbolMap` must handle:
```json
{ "fmp": "BRK.B", "tiingo": "BRK-B", "alphavantage": "BRK.B" }
```

### Tiingo Has No Symbol Search

Tiingo does not provide a search endpoint. FMP handles all symbol search. The Tiingo provider's `searchSymbols()` method should return empty array.

### Tiingo Error Handling

Invalid symbols return HTTP 404 with JSON error body (to be verified with more testing). **Critical:** When rate limits are exceeded, Tiingo returns HTTP 200 with a plain text body (not JSON). The provider MUST check for non-JSON responses.

---

## Alpha Vantage (Backup Quotes)

### Global Quote Response Shape (WORKING)

Endpoint: `GET /query?function=GLOBAL_QUOTE&symbol=VTI&apikey=KEY`

```json
{
  "Global Quote": {
    "01. symbol": "VTI",
    "02. open": "339.5000",
    "03. high": "340.4550",
    "04. low": "335.4350",
    "05. price": "336.4600",
    "06. volume": "10771945",
    "07. latest trading day": "2026-02-23",
    "08. previous close": "340.2700",
    "09. change": "-3.8100",
    "10. change percent": "-1.1197%"
  }
}
```

**Key observations:**
- Numbered key format confirmed: `"05. price"`, `"08. previous close"`
- Prices are **strings** with 4 decimal places: `"336.4600"` — good for Decimal conversion
- `"10. change percent"` includes `%` symbol — must strip before parsing
- Response is object (not array) with `"Global Quote"` wrapper

**Appears to match existing Session 2 mock assumptions closely.** Least work needed here.

---

## Environment Configuration Finding

**Variable names in `apps/web/.env.local` don't match what the code expects:**

| In .env.local | Code expects (`fmp.ts`, `config.ts`) |
|---|---|
| `FMP_KEY=...` | `process.env['FMP_API_KEY']` |
| `AV_KEY=...` | `process.env['ALPHA_VANTAGE_API_KEY']` |
| `TIINGO_KEY=...` | `process.env['TIINGO_API_KEY']` (new) |

**Action required:** Either rename variables in `.env.local` or update all `process.env` references. Recommend renaming in `.env.local` to match spec (Section 12) and existing code.

---

## Phase 0 Verdict

- [x] FMP: parseable data for search and quotes on `/stable/` endpoints
- [x] Tiingo: parseable data for 3+ symbols
- [x] Alpha Vantage: parseable data for VTI
- [x] All mismatches documented
- [x] BRK-B format documented for Tiingo (hyphen) and FMP (dot)

### Blocking Issues for Session 11

1. **FMP URL migration** — every endpoint URL must be rewritten from `/api/v3/` to `/stable/`
2. **FMP history removed from free tier** — Tiingo is sole history provider
3. **FMP response shape changes** — field names, types, structure all differ from v3 mocks
4. **Tiingo provider must be built from scratch** (replaces Stooq)
5. **`.env.local` variable names** must be reconciled with code

**PHASE 0 GATE: PASS** — All providers accessible. Issues are implementation-level, not blocking.
