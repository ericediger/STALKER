import { PrismaClient } from '@prisma/client';
import { generateUlid } from '@stalker/shared';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const instrumentId = generateUlid();

  // 1. Create a single instrument
  await prisma.instrument.upsert({
    where: { symbol: 'AAPL' },
    update: {},
    create: {
      id: instrumentId,
      symbol: 'AAPL',
      name: 'Apple Inc.',
      type: 'STOCK',
      currency: 'USD',
      exchange: 'NASDAQ',
      exchangeTz: 'America/New_York',
      providerSymbolMap: JSON.stringify({ fmp: 'AAPL', stooq: 'aapl.us' }),
      firstBarDate: '2026-02-20',
    },
  });

  // Look up the actual instrument (in case upsert used existing)
  const instrument = await prisma.instrument.findUniqueOrThrow({
    where: { symbol: 'AAPL' },
  });

  // 2. Create a single transaction
  const existingTx = await prisma.transaction.findFirst({
    where: { instrumentId: instrument.id },
  });
  if (!existingTx) {
    await prisma.transaction.create({
      data: {
        id: generateUlid(),
        instrumentId: instrument.id,
        type: 'BUY',
        quantity: '100',
        price: '185.50',
        fees: '0',
        tradeAt: new Date('2026-02-20T14:30:00Z'),
      },
    });
  }

  // 3. Create a single price bar
  const existingBar = await prisma.priceBar.findFirst({
    where: { instrumentId: instrument.id, date: '2026-02-20' },
  });
  if (!existingBar) {
    await prisma.priceBar.create({
      data: {
        instrumentId: instrument.id,
        provider: 'fmp',
        resolution: '1D',
        date: '2026-02-20',
        open: '184.00',
        high: '186.50',
        low: '183.50',
        close: '185.50',
        volume: 50000000,
      },
    });
  }

  console.log('Seed complete: 1 instrument (AAPL), 1 BUY transaction, 1 price bar');
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
