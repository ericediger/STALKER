import { Decimal, sub, mul, add, div, ZERO } from '@stalker/shared';
import type { Lot, RealizedTrade, UnrealizedPnL, HoldingSummary } from '@stalker/shared';

export function computeUnrealizedPnL(lots: Lot[], markPrice: Decimal): UnrealizedPnL {
  const perLot = lots.map(lot => ({
    lot,
    unrealizedPnl: mul(sub(markPrice, lot.price), lot.remainingQty),
    markPrice,
  }));

  const totalUnrealized = perLot.reduce(
    (sum, item) => add(sum, item.unrealizedPnl),
    ZERO,
  );

  return { totalUnrealized, perLot };
}

export function computeRealizedPnL(trades: RealizedTrade[]): Decimal {
  return trades.reduce(
    (sum, trade) => add(sum, trade.realizedPnl),
    ZERO,
  );
}

export function computeHoldingSummary(
  instrumentId: string,
  symbol: string,
  lots: Lot[],
  trades: RealizedTrade[],
  markPrice: Decimal,
): HoldingSummary {
  const totalQty = lots.reduce((sum, lot) => add(sum, lot.remainingQty), ZERO);
  const totalCostBasis = lots.reduce((sum, lot) => add(sum, lot.costBasisRemaining), ZERO);
  const marketValue = mul(totalQty, markPrice);
  const unrealizedPnl = sub(marketValue, totalCostBasis);
  const unrealizedPnlPercent = totalCostBasis.isZero()
    ? ZERO
    : div(unrealizedPnl, totalCostBasis);
  const realizedPnl = computeRealizedPnL(trades);

  return {
    instrumentId,
    symbol,
    totalQty,
    totalCostBasis,
    marketValue,
    unrealizedPnl,
    unrealizedPnlPercent,
    realizedPnl,
    lots,
    realizedTrades: trades,
  };
}
