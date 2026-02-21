import { describe, it, expect } from 'vitest';
import { validateTransactionSet } from '../src/validation.js';
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

describe('validateTransactionSet', () => {
  it('buys only are always valid', () => {
    const txs = [
      makeTx({ type: 'BUY', quantity: '100', price: '10', tradeAt: new Date('2025-01-01') }),
      makeTx({ type: 'BUY', quantity: '50', price: '12', tradeAt: new Date('2025-01-02') }),
    ];

    const result = validateTransactionSet(txs);
    expect(result.valid).toBe(true);
  });

  it('buy then sell within position is valid', () => {
    const txs = [
      makeTx({ type: 'BUY', quantity: '100', price: '10', tradeAt: new Date('2025-01-01') }),
      makeTx({ type: 'SELL', quantity: '50', price: '15', tradeAt: new Date('2025-01-10') }),
    ];

    const result = validateTransactionSet(txs);
    expect(result.valid).toBe(true);
  });

  it('exact close (position goes to zero) is valid', () => {
    const txs = [
      makeTx({ type: 'BUY', quantity: '100', price: '10', tradeAt: new Date('2025-01-01') }),
      makeTx({ type: 'SELL', quantity: '100', price: '15', tradeAt: new Date('2025-01-10') }),
    ];

    const result = validateTransactionSet(txs);
    expect(result.valid).toBe(true);
  });

  it('sell exceeding position is invalid with correct deficit', () => {
    const txs = [
      makeTx({ type: 'BUY', quantity: '50', price: '10', tradeAt: new Date('2025-01-01') }),
      makeTx({ type: 'SELL', quantity: '100', price: '15', tradeAt: new Date('2025-01-10') }),
    ];

    const result = validateTransactionSet(txs);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.deficitQty.toString()).toBe('50');
      expect(result.firstNegativeDate).toEqual(new Date('2025-01-10'));
    }
  });

  it('backdated sell creating mid-timeline negative flags the correct transaction', () => {
    // Scenario: Buy 100 on Jan 1, Sell 50 on Jan 3 (backdated insert), Sell 80 on Jan 5
    // After sorting by tradeAt: Buy 100 (Jan 1) -> Sell 50 (Jan 3) -> Sell 80 (Jan 5)
    // Position: 100 -> 50 -> -30 (invalid!)
    const sellJan5 = makeTx({ type: 'SELL', quantity: '80', price: '15', tradeAt: new Date('2025-01-05') });
    const txs = [
      makeTx({ type: 'BUY', quantity: '100', price: '10', tradeAt: new Date('2025-01-01') }),
      makeTx({ type: 'SELL', quantity: '50', price: '12', tradeAt: new Date('2025-01-03') }),
      sellJan5,
    ];

    const result = validateTransactionSet(txs);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.offendingTransaction.id).toBe(sellJan5.id);
      expect(result.firstNegativeDate).toEqual(new Date('2025-01-05'));
      expect(result.deficitQty.toString()).toBe('30');
    }
  });

  it('multiple buys covering sells is valid', () => {
    const txs = [
      makeTx({ type: 'BUY', quantity: '100', price: '10', tradeAt: new Date('2025-01-01') }),
      makeTx({ type: 'BUY', quantity: '50', price: '12', tradeAt: new Date('2025-01-02') }),
      makeTx({ type: 'SELL', quantity: '120', price: '15', tradeAt: new Date('2025-01-10') }),
    ];

    const result = validateTransactionSet(txs);
    expect(result.valid).toBe(true);
  });

  it('sell with no prior buys is invalid', () => {
    const sellTx = makeTx({ type: 'SELL', quantity: '50', price: '10', tradeAt: new Date('2025-01-01') });
    const txs = [sellTx];

    const result = validateTransactionSet(txs);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.offendingTransaction.id).toBe(sellTx.id);
      expect(result.deficitQty.toString()).toBe('50');
    }
  });

  it('empty transaction list is valid', () => {
    const result = validateTransactionSet([]);
    expect(result.valid).toBe(true);
  });
});
