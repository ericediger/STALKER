import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/errors';
import { PrismaSnapshotStore } from '@/lib/prisma-snapshot-store';
import { toDecimal, ZERO, add, div, mul } from '@stalker/shared';
import type { Decimal } from '@stalker/shared';
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

    // Build previous close lookup for day change (2nd most recent bar per instrument)
    // We need both the most recent and 2nd most recent PriceBar per instrument.
    // Fetch the 2 most recent bars per instrument efficiently.
    const allInstrumentIds = instruments.map((i) => i.id);
    const prevCloseByInstrumentId = new Map<string, string>();
    // Batch query: for each instrument, get the 2nd most recent daily bar's close
    await Promise.all(
      allInstrumentIds.map(async (instId) => {
        const prevBar = await prisma.priceBar.findFirst({
          where: { instrumentId: instId, resolution: '1D' },
          orderBy: { date: 'desc' },
          skip: 1,
          select: { close: true },
        });
        if (prevBar) {
          prevCloseByInstrumentId.set(instId, prevBar.close.toString());
        }
      }),
    );

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

    // First pass: compute current value for each holding using fresh quotes
    const holdingsData: Array<{
      symbol: string;
      name: string;
      instrumentId: string | null;
      instrumentType: string;
      qty: string;
      price: string;
      currentValue: Decimal;
      costBasis: string;
      unrealizedPnl: string;
      unrealizedPnlPct: string;
      dayChange: string | null;
      dayChangePct: string | null;
      firstBuyDate: string | null;
    }> = [];

    let computedTotalValue = ZERO;

    for (const [symbol, entry] of Object.entries(latest.holdingsJson) as Array<[string, HoldingSnapshot]>) {
      const inst = instrumentBySymbol.get(symbol);
      const quote = inst ? quoteByInstrumentId.get(inst.id) : undefined;
      const latestPrice = quote ? toDecimal(quote.price.toString()) : null;

      // Use latest quote price to compute current value if available, otherwise use snapshot value
      const currentValue = latestPrice ? mul(entry.qty, latestPrice) : entry.value;
      computedTotalValue = add(computedTotalValue, currentValue);

      const unrealizedPnl = currentValue.minus(entry.costBasis);
      const unrealizedPnlPct = entry.costBasis.isZero()
        ? '0'
        : div(unrealizedPnl, entry.costBasis).times(100).toFixed(2);

      const firstBuyDate = inst ? firstBuyByInstrumentId.get(inst.id) ?? null : null;

      // Compute day change from previous bar close
      let dayChange: string | null = null;
      let dayChangePct: string | null = null;
      if (inst && latestPrice && !latestPrice.isZero()) {
        const prevCloseStr = prevCloseByInstrumentId.get(inst.id);
        if (prevCloseStr) {
          const prevClose = toDecimal(prevCloseStr);
          if (!prevClose.isZero()) {
            const change = latestPrice.minus(prevClose);
            dayChange = change.toString();
            dayChangePct = change.dividedBy(prevClose).times(100).toFixed(2);
          }
        }
      }

      holdingsData.push({
        symbol,
        name: inst?.name ?? symbol,
        instrumentId: inst?.id ?? null,
        instrumentType: inst?.type ?? 'STOCK',
        qty: entry.qty.toString(),
        price: latestPrice ? latestPrice.toString() : (entry.qty.isZero() ? '0' : entry.value.dividedBy(entry.qty).toString()),
        currentValue,
        costBasis: entry.costBasis.toString(),
        unrealizedPnl: unrealizedPnl.toString(),
        unrealizedPnlPct,
        dayChange,
        dayChangePct,
        firstBuyDate: firstBuyDate ? firstBuyDate.toISOString() : null,
      });
    }

    // Second pass: compute allocation using recomputed total value
    const holdings = holdingsData.map((h) => ({
      symbol: h.symbol,
      name: h.name,
      instrumentId: h.instrumentId,
      instrumentType: h.instrumentType,
      qty: h.qty,
      price: h.price,
      value: h.currentValue.toString(),
      costBasis: h.costBasis,
      unrealizedPnl: h.unrealizedPnl,
      unrealizedPnlPct: h.unrealizedPnlPct,
      dayChange: h.dayChange,
      dayChangePct: h.dayChangePct,
      allocation: computedTotalValue.isZero()
        ? '0'
        : div(h.currentValue, computedTotalValue).times(100).toFixed(2),
      firstBuyDate: h.firstBuyDate,
    }));

    return Response.json(holdings);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return apiError(500, 'INTERNAL_ERROR', message);
  }
}
