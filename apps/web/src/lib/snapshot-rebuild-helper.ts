import { prisma } from '@/lib/prisma';
import { PrismaPriceLookup } from '@/lib/prisma-price-lookup';
import { PrismaSnapshotStore } from '@/lib/prisma-snapshot-store';
import { rebuildSnapshotsFrom } from '@stalker/analytics';
import { getNextTradingDay, isTradingDay } from '@stalker/market-data';
import { toDecimal } from '@stalker/shared';
import type { Instrument, Transaction, InstrumentType, TransactionType } from '@stalker/shared';

function toSharedInstrument(prismaInst: {
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

function toSharedTransaction(prismaTx: {
  id: string;
  instrumentId: string;
  type: string;
  quantity: unknown;
  price: unknown;
  fees: unknown;
  tradeAt: Date;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Transaction {
  return {
    ...prismaTx,
    type: prismaTx.type as TransactionType,
    quantity: toDecimal(prismaTx.quantity!.toString()),
    price: toDecimal(prismaTx.price!.toString()),
    fees: toDecimal(prismaTx.fees!.toString()),
  };
}

function toDateStr(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Trigger a snapshot rebuild from the given date forward.
 * Loads all instruments and transactions from the database and delegates to the analytics engine.
 *
 * NOTE (W-3): This runs outside the Prisma transaction that performs the mutation.
 * Acceptable for MVP since we're single-user and the rebuild is idempotent.
 */
export async function triggerSnapshotRebuild(affectedDate: Date): Promise<void> {
  const affectedDateStr = toDateStr(affectedDate);

  const [prismaInstruments, prismaTransactions] = await Promise.all([
    prisma.instrument.findMany(),
    prisma.transaction.findMany({ orderBy: { tradeAt: 'asc' } }),
  ]);

  if (prismaTransactions.length === 0) {
    // No transactions remain — clear all snapshots
    const store = new PrismaSnapshotStore(prisma);
    await store.deleteFrom('1970-01-01');
    return;
  }

  const instruments = prismaInstruments.map(toSharedInstrument);
  const transactions = prismaTransactions.map(toSharedTransaction);

  await rebuildSnapshotsFrom({
    affectedDate: affectedDateStr,
    transactions,
    instruments,
    priceLookup: new PrismaPriceLookup(prisma),
    snapshotStore: new PrismaSnapshotStore(prisma),
    calendar: { getNextTradingDay, isTradingDay },
  });
}
