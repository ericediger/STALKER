# SESSION-12-PLAN: API Wiring + Pipeline Soak

**Session:** 12
**Epic:** 11 (completion)
**Mode:** Lead Phase 0 (blocking gate) + 2 parallel teammates
**Prerequisite:** Session 11 complete (526 tests, 0 type errors, providers rewired)
**Estimated Complexity:** Medium

---

## 1. Session Goal

Close the integration gap between Session 11's provider layer and the API routes. Wire the two remaining stubs to live `MarketDataService`, run end-to-end verification with real API keys, and soak-test the pipeline with 15 real instruments to validate backfill, polling, and data quality before real portfolio data enters the system.

**This is the last engineering session before UAT.** After this session, the system should be able to:
1. Search for a real ticker symbol and get live results
2. Create an instrument and see historical price bars backfill automatically
3. Watch the scheduler poll quotes during market hours
4. Display accurate, live portfolio data on the dashboard

---

## 2. Pre-Flight (Lead)

Run before launching any work. All must pass.

```bash
# PF-1: Type check
pnpm tsc --noEmit

# PF-2: Baseline tests
pnpm test
# Expected: 526 tests pass, 0 failures

# PF-3: Verify API keys are configured
cat .env.local | grep -E "FMP_API_KEY|TIINGO_API_KEY|ALPHA_VANTAGE_API_KEY"
# All three must be set (not placeholder values)

# PF-4: Live provider smoke (one-time, manual)
# Verify FMP search still works:
curl "https://financialmodelingprep.com/stable/search-symbol?query=VTI&apikey=$FMP_API_KEY"
# Verify Tiingo history still works:
curl -H "Authorization: Token $TIINGO_API_KEY" "https://api.tiingo.com/tiingo/daily/VTI/prices?startDate=2025-01-02&endDate=2025-01-03"
# Both should return JSON with expected shapes (see data/test/provider-smoke-results.md)
```

**If PF-3 or PF-4 fail, do not proceed.** Resolve API key issues first.

---

## 3. Phase 0: API Stub Wiring (Lead — Blocking Gate)

**Rationale:** The API stubs are the integration seam. Wiring them wrong affects every downstream test. Lead does this before releasing teammates.

### 3.1 Wire `/api/market/search`

**Current state:** Returns mock data.
**Target:** Call `MarketDataService.searchSymbols()` → FMP `/stable/search-symbol`.

```typescript
// apps/web/src/app/api/market/search/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  if (!q || q.length < 2) return Response.json({ results: [] });

  const service = getMarketDataService(); // singleton or factory
  const results = await service.searchSymbols(q);
  return Response.json({ results });
}
```

**Key decisions:**
- `getMarketDataService()` must be a singleton or factory that initializes providers with env vars. If this doesn't exist yet, create it as `apps/web/src/lib/market-data-service.ts`.
- Search debouncing is client-side (already in place from S7 AddInstrumentModal). Server just proxies.
- FMP search returns no `type` field — default to `"STOCK"` (AD per R-II-11).

### 3.2 Wire `/api/market/refresh`

**Current state:** Returns mock/stub response.
**Target:** Call `MarketDataService.getQuote()` for each tracked instrument.

```typescript
// apps/web/src/app/api/market/refresh/route.ts
export async function POST(request: Request) {
  const instruments = await prisma.instrument.findMany();
  const service = getMarketDataService();

  let refreshed = 0, failed = 0, rateLimited = false;
  for (const inst of instruments) {
    try {
      const quote = await service.getQuote(inst.symbol, inst.providerSymbolMap);
      // Update LatestQuote cache
      await updateLatestQuote(inst.id, quote);
      refreshed++;
    } catch (e) {
      if (isRateLimitError(e)) rateLimited = true;
      failed++;
    }
  }

  return Response.json({ refreshed, failed, rateLimited });
}
```

### 3.3 Wire Instrument Creation Backfill

**Current state:** `POST /api/instruments` creates the instrument but does not trigger historical backfill.
**Target:** After instrument creation, fetch historical bars from Tiingo and populate `PriceBar` table.

```typescript
// After successful instrument creation:
const service = getMarketDataService();
const bars = await service.getHistory(
  instrument.symbol,
  getStartDate(), // e.g., 2 years ago
  new Date(),
  '1D',
  instrument.providerSymbolMap
);
// Bulk insert bars into PriceBar table
// Set instrument.firstBarDate from earliest bar
```

**Important:** Backfill is async from the user's perspective. The instrument creation returns immediately. A background task (or the same request) handles backfill. For MVP/single-user, synchronous-within-the-request is acceptable. If it takes > 5s for 2 years of daily bars (~500 rows), consider `Promise.resolve().then(backfill)` pattern.

### 3.4 MarketDataService Factory

Create `apps/web/src/lib/market-data-service.ts` if it doesn't exist:

```typescript
import { MarketDataService, FmpProvider, TiingoProvider, AlphaVantageProvider } from '@stalker/market-data';

let instance: MarketDataService | null = null;

export function getMarketDataService(): MarketDataService {
  if (!instance) {
    instance = new MarketDataService({
      providers: {
        search: new FmpProvider({ apiKey: process.env.FMP_API_KEY! }),
        quotes: new FmpProvider({ apiKey: process.env.FMP_API_KEY! }),
        history: new TiingoProvider({ apiKey: process.env.TIINGO_API_KEY! }),
      },
      fallbackQuotes: new AlphaVantageProvider({ apiKey: process.env.ALPHA_VANTAGE_API_KEY }),
    });
  }
  return instance;
}
```

**Adjust constructor to match actual `MarketDataService` API.** The point is: one factory, one singleton, all providers initialized from env vars.

### 3.5 Phase 0 Verification

After wiring, verify manually:

```bash
# V-1: Search returns live results
curl "http://localhost:3000/api/market/search?q=AAPL"
# Should return FMP results, not mock data

# V-2: Refresh works (at least for seed instruments)
curl -X POST "http://localhost:3000/api/market/refresh"
# Should return { refreshed: N, failed: 0, rateLimited: false }

# V-3: Instrument creation triggers backfill
# (test via UI or curl — create a new instrument, check PriceBar table)
```

**All three must pass before releasing teammates.**

---

## 4. Teammate Split

### Teammate 1: `pipeline-soak-engineer`

**Goal:** Add 15 real instruments, verify backfill quality, monitor polling, validate data integrity.

**Filesystem scope:** `data/test/`, `apps/web/__tests__/api/` (new integration test files only). Do NOT modify provider code or API routes.

**Tasks:**

1. **Create instrument test fixture:** `data/test/soak-instruments.json`
   - 15 real instruments covering: large-cap stocks (AAPL, MSFT, GOOGL), ETFs (VTI, QQQ, SPY, BND), mid-cap (CRWD, SQ), international ETF (VXUS), REIT (VNQ), sector ETF (XLK), bond ETF (AGG), and one hyphenated symbol (BRK-B)
   - Each entry: `{ symbol, name, type, exchange, expectedBarsMinimum }` where `expectedBarsMinimum` is the approximate number of daily bars for 2 years

2. **Backfill verification script:** `data/test/verify-backfill.ts`
   - For each instrument in the fixture:
     - Create instrument via `POST /api/instruments`
     - Wait for backfill to complete (poll `firstBarDate` until non-null, timeout 30s)
     - Query `PriceBar` table: count bars, verify date range, check no duplicate dates
     - Verify `firstBarDate` matches earliest bar
     - For BRK-B: verify Tiingo symbol mapping works (hyphen handling)
   - Report: instrument, bar count, date range, pass/fail for each

3. **Backfill data quality checks:**
   - No zero-price bars (open, high, low, close all > 0)
   - No gaps > 5 trading days (except weekends/holidays)
   - High >= Low for every bar
   - Close within High-Low range
   - Volume ≥ 0

4. **Polling monitoring script:** `data/test/verify-polling.ts`
   - With `pnpm dev` running, wait for one polling cycle to complete
   - Verify: `LatestQuote` table has fresh quotes for all 15 instruments
   - Verify: FMP API budget consumption is within expected range
   - Log: total API calls made, time elapsed, any failures

5. **Dashboard integration check:**
   - After backfill + one poll cycle, hit `GET /api/portfolio/snapshot`
   - Verify response contains all 15 instruments with non-null market values
   - Verify portfolio total value is the sum of individual holding values

**Test deliverables:**
- Vitest integration tests wrapping the verification scripts (run with `--run` flag, not in watch mode)
- Target: 20+ new tests

### Teammate 2: `hardening-engineer`

**Goal:** Close S11 outstanding items, add regression tests, documentation updates.

**Filesystem scope:** `packages/market-data/__tests__/`, `apps/web/__tests__/`, documentation files. Do NOT modify API routes or provider implementations.

**Tasks:**

1. **Tiingo HTTP 200 rate limit regression test:**
   - Create a mock that returns HTTP 200 with text body: `"You have exceeded your hourly rate limit..."`
   - Assert that the provider throws a `ProviderError` (not a JSON parse error)
   - Assert that the error is classified as rate-limiting, not as a data error
   - This is a regression guard — the fix exists in S11, but no dedicated test covers it

2. **Rate limiter integration tests:**
   - Test per-hour bucket: 50 calls allowed, 51st blocked
   - Test per-hour + per-day interaction: hour budget exhausted, daily budget still has room → blocked
   - Test sliding window: after 1 hour, budget resets
   - Target: 8+ tests

3. **Fallback chain integration tests with error simulation:**
   - FMP returns 500 → should fall through to cached LatestQuote
   - FMP returns 500, cache is stale, Alpha Vantage returns valid quote → should use AV
   - FMP returns 500, cache is stale, AV returns 500 → should return stale data with warning
   - Target: 5+ tests

4. **Documentation updates:**
   - Update `KNOWN-LIMITATIONS.md`: remove items resolved in S10/S11, add single-provider dependency note
   - Update `HANDOFF.md`: reflect current state (S12 complete, S13 next)
   - Verify `CLAUDE.md` has correct provider info (no references to Stooq in active documentation)
   - Clean up any remaining `/api/v3/` references in code comments

5. **Decimal precision E2E test:**
   - Create a transaction via `POST /api/transactions` with a precise price (e.g., `"185.7787708514"`)
   - Read it back via `GET /api/transactions`
   - Assert the price survives the round-trip exactly (string comparison)
   - This validates the full stack: API → Prisma → SQLite TEXT → Prisma → API → JSON string

**Test deliverables:**
- Target: 15+ new tests

---

## 5. Lead Integration (Post-Teammate)

1. **Run full test suite:** `pnpm test` — 560+ tests, 0 failures
2. **Run `tsc --noEmit`** — 0 errors
3. **E2E smoke with `pnpm dev`:**
   - Open browser to `localhost:3000`
   - Search for "VTI" via Add Instrument flow → should show live FMP results
   - Add VTI → should create instrument and backfill (toast notification)
   - Navigate to VTI holding detail → should show candlestick chart with real prices
   - Add a BUY transaction → dashboard should show portfolio value using live quote
   - Wait for one scheduler poll cycle → verify quotes update
   - Open advisor → ask "What's my current portfolio value?" → should use live data
4. **Budget check:** Verify total API calls consumed during session are within expected bounds
5. **Update master documents:** HANDOFF.md, CLAUDE.md, AGENTS.md
6. **Commit and push**

---

## 6. Exit Criteria

### Must Pass (Blocking)

| # | Criterion | Verification |
|---|-----------|--------------|
| 1 | `/api/market/search` returns live FMP results | Manual curl + automated test |
| 2 | `/api/market/refresh` updates LatestQuote table for all instruments | Manual curl + automated test |
| 3 | Instrument creation triggers Tiingo backfill | Create instrument, verify PriceBar rows |
| 4 | 15 instruments backfilled with correct date ranges | Soak verification script |
| 5 | No zero-price or invalid bars in backfilled data | Data quality checks |
| 6 | BRK-B backfills correctly (hyphen symbol mapping) | Specific fixture check |
| 7 | Scheduler polls quotes during market hours (or simulated) | Polling monitoring script |
| 8 | Dashboard shows live portfolio data after backfill + poll | Manual E2E |
| 9 | Tiingo 200 rate limit response treated as error | Regression test |
| 10 | Rate limiter per-hour bucket works correctly | Integration tests |
| 11 | Decimal precision survives full-stack round-trip | E2E precision test |
| 12 | `pnpm tsc --noEmit` — 0 errors | Automated |
| 13 | `pnpm test` — 560+ tests, 0 failures | Automated |
| 14 | No `/api/v3/` references in active code | grep verification |

### Should Pass (Non-Blocking)

| # | Criterion |
|---|-----------|
| 15 | Fallback chain handles FMP outage gracefully |
| 16 | Documentation fully updated (KNOWN-LIMITATIONS, HANDOFF, CLAUDE.md) |
| 17 | API budget consumption within expected bounds after soak |

---

## 7. Scope Cut Order (If Session Runs Long)

1. Cut: Fallback chain integration tests (criterion 15) — important but not blocking
2. Cut: Documentation updates (criterion 16) — can be done in S13
3. Cut: Polling monitoring script (criterion 7) — can be verified manually
4. **Never cut:** API stub wiring (1–3), backfill verification (4–6), Tiingo regression test (9), rate limiter tests (10)

---

## 8. Architecture Decisions (Planned)

| # | Decision | Rationale |
|---|----------|-----------|
| AD-S12a | `getMarketDataService()` singleton factory | One instance, all providers, initialized from env vars. Avoids constructing providers on every request. |
| AD-S12b | Synchronous backfill within instrument creation request | Single user, <500 bars for 2 years, sub-5s typical. Async adds complexity for no user benefit. If >5s, add background pattern. |
| AD-S12c | Soak instruments are real tickers, not synthetic | Tests must validate against actual API responses, not mocked data. This is the first real-data session. |

---

## 9. Monitoring Protocol (During Soak)

Track these during the pipeline soak:

| Metric | Expected | Alert If |
|--------|----------|----------|
| FMP calls during backfill | 0 (backfill uses Tiingo) | Any FMP call during backfill |
| Tiingo calls during backfill | 15 (one per instrument) | > 20 (retry storms) |
| FMP calls during polling (one cycle) | 15 (one quote per instrument) | > 20 |
| Tiingo calls during polling | 0 (quotes from FMP, not Tiingo) | Any Tiingo call during polling |
| Total FMP daily budget consumed | < 50% (125 of 250) | > 75% |
| Backfill duration per instrument | < 5s | > 15s |
| PriceBar count per instrument | 400–600 (2 years daily) | < 200 or > 1000 |
