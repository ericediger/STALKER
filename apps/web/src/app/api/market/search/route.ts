import { NextRequest } from 'next/server';
import { apiError } from '@/lib/errors';
import { getMarketDataService } from '@/lib/market-data-service';

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { searchParams } = request.nextUrl;
    const query = searchParams.get('q');

    if (!query || query.length < 1) {
      return apiError(400, 'VALIDATION_ERROR', 'q query parameter is required');
    }

    const service = getMarketDataService();
    const results = await service.searchSymbols(query);

    return Response.json({ results });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return apiError(500, 'INTERNAL_ERROR', message);
  }
}
