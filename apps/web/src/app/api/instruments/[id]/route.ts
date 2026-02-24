import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/errors';
import { triggerSnapshotRebuild } from '@/lib/snapshot-rebuild-helper';

function serializeInstrument(instrument: {
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
}) {
  return {
    ...instrument,
    providerSymbolMap: JSON.parse(instrument.providerSymbolMap) as Record<string, string>,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;

    const instrument = await prisma.instrument.findUnique({
      where: { id },
    });

    if (!instrument) {
      return apiError(404, 'NOT_FOUND', `Instrument '${id}' not found`);
    }

    return Response.json(serializeInstrument(instrument));
  } catch (err: unknown) {
    console.error('GET /api/instruments/[id] error:', err);
    return apiError(500, 'INTERNAL_ERROR', 'Failed to fetch instrument');
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;

    const instrument = await prisma.instrument.findUnique({
      where: { id },
    });

    if (!instrument) {
      return apiError(404, 'NOT_FOUND', `Instrument '${id}' not found`);
    }

    // Find the earliest remaining transaction date before deleting
    // (to know where to start the rebuild after this instrument is gone)
    const earliestRemainingTx = await prisma.transaction.findFirst({
      where: { instrumentId: { not: id } },
      orderBy: { tradeAt: 'asc' },
      select: { tradeAt: true },
    });

    // Cascade delete: transactions, price bars, latest quotes, then instrument
    await prisma.$transaction([
      prisma.transaction.deleteMany({ where: { instrumentId: id } }),
      prisma.priceBar.deleteMany({ where: { instrumentId: id } }),
      prisma.latestQuote.deleteMany({ where: { instrumentId: id } }),
      prisma.instrument.delete({ where: { id } }),
    ]);

    // Rebuild snapshots from earliest remaining transaction (or clear all if none remain)
    if (earliestRemainingTx) {
      await triggerSnapshotRebuild(earliestRemainingTx.tradeAt);
    } else {
      // No transactions remain — triggerSnapshotRebuild handles this case
      await triggerSnapshotRebuild(new Date('1970-01-01'));
    }

    return Response.json({ deleted: true, id });
  } catch (err: unknown) {
    console.error('DELETE /api/instruments/[id] error:', err);
    return apiError(500, 'INTERNAL_ERROR', 'Failed to delete instrument');
  }
}
