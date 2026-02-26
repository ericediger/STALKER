# SESSION-12-KICKOFF: API Wiring + Pipeline Soak

**Session:** 12 of 13
**Epic:** 11 (completion)
**Mode:** LEAD PHASE 0 (blocking) → 2 PARALLEL TEAMMATES
**Prerequisite:** Session 11 complete (526 tests, 0 type errors)

---

## Before You Start

Read these files first:
- `SESSION-12-PLAN.md` (full session plan — Phase 0, teammate specs, exit criteria)
- `STALKER_PHASE-II_ADDENDUM.md` (binding provider info — overrides older docs)
- `CLAUDE.md`, `AGENTS.md`, `HANDOFF.md` (project conventions and current state)
- `data/test/provider-smoke-results.md` (real API response shapes from Phase 0)

---

## Phase 0: API Stub Wiring (Lead — Blocking Gate)

**You must complete Phase 0 and verify V-1 through V-3 before launching either teammate.**

### Tasks

1. **Create `apps/web/src/lib/market-data-service.ts`** — singleton factory that initializes FMP, Tiingo, and Alpha Vantage providers from env vars. Adjust constructor to match actual `MarketDataService` class signature.

2. **Wire `/api/market/search/route.ts`** — replace mock response with call to `getMarketDataService().searchSymbols(q)`. FMP search returns no `type` field — default to `"STOCK"`.

3. **Wire `/api/market/refresh/route.ts`** — iterate all instruments, call `getQuote()` for each, update `LatestQuote` table. Return `{ refreshed, failed, rateLimited }`.

4. **Wire instrument creation backfill** — after `POST /api/instruments` creates the instrument, call `getMarketDataService().getHistory()` via Tiingo. Bulk insert bars into `PriceBar` table. Set `firstBarDate` from earliest bar.

### Verification (all must pass)

```bash
# Start dev server
pnpm dev

# V-1: Search returns live FMP results
curl "http://localhost:3000/api/market/search?q=AAPL"
# Should return real search results, not mock data

# V-2: Refresh updates quotes
curl -X POST "http://localhost:3000/api/market/refresh"
# Should return { refreshed: N, failed: 0 }

# V-3: Instrument creation triggers backfill
# Create a test instrument and verify PriceBar table has rows
```

**If any verification fails, fix before proceeding.**

---

## Phase 1: Parallel Teammates

Launch both teammates simultaneously after Phase 0 passes.

### Teammate 1: `pipeline-soak-engineer`

**Scope:** Add 15 real instruments, verify backfill quality, monitor polling, validate data integrity.

**Filesystem:** `data/test/` (new files), `apps/web/__tests__/api/` (new test files). Do NOT modify provider code or API routes.

**Key deliverables:**
- `data/test/soak-instruments.json` — 15 real instruments (AAPL, MSFT, GOOGL, VTI, QQQ, SPY, BND, CRWD, SQ, VXUS, VNQ, XLK, AGG, BRK-B, and one more)
- `data/test/verify-backfill.ts` — creates each instrument, verifies bar count, date range, data quality
- `data/test/verify-polling.ts` — monitors one scheduler poll cycle, verifies quotes updated
- Vitest integration tests wrapping verification scripts
- Target: 20+ new tests

**Data quality checks per instrument:**
- No zero-price bars
- No gaps > 5 trading days
- High >= Low, Close within range
- `firstBarDate` matches earliest bar
- BRK-B specifically: Tiingo symbol mapping works

### Teammate 2: `hardening-engineer`

**Scope:** Regression tests, rate limiter integration tests, documentation updates.

**Filesystem:** `packages/market-data/__tests__/` (new test files), `apps/web/__tests__/` (new test files), documentation files. Do NOT modify API routes or provider implementations.

**Key deliverables:**
- Tiingo HTTP 200 rate limit regression test (mock returns `"You have exceeded..."`, assert ProviderError)
- Rate limiter per-hour bucket tests (8+ tests): 50 allowed, 51st blocked, sliding window reset
- Fallback chain error simulation tests (5+ tests): FMP 500 → cache → AV
- Decimal precision E2E round-trip test (write precise price, read back, exact string match)
- Documentation: update KNOWN-LIMITATIONS.md, HANDOFF.md, clean `/api/v3/` references
- Target: 15+ new tests

---

## Phase 2: Lead Integration

After both teammates complete:

1. `pnpm tsc --noEmit` — 0 errors
2. `pnpm test` — 560+ tests, 0 failures
3. **Full E2E smoke in browser:**
   - Search for VTI → live results
   - Add VTI → backfill occurs, toast confirms
   - Add a BUY transaction → dashboard shows live portfolio value
   - Wait for scheduler poll → quotes update
   - Open advisor → ask about portfolio → uses live data
4. Verify API budget consumption is within expected bounds
5. Update HANDOFF.md, CLAUDE.md, AGENTS.md
6. Commit and push

---

## Definition of Done

- [ ] `/api/market/search` returns live FMP results (not mock)
- [ ] `/api/market/refresh` updates LatestQuote for all instruments
- [ ] Instrument creation triggers Tiingo backfill automatically
- [ ] 15 instruments backfilled with correct bar counts and date ranges
- [ ] BRK-B backfills correctly (hyphen symbol mapping)
- [ ] No zero-price or invalid bars in backfilled data
- [ ] Tiingo 200 rate limit treated as error (regression test)
- [ ] Rate limiter per-hour bucket tested
- [ ] Decimal precision survives full-stack round-trip
- [ ] `tsc --noEmit` — 0 errors
- [ ] `pnpm test` — 560+ tests, 0 failures
- [ ] E2E smoke passes in browser with live data
- [ ] Documentation updated
- [ ] Committed and pushed
