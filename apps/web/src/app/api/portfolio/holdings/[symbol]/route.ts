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

    // Phase 1: Fall back to latest PriceBar close when no LatestQuote exists
    let markPrice = ZERO;
    let quoteResponse: {
      price: string;
      asOf: string;
      fetchedAt: string;
      provider: string;
    } | null = null;

    if (latestQuote) {
      markPrice = toDecimal(latestQuote.price.toString());
      quoteResponse = {
        price: latestQuote.price.toString(),
        asOf: latestQuote.asOf.toISOString(),
        fetchedAt: latestQuote.fetchedAt.toISOString(),
        provider: latestQuote.provider,
      };
    } else {
      // No live quote — fall back to most recent daily PriceBar
      const fallbackBar = await prisma.priceBar.findFirst({
        where: { instrumentId: instrument.id, resolution: '1D' },
        orderBy: { date: 'desc' },
      });
      if (fallbackBar) {
        markPrice = toDecimal(fallbackBar.close.toString());
        quoteResponse = {
          price: fallbackBar.close.toString(),
          asOf: new Date(fallbackBar.date + 'T16:00:00Z').toISOString(),
          fetchedAt: new Date(fallbackBar.date + 'T16:00:00Z').toISOString(),
          provider: 'price-history',
        };
      }
    }

    // Phase 4: Compute allocation, firstBuyDate, dayChange
    const [latestSnapshot, firstBuyTx, prevBar] = await Promise.all([
      prisma.portfolioValueSnapshot.findFirst({
        orderBy: { date: 'desc' },
        select: { totalValue: true },
      }),
      prisma.transaction.findFirst({
        where: { instrumentId: instrument.id, type: 'BUY' },
        orderBy: { tradeAt: 'asc' },
        select: { tradeAt: true },
      }),
      // Get second-most-recent PriceBar for day change calculation
      prisma.priceBar.findFirst({
        where: { instrumentId: instrument.id, resolution: '1D' },
        orderBy: { date: 'desc' },
        skip: 1,
      }),
    ]);

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

    // Compute allocation %
    const totalPortfolioValue = latestSnapshot
      ? toDecimal(latestSnapshot.totalValue.toString())
      : ZERO;
    const allocation = totalPortfolioValue.isZero()
      ? ZERO
      : marketValue.dividedBy(totalPortfolioValue).times(100);

    // Compute day change from previous bar close
    let dayChange: string | null = null;
    let dayChangePct: string | null = null;
    if (prevBar && !markPrice.isZero()) {
      const prevClose = toDecimal(prevBar.close.toString());
      if (!prevClose.isZero()) {
        const change = markPrice.minus(prevClose);
        dayChange = change.toString();
        dayChangePct = change.dividedBy(prevClose).times(100).toFixed(2);
      }
    }

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
      allocation: allocation.toFixed(2),
      firstBuyDate: firstBuyTx ? firstBuyTx.tradeAt.toISOString() : null,
      dayChange,
      dayChangePct,
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
      latestQuote: quoteResponse,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('GET /api/portfolio/holdings/[symbol] error:', error);
    return apiError(500, 'INTERNAL_ERROR', message);
  }
}
