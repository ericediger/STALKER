import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/errors';
import { transactionInputSchema } from '@/lib/validators/transactionInput';
import { toDecimal } from '@stalker/shared';
import type { Transaction as AnalyticsTransaction } from '@stalker/shared';
import { validateTransactionSet } from '@stalker/analytics';

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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;

    const tx = await prisma.transaction.findUnique({
      where: { id },
      include: { instrument: true },
    });

    if (!tx) {
      return apiError(404, 'NOT_FOUND', `Transaction '${id}' not found`);
    }

    return Response.json(serializeTransaction(tx));
  } catch (err: unknown) {
    console.error('GET /api/transactions/[id] error:', err);
    return apiError(500, 'INTERNAL_ERROR', 'Failed to fetch transaction');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;

    const existing = await prisma.transaction.findUnique({
      where: { id },
      include: { instrument: true },
    });

    if (!existing) {
      return apiError(404, 'NOT_FOUND', `Transaction '${id}' not found`);
    }

    const body: unknown = await request.json();
    const parsed = transactionInputSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(400, 'VALIDATION_ERROR', 'Invalid transaction input', {
        issues: parsed.error.issues,
      });
    }

    const { instrumentId, type, quantity, price, tradeAt, fees, notes } = parsed.data;

    // Verify instrument exists
    const instrument = await prisma.instrument.findUnique({
      where: { id: instrumentId },
    });
    if (!instrument) {
      return apiError(404, 'NOT_FOUND', `Instrument '${instrumentId}' not found`);
    }

    // Build the modified transaction for validation
    const modifiedTx: AnalyticsTransaction = {
      id,
      instrumentId,
      type: type as 'BUY' | 'SELL',
      quantity: toDecimal(quantity),
      price: toDecimal(price),
      fees: toDecimal(fees),
      tradeAt: new Date(tradeAt),
      notes: notes ?? null,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    };

    // Fetch all transactions for this instrument, replacing the modified one
    const existingTxs = await prisma.transaction.findMany({
      where: { instrumentId },
      orderBy: { tradeAt: 'asc' },
    });

    const allTxs = existingTxs
      .map((tx) => (tx.id === id ? modifiedTx : prismaToAnalyticsTransaction(tx)))
      .sort((a, b) => a.tradeAt.getTime() - b.tradeAt.getTime());

    // If instrument changed, also validate the original instrument's remaining transactions
    if (existing.instrumentId !== instrumentId) {
      const originalTxs = await prisma.transaction.findMany({
        where: { instrumentId: existing.instrumentId },
        orderBy: { tradeAt: 'asc' },
      });
      const remainingOriginal = originalTxs
        .filter((tx) => tx.id !== id)
        .map(prismaToAnalyticsTransaction);

      const originalValidation = validateTransactionSet(remainingOriginal);
      if (!originalValidation.valid) {
        const origInstrument = await prisma.instrument.findUnique({
          where: { id: existing.instrumentId },
        });
        return apiError(422, 'SELL_VALIDATION_FAILED', 'Removing transaction from original instrument would create negative position', {
          instrumentSymbol: origInstrument?.symbol ?? existing.instrumentId,
          firstViolationDate: originalValidation.firstNegativeDate.toISOString(),
          deficitQuantity: originalValidation.deficitQty.toString(),
        });
      }
    }

    // Validate the target instrument's transaction set
    const validation = validateTransactionSet(allTxs);
    if (!validation.valid) {
      return apiError(422, 'SELL_VALIDATION_FAILED', 'Transaction would create negative position', {
        instrumentSymbol: instrument.symbol,
        firstViolationDate: validation.firstNegativeDate.toISOString(),
        deficitQuantity: validation.deficitQty.toString(),
      });
    }

    // Update transaction
    const updated = await prisma.transaction.update({
      where: { id },
      data: {
        instrumentId,
        type,
        quantity,
        price,
        fees,
        tradeAt: new Date(tradeAt),
        notes: notes ?? null,
      },
    });

    // Snapshot rebuild skipped for now

    return Response.json(serializeTransaction(updated));
  } catch (err: unknown) {
    console.error('PUT /api/transactions/[id] error:', err);
    return apiError(500, 'INTERNAL_ERROR', 'Failed to update transaction');
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;

    const existing = await prisma.transaction.findUnique({
      where: { id },
      include: { instrument: true },
    });

    if (!existing) {
      return apiError(404, 'NOT_FOUND', `Transaction '${id}' not found`);
    }

    // Fetch all transactions for this instrument excluding the one being deleted
    const remainingTxs = await prisma.transaction.findMany({
      where: { instrumentId: existing.instrumentId, NOT: { id } },
      orderBy: { tradeAt: 'asc' },
    });

    // Re-validate remaining transactions (removing a BUY could invalidate a later SELL)
    const validation = validateTransactionSet(
      remainingTxs.map(prismaToAnalyticsTransaction),
    );

    if (!validation.valid) {
      return apiError(422, 'SELL_VALIDATION_FAILED', 'Deleting this transaction would create a negative position', {
        instrumentSymbol: existing.instrument.symbol,
        firstViolationDate: validation.firstNegativeDate.toISOString(),
        deficitQuantity: validation.deficitQty.toString(),
      });
    }

    // Delete transaction
    await prisma.transaction.delete({ where: { id } });

    // Snapshot rebuild skipped for now

    return Response.json({ deleted: true, id });
  } catch (err: unknown) {
    console.error('DELETE /api/transactions/[id] error:', err);
    return apiError(500, 'INTERNAL_ERROR', 'Failed to delete transaction');
  }
}
