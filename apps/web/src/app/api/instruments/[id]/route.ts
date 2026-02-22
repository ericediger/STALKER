import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/errors';

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

    // Cascade delete: transactions, price bars, latest quotes, then instrument
    await prisma.$transaction([
      prisma.transaction.deleteMany({ where: { instrumentId: id } }),
      prisma.priceBar.deleteMany({ where: { instrumentId: id } }),
      prisma.latestQuote.deleteMany({ where: { instrumentId: id } }),
      prisma.instrument.delete({ where: { id } }),
    ]);

    // Snapshot rebuild skipped — Prisma implementations being built by Teammate 2
    return Response.json({ deleted: true, id });
  } catch (err: unknown) {
    console.error('DELETE /api/instruments/[id] error:', err);
    return apiError(500, 'INTERNAL_ERROR', 'Failed to delete instrument');
  }
}
