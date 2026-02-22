import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/errors';

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { searchParams } = request.nextUrl;
    const symbol = searchParams.get('symbol');

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

    // Get latest quote
    const quote = await prisma.latestQuote.findFirst({
      where: { instrumentId: instrument.id },
      orderBy: { fetchedAt: 'desc' },
    });

    if (!quote) {
      return apiError(404, 'NOT_FOUND', `No quote available for symbol "${symbol.toUpperCase()}"`);
    }

    return Response.json({
      symbol: instrument.symbol,
      price: quote.price.toString(),
      asOf: quote.asOf.toISOString(),
      fetchedAt: quote.fetchedAt.toISOString(),
      provider: quote.provider,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return apiError(500, 'INTERNAL_ERROR', message);
  }
}
