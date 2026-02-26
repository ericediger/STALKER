/**
 * One-off script: Re-backfill price bars to extend history to 10 years.
 * Fills the gap for instruments whose firstBarDate is too recent for their earliest transaction.
 * Run with: npx tsx scripts/re-backfill-history.ts
 *
 * Rate limits: Batches of 45 with 60s pause between batches (Tiingo: 50/hr).
 * Idempotent: Existing bars are skipped via date-range targeting and individual INSERT OR IGNORE.
 */
import { PrismaClient } from '@prisma/client';
import path from 'path';

import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../apps/web/.env.local') });

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

const BATCH_SIZE = 45;
const BATCH_PAUSE_MS = 61_000; // 61s between batches

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { TiingoProvider } = await import('../packages/market-data/src/index.js');
  const tiingo = new TiingoProvider();

  // Get all instruments with their earliest transaction and current firstBarDate
  const instruments = await prisma.instrument.findMany();
  const transactions = await prisma.transaction.groupBy({
    by: ['instrumentId'],
    _min: { tradeAt: true },
  });

  const earliestTxMap = new Map(
    transactions.map((t) => [t.instrumentId, t._min.tradeAt]),
  );

  // 10 years ago from today
  const tenYearsAgo = new Date();
  tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);

  // Determine which instruments need re-backfill
  const toBackfill: Array<{
    id: string;
    symbol: string;
    providerSymbolMap: string;
    currentFirstBar: string | null;
    targetStart: Date;
  }> = [];

  for (const inst of instruments) {
    const earliestTx = earliestTxMap.get(inst.id);
    if (!earliestTx) continue; // No transactions — skip

    // Target start: 30 days before earliest transaction, but no earlier than 10 years ago
    const txDate = new Date(earliestTx);
    const targetStart = new Date(txDate);
    targetStart.setDate(targetStart.getDate() - 30);
    if (targetStart < tenYearsAgo) {
      targetStart.setTime(tenYearsAgo.getTime());
    }

    // Already have bars from before the target?
    if (inst.firstBarDate) {
      const fbDate = new Date(inst.firstBarDate);
      if (fbDate <= targetStart) continue; // Already sufficient
    }

    toBackfill.push({
      id: inst.id,
      symbol: inst.symbol,
      providerSymbolMap: inst.providerSymbolMap,
      currentFirstBar: inst.firstBarDate,
      targetStart,
    });
  }

  console.log(
    `Found ${toBackfill.length} instruments needing history extension (out of ${instruments.length} total).\n`,
  );

  if (toBackfill.length === 0) {
    console.log('Nothing to do.');
    await prisma.$disconnect();
    return;
  }

  let totalBarsAdded = 0;
  let success = 0;
  let failed = 0;

  for (let i = 0; i < toBackfill.length; i++) {
    // Rate limit: pause between batches
    if (i > 0 && i % BATCH_SIZE === 0) {
      console.log(`\n--- Pausing 61s for Tiingo rate limit (batch ${Math.floor(i / BATCH_SIZE)}) ---\n`);
      await sleep(BATCH_PAUSE_MS);
    }

    const inst = toBackfill[i];
    const providerMap = JSON.parse(inst.providerSymbolMap) as Record<string, string>;
    const tiingoSymbol = providerMap.tiingo ?? inst.symbol.replace(/\./g, '-');

    // Fetch from targetStart to current firstBarDate (or today if no bars)
    const fetchEnd = inst.currentFirstBar
      ? new Date(inst.currentFirstBar)
      : new Date();

    const startStr = inst.targetStart.toISOString().slice(0, 10);
    const endStr = fetchEnd.toISOString().slice(0, 10);

    process.stdout.write(
      `[${i + 1}/${toBackfill.length}] ${inst.symbol} (${startStr} → ${endStr})... `,
    );

    try {
      const bars = await tiingo.getHistory(
        tiingoSymbol,
        inst.targetStart,
        fetchEnd,
        'daily',
      );

      if (bars.length === 0) {
        console.log('0 bars (no data from Tiingo)');
        failed++;
        continue;
      }

      // Get existing bar dates to avoid UNIQUE constraint violations
      const existingBars = await prisma.priceBar.findMany({
        where: { instrumentId: inst.id },
        select: { date: true },
      });
      const existingDates = new Set(existingBars.map((b) => b.date));

      const newBars = bars.filter((bar) => !existingDates.has(bar.date));

      if (newBars.length > 0) {
        await prisma.priceBar.createMany({
          data: newBars.map((bar) => ({
            instrumentId: inst.id,
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
      }

      // Update firstBarDate to the earliest bar across old + new
      const allDates = [...existingDates, ...newBars.map((b) => b.date)].sort();
      const newFirstBar = allDates[0] ?? null;

      if (newFirstBar && newFirstBar !== inst.currentFirstBar) {
        await prisma.instrument.update({
          where: { id: inst.id },
          data: { firstBarDate: newFirstBar },
        });
      }

      console.log(
        `${newBars.length} new bars added (${bars.length} fetched, ${bars.length - newBars.length} dupes skipped)`,
      );
      totalBarsAdded += newBars.length;
      success++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAILED: ${msg}`);
      failed++;
    }
  }

  console.log(
    `\nDone. ${success} succeeded, ${failed} failed. ${totalBarsAdded} total new bars added.`,
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
