/**
 * One-off script: Backfill price bars for instruments that have 0 bars.
 * Run with: npx tsx scripts/backfill-missing.ts
 */
import { PrismaClient } from '@prisma/client';
import path from 'path';

// Load env
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../apps/web/.env.local') });

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

async function main() {
  // Find instruments with 0 price bars
  const instruments = await prisma.instrument.findMany();
  const barCounts = await prisma.priceBar.groupBy({
    by: ['instrumentId'],
    _count: true,
  });
  const barCountMap = new Map(barCounts.map((b) => [b.instrumentId, b._count]));

  const missing = instruments.filter((i) => !barCountMap.has(i.id));
  console.log(`Found ${missing.length} instruments with 0 price bars. Starting backfill...`);

  // Dynamic import of market data service (use relative path for tsx compat)
  const { TiingoProvider } = await import('../packages/market-data/src/index.js');
  const tiingo = new TiingoProvider();

  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 10);

  let success = 0;
  let failed = 0;

  for (const inst of missing) {
    const providerMap = JSON.parse(inst.providerSymbolMap) as Record<string, string>;
    const tiingoSymbol = providerMap.tiingo ?? inst.symbol.replace(/\./g, '-');

    process.stdout.write(`  ${inst.symbol} (${tiingoSymbol})... `);

    try {
      const bars = await tiingo.getHistory(tiingoSymbol, start, end, 'daily');

      if (bars.length === 0) {
        console.log(`0 bars (no data from Tiingo)`);
        failed++;
        continue;
      }

      await prisma.priceBar.createMany({
        data: bars.map((bar) => ({
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

      const sortedDates = bars.map((b) => b.date).sort();
      const firstBarDate = sortedDates[0] ?? null;
      if (firstBarDate) {
        await prisma.instrument.update({
          where: { id: inst.id },
          data: { firstBarDate },
        });
      }

      console.log(`${bars.length} bars (${sortedDates[0]} to ${sortedDates[sortedDates.length - 1]})`);
      success++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAILED: ${msg}`);
      failed++;
    }
  }

  console.log(`\nDone. ${success} succeeded, ${failed} failed.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
