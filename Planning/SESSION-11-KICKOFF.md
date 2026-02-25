# SESSION 11 KICKOFF — Provider Integration Testing

> **Paste this into Claude Code. Phase 0 is complete.**
> Read `data/test/provider-smoke-results.md` first — it contains exact response shapes from live APIs.
> Raw response files are in `data/test/smoke-responses/`.

---

## Context

You are working on STALKER, a local-first portfolio tracker. This is Session 11 — the first time the application contacts real market data APIs. Sessions 1–10 built and tested everything against mocked HTTP responses. All 506+ tests pass against those mocks.

**Phase 0 revealed that the mocks are wrong.** Specifically:
1. FMP's entire `/api/v3/` API namespace is **dead** — discontinued for new accounts after Aug 2025. Every FMP URL in the codebase returns an error.
2. FMP's replacement `/stable/` API has different URLs, different parameter formats, and different response shapes.
3. FMP historical data is **premium-only** — free tier cannot use it. Tiingo replaces Stooq as the sole history provider.

**Read these files in order:**
1. `CLAUDE.md` — Architecture overview and coding rules
2. `AGENTS.md` — Package inventory and coordination patterns
3. `data/test/provider-smoke-results.md` — **CRITICAL: Phase 0 findings with exact response shapes**
4. `data/test/smoke-responses/` — Raw API response JSON files

**Three load-bearing invariants:**
1. Event-sourced core: Transactions + PriceBars = truth. Everything else is rebuildable cache.
2. Decimal precision: No `number` type touches money or quantity in business logic. All financial arithmetic uses `Decimal.js`.
3. Sell validation invariant: cumulative_buy_qty >= cumulative_sell_qty at every point per instrument.

---

## Provider Architecture (Post-Phase 0)

```
Symbol Search:   FMP (/stable/search-symbol)
                   └── no fallback (FMP is the only search provider)

Real-time Quotes: FMP (/stable/quote)
                   └── fallback → Alpha Vantage (GLOBAL_QUOTE)
                        └── fallback → cached LatestQuote

Historical Bars:  Tiingo (/tiingo/daily/{sym}/prices)  ← NEW, replaces Stooq
                   └── no fallback (Tiingo is the only history provider)
```

FMP no longer provides history. Stooq is deprecated. Tiingo is new.

---

## Your Assignment: Lead Agent

### Priority Order
```
1. FMP URL migration (/api/v3/ → /stable/) + response parser rewrite
2. Tiingo provider implementation (NEW — replaces Stooq)
3. Provider chain rewiring (FMP: search+quotes, Tiingo: history, AV: backup)
4. Alpha Vantage verification (minor)
5. Environment variable reconciliation
6. Mock fixture updates (mandatory)
7. Decimal precision audit
8. All 506+ tests pass
```

---

### Task 1: FMP Migration

Open `packages/market-data/src/providers/fmp.ts`. The entire file needs surgery.

**1a. URL Rewrites**

Replace every endpoint URL:

```typescript
// DEAD — returns "Legacy Endpoint" error
const url = `${FMP_BASE_URL}/api/v3/search?query=${query}&apikey=${apiKey}`;
// WORKING
const url = `${FMP_BASE_URL}/stable/search-symbol?query=${encodeURIComponent(query)}&apikey=${apiKey}`;

// DEAD
const url = `${FMP_BASE_URL}/api/v3/quote/${symbol}?apikey=${apiKey}`;
// WORKING — symbol is now a query param, not in the path
const url = `${FMP_BASE_URL}/stable/quote?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;

// DEAD and also premium-only — REMOVE entirely
const url = `${FMP_BASE_URL}/api/v3/historical-price-full/${symbol}?from=${startStr}&to=${endStr}&apikey=${apiKey}`;
```

**1b. Search Response Parser**

Real response from `/stable/search-symbol?query=VTI`:
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

Changes from v3:
- `exchangeFullName` is new (map to display name if useful, otherwise ignore)
- There is **no `type` field**. If the existing `SymbolSearchResult` type requires `type`, make it optional with default `"STOCK"`.
- Verify your mock fixtures assumed different field names

**1c. Quote Response Parser**

Real response from `/stable/quote?symbol=AAPL`:
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

**CRITICAL: `price` is a JSON number, not a string.** Convert via:
```typescript
new Decimal(String(item.price))  // "272.11" → exact Decimal
// NEVER: new Decimal(item.price)  // 272.11 float → potential precision loss
```

This applies to ALL numeric fields: `price`, `open`, `previousClose`, `dayLow`, `dayHigh`, etc.

**1d. Remove History Method**

FMP's `getHistory()` must no longer attempt to call the API. Either:
- Throw `new ProviderError('FMP free tier does not support historical data', ...)`
- Or return empty array

Do NOT leave the dead `/api/v3/historical-price-full/` URL in the code.

---

### Task 2: Tiingo Provider (NEW)

**Create:** `packages/market-data/src/providers/tiingo.ts`

This replaces Stooq as the history provider. Implement `MarketDataProvider` interface.

**API details:**
- Base URL: `https://api.tiingo.com`
- Auth: query parameter `token=KEY`
- History: `GET /tiingo/daily/{symbol}/prices?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&token=KEY`
- Quote: `GET /iex/{symbol}?token=KEY`
- Search: NOT AVAILABLE — return empty array
- Env var: `TIINGO_API_KEY`

**Use the REAL response shapes from `data/test/smoke-responses/tiingo-history-vti-short.json`.**

The real response is a bare JSON array:
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

**Implementation rules:**

1. **Use adjusted prices:** Map `adjClose` → PriceBar `close`, `adjOpen` → `open`, `adjHigh` → `high`, `adjLow` → `low`. Document this with a comment.

2. **Date parsing:** Extract date portion from `"2025-01-02T00:00:00.000Z"` → `"2025-01-02"` for PriceBar.date. Use `.split('T')[0]` or equivalent — do NOT store the full ISO string.

3. **Number-to-Decimal conversion:** All prices are JSON numbers. Always convert via String intermediary:
   ```typescript
   new Decimal(String(bar.adjClose))
   ```

4. **Error handling — THIS IS CRITICAL:**
   ```typescript
   const text = await response.text();
   let data;
   try {
     data = JSON.parse(text);
   } catch {
     // Tiingo returns HTTP 200 with plain text on errors/rate limits
     throw new ProviderError(`Tiingo error: ${text.substring(0, 200)}`, 'PROVIDER_ERROR', 'tiingo');
   }
   ```

5. **Symbol mapping:** Tiingo uses uppercase with hyphens. `BRK-B` not `BRK.B`. Add `tiingo` to the `providerSymbolMap` convention. If the instrument has a custom Tiingo symbol in its map, use it; otherwise use the canonical symbol.

6. **Rate limits:** 50 requests/hour, 1,000/day. The rate limiter needs per-hour bucket support. Check `packages/market-data/src/rate-limiter.ts` — if it only has per-minute and per-day, add per-hour. Env vars: `TIINGO_RPH=50`, `TIINGO_RPD=1000`.

7. **No search:** `searchSymbols()` returns `[]`.

**Create tests:** `packages/market-data/src/__tests__/tiingo.test.ts`
- Use response shapes from `data/test/smoke-responses/tiingo-*.json` as fixtures
- Test: getHistory returns correct bar count, date range, and Decimal prices
- Test: date parsing extracts YYYY-MM-DD correctly
- Test: error response (non-JSON) throws ProviderError
- Test: BRK-B symbol mapping works
- Test: quote endpoint parses correctly (if IEX response available)

---

### Task 3: Provider Chain Rewiring

Update `packages/market-data/src/service.ts` (or wherever the provider chain is configured):

```
Search:   FMP only (no fallback)
Quotes:   FMP → Alpha Vantage → cached LatestQuote
History:  Tiingo only (no fallback)
```

- Remove Stooq from all chains
- Remove FMP from history chain
- Add Tiingo for history
- Export Tiingo from `packages/market-data/src/providers/index.ts`

Update `packages/market-data/src/providers/stooq.ts`:
```typescript
/**
 * @deprecated Replaced by TiingoProvider in Session 11.
 * Stooq CSV endpoints have no formal API, IP-rate-limiting, and CAPTCHA risk.
 * This file is kept for reference only. Do not use.
 */
```

---

### Task 4: Alpha Vantage Verification

The real AV response matches expectations closely. Verify:
- The `"05. price"` numbered key format parses correctly
- `"10. change percent"` value includes `%` (e.g., `"-1.1197%"`) — must strip before any numeric use
- If mock fixtures differ from the real shape in `data/test/smoke-responses/av-quote-vti.json`, update them

---

### Task 5: Environment Variables

Rename in `apps/web/.env.local`:
```bash
# Before (wrong names)
FMP_KEY=...
AV_KEY=...
TIINGO_KEY=...

# After (matches code)
FMP_API_KEY=...
ALPHA_VANTAGE_API_KEY=...
TIINGO_API_KEY=...
TIINGO_RPH=50
TIINGO_RPD=1000
```

Update `.env.local.example` (or `.env.example`) to document all required variables.

Also update `packages/scheduler/src/config.ts` to read `TIINGO_API_KEY`, `TIINGO_RPH`, `TIINGO_RPD`.

---

### Task 6: Mock Fixture Updates

**Every mock fixture must reflect real response shapes. This is mandatory (AD-P2-5).**

1. Copy representative real responses from `data/test/smoke-responses/` into `packages/market-data/src/__tests__/fixtures/`
2. Update FMP test fixtures to use `/stable/` response shapes (field names, types all changed)
3. Update AV test fixtures if any differences found
4. Create Tiingo test fixtures from real responses
5. Run `pnpm test` — all 506+ tests must be green
6. If a test fails because the fixture changed, **that's a real bug** — the test was validating behavior that wouldn't work with real data. Fix the code, not just the test.

---

### Task 7: Decimal Precision Audit

For FMP and Tiingo, trace one price through the full pipeline:

```
Raw JSON (number) → JSON.parse → String(value) → new Decimal(str) → Prisma write (TEXT) → Prisma read → Decimal → API response (string)
```

**No `parseFloat()`, `Number()`, or `+value` anywhere in this chain.**

Test edge cases: `272.11`, `268` (integer, no decimal), `0.01`, `285.7787708514` (high precision from Tiingo adjClose).

---

## Teammate Assignment: Phase 1B (Rate Limiter + Fallback)

### Rate Limiter
- Verify existing per-minute and per-day buckets work
- Add per-hour bucket for Tiingo (50/hr) if not present
- Write unit test for per-hour throttling behavior
- Log results to `data/test/rate-limiter-validation.md`

### Fallback Chain Testing
- Test with invalid FMP key → verify AV fallback activates for quotes
- Test with network disabled → verify cached quotes served with staleness
- Test with invalid Tiingo key → verify graceful degradation (no history, "no price data" warning)
- Log results to `data/test/fallback-chain-results.md`

---

## Filesystem Boundaries

**Lead agent owns:**
```
packages/market-data/src/providers/tiingo.ts          (CREATE)
packages/market-data/src/providers/fmp.ts              (REWRITE)
packages/market-data/src/providers/alpha-vantage.ts    (MODIFY)
packages/market-data/src/providers/stooq.ts            (DEPRECATE comment)
packages/market-data/src/providers/index.ts            (MODIFY)
packages/market-data/src/service.ts                    (MODIFY)
packages/market-data/src/__tests__/tiingo.test.ts      (CREATE)
packages/market-data/src/__tests__/fixtures/           (CREATE)
packages/market-data/src/__tests__/fmp.test.ts         (MODIFY)
packages/market-data/src/__tests__/alpha-vantage.test.ts (MODIFY)
packages/market-data/src/rate-limiter.ts               (MODIFY if per-hour needed)
packages/scheduler/src/config.ts                       (MODIFY)
apps/web/.env.local                                    (MODIFY)
```

**Teammate owns:**
```
packages/market-data/src/__tests__/rate-limiter-integration.test.ts  (CREATE)
packages/market-data/src/__tests__/fallback-chain.test.ts            (CREATE)
data/test/rate-limiter-validation.md                                 (CREATE)
data/test/fallback-chain-results.md                                  (CREATE)
```

**No overlap.**

---

## Exit Checklist

- [ ] FMP search works via `/stable/search-symbol` — returns parsed SymbolSearchResult
- [ ] FMP quotes work via `/stable/quote` — returns parsed Quote with Decimal price
- [ ] FMP `getHistory()` is disabled (no longer calls dead endpoint)
- [ ] Tiingo provider implemented and returns correct daily bars
- [ ] Tiingo BRK-B (hyphen) resolves correctly
- [ ] Tiingo error handling catches HTTP 200 text responses
- [ ] Alpha Vantage verified against real response shape
- [ ] Provider chain: FMP (search+quotes) → Tiingo (history) → AV (backup quotes)
- [ ] Stooq deprecated, removed from active chain
- [ ] Rate limiter has per-hour bucket for Tiingo
- [ ] Fallback chain tested with real failure scenarios
- [ ] All mock fixtures updated to match real response shapes
- [ ] `.env.local` variables renamed to match code (`FMP_API_KEY`, `ALPHA_VANTAGE_API_KEY`, `TIINGO_API_KEY`)
- [ ] Decimal precision audited — no parseFloat/Number in financial path
- [ ] `pnpm test` passes (all 506+ tests green, plus new Tiingo tests)

**Test count target:** 506 + ~30 new (Tiingo + rate limiter + fallback) = 536+

---

## What NOT To Do

- Do NOT add new features. This is integration, not development.
- Do NOT leave any `/api/v3/` URLs in the codebase. They are dead.
- Do NOT delete Stooq code. Deprecate with a comment.
- Do NOT call live APIs in unit tests. Mock tests use fixtures shaped like real responses.
- Do NOT use `parseFloat()` or `Number()` on any financial value.
- Do NOT use `new Decimal(jsonNumber)` directly. Always `new Decimal(String(jsonNumber))`.
- Do NOT skip the mock fixture update. Every test must validate against realistic data shapes.
