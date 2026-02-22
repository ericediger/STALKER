import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/errors';
import { processTransactions, computeUnrealizedPnL, computeRealizedPnL } from '@stalker/analytics';
import { toDecimal, ZERO } from '@stalker/shared';
import type { Transaction, TransactionType } from '@stalker/shared';

function toSharedTransaction(prismaTx: {
  id: string;
  instrumentId: string;
  type: string;
  quantity: unknown;
  price: unknown;
  fees: unknown;
  tradeAt: Date;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Transaction {
  return {
    ...prismaTx,
    type: prismaTx.type as TransactionType,
    quantity: toDecimal(prismaTx.quantity!.toString()),
    price: toDecimal(prismaTx.price!.toString()),
    fees: toDecimal(prismaTx.fees!.toString()),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
): Promise<Response> {
  try {
    const { symbol } = await params;

    // Look up instrument by symbol (not ID)
    const instrument = await prisma.instrument.findUnique({
      where: { symbol: symbol.toUpperCase() },
    });

    if (!instrument) {
      return apiError(404, 'NOT_FOUND', `Instrument with symbol "${symbol.toUpperCase()}" not found`);
    }

    // Get all transactions for this instrument
    const prismaTransactions = await prisma.transaction.findMany({
      where: { instrumentId: instrument.id },
      orderBy: { tradeAt: 'asc' },
    });

    const transactions = prismaTransactions.map(toSharedTransaction);

    // Process through lot engine
    const { lots, realizedTrades } = processTransactions(transactions);

    // Get latest quote for mark price
    const latestQuote = await prisma.latestQuote.findFirst({
      where: { instrumentId: instrument.id },
      orderBy: { fetchedAt: 'desc' },
    });

    const markPrice = latestQuote ? toDecimal(latestQuote.price.toString()) : ZERO;

    // Compute unrealized PnL per lot
    const unrealized = lots.length > 0 && !markPrice.isZero()
      ? computeUnrealizedPnL(lots, markPrice)
      : { totalUnrealized: ZERO, perLot: [] };

    // Compute realized PnL
    const realizedPnl = computeRealizedPnL(realizedTrades);

    // Total qty and cost basis
    const totalQty = lots.reduce((sum, lot) => sum.plus(lot.remainingQty), ZERO);
    const totalCostBasis = lots.reduce((sum, lot) => sum.plus(lot.costBasisRemaining), ZERO);
    const marketValue = totalQty.times(markPrice);

    return Response.json({
      symbol: instrument.symbol,
      name: instrument.name,
      instrumentId: instrument.id,
      totalQty: totalQty.toString(),
      markPrice: markPrice.toString(),
      marketValue: marketValue.toString(),
      totalCostBasis: totalCostBasis.toString(),
      unrealizedPnl: unrealized.totalUnrealized.toString(),
      unrealizedPnlPct: totalCostBasis.isZero()
        ? '0'
        : unrealized.totalUnrealized.dividedBy(totalCostBasis).times(100).toFixed(2),
      realizedPnl: realizedPnl.toString(),
      lots: lots.map((lot) => ({
        openedAt: lot.openedAt.toISOString(),
        originalQty: lot.originalQty.toString(),
        remainingQty: lot.remainingQty.toString(),
        price: lot.price.toString(),
        costBasisRemaining: lot.costBasisRemaining.toString(),
      })),
      realizedTrades: realizedTrades.map((t) => ({
        sellDate: t.sellDate.toISOString(),
        qty: t.qty.toString(),
        proceeds: t.proceeds.toString(),
        costBasis: t.costBasis.toString(),
        realizedPnl: t.realizedPnl.toString(),
        fees: t.fees.toString(),
      })),
      transactions: transactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        quantity: tx.quantity.toString(),
        price: tx.price.toString(),
        fees: tx.fees.toString(),
        tradeAt: tx.tradeAt.toISOString(),
        notes: tx.notes,
      })),
      latestQuote: latestQuote
        ? {
            price: latestQuote.price.toString(),
            asOf: latestQuote.asOf.toISOString(),
            fetchedAt: latestQuote.fetchedAt.toISOString(),
            provider: latestQuote.provider,
          }
        : null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return apiError(500, 'INTERNAL_ERROR', message);
  }
}
