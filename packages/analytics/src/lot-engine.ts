import { Decimal, toDecimal, sub, mul, add, div, ZERO, isZero, min } from '@stalker/shared';
import type { Transaction, Lot, RealizedTrade } from '@stalker/shared';

export interface LotEngineResult {
  lots: Lot[];
  realizedTrades: RealizedTrade[];
}

/**
 * Process an ordered list of transactions for a SINGLE instrument
 * and produce open lots + realized trades using FIFO accounting.
 *
 * Transactions MUST be sorted by tradeAt ASC.
 * All transactions MUST be for the same instrument.
 *
 * Fee allocation for multi-lot sells: fees are allocated proportionally
 * based on the quantity consumed from each lot relative to total sell quantity.
 */
export function processTransactions(transactions: Transaction[]): LotEngineResult {
  const openLots: Lot[] = [];
  const realizedTrades: RealizedTrade[] = [];

  for (const tx of transactions) {
    if (tx.type === 'BUY') {
      openLots.push({
        instrumentId: tx.instrumentId,
        openedAt: tx.tradeAt,
        originalQty: tx.quantity,
        remainingQty: tx.quantity,
        price: tx.price,
        costBasisRemaining: mul(tx.quantity, tx.price),
      });
    } else {
      // SELL -- consume from front of queue (FIFO)
      // First pass: figure out what lots we consume and how much
      const consumptions: Array<{ lotIndex: number; consumed: Decimal; lotPrice: Decimal }> = [];
      let remainingToSell = tx.quantity;
      let scanIndex = 0;

      while (!isZero(remainingToSell) && scanIndex < openLots.length) {
        const lot = openLots[scanIndex]!;
        const consumed = min(remainingToSell, lot.remainingQty);
        consumptions.push({
          lotIndex: scanIndex,
          consumed,
          lotPrice: lot.price,
        });
        remainingToSell = sub(remainingToSell, consumed);
        scanIndex++;
      }

      // Second pass: create realized trades with proportional fee allocation
      const totalSellQty = tx.quantity;
      const sellPrice = tx.price;

      for (const consumption of consumptions) {
        const { consumed, lotPrice } = consumption;
        const proceeds = mul(consumed, sellPrice);
        const costBasis = mul(consumed, lotPrice);
        // Proportional fee allocation: (consumed / totalSellQty) * totalFees
        const allocatedFees = isZero(totalSellQty)
          ? ZERO
          : mul(div(consumed, totalSellQty), tx.fees);

        realizedTrades.push({
          instrumentId: tx.instrumentId,
          sellDate: tx.tradeAt,
          qty: consumed,
          proceeds,
          costBasis,
          realizedPnl: sub(sub(proceeds, costBasis), allocatedFees),
          fees: allocatedFees,
        });
      }

      // Third pass: actually update the lots (deduct consumed shares, remove empty lots)
      // Process in reverse order so index shifts don't affect earlier indices
      for (let i = consumptions.length - 1; i >= 0; i--) {
        const consumption = consumptions[i]!;
        const lot = openLots[consumption.lotIndex]!;
        const costBasisConsumed = mul(consumption.consumed, lot.price);
        lot.remainingQty = sub(lot.remainingQty, consumption.consumed);
        lot.costBasisRemaining = sub(lot.costBasisRemaining, costBasisConsumed);

        if (isZero(lot.remainingQty)) {
          openLots.splice(consumption.lotIndex, 1);
        }
      }
    }
  }

  return { lots: openLots, realizedTrades };
}
