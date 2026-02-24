import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/errors';
import { getMarketDataService } from '@/lib/market-data-service';
import type { Instrument, InstrumentType } from '@stalker/shared';
import { ProviderError } from '@stalker/market-data';

function toDomainInstrument(prismaInst: {
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
}): Instrument {
  return {
    ...prismaInst,
    type: prismaInst.type as InstrumentType,
    providerSymbolMap: JSON.parse(prismaInst.providerSymbolMap) as Record<string, string>,
  };
}

export async function POST(): Promise<Response> {
  try {
    const instruments = await prisma.instrument.findMany();
    const service = getMarketDataService();

    let refreshed = 0;
    let failed = 0;
    let rateLimited = false;

    for (const inst of instruments) {
      try {
        const domainInst = toDomainInstrument(inst);
        const quote = await service.getQuote(domainInst);
        if (quote) {
          refreshed++;
        } else {
          failed++;
        }
      } catch (e: unknown) {
        if (e instanceof ProviderError && e.type === 'RATE_LIMITED') {
          rateLimited = true;
        }
        failed++;
      }
    }

    return Response.json({ refreshed, failed, rateLimited });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return apiError(500, 'INTERNAL_ERROR', message);
  }
}
