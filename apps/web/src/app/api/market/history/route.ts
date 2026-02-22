import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/errors';

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { searchParams } = request.nextUrl;
    const symbol = searchParams.get('symbol');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!symbol) {
      return apiError(400, 'VALIDATION_ERROR', 'symbol query parameter is required');
    }

    // Look up instrument by symbol
    const instrument = await prisma.instrument.findUnique({
      where: { symbol: symbol.toUpperCase() },
    });

    if (!instrument) {
      return apiError(404, 'NOT_FOUND', `Instrument with symbol "${symbol.toUpperCase()}" not found`);
    }

    // Build where clause
    const where: {
      instrumentId: string;
      resolution: string;
      date?: { gte?: string; lte?: string };
    } = {
      instrumentId: instrument.id,
      resolution: '1D',
    };

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = startDate;
      if (endDate) where.date.lte = endDate;
    }

    const bars = await prisma.priceBar.findMany({
      where,
      orderBy: { date: 'asc' },
    });

    const result = bars.map((bar) => ({
      date: bar.date,
      open: bar.open.toString(),
      high: bar.high.toString(),
      low: bar.low.toString(),
      close: bar.close.toString(),
      volume: bar.volume,
      provider: bar.provider,
    }));

    return Response.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return apiError(500, 'INTERNAL_ERROR', message);
  }
}
