import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/errors';
import { PrismaSnapshotStore } from '@/lib/prisma-snapshot-store';
import { toDecimal, ZERO, add, div, mul } from '@stalker/shared';
import type { HoldingSnapshot } from '@stalker/shared';

export async function GET(): Promise<Response> {
  try {
    const snapshotStore = new PrismaSnapshotStore(prisma);

    // Get the most recent snapshot
    const latestRow = await prisma.portfolioValueSnapshot.findFirst({
      orderBy: { date: 'desc' },
    });

    if (!latestRow) {
      return Response.json([]);
    }

    const latest = await snapshotStore.getByDate(latestRow.date);
    if (!latest) {
      return Response.json([]);
    }

    // Build instrument lookup by symbol
    const instruments = await prisma.instrument.findMany();
    const instrumentBySymbol = new Map<string, typeof instruments[number]>();
    for (const inst of instruments) {
      instrumentBySymbol.set(inst.symbol, inst);
    }

    // Build latest quote lookup by instrumentId
    const quotes = await prisma.latestQuote.findMany();
    const quoteByInstrumentId = new Map<string, typeof quotes[number]>();
    for (const q of quotes) {
      const existing = quoteByInstrumentId.get(q.instrumentId);
      if (!existing || q.fetchedAt > existing.fetchedAt) {
        quoteByInstrumentId.set(q.instrumentId, q);
      }
    }

    // Derive first BUY date per instrument
    const firstBuyRows = await prisma.transaction.groupBy({
      by: ['instrumentId'],
      where: { type: 'BUY' },
      _min: { tradeAt: true },
    });
    const firstBuyByInstrumentId = new Map<string, Date>();
    for (const row of firstBuyRows) {
      if (row._min.tradeAt) {
        firstBuyByInstrumentId.set(row.instrumentId, row._min.tradeAt);
      }
    }

    const totalValue = latest.totalValue;
    const holdings: Array<Record<string, unknown>> = [];

    for (const [symbol, entry] of Object.entries(latest.holdingsJson) as Array<[string, HoldingSnapshot]>) {
      const inst = instrumentBySymbol.get(symbol);
      const quote = inst ? quoteByInstrumentId.get(inst.id) : undefined;
      const latestPrice = quote ? toDecimal(quote.price.toString()) : null;

      // Use latest quote price to compute current value if available, otherwise use snapshot value
      const currentValue = latestPrice ? mul(entry.qty, latestPrice) : entry.value;
      const unrealizedPnl = currentValue.minus(entry.costBasis);
      const unrealizedPnlPct = entry.costBasis.isZero()
        ? '0'
        : div(unrealizedPnl, entry.costBasis).times(100).toFixed(2);
      const allocation = totalValue.isZero()
        ? '0'
        : div(currentValue, totalValue).times(100).toFixed(2);

      const firstBuyDate = inst ? firstBuyByInstrumentId.get(inst.id) ?? null : null;

      holdings.push({
        symbol,
        name: inst?.name ?? symbol,
        instrumentId: inst?.id ?? null,
        qty: entry.qty.toString(),
        price: latestPrice ? latestPrice.toString() : entry.value.dividedBy(entry.qty).toString(),
        value: currentValue.toString(),
        costBasis: entry.costBasis.toString(),
        unrealizedPnl: unrealizedPnl.toString(),
        unrealizedPnlPct,
        allocation,
        firstBuyDate: firstBuyDate ? firstBuyDate.toISOString() : null,
      });
    }

    return Response.json(holdings);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return apiError(500, 'INTERNAL_ERROR', message);
  }
}
