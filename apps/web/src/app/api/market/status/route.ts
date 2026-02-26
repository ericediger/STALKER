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

    const fmpDailyLimit = parseInt(process.env['FMP_RPD'] ?? '250', 10);
    const tiingoHourlyLimit = parseInt(process.env['TIINGO_RPH'] ?? '50', 10);
    const tiingoDailyLimit = parseInt(process.env['TIINGO_RPD'] ?? '1000', 10);

    return Response.json({
      instrumentCount,
      pollingInterval: 1800,
      pollingActive,
      budget: {
        primary: {
          provider: 'tiingo',
          usedThisHour: 0,
          hourlyLimit: tiingoHourlyLimit,
          usedToday: 0,
          dailyLimit: tiingoDailyLimit,
        },
        secondary: {
          provider: 'fmp',
          usedToday: 0,
          dailyLimit: fmpDailyLimit,
        },
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
