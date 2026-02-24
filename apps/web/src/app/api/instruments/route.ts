import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/errors';
import { instrumentInputSchema } from '@/lib/validators/instrumentInput';
import { getMarketDataService } from '@/lib/market-data-service';
import {
  generateUlid,
  EXCHANGE_TIMEZONE_MAP,
  DEFAULT_TIMEZONE,
} from '@stalker/shared';
import type { Instrument, InstrumentType } from '@stalker/shared';

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

/**
 * Build the tiingo symbol from the canonical symbol.
 * Tiingo uses hyphens where FMP/exchanges use dots (e.g. BRK.B → BRK-B).
 */
function buildTiingoSymbol(symbol: string): string {
  return symbol.replace(/\./g, '-');
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const parsed = instrumentInputSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(400, 'VALIDATION_ERROR', 'Invalid instrument input', {
        issues: parsed.error.issues,
      });
    }

    const { symbol, name, type, exchange } = parsed.data;

    // Check for duplicate symbol
    const existing = await prisma.instrument.findUnique({
      where: { symbol },
    });
    if (existing) {
      return apiError(409, 'CONFLICT', `Instrument with symbol '${symbol}' already exists`);
    }

    // Map exchange to timezone
    const exchangeTz = EXCHANGE_TIMEZONE_MAP[exchange] ?? DEFAULT_TIMEZONE;

    // Build provider symbol map (FMP uses dots, Tiingo uses hyphens)
    const providerSymbolMap: Record<string, string> = {
      fmp: symbol,
      tiingo: buildTiingoSymbol(symbol),
    };

    const id = generateUlid();

    const instrument = await prisma.instrument.create({
      data: {
        id,
        symbol,
        name,
        type,
        exchange,
        exchangeTz,
        providerSymbolMap: JSON.stringify(providerSymbolMap),
        firstBarDate: null,
      },
    });

    // Return immediately — backfill runs after response
    const response = Response.json(serializeInstrument(instrument), { status: 201 });

    // Trigger historical backfill (synchronous within request for MVP/single-user)
    // This runs after response is constructed but before it's sent
    triggerBackfill(instrument).catch((err: unknown) => {
      console.error(`Backfill failed for ${symbol}:`, err);
    });

    return response;
  } catch (err: unknown) {
    console.error('POST /api/instruments error:', err);
    return apiError(500, 'INTERNAL_ERROR', 'Failed to create instrument');
  }
}

/**
 * Fetch ~2 years of daily price bars from Tiingo and bulk-insert into PriceBar table.
 * Updates firstBarDate on the instrument after successful backfill.
 */
async function triggerBackfill(prismaInst: {
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
}): Promise<void> {
  const service = getMarketDataService();

  // Convert Prisma instrument to domain Instrument for the service
  const domainInstrument: Instrument = {
    ...prismaInst,
    type: prismaInst.type as InstrumentType,
    providerSymbolMap: JSON.parse(prismaInst.providerSymbolMap) as Record<string, string>,
  };

  // Fetch ~2 years of daily bars
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 2);

  const bars = await service.getHistory(domainInstrument, start, end);

  if (bars.length === 0) {
    console.warn(`No bars returned for ${prismaInst.symbol} — backfill skipped`);
    return;
  }

  // Bulk insert bars (SQLite does not support skipDuplicates, so we just use createMany)
  await prisma.priceBar.createMany({
    data: bars.map((bar) => ({
      instrumentId: prismaInst.id,
      provider: bar.provider,
      resolution: bar.resolution,
      date: bar.date,
      time: bar.time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    })),
  });

  // Determine firstBarDate from earliest bar
  const sortedDates = bars.map((b) => b.date).sort();
  const firstBarDate = sortedDates[0] ?? null;

  if (firstBarDate) {
    await prisma.instrument.update({
      where: { id: prismaInst.id },
      data: { firstBarDate },
    });
  }

  console.log(
    `Backfill complete for ${prismaInst.symbol}: ${bars.length} bars, firstBarDate=${firstBarDate}`
  );
}

export async function GET(): Promise<Response> {
  try {
    const instruments = await prisma.instrument.findMany({
      orderBy: { symbol: 'asc' },
    });

    return Response.json(instruments.map(serializeInstrument));
  } catch (err: unknown) {
    console.error('GET /api/instruments error:', err);
    return apiError(500, 'INTERNAL_ERROR', 'Failed to fetch instruments');
  }
}
