import { NextRequest } from 'next/server';
import { apiError } from '@/lib/errors';

// TODO: Implement symbol search by proxying to MarketDataService.searchSymbols()
// when API keys are configured. For now, returns empty results.
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { searchParams } = request.nextUrl;
    const query = searchParams.get('q');

    if (!query) {
      return apiError(400, 'VALIDATION_ERROR', 'q query parameter is required');
    }

    // Stub: return empty results until API keys are configured
    return Response.json({ results: [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return apiError(500, 'INTERNAL_ERROR', message);
  }
}
