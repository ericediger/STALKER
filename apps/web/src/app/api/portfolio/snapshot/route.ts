import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/errors';
import { PrismaPriceLookup } from '@/lib/prisma-price-lookup';
import { PrismaSnapshotStore } from '@/lib/prisma-snapshot-store';
import { queryPortfolioWindow } from '@stalker/analytics';
import { getNextTradingDay, isTradingDay, getPriorTradingDay } from '@stalker/market-data';
import { toDecimal } from '@stalker/shared';
import type { Instrument, Transaction, InstrumentType, TransactionType } from '@stalker/shared';

const VALID_WINDOWS = ['1D', '1W', '1M', '3M', '1Y', 'ALL'] as const;
type WindowParam = (typeof VALID_WINDOWS)[number];

function toSharedInstrument(prismaInst: {
  id: string;
  symbol: string;
  name: string;
  type: string;
  currency: string;
  exchange: string;
  exchangeTz: string;
  providerSymbolMap: string;
  firstBarDate: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Instrument {
  return {
    ...prismaInst,
    type: prismaInst.type as InstrumentType,
    providerSymbolMap: JSON.parse(prismaInst.providerSymbolMap) as Record<string, string>,
  };
}

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

function computeStartDate(window: WindowParam, endDate: Date): string {
  const d = new Date(endDate);
  switch (window) {
    case '1D': {
      const prior = getPriorTradingDay(d, 'NYSE');
      return toDateStr(prior);
    }
    case '1W':
      d.setUTCDate(d.getUTCDate() - 7);
      return toDateStr(d);
    case '1M':
      d.setUTCDate(d.getUTCDate() - 30);
      return toDateStr(d);
    case '3M':
      d.setUTCDate(d.getUTCDate() - 90);
      return toDateStr(d);
    case '1Y':
      d.setUTCDate(d.getUTCDate() - 365);
      return toDateStr(d);
    case 'ALL':
      return '1970-01-01';
  }
}

function toDateStr(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function serializeDecimal(value: unknown): string {
  if (value !== null && typeof value === 'object' && 'toFixed' in (value as Record<string, unknown>)) {
    return (value as { toString(): string }).toString();
  }
  return String(value);
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { searchParams } = request.nextUrl;
    const window = (searchParams.get('window') ?? '1M') as string;
    const asOf = searchParams.get('asOf') ?? undefined;

    if (!VALID_WINDOWS.includes(window as WindowParam)) {
      return apiError(400, 'VALIDATION_ERROR', `Invalid window param. Must be one of: ${VALID_WINDOWS.join(', ')}`);
    }

    const now = asOf ? new Date(asOf) : new Date();
    const endDateStr = toDateStr(now);
    let startDateStr = computeStartDate(window as WindowParam, now);

    // For ALL window, find earliest transaction date
    if (window === 'ALL') {
      const earliest = await prisma.transaction.findFirst({
        orderBy: { tradeAt: 'asc' },
        select: { tradeAt: true },
      });
      if (earliest) {
        startDateStr = toDateStr(earliest.tradeAt);
      } else {
        return Response.json({
          totalValue: '0',
          totalCostBasis: '0',
          unrealizedPnl: '0',
          realizedPnl: '0',
          holdings: [],
          window: {
            startDate: startDateStr,
            endDate: endDateStr,
            startValue: '0',
            endValue: '0',
            changeAmount: '0',
            changePct: '0',
          },
        });
      }
    }

    const [prismaInstruments, prismaTransactions] = await Promise.all([
      prisma.instrument.findMany(),
      prisma.transaction.findMany({ orderBy: { tradeAt: 'asc' } }),
    ]);

    if (prismaTransactions.length === 0) {
      return Response.json({
        totalValue: '0',
        totalCostBasis: '0',
        unrealizedPnl: '0',
        realizedPnl: '0',
        holdings: [],
        window: {
          startDate: startDateStr,
          endDate: endDateStr,
          startValue: '0',
          endValue: '0',
          changeAmount: '0',
          changePct: '0',
        },
      });
    }

    const instruments = prismaInstruments.map(toSharedInstrument);
    const transactions = prismaTransactions.map(toSharedTransaction);

    const priceLookup = new PrismaPriceLookup(prisma);
    const snapshotStore = new PrismaSnapshotStore(prisma);
    const calendar = { getNextTradingDay, isTradingDay };

    const result = await queryPortfolioWindow({
      startDate: startDateStr,
      endDate: endDateStr,
      asOf,
      transactions,
      instruments,
      priceLookup,
      snapshotStore,
      calendar,
    });

    const holdingsArr = result.holdings.map((h) => ({
      symbol: h.symbol,
      instrumentId: h.instrumentId,
      qty: serializeDecimal(h.qty),
      value: serializeDecimal(h.value),
      costBasis: serializeDecimal(h.costBasis),
      unrealizedPnl: serializeDecimal(h.unrealizedPnl),
      allocation: result.endValue.isZero()
        ? '0'
        : h.value.dividedBy(result.endValue).times(100).toFixed(2),
      isEstimated: h.isEstimated ?? false,
    }));

    return Response.json({
      totalValue: serializeDecimal(result.endValue),
      totalCostBasis: serializeDecimal(
        result.holdings.reduce(
          (sum, h) => sum.plus(h.costBasis),
          toDecimal('0'),
        ),
      ),
      unrealizedPnl: serializeDecimal(result.unrealizedPnlAtEnd),
      realizedPnl: serializeDecimal(result.realizedPnlInWindow),
      holdings: holdingsArr,
      window: {
        startDate: startDateStr,
        endDate: endDateStr,
        startValue: serializeDecimal(result.startValue),
        endValue: serializeDecimal(result.endValue),
        changeAmount: serializeDecimal(result.absoluteChange),
        changePct: serializeDecimal(result.percentageChange),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return apiError(500, 'INTERNAL_ERROR', message);
  }
}
