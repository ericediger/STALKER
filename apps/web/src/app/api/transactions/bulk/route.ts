import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/errors';
import { generateUlid, toDecimal } from '@stalker/shared';
import type { Transaction as AnalyticsTransaction } from '@stalker/shared';
import { validateTransactionSet } from '@stalker/analytics';
import { triggerSnapshotRebuild } from '@/lib/snapshot-rebuild-helper';
import { findOrCreateInstrument, triggerBackfill } from '@/lib/auto-create-instrument';

/* -------------------------------------------------------------------------- */
/*  Request validation schema                                                  */
/* -------------------------------------------------------------------------- */

const bulkRowSchema = z.object({
  symbol: z.string().min(1, 'symbol is required'),
  type: z.enum(['BUY', 'SELL']),
  quantity: z.string().regex(/^\d+(\.\d+)?$/, 'Must be a positive decimal number'),
  price: z.string().regex(/^\d+(\.\d+)?$/, 'Must be a positive decimal number'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  fees: z.string().regex(/^\d+(\.\d+)?$/, 'Must be a non-negative decimal number').optional().default('0'),
  notes: z.string().optional(),
});

const bulkRequestSchema = z.object({
  rows: z.array(bulkRowSchema),
  dryRun: z.boolean().optional().default(false),
});

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Convert a YYYY-MM-DD date string to a UTC Date.
 * Uses noon UTC to match the existing single transaction creation pattern
 * (see formatTransactionForApi in transaction-utils.ts).
 */
function dateToUtcTradeAt(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00.000Z`);
}

/* -------------------------------------------------------------------------- */
/*  POST /api/transactions/bulk                                                */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const parsed = bulkRequestSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(400, 'VALIDATION_ERROR', 'Invalid bulk transaction input', {
        issues: parsed.error.issues,
      });
    }

    const { rows, dryRun } = parsed.data;

    // Empty batch is a valid no-op
    if (rows.length === 0) {
      return Response.json({ inserted: 0, errors: [], earliestDate: null });
    }

    // --- Step 1: Resolve symbols to instruments (auto-create if missing) ---
    const uniqueSymbols = [...new Set(rows.map((r) => r.symbol.toUpperCase()))];
    const existingInstruments = await prisma.instrument.findMany({
      where: { symbol: { in: uniqueSymbols } },
    });
    const symbolToInstrument = new Map(existingInstruments.map((inst) => [inst.symbol, inst]));

    // Auto-create any missing instruments (skip backfill to avoid SQLite contention)
    const missingSymbols = uniqueSymbols.filter((s) => !symbolToInstrument.has(s));
    const autoCreated: string[] = [];
    const newInstruments: Array<{ id: string; symbol: string; name: string; type: string; currency: string; exchange: string; exchangeTz: string; providerSymbolMap: string; firstBarDate: string | null; createdAt: Date; updatedAt: Date }> = [];
    for (const symbol of missingSymbols) {
      const instrument = await findOrCreateInstrument(symbol, true); // skip backfill
      symbolToInstrument.set(instrument.symbol, instrument);
      autoCreated.push(instrument.symbol);
      newInstruments.push(instrument);
    }

    // --- Step 2: Build prospective transactions ---
    const now = new Date();
    const prospectiveTransactions: Array<{
      id: string;
      instrumentId: string;
      type: 'BUY' | 'SELL';
      quantity: string;
      price: string;
      fees: string;
      tradeAt: Date;
      notes: string | null;
      rowIndex: number;
      symbol: string;
    }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const symbol = row.symbol.toUpperCase();
      const instrument = symbolToInstrument.get(symbol)!;
      const tradeAt = dateToUtcTradeAt(row.date);

      prospectiveTransactions.push({
        id: generateUlid(),
        instrumentId: instrument.id,
        type: row.type,
        quantity: row.quantity,
        price: row.price,
        fees: row.fees ?? '0',
        tradeAt,
        notes: row.notes ?? null,
        rowIndex: i,
        symbol,
      });
    }

    // --- Step 3: Sell validation per instrument ---
    // Group by instrumentId
    const instrumentIds = [...new Set(prospectiveTransactions.map((t) => t.instrumentId))];

    // Fetch all existing transactions for affected instruments
    const existingTxs = await prisma.transaction.findMany({
      where: { instrumentId: { in: instrumentIds } },
      orderBy: { tradeAt: 'asc' },
    });

    // Run sell validation per instrument (existing + new, sorted by tradeAt)
    for (const instrumentId of instrumentIds) {
      const existingForInstrument = existingTxs
        .filter((tx) => tx.instrumentId === instrumentId)
        .map((tx): AnalyticsTransaction => ({
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
        }));

      const newForInstrument = prospectiveTransactions
        .filter((t) => t.instrumentId === instrumentId)
        .map((t): AnalyticsTransaction => ({
          id: t.id,
          instrumentId: t.instrumentId,
          type: t.type,
          quantity: toDecimal(t.quantity),
          price: toDecimal(t.price),
          fees: toDecimal(t.fees),
          tradeAt: t.tradeAt,
          notes: t.notes,
          createdAt: now,
          updatedAt: now,
        }));

      const allTxs = [...existingForInstrument, ...newForInstrument]
        .sort((a, b) => a.tradeAt.getTime() - b.tradeAt.getTime());

      const validation = validateTransactionSet(allTxs);
      if (!validation.valid) {
        // Find which row caused the issue
        const offendingNew = prospectiveTransactions.find(
          (t) => t.id === validation.offendingTransaction.id,
        );
        const symbol = offendingNew?.symbol
          ?? [...symbolToInstrument.values()].find((inst) => inst.id === instrumentId)?.symbol
          ?? 'UNKNOWN';

        return Response.json({
          inserted: 0,
          errors: [{
            lineNumber: offendingNew ? offendingNew.rowIndex + 1 : 0,
            symbol,
            error: `Sell validation failed: position would go negative by ${validation.deficitQty.toString()} shares on ${validation.firstNegativeDate.toISOString()}`,
          }],
          earliestDate: null,
        }, { status: 422 });
      }
    }

    // --- Step 4: Dry run check ---
    if (dryRun) {
      return Response.json({ inserted: 0, errors: [], earliestDate: null });
    }

    // --- Step 5: Insert all rows in a single Prisma transaction ---
    const txData = prospectiveTransactions.map((t) => ({
      id: t.id,
      instrumentId: t.instrumentId,
      type: t.type,
      quantity: t.quantity,
      price: t.price,
      fees: t.fees,
      tradeAt: t.tradeAt,
      notes: t.notes,
    }));

    await prisma.$transaction(async (tx) => {
      for (const data of txData) {
        await tx.transaction.create({ data });
      }
    });

    // --- Step 6: Trigger snapshot rebuild from earliest tradeAt (fire-and-forget) ---
    // For bulk imports with many instruments, the rebuild can take minutes.
    // We don't block the response — the dashboard will trigger a rebuild if needed.
    const earliestTradeAt = prospectiveTransactions.reduce(
      (earliest, t) => (t.tradeAt < earliest ? t.tradeAt : earliest),
      prospectiveTransactions[0]!.tradeAt,
    );

    triggerSnapshotRebuild(earliestTradeAt).catch((err: unknown) => {
      console.error('Snapshot rebuild after bulk import failed:', err);
    });

    // --- Step 7: Trigger backfills for auto-created instruments (fire-and-forget, sequential) ---
    if (newInstruments.length > 0) {
      (async () => {
        for (const inst of newInstruments) {
          try {
            await triggerBackfill(inst);
          } catch (err: unknown) {
            console.error(`Backfill failed for ${inst.symbol}:`, err);
          }
        }
      })().catch(() => { /* swallow */ });
    }

    return Response.json({
      inserted: rows.length,
      errors: [],
      earliestDate: earliestTradeAt.toISOString(),
      autoCreatedInstruments: autoCreated,
    }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('POST /api/transactions/bulk error:', err);
    return apiError(500, 'INTERNAL_ERROR', `Bulk import failed: ${msg}`);
  }
}
