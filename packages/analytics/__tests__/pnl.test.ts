import { describe, it, expect } from 'vitest';
import { computeUnrealizedPnL, computeRealizedPnL, computeHoldingSummary } from '../src/pnl.js';
import { toDecimal, ZERO } from '@stalker/shared';
import type { Lot, RealizedTrade } from '@stalker/shared';

function makeLot(overrides: {
  remainingQty: string;
  price: string;
  originalQty?: string;
  costBasisRemaining?: string;
}): Lot {
  const qty = toDecimal(overrides.remainingQty);
  const price = toDecimal(overrides.price);
  return {
    instrumentId: 'test-instrument',
    openedAt: new Date('2025-01-01'),
    originalQty: toDecimal(overrides.originalQty ?? overrides.remainingQty),
    remainingQty: qty,
    price,
    costBasisRemaining: toDecimal(overrides.costBasisRemaining ?? qty.times(price).toString()),
  };
}

function makeRealizedTrade(overrides: {
  qty: string;
  proceeds: string;
  costBasis: string;
  realizedPnl: string;
  fees?: string;
}): RealizedTrade {
  return {
    instrumentId: 'test-instrument',
    sellDate: new Date('2025-01-15'),
    qty: toDecimal(overrides.qty),
    proceeds: toDecimal(overrides.proceeds),
    costBasis: toDecimal(overrides.costBasis),
    realizedPnl: toDecimal(overrides.realizedPnl),
    fees: toDecimal(overrides.fees ?? '0'),
  };
}

describe('computeUnrealizedPnL', () => {
  it('computes unrealized gain for a single lot', () => {
    const lots = [makeLot({ remainingQty: '100', price: '10' })];
    const result = computeUnrealizedPnL(lots, toDecimal('12'));

    expect(result.totalUnrealized.toString()).toBe('200'); // (12-10)*100
    expect(result.perLot).toHaveLength(1);
    expect(result.perLot[0]!.unrealizedPnl.toString()).toBe('200');
  });

  it('computes unrealized loss for a single lot', () => {
    const lots = [makeLot({ remainingQty: '50', price: '20' })];
    const result = computeUnrealizedPnL(lots, toDecimal('15'));

    expect(result.totalUnrealized.toString()).toBe('-250'); // (15-20)*50
  });

  it('computes unrealized PnL across multiple lots', () => {
    const lots = [
      makeLot({ remainingQty: '100', price: '10' }),
      makeLot({ remainingQty: '50', price: '12' }),
    ];
    const result = computeUnrealizedPnL(lots, toDecimal('15'));

    // Lot 1: (15-10)*100 = 500
    // Lot 2: (15-12)*50 = 150
    // Total: 650
    expect(result.totalUnrealized.toString()).toBe('650');
    expect(result.perLot).toHaveLength(2);
    expect(result.perLot[0]!.unrealizedPnl.toString()).toBe('500');
    expect(result.perLot[1]!.unrealizedPnl.toString()).toBe('150');
  });

  it('returns zero unrealized PnL for empty lots', () => {
    const result = computeUnrealizedPnL([], toDecimal('100'));
    expect(result.totalUnrealized.toString()).toBe('0');
    expect(result.perLot).toHaveLength(0);
  });
});

describe('computeRealizedPnL', () => {
  it('sums realized PnL across multiple trades', () => {
    const trades = [
      makeRealizedTrade({ qty: '50', proceeds: '750', costBasis: '500', realizedPnl: '250' }),
      makeRealizedTrade({ qty: '30', proceeds: '360', costBasis: '300', realizedPnl: '60' }),
    ];

    const result = computeRealizedPnL(trades);
    expect(result.toString()).toBe('310'); // 250 + 60
  });

  it('returns zero for empty trades list', () => {
    const result = computeRealizedPnL([]);
    expect(result.toString()).toBe('0');
  });

  it('handles mix of gains and losses', () => {
    const trades = [
      makeRealizedTrade({ qty: '50', proceeds: '750', costBasis: '500', realizedPnl: '250' }),
      makeRealizedTrade({ qty: '30', proceeds: '300', costBasis: '450', realizedPnl: '-150' }),
    ];

    const result = computeRealizedPnL(trades);
    expect(result.toString()).toBe('100'); // 250 + (-150)
  });
});

describe('computeHoldingSummary', () => {
  it('computes a complete holding summary with unrealized and realized PnL', () => {
    const lots = [
      makeLot({ remainingQty: '40', price: '10', originalQty: '100', costBasisRemaining: '400' }),
    ];
    const trades = [
      makeRealizedTrade({ qty: '60', proceeds: '900', costBasis: '600', realizedPnl: '300' }),
    ];

    const summary = computeHoldingSummary(
      'inst-1',
      'AAPL',
      lots,
      trades,
      toDecimal('15'),
    );

    expect(summary.instrumentId).toBe('inst-1');
    expect(summary.symbol).toBe('AAPL');
    expect(summary.totalQty.toString()).toBe('40');
    expect(summary.totalCostBasis.toString()).toBe('400');
    expect(summary.marketValue.toString()).toBe('600'); // 40 * 15
    expect(summary.unrealizedPnl.toString()).toBe('200'); // 600 - 400
    expect(summary.unrealizedPnlPercent.toString()).toBe('0.5'); // 200 / 400
    expect(summary.realizedPnl.toString()).toBe('300');
    expect(summary.lots).toHaveLength(1);
    expect(summary.realizedTrades).toHaveLength(1);
  });

  it('handles zero cost basis (no open lots) without division error', () => {
    const summary = computeHoldingSummary(
      'inst-1',
      'AAPL',
      [],
      [makeRealizedTrade({ qty: '100', proceeds: '1500', costBasis: '1000', realizedPnl: '500' })],
      toDecimal('15'),
    );

    expect(summary.totalQty.toString()).toBe('0');
    expect(summary.totalCostBasis.toString()).toBe('0');
    expect(summary.marketValue.toString()).toBe('0');
    expect(summary.unrealizedPnl.toString()).toBe('0');
    expect(summary.unrealizedPnlPercent.toString()).toBe('0'); // Should be ZERO, not NaN
    expect(summary.realizedPnl.toString()).toBe('500');
  });
});
