import { apiError } from '@/lib/errors';

// TODO: Implement manual refresh by iterating instruments, calling MarketDataService.getQuote()
// with rate limiting, and upserting LatestQuote. Requires configured API keys.
export async function POST(): Promise<Response> {
  try {
    return Response.json({
      refreshed: 0,
      failed: 0,
      rateLimited: false,
      message: 'Manual refresh requires configured API keys',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return apiError(500, 'INTERNAL_ERROR', message);
  }
}
