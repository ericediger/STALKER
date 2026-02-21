import { ZERO, add, sub, isNegative } from '@stalker/shared';
import type { Transaction, ValidationResult } from '@stalker/shared';

/**
 * Validate that at every point in the timeline, cumulative buys >= cumulative sells.
 * Transactions must be sorted by tradeAt ASC.
 * All transactions must be for the same instrument.
 */
export function validateTransactionSet(transactions: Transaction[]): ValidationResult {
  let cumulativeQty = ZERO;

  for (const tx of transactions) {
    if (tx.type === 'BUY') {
      cumulativeQty = add(cumulativeQty, tx.quantity);
    } else {
      cumulativeQty = sub(cumulativeQty, tx.quantity);
    }

    if (isNegative(cumulativeQty)) {
      return {
        valid: false,
        offendingTransaction: tx,
        firstNegativeDate: tx.tradeAt,
        deficitQty: sub(ZERO, cumulativeQty), // Make positive
      };
    }
  }

  return { valid: true };
}
