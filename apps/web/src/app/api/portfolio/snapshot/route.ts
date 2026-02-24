import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/errors';
import { PrismaSnapshotStore } from '@/lib/prisma-snapshot-store';
import { processTransactions, computeRealizedPnL } from '@stalker/analytics';
import type { HoldingSnapshotEntry } from '@stalker/analytics';
import { getPriorTradingDay } from '@stalker/market-data';
import { toDecimal, ZERO, add, sub, div, isZero } from '@stalker/shared';
import type { Instrument, Transaction, InstrumentType, TransactionType, PortfolioValueSnapshot } from '@stalker/shared';

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

/**
 * Build the snapshot response from cached snapshots without triggering a rebuild.
 * Computes window metrics and holdings breakdown from existing snapshot data.
 */
function buildResponseFromSnapshots(
  snapshots: PortfolioValueSnapshot[],
  transactions: Transaction[],
  instruments: Instrument[],
  startDateStr: string,
  endDateStr: string,
): Record<string, unknown> {
  const startValue = snapshots.length > 0 ? snapshots[0]!.totalValue : ZERO;
  const endValue = snapshots.length > 0 ? snapshots[snapshots.length - 1]!.totalValue : ZERO;
  const absoluteChange = sub(endValue, startValue);
  const percentageChange = isZero(startValue)
    ? ZERO
    : toDecimal(div(absoluteChange, startValue).toFixed(4));

  // Compute realized PnL within the window from transactions
  const windowStartDate = parseDateStr(startDateStr);
  const windowEndDate = parseDateStr(endDateStr);
  windowEndDate.setUTCHours(23, 59, 59, 999);

  const sortedTxs = [...transactions].sort(
    (a, b) => a.tradeAt.getTime() - b.tradeAt.getTime(),
  );
  const txsByInstrument = new Map<string, Transaction[]>();
  for (const tx of sortedTxs) {
    const list = txsByInstrument.get(tx.instrumentId);
    if (list) {
      list.push(tx);
    } else {
      txsByInstrument.set(tx.instrumentId, [tx]);
    }
  }

  let realizedPnlInWindow = ZERO;
  for (const [, txs] of txsByInstrument) {
    const result = processTransactions(txs);
    const windowTrades = result.realizedTrades.filter(
      (t) => t.sellDate >= windowStartDate && t.sellDate <= windowEndDate,
    );
    realizedPnlInWindow = add(realizedPnlInWindow, computeRealizedPnL(windowTrades));
  }

  const unrealizedPnlAtEnd = snapshots.length > 0
    ? snapshots[snapshots.length - 1]!.unrealizedPnl
    : ZERO;

  // Build holdings from last snapshot
  const instrumentMap = new Map<string, Instrument>();
  for (const inst of instruments) {
    instrumentMap.set(inst.symbol, inst);
  }

  const holdingsArr: Record<string, unknown>[] = [];
  if (snapshots.length > 0) {
    const lastSnapshot = snapshots[snapshots.length - 1]!;
    const holdingsJson = lastSnapshot.holdingsJson as Record<string, HoldingSnapshotEntry>;
    for (const [symbol, entry] of Object.entries(holdingsJson)) {
      const inst = instrumentMap.get(symbol);
      const instrumentId = inst ? inst.id : symbol;
      const unrealizedPnl = sub(entry.value, entry.costBasis);
      holdingsArr.push({
        symbol,
        instrumentId,
        qty: serializeDecimal(entry.qty),
        value: serializeDecimal(entry.value),
        costBasis: serializeDecimal(entry.costBasis),
        unrealizedPnl: serializeDecimal(unrealizedPnl),
        allocation: isZero(endValue)
          ? '0'
          : entry.value.dividedBy(endValue).times(100).toFixed(2),
        isEstimated: entry.isEstimated ?? false,
      });
    }
  }

  return {
    totalValue: serializeDecimal(endValue),
    totalCostBasis: serializeDecimal(
      holdingsArr.length > 0 && snapshots.length > 0
        ? snapshots[snapshots.length - 1]!.totalCostBasis
        : ZERO,
    ),
    unrealizedPnl: serializeDecimal(unrealizedPnlAtEnd),
    realizedPnl: serializeDecimal(realizedPnlInWindow),
    holdings: holdingsArr,
    window: {
      startDate: startDateStr,
      endDate: endDateStr,
      startValue: serializeDecimal(startValue),
      endValue: serializeDecimal(endValue),
      changeAmount: serializeDecimal(absoluteChange),
      changePct: serializeDecimal(percentageChange),
    },
  };
}

function parseDateStr(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
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

    const snapshotStore = new PrismaSnapshotStore(prisma);

    // AD-S10b: GET is strictly read-only. No writes to the database.
    const cachedSnapshots = await snapshotStore.getRange(startDateStr, endDateStr);

    if (cachedSnapshots.length > 0) {
      // Read-only path: use cached snapshots, compute derived fields from transactions
      return Response.json(
        buildResponseFromSnapshots(cachedSnapshots, transactions, instruments, startDateStr, endDateStr),
      );
    }

    // No cached snapshots — signal the client that a rebuild is needed.
    // The client should POST /api/portfolio/rebuild to trigger snapshot computation.
    return Response.json({
      needsRebuild: true,
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return apiError(500, 'INTERNAL_ERROR', message);
  }
}
