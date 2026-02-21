import { describe, it, expect } from 'vitest';
import { processTransactions } from '../src/lot-engine.js';
import { Decimal, toDecimal, generateUlid } from '@stalker/shared';
import type { Transaction, TransactionType } from '@stalker/shared';

function makeTx(
  overrides: Omit<Partial<Transaction>, 'quantity' | 'price' | 'fees'> & {
    type: TransactionType;
    quantity: string;
    price: string;
    tradeAt: Date;
    fees?: Decimal;
  },
): Transaction {
  return {
    id: generateUlid(),
    instrumentId: 'test-instrument',
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
    type: overrides.type,
    quantity: toDecimal(overrides.quantity),
    price: toDecimal(overrides.price),
    fees: overrides.fees ?? toDecimal('0'),
    tradeAt: overrides.tradeAt,
  };
}

describe('processTransactions (FIFO lot engine)', () => {
  it('single buy creates one open lot with correct cost basis', () => {
    const txs = [
      makeTx({ type: 'BUY', quantity: '100', price: '10', tradeAt: new Date('2025-01-01') }),
    ];

    const result = processTransactions(txs);

    expect(result.lots).toHaveLength(1);
    expect(result.lots[0]!.remainingQty.toString()).toBe('100');
    expect(result.lots[0]!.costBasisRemaining.toString()).toBe('1000');
    expect(result.lots[0]!.originalQty.toString()).toBe('100');
    expect(result.realizedTrades).toHaveLength(0);
  });

  it('two buys create two open lots', () => {
    const txs = [
      makeTx({ type: 'BUY', quantity: '100', price: '10', tradeAt: new Date('2025-01-01') }),
      makeTx({ type: 'BUY', quantity: '50', price: '12', tradeAt: new Date('2025-01-02') }),
    ];

    const result = processTransactions(txs);

    expect(result.lots).toHaveLength(2);
    expect(result.lots[0]!.remainingQty.toString()).toBe('100');
    expect(result.lots[0]!.costBasisRemaining.toString()).toBe('1000');
    expect(result.lots[1]!.remainingQty.toString()).toBe('50');
    expect(result.lots[1]!.costBasisRemaining.toString()).toBe('600');
    expect(result.realizedTrades).toHaveLength(0);
  });

  it('buy then partial sell produces one reduced lot and one realized trade', () => {
    const txs = [
      makeTx({ type: 'BUY', quantity: '100', price: '10', tradeAt: new Date('2025-01-01') }),
      makeTx({ type: 'SELL', quantity: '60', price: '15', tradeAt: new Date('2025-01-10') }),
    ];

    const result = processTransactions(txs);

    expect(result.lots).toHaveLength(1);
    expect(result.lots[0]!.remainingQty.toString()).toBe('40');
    expect(result.lots[0]!.costBasisRemaining.toString()).toBe('400');

    expect(result.realizedTrades).toHaveLength(1);
    const trade = result.realizedTrades[0]!;
    expect(trade.qty.toString()).toBe('60');
    expect(trade.proceeds.toString()).toBe('900'); // 60 * 15
    expect(trade.costBasis.toString()).toBe('600'); // 60 * 10
    expect(trade.realizedPnl.toString()).toBe('300'); // 900 - 600 - 0 fees
  });

  it('multi-lot sell uses FIFO: consumes first lot fully, then partially second', () => {
    const txs = [
      makeTx({ type: 'BUY', quantity: '100', price: '10', tradeAt: new Date('2025-01-01') }),
      makeTx({ type: 'BUY', quantity: '50', price: '12', tradeAt: new Date('2025-01-02') }),
      makeTx({ type: 'SELL', quantity: '120', price: '15', tradeAt: new Date('2025-01-15') }),
    ];

    const result = processTransactions(txs);

    // First lot fully consumed (100 shares), second partially consumed (20 shares)
    expect(result.lots).toHaveLength(1);
    expect(result.lots[0]!.remainingQty.toString()).toBe('30');
    expect(result.lots[0]!.costBasisRemaining.toString()).toBe('360'); // 30 * 12

    expect(result.realizedTrades).toHaveLength(2);

    // First realized trade: 100 shares from lot 1
    const trade1 = result.realizedTrades[0]!;
    expect(trade1.qty.toString()).toBe('100');
    expect(trade1.proceeds.toString()).toBe('1500'); // 100 * 15
    expect(trade1.costBasis.toString()).toBe('1000'); // 100 * 10
    expect(trade1.realizedPnl.toString()).toBe('500'); // 1500 - 1000

    // Second realized trade: 20 shares from lot 2
    const trade2 = result.realizedTrades[1]!;
    expect(trade2.qty.toString()).toBe('20');
    expect(trade2.proceeds.toString()).toBe('300'); // 20 * 15
    expect(trade2.costBasis.toString()).toBe('240'); // 20 * 12
    expect(trade2.realizedPnl.toString()).toBe('60'); // 300 - 240
  });

  it('full close removes all lots', () => {
    const txs = [
      makeTx({ type: 'BUY', quantity: '100', price: '10', tradeAt: new Date('2025-01-01') }),
      makeTx({ type: 'SELL', quantity: '100', price: '15', tradeAt: new Date('2025-01-15') }),
    ];

    const result = processTransactions(txs);

    expect(result.lots).toHaveLength(0);
    expect(result.realizedTrades).toHaveLength(1);
    expect(result.realizedTrades[0]!.realizedPnl.toString()).toBe('500'); // (15-10)*100
  });

  it('multiple partial sells drain lots correctly', () => {
    const txs = [
      makeTx({ type: 'BUY', quantity: '100', price: '10', tradeAt: new Date('2025-01-01') }),
      makeTx({ type: 'SELL', quantity: '50', price: '12', tradeAt: new Date('2025-01-10') }),
      makeTx({ type: 'SELL', quantity: '50', price: '15', tradeAt: new Date('2025-01-20') }),
    ];

    const result = processTransactions(txs);

    expect(result.lots).toHaveLength(0);
    expect(result.realizedTrades).toHaveLength(2);

    // First sell: 50 @ 12, cost 50*10=500, proceeds 600, pnl 100
    expect(result.realizedTrades[0]!.realizedPnl.toString()).toBe('100');
    // Second sell: 50 @ 15, cost 50*10=500, proceeds 750, pnl 250
    expect(result.realizedTrades[1]!.realizedPnl.toString()).toBe('250');
  });

  it('sell with fees reduces realized PnL correctly', () => {
    const txs = [
      makeTx({ type: 'BUY', quantity: '100', price: '10', tradeAt: new Date('2025-01-01') }),
      makeTx({
        type: 'SELL',
        quantity: '100',
        price: '15',
        tradeAt: new Date('2025-01-15'),
        fees: toDecimal('10'),
      }),
    ];

    const result = processTransactions(txs);

    expect(result.realizedTrades).toHaveLength(1);
    const trade = result.realizedTrades[0]!;
    // proceeds=1500, cost=1000, fees=10, pnl=490
    expect(trade.realizedPnl.toString()).toBe('490');
    expect(trade.fees.toString()).toBe('10');
  });

  it('multi-lot sell with fees allocates fees proportionally', () => {
    const txs = [
      makeTx({ type: 'BUY', quantity: '100', price: '10', tradeAt: new Date('2025-01-01') }),
      makeTx({ type: 'BUY', quantity: '50', price: '12', tradeAt: new Date('2025-01-02') }),
      makeTx({
        type: 'SELL',
        quantity: '120',
        price: '15',
        tradeAt: new Date('2025-01-15'),
        fees: toDecimal('12'),
      }),
    ];

    const result = processTransactions(txs);

    expect(result.realizedTrades).toHaveLength(2);

    // Fee allocation: 100/120 * 12 = 10, 20/120 * 12 = 2
    const trade1 = result.realizedTrades[0]!;
    expect(trade1.fees.toString()).toBe('10');
    // proceeds=1500, cost=1000, fees=10, pnl=490
    expect(trade1.realizedPnl.toString()).toBe('490');

    const trade2 = result.realizedTrades[1]!;
    expect(trade2.fees.toString()).toBe('2');
    // proceeds=300, cost=240, fees=2, pnl=58
    expect(trade2.realizedPnl.toString()).toBe('58');
  });

  it('sell at a loss produces negative realized PnL', () => {
    const txs = [
      makeTx({ type: 'BUY', quantity: '100', price: '20', tradeAt: new Date('2025-01-01') }),
      makeTx({ type: 'SELL', quantity: '100', price: '15', tradeAt: new Date('2025-01-15') }),
    ];

    const result = processTransactions(txs);

    expect(result.realizedTrades).toHaveLength(1);
    // proceeds=1500, cost=2000, pnl=-500
    expect(result.realizedTrades[0]!.realizedPnl.toString()).toBe('-500');
  });
});
