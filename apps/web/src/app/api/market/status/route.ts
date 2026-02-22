import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/errors';
import { isMarketOpen } from '@stalker/market-data';

export async function GET(): Promise<Response> {
  try {
    const instrumentCount = await prisma.instrument.count();

    const now = new Date();
    const pollingActive = isMarketOpen(now, 'NYSE');

    // Check freshness: find instruments with stale or missing quotes
    const instruments = await prisma.instrument.findMany({
      select: { id: true, symbol: true },
    });

    const staleInstruments: Array<{
      symbol: string;
      lastUpdated: string | null;
      minutesStale: number | null;
    }> = [];

    let allFreshWithinMinutes: number | null = null;

    if (instruments.length > 0) {
      let maxStaleMinutes = 0;

      for (const inst of instruments) {
        const quote = await prisma.latestQuote.findFirst({
          where: { instrumentId: inst.id },
          orderBy: { fetchedAt: 'desc' },
        });

        if (!quote) {
          staleInstruments.push({
            symbol: inst.symbol,
            lastUpdated: null,
            minutesStale: null,
          });
        } else {
          const ageMinutes = Math.floor((now.getTime() - quote.fetchedAt.getTime()) / 60000);
          if (ageMinutes > 60) {
            staleInstruments.push({
              symbol: inst.symbol,
              lastUpdated: quote.fetchedAt.toISOString(),
              minutesStale: ageMinutes,
            });
          }
          maxStaleMinutes = Math.max(maxStaleMinutes, ageMinutes);
        }
      }

      if (staleInstruments.length === 0 && instruments.length > 0) {
        allFreshWithinMinutes = maxStaleMinutes;
      }
    }

    return Response.json({
      instrumentCount,
      pollingInterval: 1800,
      pollingActive,
      budget: {
        provider: 'fmp',
        usedToday: 0,
        dailyLimit: 250,
      },
      freshness: {
        allFreshWithinMinutes,
        staleInstruments,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return apiError(500, 'INTERNAL_ERROR', message);
  }
}
