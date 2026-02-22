import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/errors';
import { instrumentInputSchema } from '@/lib/validators/instrumentInput';
import {
  generateUlid,
  EXCHANGE_TIMEZONE_MAP,
  DEFAULT_TIMEZONE,
} from '@stalker/shared';

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

    // Build provider symbol map
    const providerSymbolMap: Record<string, string> = {
      fmp: symbol,
      stooq: `${symbol.toLowerCase()}.us`,
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

    return Response.json(serializeInstrument(instrument), { status: 201 });
  } catch (err: unknown) {
    console.error('POST /api/instruments error:', err);
    return apiError(500, 'INTERNAL_ERROR', 'Failed to create instrument');
  }
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
