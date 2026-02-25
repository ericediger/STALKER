import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/errors';
import { transactionInputSchema } from '@/lib/validators/transactionInput';
import { generateUlid, toDecimal } from '@stalker/shared';
import type { Transaction as AnalyticsTransaction } from '@stalker/shared';
import { validateTransactionSet } from '@stalker/analytics';
import { triggerSnapshotRebuild } from '@/lib/snapshot-rebuild-helper';
import { findOrCreateInstrument } from '@/lib/auto-create-instrument';

function prismaToAnalyticsTransaction(
  tx: { id: string; instrumentId: string; type: string; quantity: { toString(): string }; price: { toString(): string }; fees: { toString(): string }; tradeAt: Date; notes: string | null; createdAt: Date; updatedAt: Date },
): AnalyticsTransaction {
  return {
    id: tx.id,
    instrumentId: tx.instrumentId,
    type: tx.type as 'BUY' | 'SELL',
    quantity: toDecimal(tx.quantity.toString()),
    price: toDecimal(tx.price.toString()),
    fees: toDecimal(tx.fees.toString()),
    tradeAt: tx.tradeAt,
    notes: tx.notes,
    createdAt: tx.createdAt,
    updatedAt: tx.updatedAt,
  };
}

function serializeTransaction(tx: {
  id: string;
  instrumentId: string;
  type: string;
  quantity: { toString(): string };
  price: { toString(): string };
  fees: { toString(): string };
  tradeAt: Date;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: tx.id,
    instrumentId: tx.instrumentId,
    type: tx.type,
    quantity: tx.quantity.toString(),
    price: tx.price.toString(),
    fees: tx.fees.toString(),
    tradeAt: tx.tradeAt.toISOString(),
    notes: tx.notes,
    createdAt: tx.createdAt.toISOString(),
    updatedAt: tx.updatedAt.toISOString(),
  };
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const parsed = transactionInputSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(400, 'VALIDATION_ERROR', 'Invalid transaction input', {
        issues: parsed.error.issues,
      });
    }

    const { instrumentId: rawInstrumentId, type, quantity, price, tradeAt, fees, notes } = parsed.data;

    // Resolve instrument: if instrumentId looks like a symbol (short uppercase string, no ULID chars),
    // try to find or create by symbol. Otherwise look up by ID.
    let instrumentId = rawInstrumentId;
    let instrument: { id: string; symbol: string } | null = null;

    // Check if it's an existing instrument ID first
    instrument = await prisma.instrument.findUnique({
      where: { id: rawInstrumentId },
    });

    if (!instrument) {
      // Try treating it as a symbol — auto-create if needed
      const bySymbol = await findOrCreateInstrument(rawInstrumentId);
      instrument = bySymbol;
      instrumentId = bySymbol.id;
    }

    // Build the prospective transaction for validation
    const newTxId = generateUlid();
    const now = new Date();
    const prospectiveTx: AnalyticsTransaction = {
      id: newTxId,
      instrumentId,
      type: type as 'BUY' | 'SELL',
      quantity: toDecimal(quantity),
      price: toDecimal(price),
      fees: toDecimal(fees),
      tradeAt: new Date(tradeAt),
      notes: notes ?? null,
      createdAt: now,
      updatedAt: now,
    };

    // Fetch existing transactions for this instrument
    const existingTxs = await prisma.transaction.findMany({
      where: { instrumentId },
      orderBy: { tradeAt: 'asc' },
    });

    // Build full transaction set including the new one, sorted by tradeAt
    const allTxs = [
      ...existingTxs.map(prismaToAnalyticsTransaction),
      prospectiveTx,
    ].sort((a, b) => a.tradeAt.getTime() - b.tradeAt.getTime());

    // Run sell validation
    const validation = validateTransactionSet(allTxs);
    if (!validation.valid) {
      return apiError(422, 'SELL_VALIDATION_FAILED', 'Transaction would create negative position', {
        instrumentSymbol: instrument.symbol,
        firstViolationDate: validation.firstNegativeDate.toISOString(),
        deficitQuantity: validation.deficitQty.toString(),
      });
    }

    // Insert transaction
    const created = await prisma.transaction.create({
      data: {
        id: newTxId,
        instrumentId,
        type,
        quantity,
        price,
        fees,
        tradeAt: new Date(tradeAt),
        notes: notes ?? null,
      },
    });

    // Rebuild snapshots from the new transaction's trade date forward
    await triggerSnapshotRebuild(new Date(tradeAt));

    return Response.json(serializeTransaction(created), { status: 201 });
  } catch (err: unknown) {
    console.error('POST /api/transactions error:', err);
    return apiError(500, 'INTERNAL_ERROR', 'Failed to create transaction');
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const instrumentId = searchParams.get('instrumentId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const type = searchParams.get('type');

    const where: {
      instrumentId?: string;
      tradeAt?: { gte?: Date; lte?: Date };
      type?: string;
    } = {};

    if (instrumentId) {
      where.instrumentId = instrumentId;
    }

    if (startDate || endDate) {
      where.tradeAt = {};
      if (startDate) {
        where.tradeAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.tradeAt.lte = new Date(endDate);
      }
    }

    if (type) {
      where.type = type;
    }

    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { tradeAt: 'asc' },
      include: { instrument: { select: { symbol: true, name: true } } },
    });

    return Response.json(transactions.map((tx) => ({
      ...serializeTransaction(tx),
      symbol: tx.instrument.symbol,
      instrumentName: tx.instrument.name,
    })));
  } catch (err: unknown) {
    console.error('GET /api/transactions error:', err);
    return apiError(500, 'INTERNAL_ERROR', 'Failed to fetch transactions');
  }
}
