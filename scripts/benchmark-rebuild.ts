/**
 * Benchmark the snapshot rebuild with the real portfolio.
 * Run with: npx tsx scripts/benchmark-rebuild.ts
 */
import { PrismaClient } from '@prisma/client';
import { BatchPriceLookup } from '../apps/web/src/lib/batch-price-lookup.js';
import { PrismaSnapshotStore } from '../apps/web/src/lib/prisma-snapshot-store.js';
import { rebuildSnapshotsFrom } from '@stalker/analytics';
import { getNextTradingDay, isTradingDay } from '@stalker/market-data';
import { toDecimal } from '@stalker/shared';
import type { Instrument, Transaction, InstrumentType, TransactionType } from '@stalker/shared';

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../apps/web/data/portfolio.db');

const prisma = new PrismaClient({
  datasources: {
    db: { url: `file:${dbPath}` },
  },
});

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

async function main() {
  console.log('=== Snapshot Rebuild Benchmark ===');

  const [prismaInstruments, prismaTransactions, barCount] = await Promise.all([
    prisma.instrument.findMany(),
    prisma.transaction.findMany({ orderBy: { tradeAt: 'asc' } }),
    prisma.priceBar.count(),
  ]);

  console.log(`Instruments: ${prismaInstruments.length}`);
  console.log(`Transactions: ${prismaTransactions.length}`);
  console.log(`Price bars: ${barCount}`);

  const instruments = prismaInstruments.map(toSharedInstrument);
  const transactions = prismaTransactions.map(toSharedTransaction);

  // Find earliest transaction date
  const earliest = transactions.reduce((min, tx) =>
    tx.tradeAt < min ? tx.tradeAt : min, transactions[0]!.tradeAt);
  const earliestDate = earliest.toISOString().slice(0, 10);
  console.log(`Earliest transaction: ${earliestDate}`);

  // --- Benchmark: BatchPriceLookup preload ---
  const preloadStart = Date.now();
  const instrumentIds = instruments.map((i) => i.id);

  await prisma.$transaction(async (tx) => {
    const priceLookup = await BatchPriceLookup.preload(tx, instrumentIds);
    const preloadMs = Date.now() - preloadStart;
    console.log(`\nBatchPriceLookup preload: ${preloadMs}ms`);

    // --- Benchmark: Full rebuild ---
    const rebuildStart = Date.now();
    const snapshotStore = new PrismaSnapshotStore(tx);

    const result = await rebuildSnapshotsFrom({
      affectedDate: earliestDate,
      transactions,
      instruments,
      priceLookup,
      snapshotStore,
      calendar: { getNextTradingDay, isTradingDay },
    });

    const rebuildMs = Date.now() - rebuildStart;
    console.log(`Rebuild (delete + compute + write): ${rebuildMs}ms`);
    console.log(`Snapshots rebuilt: ${result.snapshotsRebuilt}`);
    console.log(`\nTotal: ${Date.now() - preloadStart}ms`);
  }, { timeout: 120000 });

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
