# SESSION-4-KICKOFF: API Layer

**Session:** 4 of 9
**Epic:** 3 (full)
**Mode:** PARALLEL
**Baseline:** 218 tests | `tsc --noEmit` clean | 3 packages built (shared, analytics, market-data)
**Read first:** SESSION-4-PLAN.md (full detail), SPEC_v4.md §8 (endpoints), SPEC_v4.md §4.2 (schemas)

---

## Quick Context

Sessions 1–3 built the packages: shared types, analytics engine (FIFO lots, value series, snapshots), market data providers, scheduler, and validation fixtures. Nothing is wired to HTTP yet. This session builds every API route that the UI (Sessions 5–7) will call.

**This is the first session that touches `apps/web/`.** All prior work lives in `packages/`.

---

## Lead Setup (Do First — Before Teammates Start)

```
1. Verify:  cd apps/web && npx prisma generate    → client OK
2. Sync DB: npx prisma db push                     → schema in SQLite
3. Create:  apps/web/src/lib/prisma.ts             → singleton PrismaClient
4. Create:  apps/web/prisma/seed.ts                → 1 instrument + 1 transaction + 1 price bar
5. Run:     npx prisma db seed                     → verify seed works
6. Clean:   Remove copyLots() from packages/analytics/src/value-series.ts (dead code)
7. Test:    pnpm test                              → all 218 pass
8. Commit:  "Session 4: Lead setup — Prisma client, seed, dead code cleanup"
```

---

## Teammate 1: `api-crud-engineer`

### Your Files
```
apps/web/src/app/api/instruments/route.ts
apps/web/src/app/api/instruments/[id]/route.ts
apps/web/src/app/api/transactions/route.ts
apps/web/src/app/api/transactions/[id]/route.ts
apps/web/src/lib/validators/                    (Zod schemas)
apps/web/src/lib/errors.ts                      (shared error factory)
apps/web/__tests__/api/instruments/
apps/web/__tests__/api/transactions/
```

### Build Order
1. **`errors.ts`** — Create shared error response factory first (Teammate 2 will import this).
   ```typescript
   export function apiError(status: number, code: string, message: string, details?: Record<string, unknown>) {
     return Response.json({ error: code, message, details }, { status });
   }
   ```

2. **Zod validators** — `instrumentInput.ts`, `transactionInput.ts`.

3. **Instrument CRUD:**
   - POST: validate → check duplicate (409) → map exchange→exchangeTz → build providerSymbolMap → insert → trigger backfill → set firstBarDate → return.
   - GET (list): all instruments, ordered by symbol ASC.
   - GET [id]: by ID, 404 if missing.
   - DELETE [id]: cascade delete (instrument + transactions + price bars + quotes) → rebuild snapshots.

4. **Transaction CRUD:**
   - POST: validate → **run sell validation** → insert → `rebuildSnapshotsFrom(tradeAt)` → return.
   - GET: filter by `instrumentId`, `startDate`, `endDate`, `type`.
   - PUT [id]: validate → **re-run sell validation** → update → rebuild from earliest affected date.
   - DELETE [id]: delete → **re-validate remaining** → rebuild from deleted tradeAt.

### Sell Validation (Critical — Get This Right)

For every POST/PUT/DELETE on transactions:
1. Assemble ALL transactions for the instrument, sorted by `tradeAt` ASC (including the new/modified one).
2. Walk the list. Track `cumulativeBuyQty` and `cumulativeSellQty` (Decimal).
3. If `cumulativeSellQty > cumulativeBuyQty` at ANY point → reject with 422:
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
4. On DELETE: removing a BUY can invalidate a later SELL. Always re-validate.

### Snapshot Rebuild Integration

After successful transaction write:
```typescript
import { rebuildSnapshotsFrom } from '@stalker/analytics';
import { PrismaPriceLookup } from '@/lib/prisma-price-lookup';     // Teammate 2 builds
import { PrismaSnapshotStore } from '@/lib/prisma-snapshot-store';  // Teammate 2 builds

await rebuildSnapshotsFrom({
  fromDate: affectedDate,
  priceLookup: new PrismaPriceLookup(prisma),
  snapshotStore: new PrismaSnapshotStore(prisma),
  // ... other dependencies per interface signature
});
```

If Teammate 2 hasn't finished these yet, **stub them** and wire up later. Don't block on this.

### Test Coverage
- Instrument: create, create duplicate (409), get list, get by id, get 404, delete cascade
- Transaction: create BUY, create SELL (valid), create SELL (invalid → 422), get with filters, edit, edit that violates (422), delete, delete that invalidates later sell (422)
- **Target: 18+ integration tests**

---

## Teammate 2: `api-analytics-engineer`

### Your Files
```
apps/web/src/app/api/portfolio/snapshot/route.ts
apps/web/src/app/api/portfolio/timeseries/route.ts
apps/web/src/app/api/portfolio/holdings/route.ts
apps/web/src/app/api/portfolio/holdings/[symbol]/route.ts
apps/web/src/app/api/market/quote/route.ts
apps/web/src/app/api/market/history/route.ts
apps/web/src/app/api/market/search/route.ts
apps/web/src/app/api/market/refresh/route.ts
apps/web/src/app/api/market/status/route.ts
apps/web/src/lib/prisma-price-lookup.ts
apps/web/src/lib/prisma-snapshot-store.ts
apps/web/src/lib/market-data-client.ts
apps/web/__tests__/api/portfolio/
apps/web/__tests__/api/market/
```

### Build Order
1. **`PrismaPriceLookup`** — Build this FIRST. Teammate 1 needs it for rebuild triggers.
   ```sql
   -- Core query
   SELECT close FROM PriceBar
   WHERE instrumentId = ? AND resolution = '1D' AND date <= ?
   ORDER BY date DESC LIMIT 1
   ```
   Returns `Decimal` or `null`. This is the carry-forward implementation.

2. **`PrismaSnapshotStore`** — Build this second. Also needed by Teammate 1.
   - `save(snapshot)` → upsert on date
   - `deleteFrom(date)` → delete WHERE date >= ?
   - `getRange(start, end)` → ORDER BY date ASC
   - `getLatest()` → ORDER BY date DESC LIMIT 1

3. **Portfolio endpoints:**
   - `GET /portfolio/snapshot` — Parse window param → compute date range → call `queryPortfolioWindow()` → return.
   - `GET /portfolio/timeseries` — Parse startDate/endDate → query SnapshotStore range → return array.
   - `GET /portfolio/holdings` — Get latest snapshot → enrich with latest quotes → compute allocation %.
   - `GET /portfolio/holdings/[symbol]` — Look up by symbol → call `processTransactions()` → get lots → compute per-lot unrealized PnL with latest quote price.

4. **Market data endpoints:**
   - `GET /market/quote?symbol=` → Query `LatestQuote` table.
   - `GET /market/history?symbol=&startDate=&endDate=` → Query `PriceBar` table.
   - `GET /market/search?q=` → Proxy to market data service `searchSymbols()`.
   - `POST /market/refresh` → For each instrument, call `getQuote()` respecting rate limits → update `LatestQuote`.
   - `GET /market/status` → Assemble response per Spec 8.4 shape. If rate limiter lacks `getUsage()`, add it.

### Key Rules
- **ALL Decimal values → string in JSON.** No exceptions.
- Import error factory from `@/lib/errors.ts` (Teammate 1 creates).
- Import prisma singleton from `@/lib/prisma.ts` (Lead creates).
- Holdings/[symbol] uses **symbol in URL**, not ID.
- Day change = latest quote − prior trading day close (use `MarketCalendar.getPriorTradingDay()`).

### Test Coverage
- PrismaPriceLookup: carry-forward works, null when no data, exact date match
- PrismaSnapshotStore: save, upsert, deleteFrom, getRange, getLatest
- Portfolio endpoints: snapshot with window, timeseries range, holdings list, holdings by symbol
- Market endpoints: quote, history, search proxy, refresh, status shape
- **Target: 20+ integration tests**

---

## Anti-Patterns to Avoid

| Don't | Do Instead |
|-------|-----------|
| Use `number` for any financial value in response JSON | Serialize all Decimal as string |
| Let Prisma errors leak to API response | Catch and wrap in `apiError()` |
| Hardcode exchange timezone | Use Spec 2.2 lookup table |
| Skip sell validation on DELETE | Always re-validate remaining transactions |
| Modify `packages/analytics/` source | Only import from it — it's frozen from Session 3 |
| Block on the other teammate's files | Stub the dependency and wire up later |
| Use `WidthType.PERCENTAGE` (wrong doc, but good pattern) | — |

---

## Verification Steps

After both teammates finish:

```bash
# 1. Type check
pnpm tsc --noEmit                    # zero errors

# 2. All tests
pnpm test                            # 260+ total, zero failures

# 3. Smoke test — create instrument via API
curl -X POST http://localhost:3000/api/instruments \
  -H "Content-Type: application/json" \
  -d '{"symbol":"AAPL","name":"Apple Inc.","type":"STOCK","exchange":"NASDAQ"}'
# → 201, instrument with exchangeTz="America/New_York", firstBarDate populated

# 4. Smoke test — create transaction
curl -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{"instrumentId":"<id_from_above>","type":"BUY","quantity":"100","price":"185.50","tradeAt":"2026-02-20T14:30:00Z"}'
# → 201, transaction created, snapshot rebuild triggered

# 5. Smoke test — portfolio snapshot
curl http://localhost:3000/api/portfolio/snapshot?window=1M
# → 200, JSON with totalValue, holdings array, all values as strings

# 6. Smoke test — sell validation
curl -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{"instrumentId":"<id>","type":"SELL","quantity":"200","price":"190.00","tradeAt":"2026-02-21T10:00:00Z"}'
# → 422, SELL_VALIDATION_FAILED with deficitQuantity="100.00"

# 7. Smoke test — market status
curl http://localhost:3000/api/market/status
# → 200, { instrumentCount, pollingInterval, budget, freshness }
```

---

## Definition of Done

- [ ] All 16 Must Pass exit criteria met (see SESSION-4-PLAN.md §8)
- [ ] 260+ total tests, all green
- [ ] `tsc --noEmit` clean
- [ ] All 7 smoke tests pass
- [ ] CLAUDE.md updated with API patterns + Session 5 notes
- [ ] Committed and pushed
