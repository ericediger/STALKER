/**
 * Cross-Validation Script for STALKER Reference Portfolio
 *
 * A standalone script that independently recomputes portfolio values, FIFO lot
 * states, and realized PnL from the reference-portfolio.json fixtures, then
 * compares every value against expected-outputs.json.
 *
 * THREE independent validation paths:
 *   Part A: Uses @stalker/analytics engine (processTransactions, buildPortfolioValueSeries)
 *   Part B: Fully independent FIFO + valuation from scratch (no analytics engine)
 *   Part C: Cross-checks engine vs independent for consistency
 *
 * All financial math uses Decimal.js via @stalker/shared. No Number() on money.
 *
 * Usage:
 *   npx tsx data/test/cross-validate.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  Decimal,
  toDecimal,
  add,
  sub,
  mul,
  ZERO,
} from '@stalker/shared';
import type {
  Transaction,
  Instrument,
  TransactionType,
  InstrumentType,
} from '@stalker/shared';
import {
  processTransactions,
  computeRealizedPnL,
  buildPortfolioValueSeries,
  MockPriceLookup,
  MockSnapshotStore,
} from '@stalker/analytics';
import type { HoldingSnapshotEntry, CalendarFns } from '@stalker/analytics';

// ---------------------------------------------------------------------------
// Load fixture files
// ---------------------------------------------------------------------------

const fixtureDir = path.resolve(__dirname);
const refPortfolio = JSON.parse(
  fs.readFileSync(path.join(fixtureDir, 'reference-portfolio.json'), 'utf-8'),
) as {
  instruments: Array<Record<string, unknown>>;
  transactions: Array<Record<string, unknown>>;
  priceBars: Record<string, Array<{ date: string; close: string }>>;
};

const expectedOutputs = JSON.parse(
  fs.readFileSync(path.join(fixtureDir, 'expected-outputs.json'), 'utf-8'),
) as {
  checkpoints: Array<{
    date: string;
    dayIndex: number;
    description: string;
    expectedLotState: Record<
      string,
      Array<{
        openedAt: string;
        originalQty: string;
        remainingQty: string;
        costBasisPerShare: string;
        costBasisRemaining: string;
      }>
    >;
    expectedRealizedPnl: {
      cumulative: string;
      trades: Array<{
        instrument: string;
        sellDate: string;
        qty: string;
        proceeds: string;
        costBasis: string;
        realizedPnl: string;
      }>;
    };
    expectedPortfolioValue: {
      totalValue: string;
      totalCostBasis: string;
      unrealizedPnl: string;
      realizedPnl: string;
      holdings: Record<
        string,
        { qty: string; value: string; costBasis: string; isEstimated?: boolean }
      >;
    };
  }>;
};

// ---------------------------------------------------------------------------
// Converters: fixture JSON -> typed objects
// ---------------------------------------------------------------------------

function toInstrument(raw: Record<string, unknown>): Instrument {
  return {
    id: raw['id'] as string,
    symbol: raw['symbol'] as string,
    name: raw['name'] as string,
    type: raw['type'] as InstrumentType,
    currency: raw['currency'] as string,
    exchange: raw['exchange'] as string,
    exchangeTz: raw['exchangeTz'] as string,
    providerSymbolMap: (raw['providerSymbolMap'] ?? {}) as Record<string, string>,
    firstBarDate: (raw['firstBarDate'] ?? null) as string | null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function toTransaction(raw: Record<string, unknown>): Transaction {
  return {
    id: raw['id'] as string,
    instrumentId: raw['instrumentId'] as string,
    type: raw['type'] as TransactionType,
    quantity: toDecimal(raw['quantity'] as string),
    price: toDecimal(raw['price'] as string),
    fees: toDecimal(raw['fees'] as string),
    tradeAt: new Date(raw['tradeAt'] as string),
    notes: (raw['notes'] ?? null) as string | null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Build typed data
// ---------------------------------------------------------------------------

const instruments: Instrument[] = refPortfolio.instruments.map(toInstrument);
const allTransactions: Transaction[] = refPortfolio.transactions.map(toTransaction);

const idToSymbol = new Map<string, string>();
const symbolToId = new Map<string, string>();
for (const inst of instruments) {
  idToSymbol.set(inst.id, inst.symbol);
  symbolToId.set(inst.symbol, inst.id);
}

function buildPriceLookup(): MockPriceLookup {
  const bars: Record<string, Array<{ date: string; close: Decimal }>> = {};
  for (const [instrumentId, rawBars] of Object.entries(refPortfolio.priceBars)) {
    bars[instrumentId] = rawBars.map((b) => ({
      date: b.date,
      close: toDecimal(b.close),
    }));
  }
  return new MockPriceLookup(bars);
}

const testCalendar: CalendarFns = {
  isTradingDay(date: Date, _exchange: string): boolean {
    const day = date.getUTCDay();
    return day >= 1 && day <= 5;
  },
  getNextTradingDay(date: Date, _exchange: string): Date {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + 1);
    while (next.getUTCDay() === 0 || next.getUTCDay() === 6) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next;
  },
};

function getTransactionsForInstrument(
  symbol: string,
  upToDate: string,
): Transaction[] {
  const instrumentId = symbolToId.get(symbol);
  if (!instrumentId) return [];
  const endOfDay = new Date(upToDate + 'T23:59:59.999Z');
  return allTransactions
    .filter((tx) => tx.instrumentId === instrumentId && tx.tradeAt <= endOfDay)
    .sort((a, b) => a.tradeAt.getTime() - b.tradeAt.getTime());
}

// ---------------------------------------------------------------------------
// Independent FIFO calculation (no analytics engine)
// ---------------------------------------------------------------------------

interface IndependentLot {
  openedAt: string;
  originalQty: Decimal;
  remainingQty: Decimal;
  costBasisPerShare: Decimal;
  costBasisRemaining: Decimal;
}

interface IndependentResult {
  lots: IndependentLot[];
  realizedPnl: Decimal;
}

/**
 * Independently compute FIFO lots and realized PnL from raw transactions.
 * This duplicates the logic without using the analytics engine.
 */
function independentFIFO(transactions: Transaction[]): IndependentResult {
  const lots: IndependentLot[] = [];
  let totalRealizedPnl = ZERO;

  const sorted = [...transactions].sort(
    (a, b) => a.tradeAt.getTime() - b.tradeAt.getTime(),
  );

  for (const tx of sorted) {
    if (tx.type === 'BUY') {
      lots.push({
        openedAt: tx.tradeAt.toISOString(),
        originalQty: tx.quantity,
        remainingQty: tx.quantity,
        costBasisPerShare: tx.price,
        costBasisRemaining: mul(tx.quantity, tx.price),
      });
    } else {
      // SELL - FIFO from front
      let remainingToSell = tx.quantity;
      let lotIdx = 0;
      while (remainingToSell.greaterThan(ZERO) && lotIdx < lots.length) {
        const lot = lots[lotIdx]!;
        const consumed = Decimal.min(remainingToSell, lot.remainingQty);
        const proceeds = mul(consumed, tx.price);
        const costBasis = mul(consumed, lot.costBasisPerShare);
        totalRealizedPnl = add(totalRealizedPnl, sub(proceeds, costBasis));

        lot.remainingQty = sub(lot.remainingQty, consumed);
        lot.costBasisRemaining = sub(
          lot.costBasisRemaining,
          mul(consumed, lot.costBasisPerShare),
        );
        remainingToSell = sub(remainingToSell, consumed);

        if (lot.remainingQty.isZero()) {
          lots.splice(lotIdx, 1);
        } else {
          lotIdx++;
        }
      }
    }
  }

  return { lots, realizedPnl: totalRealizedPnl };
}

/**
 * Get the close price for an instrument on a date, with carry-forward.
 */
function getPrice(
  instrumentId: string,
  date: string,
): { price: Decimal; isEstimated: boolean } | null {
  const bars = refPortfolio.priceBars[instrumentId];
  if (!bars || bars.length === 0) return null;

  // Exact match
  const exact = bars.find((b) => b.date === date);
  if (exact) return { price: toDecimal(exact.close), isEstimated: false };

  // Carry-forward: most recent bar on or before date
  let best: { date: string; close: string } | undefined;
  for (const bar of bars) {
    if (bar.date <= date) {
      best = bar;
    } else {
      break;
    }
  }
  if (!best) return null;
  return { price: toDecimal(best.close), isEstimated: true };
}

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;
const failures: string[] = [];

function check(label: string, actual: string, expected: string): void {
  totalChecks++;
  if (actual === expected) {
    passedChecks++;
  } else {
    failedChecks++;
    const msg = `  FAIL: ${label} -- expected "${expected}", got "${actual}"`;
    failures.push(msg);
    console.log(msg);
  }
}

function section(title: string): void {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(70));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('STALKER Reference Portfolio Cross-Validation');
  console.log(`Date: ${new Date().toISOString().split('T')[0]}`);
  console.log(`Fixtures: ${fixtureDir}`);
  console.log(`Instruments: ${instruments.length}, Transactions: ${allTransactions.length}`);
  console.log(`Checkpoints: ${expectedOutputs.checkpoints.length}`);

  // =========================================================================
  // Part A: Engine-based validation (using @stalker/analytics)
  // =========================================================================
  section('PART A: Analytics Engine Validation');

  for (let cpIdx = 0; cpIdx < expectedOutputs.checkpoints.length; cpIdx++) {
    const cp = expectedOutputs.checkpoints[cpIdx]!;
    const cpLabel = `Checkpoint ${cpIdx + 1} (${cp.date})`;

    console.log(`\n--- ${cpLabel}: ${cp.description} ---`);

    // A1: Lot state per instrument
    for (const [symbol, expectedLots] of Object.entries(cp.expectedLotState)) {
      const txs = getTransactionsForInstrument(symbol, cp.date);
      const result = processTransactions(txs);

      check(
        `${cpLabel} ${symbol} lot count`,
        result.lots.length.toString(),
        expectedLots.length.toString(),
      );

      for (let i = 0; i < expectedLots.length; i++) {
        const lot = result.lots[i];
        const expected = expectedLots[i]!;
        if (lot) {
          check(
            `${cpLabel} ${symbol} lot[${i}] openedAt`,
            lot.openedAt.toISOString(),
            expected.openedAt,
          );
          check(
            `${cpLabel} ${symbol} lot[${i}] remainingQty`,
            lot.remainingQty.toString(),
            expected.remainingQty,
          );
          check(
            `${cpLabel} ${symbol} lot[${i}] costBasisPerShare`,
            lot.price.toString(),
            expected.costBasisPerShare,
          );
          check(
            `${cpLabel} ${symbol} lot[${i}] costBasisRemaining`,
            lot.costBasisRemaining.toString(),
            expected.costBasisRemaining,
          );
        }
      }
    }

    // A2: Realized PnL per trade
    for (const expectedTrade of cp.expectedRealizedPnl.trades) {
      const txs = getTransactionsForInstrument(expectedTrade.instrument, cp.date);
      const result = processTransactions(txs);

      const matchingTrades = result.realizedTrades.filter(
        (rt) =>
          rt.sellDate.toISOString() === expectedTrade.sellDate &&
          rt.qty.toString() === expectedTrade.qty,
      );

      if (matchingTrades.length > 0) {
        const trade = matchingTrades[0]!;
        check(
          `${cpLabel} ${expectedTrade.instrument} trade (sell ${expectedTrade.qty} at ${expectedTrade.sellDate.split('T')[0]}) proceeds`,
          trade.proceeds.toString(),
          expectedTrade.proceeds,
        );
        check(
          `${cpLabel} ${expectedTrade.instrument} trade (sell ${expectedTrade.qty} at ${expectedTrade.sellDate.split('T')[0]}) costBasis`,
          trade.costBasis.toString(),
          expectedTrade.costBasis,
        );
        check(
          `${cpLabel} ${expectedTrade.instrument} trade (sell ${expectedTrade.qty} at ${expectedTrade.sellDate.split('T')[0]}) realizedPnl`,
          trade.realizedPnl.toString(),
          expectedTrade.realizedPnl,
        );
      } else {
        failedChecks++;
        totalChecks++;
        const msg = `  FAIL: ${cpLabel} missing trade for ${expectedTrade.instrument} sell ${expectedTrade.qty} at ${expectedTrade.sellDate}`;
        failures.push(msg);
        console.log(msg);
      }
    }

    // A3: Cumulative realized PnL across all instruments
    const allSymbols = ['AAPL', 'MSFT', 'VTI', 'QQQ', 'SPY', 'INTC'];
    let cumulativeRealized = ZERO;
    for (const symbol of allSymbols) {
      const txs = getTransactionsForInstrument(symbol, cp.date);
      const result = processTransactions(txs);
      cumulativeRealized = add(cumulativeRealized, computeRealizedPnL(result.realizedTrades));
    }
    check(
      `${cpLabel} cumulative realized PnL`,
      cumulativeRealized.toString(),
      cp.expectedRealizedPnl.cumulative,
    );

    // A4: Portfolio value snapshot via buildPortfolioValueSeries
    const priceLookup = buildPriceLookup();
    const store = new MockSnapshotStore();

    await buildPortfolioValueSeries({
      transactions: allTransactions,
      instruments,
      priceLookup,
      snapshotStore: store,
      calendar: testCalendar,
      startDate: '2026-01-02',
      endDate: cp.date,
    });

    const snapshot = await store.getByDate(cp.date);
    if (!snapshot) {
      failedChecks++;
      totalChecks++;
      const msg = `  FAIL: ${cpLabel} -- no snapshot found for date ${cp.date}`;
      failures.push(msg);
      console.log(msg);
    } else {
      check(
        `${cpLabel} snapshot totalValue`,
        snapshot.totalValue.toString(),
        cp.expectedPortfolioValue.totalValue,
      );
      check(
        `${cpLabel} snapshot totalCostBasis`,
        snapshot.totalCostBasis.toString(),
        cp.expectedPortfolioValue.totalCostBasis,
      );
      check(
        `${cpLabel} snapshot unrealizedPnl`,
        snapshot.unrealizedPnl.toString(),
        cp.expectedPortfolioValue.unrealizedPnl,
      );
      check(
        `${cpLabel} snapshot realizedPnl`,
        snapshot.realizedPnl.toString(),
        cp.expectedPortfolioValue.realizedPnl,
      );

      const holdings = snapshot.holdingsJson as Record<string, HoldingSnapshotEntry>;
      for (const [symbol, expected] of Object.entries(cp.expectedPortfolioValue.holdings)) {
        if (!holdings[symbol]) {
          failedChecks++;
          totalChecks++;
          const msg = `  FAIL: ${cpLabel} -- holding ${symbol} not found in snapshot`;
          failures.push(msg);
          console.log(msg);
          continue;
        }
        check(
          `${cpLabel} ${symbol} snapshot qty`,
          holdings[symbol]!.qty.toString(),
          expected.qty,
        );
        check(
          `${cpLabel} ${symbol} snapshot value`,
          holdings[symbol]!.value.toString(),
          expected.value,
        );
        check(
          `${cpLabel} ${symbol} snapshot costBasis`,
          holdings[symbol]!.costBasis.toString(),
          expected.costBasis,
        );
        if (expected.isEstimated) {
          check(
            `${cpLabel} ${symbol} snapshot isEstimated`,
            String(holdings[symbol]!.isEstimated ?? false),
            'true',
          );
        }
      }
    }
  }

  // =========================================================================
  // Part B: Fully Independent Validation (no analytics engine)
  // =========================================================================
  section('PART B: Independent Calculation Cross-Check');

  for (let cpIdx = 0; cpIdx < expectedOutputs.checkpoints.length; cpIdx++) {
    const cp = expectedOutputs.checkpoints[cpIdx]!;
    const cpLabel = `Independent CP${cpIdx + 1} (${cp.date})`;

    console.log(`\n--- ${cpLabel}: ${cp.description} ---`);

    let indepTotalValue = ZERO;
    let indepTotalCostBasis = ZERO;
    let indepTotalRealized = ZERO;

    for (const symbol of ['AAPL', 'MSFT', 'VTI', 'QQQ', 'SPY', 'INTC']) {
      const instrumentId = symbolToId.get(symbol)!;
      const txs = getTransactionsForInstrument(symbol, cp.date);
      const result = independentFIFO(txs);

      // Accumulate realized PnL
      indepTotalRealized = add(indepTotalRealized, result.realizedPnl);

      // Compute holding values
      const totalQty = result.lots.reduce(
        (sum, lot) => add(sum, lot.remainingQty),
        ZERO,
      );
      const totalCostBasis = result.lots.reduce(
        (sum, lot) => add(sum, lot.costBasisRemaining),
        ZERO,
      );

      if (totalQty.isZero()) continue; // No position

      const priceResult = getPrice(instrumentId, cp.date);
      if (!priceResult) continue;

      const holdingValue = mul(totalQty, priceResult.price);
      indepTotalValue = add(indepTotalValue, holdingValue);
      indepTotalCostBasis = add(indepTotalCostBasis, totalCostBasis);

      // Compare per-holding values against expected
      const expectedHolding = cp.expectedPortfolioValue.holdings[symbol];
      if (expectedHolding) {
        check(`${cpLabel} ${symbol} qty`, totalQty.toString(), expectedHolding.qty);
        check(`${cpLabel} ${symbol} value`, holdingValue.toString(), expectedHolding.value);
        check(`${cpLabel} ${symbol} costBasis`, totalCostBasis.toString(), expectedHolding.costBasis);
      }
    }

    // Compare portfolio totals
    check(
      `${cpLabel} totalValue`,
      indepTotalValue.toString(),
      cp.expectedPortfolioValue.totalValue,
    );
    check(
      `${cpLabel} totalCostBasis`,
      indepTotalCostBasis.toString(),
      cp.expectedPortfolioValue.totalCostBasis,
    );
    check(
      `${cpLabel} unrealizedPnl`,
      sub(indepTotalValue, indepTotalCostBasis).toString(),
      cp.expectedPortfolioValue.unrealizedPnl,
    );
    check(
      `${cpLabel} cumulative realized PnL`,
      indepTotalRealized.toString(),
      cp.expectedRealizedPnl.cumulative,
    );
  }

  // =========================================================================
  // Part C: Engine vs Independent Cross-Check
  // =========================================================================
  section('PART C: Engine vs Independent Consistency');

  for (let cpIdx = 0; cpIdx < expectedOutputs.checkpoints.length; cpIdx++) {
    const cp = expectedOutputs.checkpoints[cpIdx]!;
    const cpLabel = `Consistency CP${cpIdx + 1} (${cp.date})`;

    console.log(`\n--- ${cpLabel} ---`);

    // Engine results
    const allSymbols = ['AAPL', 'MSFT', 'VTI', 'QQQ', 'SPY', 'INTC'];
    let engineRealized = ZERO;
    for (const symbol of allSymbols) {
      const txs = getTransactionsForInstrument(symbol, cp.date);
      const result = processTransactions(txs);
      engineRealized = add(engineRealized, computeRealizedPnL(result.realizedTrades));
    }

    // Independent results
    let indepRealized = ZERO;
    for (const symbol of allSymbols) {
      const txs = getTransactionsForInstrument(symbol, cp.date);
      const result = independentFIFO(txs);
      indepRealized = add(indepRealized, result.realizedPnl);
    }

    check(
      `${cpLabel} engine vs independent realized PnL`,
      engineRealized.toString(),
      indepRealized.toString(),
    );

    // Compare lot states
    for (const symbol of allSymbols) {
      const txs = getTransactionsForInstrument(symbol, cp.date);
      const engineResult = processTransactions(txs);
      const indepResult = independentFIFO(txs);

      check(
        `${cpLabel} ${symbol} lot count engine vs independent`,
        engineResult.lots.length.toString(),
        indepResult.lots.length.toString(),
      );

      const minLots = Math.min(engineResult.lots.length, indepResult.lots.length);
      for (let i = 0; i < minLots; i++) {
        const eLot = engineResult.lots[i]!;
        const iLot = indepResult.lots[i]!;
        check(
          `${cpLabel} ${symbol} lot[${i}] remainingQty engine vs independent`,
          eLot.remainingQty.toString(),
          iLot.remainingQty.toString(),
        );
        check(
          `${cpLabel} ${symbol} lot[${i}] costBasisRemaining engine vs independent`,
          eLot.costBasisRemaining.toString(),
          iLot.costBasisRemaining.toString(),
        );
      }
    }
  }

  // =========================================================================
  // Summary
  // =========================================================================
  section('CROSS-VALIDATION SUMMARY');

  console.log(`\nTotal checks:  ${totalChecks}`);
  console.log(`Passed:        ${passedChecks}`);
  console.log(`Failed:        ${failedChecks}`);

  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) {
      console.log(f);
    }
    console.log('\nRESULT: FAIL');
    process.exit(1);
  } else {
    console.log('\nAll checks passed.');
    console.log('\nRESULT: PASS');
    process.exit(0);
  }
}

main().catch((err: unknown) => {
  console.error('Cross-validation error:', err);
  process.exit(2);
});
