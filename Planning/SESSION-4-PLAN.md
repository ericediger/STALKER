# SESSION-4-PLAN: API Layer

**Session:** 4 of 9
**Epic:** 3 (full)
**Date:** 2026-02-21
**Planned by:** Engineering Lead (post–Session 3 review)
**Mode:** PARALLEL (two teammates with non-overlapping filesystem scope)
**Baseline:** 218 tests, 19 test files, `tsc --noEmit` clean

---

## 1. Session Objective

Build all Next.js App Router API endpoints that connect the UI (Sessions 5–7) to the analytics engine (Sessions 1–3) and market data service (Session 2). This is the highest-integration session in the project — it wires Prisma, analytics, and market data together for the first time.

Every endpoint must: validate inputs, enforce the sell invariant on transaction writes, trigger snapshot rebuilds where appropriate, serialize Decimals as strings, and return properly shaped JSON responses per Spec Section 8.

---

## 2. Lead Setup Task (Pre-Teammate Start)

Before either teammate begins, the Lead performs a **15-minute setup pass** to eliminate shared infrastructure blockers:

1. **Prisma client generation** — Verify `npx prisma generate` completes cleanly and the generated client resolves from `apps/web/`.
2. **Database migration** — Run `npx prisma db push` (or `migrate dev`) to create/sync the SQLite database schema.
3. **Seed script scaffold** — Create `apps/web/prisma/seed.ts` with a minimal seed (1 instrument, 1 transaction, 1 price bar) so both teammates can run integration tests against real data.
4. **Prisma singleton** — Create `apps/web/src/lib/prisma.ts` exporting a singleton `PrismaClient` (prevents connection pool exhaustion in dev).
5. **Dead code cleanup** — Remove unused `copyLots()` function from `packages/analytics/src/value-series.ts` (flagged in Session 3 report).
6. **Verify all 218 existing tests still pass** after setup changes.
7. **Commit setup as a standalone commit** before teammates begin.

---

## 3. Teammate Assignments

### Teammate 1: `api-crud-engineer`

**Scope:** Instrument CRUD + Transaction CRUD (the write-path endpoints)

**Filesystem scope:**
```
apps/web/src/app/api/instruments/          (all files)
apps/web/src/app/api/transactions/         (all files, excluding bulk/)
apps/web/src/lib/validators/               (input validation schemas)
apps/web/src/lib/errors.ts                 (shared error response helpers)
apps/web/__tests__/api/instruments/        (integration tests)
apps/web/__tests__/api/transactions/       (integration tests)
```

**Deliverables:**

#### Instrument Endpoints (Spec 8.1)

| Method | Route | Behavior |
|--------|-------|----------|
| POST | `/api/instruments` | Create instrument from `{ symbol, name, type, exchange }`. Auto-assign `exchangeTz` from exchange mapping (Spec 2.2). Auto-populate `providerSymbolMap`. Trigger async historical backfill via market data service. Return created instrument. |
| GET | `/api/instruments` | List all instruments, ordered by symbol ASC. |
| GET | `/api/instruments/[id]` | Get instrument by ID. 404 if not found. |
| DELETE | `/api/instruments/[id]` | Cascade delete: remove instrument + all its transactions + all its price bars + latest quotes. Trigger snapshot rebuild. 404 if not found. |

**Instrument creation flow detail:**
1. Validate input (symbol required, non-empty, uppercase-normalized).
2. Check for duplicate symbol (409 Conflict if exists).
3. Map exchange → `exchangeTz` per Spec 2.2 lookup table.
4. Build `providerSymbolMap` (FMP: symbol as-is, Stooq: `{symbol.toLowerCase()}.us`).
5. Insert instrument record.
6. Trigger historical backfill: call market data service `getHistory()` for the new instrument (FMP for recent, Stooq for deep history). Write resulting `PriceBar` rows. Set `firstBarDate` on instrument.
7. Return created instrument with `firstBarDate` populated (or null if backfill found no data).

**Note:** Backfill is synchronous in MVP (single user, one-time per instrument). If it takes >5s for deep history, log timing but don't timeout.

#### Transaction Endpoints (Spec 8.2)

| Method | Route | Behavior |
|--------|-------|----------|
| POST | `/api/transactions` | Create transaction. Validate sell invariant. Trigger snapshot rebuild from `tradeAt` forward. |
| GET | `/api/transactions` | List transactions. Query params: `instrumentId`, `startDate`, `endDate`, `type`. |
| PUT | `/api/transactions/[id]` | Edit transaction. Re-validate sell invariant for the affected instrument(s). Trigger rebuild from earliest affected `tradeAt`. |
| DELETE | `/api/transactions/[id]` | Delete transaction. Re-validate remaining transactions. Trigger rebuild from the deleted transaction's `tradeAt`. |

**Sell validation implementation (Spec 4.2):**
1. On POST/PUT: assemble the full chronological transaction list for the instrument (including the new/modified transaction).
2. Walk the list in `tradeAt` order, tracking cumulative buy qty and cumulative sell qty.
3. If at any point `cumulative_sell_qty > cumulative_buy_qty`, reject with 422 and error body:
   ```json
   {
     "error": "SELL_VALIDATION_FAILED",
     "message": "Transaction would create negative position",
     "details": {
       "instrumentSymbol": "AAPL",
       "firstViolationDate": "2026-01-15T14:30:00Z",
       "deficitQuantity": "5.00"
     }
   }
   ```
4. On DELETE: re-validate remaining transactions (a delete could make a later sell invalid if it removes a buy that was consumed).

**Snapshot rebuild integration:**
- After any successful transaction write (POST/PUT/DELETE), call `rebuildSnapshotsFrom()` with the affected date.
- The rebuild must use the Prisma-backed `PriceLookup` and `SnapshotStore` implementations (see Teammate 2).
- **Integration point:** Teammate 1 imports these from a shared location that Teammate 2 creates. If Teammate 2 hasn't finished yet, Teammate 1 stubs them and wires up later.

#### Input Validation

Create Zod schemas (or equivalent) in `apps/web/src/lib/validators/`:
- `instrumentInput.ts` — symbol (string, non-empty), name (string), type (STOCK|ETF|FUND), exchange (string, optional)
- `transactionInput.ts` — instrumentId (ULID), type (BUY|SELL), quantity (Decimal string, positive), price (Decimal string, positive), tradeAt (ISO datetime), fees (Decimal string, default "0"), notes (string, optional)

#### Error Response Shape

All error responses follow a consistent shape:
```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable message",
  "details": { ... }
}
```

Standard codes: `VALIDATION_ERROR` (400), `NOT_FOUND` (404), `CONFLICT` (409), `SELL_VALIDATION_FAILED` (422), `INTERNAL_ERROR` (500).

---

### Teammate 2: `api-analytics-engineer`

**Scope:** Portfolio analytics endpoints + Market data endpoints (the read-path + market integration)

**Filesystem scope:**
```
apps/web/src/app/api/portfolio/            (all files)
apps/web/src/app/api/market/               (all files)
apps/web/src/lib/prisma-price-lookup.ts    (Prisma PriceLookup implementation)
apps/web/src/lib/prisma-snapshot-store.ts  (Prisma SnapshotStore implementation)
apps/web/src/lib/market-data-client.ts     (thin wrapper around market-data package)
apps/web/__tests__/api/portfolio/          (integration tests)
apps/web/__tests__/api/market/             (integration tests)
```

**Deliverables:**

#### Prisma Interface Implementations (Critical Path)

These are the bridge between Session 3's analytics engine and the real database. They must be completed first because Teammate 1's snapshot rebuild depends on them.

**`PrismaPriceLookup` — implements `PriceLookup` from `@stalker/analytics`:**
```typescript
// Core query: find the most recent close price on or before the given date
// SQL equivalent: SELECT close FROM PriceBar
//   WHERE instrumentId = ? AND resolution = '1D' AND date <= ?
//   ORDER BY date DESC LIMIT 1
```
- Returns `Decimal` (the close price) or `null` (no price data).
- Must handle the carry-forward semantics correctly: "on or before" means `date <= targetDate`.
- **Test:** Verify carry-forward returns correct price when target date has no bar but earlier dates do.

**`PrismaSnapshotStore` — implements `SnapshotStore` from `@stalker/analytics`:**
- `save(snapshot)` — Upsert `PortfolioValueSnapshot` row (unique on date). Serialize `holdingsJson`.
- `deleteFrom(date)` — Delete all snapshots with `date >= affectedDate`.
- `getRange(startDate, endDate)` — Return snapshot rows for the date range, ordered by date ASC.
- `getLatest()` — Return most recent snapshot.

#### Portfolio Analytics Endpoints (Spec 8.3)

| Method | Route | Behavior |
|--------|-------|----------|
| GET | `/api/portfolio/snapshot` | Current portfolio state. Params: `asOf`, `window` (1D/1W/1M/3M/1Y/ALL). Returns total value, PnL summary, per-holding breakdown. |
| GET | `/api/portfolio/timeseries` | Value series for charting. Params: `startDate`, `endDate`. Returns array of `{ date, totalValue, totalCostBasis, unrealizedPnl, realizedPnl }`. |
| GET | `/api/portfolio/holdings` | All holdings with current unrealized PnL, allocation %. Uses latest snapshot + latest quotes for mark prices. |
| GET | `/api/portfolio/holdings/[symbol]` | Single holding detail: lots, transactions, realized + unrealized PnL. Calls `processTransactions()` for live lot computation. |

**Portfolio snapshot endpoint detail:**
1. Parse `window` param → compute `startDate` from window name (e.g., `1M` → 30 calendar days back, then find nearest trading day).
2. Call `queryPortfolioWindow()` from analytics package with Prisma-backed dependencies.
3. If no snapshots exist for the range, trigger a rebuild first (lazy rebuild on read).
4. Return:
   ```json
   {
     "totalValue": "125430.50",
     "totalCostBasis": "110200.00",
     "unrealizedPnl": "15230.50",
     "realizedPnl": "3200.00",
     "dayChange": { "amount": "450.25", "percentage": "0.36" },
     "holdings": [
       { "symbol": "AAPL", "name": "Apple Inc.", "qty": "50", "price": "185.50", "value": "9275.00", "costBasis": "8500.00", "unrealizedPnl": "775.00", "unrealizedPnlPct": "9.12", "allocation": "7.40" }
     ],
     "window": { "startDate": "2026-01-21", "endDate": "2026-02-21", "startValue": "120300.00", "endValue": "125430.50", "changeAmount": "5130.50", "changePct": "4.27" }
   }
   ```

**Holdings/[symbol] endpoint detail:**
1. Look up instrument by symbol (not ID — URL uses symbol for readability).
2. Fetch all transactions for this instrument, ordered by `tradeAt` ASC.
3. Call `processTransactions()` from analytics package → get lots + realized trades.
4. Get latest quote for mark price.
5. Compute unrealized PnL per lot using mark price.
6. Return full position detail.

#### Market Data Endpoints (Spec 8.4)

| Method | Route | Behavior |
|--------|-------|----------|
| GET | `/api/market/quote` | Latest quote. Param: `symbol`. Returns cached `LatestQuote` from DB. |
| GET | `/api/market/history` | Daily bars. Params: `symbol`, `startDate`, `endDate`. Returns from `PriceBar` table. |
| GET | `/api/market/search` | Symbol search. Param: `q`. Proxies to market data service `searchSymbols()`. |
| POST | `/api/market/refresh` | Trigger manual quote refresh for all instruments. Respects rate limits. Returns refresh status. |
| GET | `/api/market/status` | Data health summary per Spec 8.4 response shape. |

**Market status endpoint (Spec 8.4 response shape):**
```typescript
{
  instrumentCount: number,
  pollingInterval: number,           // from env POLL_INTERVAL_MARKET_HOURS
  pollingActive: boolean,            // MarketCalendar.isMarketOpen(now)
  budget: {
    provider: "fmp",
    usedToday: number,               // from rate limiter state
    dailyLimit: number               // from env FMP_RPD
  },
  freshness: {
    allFreshWithinMinutes: number | null,
    staleInstruments: [{ symbol, lastUpdated, minutesStale }]
  }
}
```

**Rate limiter state access:** The rate limiter lives in `packages/market-data/`. The endpoint reads its state (calls consumed today) — it does not reset or modify it. If the rate limiter doesn't expose a `getUsage()` method yet, add one.

**Manual refresh flow:**
1. Get all instruments from DB.
2. For each instrument, call market data service `getQuote()` (respecting rate limits).
3. Update `LatestQuote` table.
4. Return summary: `{ refreshed: number, failed: number, rateLimited: boolean }`.

---

## 4. Shared Concerns

### Decimal Serialization Rule

All Decimal values in API responses are serialized as **strings**. The UI layer parses them at render time. This is a hard rule from Spec 2.5.

```typescript
// ✅ Correct
{ "price": "185.50", "qty": "100", "pnl": "-230.75" }

// ❌ Wrong (float drift risk in JSON parsing)
{ "price": 185.50, "qty": 100, "pnl": -230.75 }
```

### Prisma Transaction Context

For transaction writes that trigger snapshot rebuilds, the entire operation (validate → insert/update/delete → rebuild) should ideally run inside a Prisma interactive transaction (`prisma.$transaction(async (tx) => { ... })`). This ensures atomicity — if the rebuild fails, the transaction write is rolled back.

However, if `rebuildSnapshotsFrom()` doesn't accept a Prisma transaction client, it can be called after the write commit. Document which approach was taken and why.

### Error Response Consistency

Both teammates use the same error response factory from `apps/web/src/lib/errors.ts`. This file is in Teammate 1's scope but should be created early so Teammate 2 can import it.

**Suggested pattern:**
```typescript
export function apiError(status: number, code: string, message: string, details?: Record<string, unknown>) {
  return Response.json({ error: code, message, details }, { status });
}
```

---

## 5. Integration Points Between Teammates

| Point | Owner | Consumer | Resolution |
|-------|-------|----------|------------|
| `PrismaPriceLookup` | Teammate 2 | Teammate 1 (rebuild trigger) | Teammate 2 creates in `apps/web/src/lib/prisma-price-lookup.ts`. Teammate 1 imports. |
| `PrismaSnapshotStore` | Teammate 2 | Teammate 1 (rebuild trigger) | Teammate 2 creates in `apps/web/src/lib/prisma-snapshot-store.ts`. Teammate 1 imports. |
| `errors.ts` | Teammate 1 | Teammate 2 | Teammate 1 creates early. Teammate 2 imports. |
| Prisma singleton | Lead (setup) | Both | Created in lead setup at `apps/web/src/lib/prisma.ts`. |
| Rate limiter state | Teammate 2 | Teammate 2 only | May need to add `getUsage()` to rate limiter in `packages/market-data/`. |

**Conflict mitigation:** No teammate touches the other's filesystem scope. The only shared files are `prisma.ts` (lead creates) and `errors.ts` (Teammate 1 creates, Teammate 2 reads). Both teammates import from `@stalker/analytics` and `@stalker/market-data` but do not modify those packages (except Teammate 2 adding `getUsage()` if needed).

---

## 6. What Is NOT In Scope

- `POST /api/transactions/bulk` — deferred to Session 9 (Next priority, not MVP core).
- Advisor endpoints (`/api/advisor/*`) — Session 8.
- UI pages — Sessions 5–7.
- Scheduler modifications — Session 2 delivered this.
- Any changes to the analytics engine internals — Session 3 delivered this. This session only *wires* it to Prisma and HTTP.

---

## 7. Spec References

| Area | Spec Section |
|------|-------------|
| Instrument schema | 4.2 (Instrument table) |
| Transaction schema + sell invariant | 4.2 (Transaction table) |
| PriceBar schema | 4.2 (PriceBar table) |
| LatestQuote schema | 4.2 (LatestQuote table) |
| PortfolioValueSnapshot schema | 4.2 (PortfolioValueSnapshot table) |
| Exchange timezone mapping | 2.2 |
| Decimal serialization | 2.5 |
| Analytics engine interfaces | 5.1–5.6 |
| Market data provider interface | 6.1 |
| Rate limiter | 6.4 |
| Provider fallback | 6.5 |
| Instrument endpoints | 8.1 |
| Transaction endpoints | 8.2 |
| Portfolio analytics endpoints | 8.3 |
| Market data endpoints | 8.4 |
| Market status response shape | 8.4 |
| Market data error handling | 11.1 |
| Analytics error handling | 11.2 |

---

## 8. Exit Criteria

### Must Pass (Blocking) — 16 items

- [ ] **Lead setup complete:** Prisma client generates, DB schema synced, seed script works, prisma singleton exists, dead code removed, all 218 baseline tests pass.
- [ ] **Instrument POST** creates instrument with correct `exchangeTz` and `providerSymbolMap`, triggers historical backfill, sets `firstBarDate`.
- [ ] **Instrument GET** (list) returns all instruments ordered by symbol.
- [ ] **Instrument GET** (by ID) returns instrument or 404.
- [ ] **Instrument DELETE** cascades to transactions + price bars + quotes, triggers snapshot rebuild.
- [ ] **Transaction POST** validates sell invariant, inserts, triggers `rebuildSnapshotsFrom()`. Returns 422 with structured error on violation.
- [ ] **Transaction GET** supports filtering by `instrumentId`, `startDate`, `endDate`, `type`.
- [ ] **Transaction PUT** re-validates sell invariant for affected instrument, triggers rebuild from earliest affected date.
- [ ] **Transaction DELETE** re-validates remaining transactions, triggers rebuild.
- [ ] **Portfolio snapshot** returns correct totals, holdings breakdown, and window comparisons using `queryPortfolioWindow()`.
- [ ] **Portfolio timeseries** returns date-ordered value series from snapshot cache.
- [ ] **Portfolio holdings** returns all holdings with unrealized PnL and allocation %.
- [ ] **Portfolio holdings/[symbol]** returns lot detail, transactions, and per-lot unrealized PnL.
- [ ] **Market data endpoints** (quote, history, search, refresh, status) all functional.
- [ ] All Decimal values serialized as strings in every API response.
- [ ] `tsc --noEmit` — zero errors across entire monorepo.

### Test Targets (Blocking)

- [ ] Total tests: **260+** (currently 218; need 42+ new tests)
- [ ] New integration tests: **35+** (covering all endpoint methods and key error paths)
- [ ] All existing 218 tests still pass (no regressions).

### Should Pass — 8 items

- [ ] `PrismaPriceLookup` correctly implements carry-forward (`date <= ? ORDER BY date DESC LIMIT 1`).
- [ ] `PrismaSnapshotStore` correctly implements upsert, deleteFrom, getRange, getLatest.
- [ ] Sell validation error includes `instrumentSymbol`, `firstViolationDate`, and `deficitQuantity`.
- [ ] Transaction DELETE correctly detects when removing a BUY would invalidate a later SELL.
- [ ] Market status endpoint returns correct `pollingActive` based on `MarketCalendar.isMarketOpen()`.
- [ ] Manual refresh respects rate limits and returns meaningful summary.
- [ ] Instrument creation handles duplicate symbol with 409 Conflict.
- [ ] CLAUDE.md updated with API endpoint patterns and Session 5 integration notes.

---

## 9. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `rebuildSnapshotsFrom()` signature doesn't accept Prisma tx context | Medium | Medium | Call rebuild after commit. Document approach. Acceptable for single-user. |
| Historical backfill timeout on deep history | Low | Low | Synchronous is fine for single user. Log timing. Timeout at 30s if needed. |
| Rate limiter doesn't expose usage state | Medium | Low | Teammate 2 adds `getUsage()` method — small, self-contained change. |
| Integration test flakiness with real SQLite | Low | Medium | Use in-memory SQLite or test-scoped DB file with cleanup. |
| Teammate file scope conflict on shared types | Low | Low | Both teammates import from packages; neither modifies them. |

---

## 10. Checklist Matrix (from Master Plan Section 5)

**Session 4 applies: Backend: API & Contracts, Security, Performance**

- [ ] All endpoints validate input before processing
- [ ] Error responses follow consistent schema
- [ ] No raw Prisma errors leak to API responses
- [ ] Decimal precision maintained end-to-end (DB → API response)
- [ ] No SQL injection vectors (Prisma parameterizes, but verify raw queries if any)
- [ ] Rate limit state not modifiable via API (read-only in status endpoint)
- [ ] Snapshot rebuild performance acceptable (<2s for reference portfolio scale)
- [ ] API responses include appropriate HTTP status codes
