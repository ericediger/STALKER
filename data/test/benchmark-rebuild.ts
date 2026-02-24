/**
 * Snapshot Rebuild Performance Benchmark
 *
 * Generates 20 instruments with 200+ transactions and corresponding mock daily
 * price bars, then times a full snapshot rebuild from scratch.
 *
 * This is a standalone script (NOT a Vitest test) because benchmark timing
 * depends on machine hardware and is too variable for CI assertions.
 *
 * Usage:
 *   npx tsx data/test/benchmark-rebuild.ts
 *
 * Expected: < 1000ms for full rebuild
 */

import {
  Decimal,
  toDecimal,
  add,
  ZERO,
} from '@stalker/shared';
import type {
  Transaction,
  Instrument,
  InstrumentType,
  TransactionType,
} from '@stalker/shared';
import {
  buildPortfolioValueSeries,
  MockPriceLookup,
  MockSnapshotStore,
} from '@stalker/analytics';
import type { CalendarFns } from '@stalker/analytics';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const NUM_INSTRUMENTS = 20;
const NUM_TRANSACTIONS = 220;
const START_DATE = '2024-06-01'; // ~2 years of trading days
const END_DATE = '2026-02-20';
const THRESHOLD_MS = 1000;

// ---------------------------------------------------------------------------
// Deterministic pseudo-random for reproducible benchmarks
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let state = seed;
  return (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(42);

function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function randDecimal(min: number, max: number, dp: number = 2): Decimal {
  const val = min + rand() * (max - min);
  return toDecimal(val.toFixed(dp));
}

// ---------------------------------------------------------------------------
// Calendar utility
// ---------------------------------------------------------------------------

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

function parseDateStr(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}

function toDateStr(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ---------------------------------------------------------------------------
// Generate trading days in range
// ---------------------------------------------------------------------------

function getTradingDays(start: string, end: string): string[] {
  const days: string[] = [];
  let current = parseDateStr(start);
  const endObj = parseDateStr(end);

  while (current <= endObj) {
    if (testCalendar.isTradingDay(current, 'NYSE')) {
      days.push(toDateStr(current));
    }
    current = new Date(current);
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return days;
}

// ---------------------------------------------------------------------------
// Generate synthetic data
// ---------------------------------------------------------------------------

function generateInstruments(): Instrument[] {
  const symbols = [
    'AAPL', 'MSFT', 'GOOG', 'AMZN', 'META',
    'TSLA', 'NVDA', 'AMD', 'INTC', 'NFLX',
    'VTI', 'QQQ', 'SPY', 'IWM', 'DIA',
    'XLF', 'XLK', 'XLE', 'XLV', 'XLI',
  ];

  return symbols.slice(0, NUM_INSTRUMENTS).map((symbol, idx): Instrument => ({
    id: `BENCH${String(idx).padStart(22, '0')}`,
    symbol,
    name: `Benchmark ${symbol}`,
    type: (idx < 10 ? 'STOCK' : 'ETF') as InstrumentType,
    currency: 'USD',
    exchange: 'NYSE',
    exchangeTz: 'America/New_York',
    providerSymbolMap: {},
    firstBarDate: START_DATE,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
}

function generatePriceBars(
  instruments: Instrument[],
  tradingDays: string[],
): Record<string, Array<{ date: string; close: Decimal }>> {
  const bars: Record<string, Array<{ date: string; close: Decimal }>> = {};

  for (const inst of instruments) {
    // Start each instrument at a random base price
    let price = randInt(50, 500);
    const instBars: Array<{ date: string; close: Decimal }> = [];

    for (const day of tradingDays) {
      // Random walk: +/- up to 3%
      const change = 1 + (rand() - 0.5) * 0.06;
      price = Math.max(10, price * change);
      instBars.push({
        date: day,
        close: toDecimal(price.toFixed(2)),
      });
    }

    bars[inst.id] = instBars;
  }

  return bars;
}

function generateTransactions(
  instruments: Instrument[],
  tradingDays: string[],
): Transaction[] {
  const transactions: Transaction[] = [];
  // Track positions to generate valid sells
  const positions: Map<string, Decimal> = new Map();

  // Distribute transactions evenly across the date range
  const txDates = tradingDays.filter(() => rand() < NUM_TRANSACTIONS / tradingDays.length);

  let txCount = 0;
  for (const date of txDates) {
    if (txCount >= NUM_TRANSACTIONS) break;

    const inst = instruments[randInt(0, instruments.length - 1)]!;
    const currentPos = positions.get(inst.id) ?? ZERO;

    // 75% BUY, 25% SELL (if position exists)
    const isSell = rand() < 0.25 && currentPos.greaterThan(ZERO);
    const type: TransactionType = isSell ? 'SELL' : 'BUY';

    let quantity: Decimal;
    if (isSell) {
      // Sell between 10% and 50% of position
      const sellFraction = 0.1 + rand() * 0.4;
      const sellQty = Math.max(1, Math.floor(Number(currentPos.toString()) * sellFraction));
      quantity = toDecimal(String(sellQty));
    } else {
      quantity = toDecimal(String(randInt(5, 100)));
    }

    const price = randDecimal(50, 500, 2);
    const fees = randDecimal(0, 10, 2);

    // Update position tracking
    if (type === 'BUY') {
      positions.set(inst.id, add(currentPos, quantity));
    } else {
      positions.set(inst.id, currentPos.minus(quantity));
    }

    transactions.push({
      id: `BENCHTX${String(txCount).padStart(19, '0')}`,
      instrumentId: inst.id,
      type,
      quantity,
      price,
      fees,
      tradeAt: new Date(date + 'T14:30:00.000Z'),
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    txCount++;
  }

  // Sort by tradeAt
  transactions.sort((a, b) => a.tradeAt.getTime() - b.tradeAt.getTime());

  return transactions;
}

// ---------------------------------------------------------------------------
// Main benchmark
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('STALKER Snapshot Rebuild Performance Benchmark');
  console.log('='.repeat(60));

  // Generate data
  const tradingDays = getTradingDays(START_DATE, END_DATE);
  const instruments = generateInstruments();
  const priceBarsMap = generatePriceBars(instruments, tradingDays);
  const transactions = generateTransactions(instruments, tradingDays);

  // Count total price bars
  let totalBars = 0;
  for (const bars of Object.values(priceBarsMap)) {
    totalBars += bars.length;
  }

  console.log(`\nData generated:`);
  console.log(`  Instruments:    ${instruments.length}`);
  console.log(`  Transactions:   ${transactions.length}`);
  console.log(`  Price bars:     ${totalBars}`);
  console.log(`  Trading days:   ${tradingDays.length}`);
  console.log(`  Date range:     ${START_DATE} to ${END_DATE}`);

  // Setup mocks
  const priceLookup = new MockPriceLookup(priceBarsMap);
  const store = new MockSnapshotStore();

  // Warm-up run (JIT, module loading, etc.)
  console.log(`\nWarm-up run...`);
  await buildPortfolioValueSeries({
    transactions: transactions.slice(0, 10),
    instruments: instruments.slice(0, 2),
    priceLookup,
    snapshotStore: new MockSnapshotStore(),
    calendar: testCalendar,
    startDate: START_DATE,
    endDate: '2024-07-01',
  });

  // Benchmark run
  console.log(`\nBenchmark: Full snapshot rebuild...`);
  const start = performance.now();

  await buildPortfolioValueSeries({
    transactions,
    instruments,
    priceLookup,
    snapshotStore: store,
    calendar: testCalendar,
    startDate: START_DATE,
    endDate: END_DATE,
  });

  const elapsed = performance.now() - start;
  const snapshots = store.getAll();

  console.log(`\nResults:`);
  console.log(`  Elapsed:        ${elapsed.toFixed(1)} ms`);
  console.log(`  Snapshots:      ${snapshots.length}`);
  console.log(`  Threshold:      ${THRESHOLD_MS} ms`);
  console.log(`  Status:         ${elapsed < THRESHOLD_MS ? 'PASS' : 'FAIL'}`);

  if (elapsed >= THRESHOLD_MS) {
    console.log(`\nWARNING: Rebuild took ${elapsed.toFixed(1)}ms, exceeding ${THRESHOLD_MS}ms threshold.`);
    process.exit(1);
  } else {
    console.log(`\nBenchmark passed: ${elapsed.toFixed(1)}ms < ${THRESHOLD_MS}ms`);
    process.exit(0);
  }
}

main().catch((err: unknown) => {
  console.error('Benchmark error:', err);
  process.exit(2);
});
