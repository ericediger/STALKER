import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const DB_PATH = path.resolve(
  import.meta.dirname,
  '..',
  'data',
  'portfolio.db',
);

const prisma = new PrismaClient({
  datasourceUrl: `file:${DB_PATH}`,
});

const TEST_INSTRUMENT_ID = 'PF2_DECIMAL_TEST_INSTRUMENT';
const testTransactionIds: string[] = [];

/**
 * Compare two Prisma Decimal values for exact numeric equality.
 * Prisma Decimal.toString() may use scientific notation (e.g. '1e-8'),
 * so we use .equals() which compares the numeric values.
 */
function decimalEquals(actual: Prisma.Decimal, expectedStr: string): boolean {
  return actual.equals(new Prisma.Decimal(expectedStr));
}

beforeAll(async () => {
  await prisma.$connect();
  await prisma.instrument.upsert({
    where: { id: TEST_INSTRUMENT_ID },
    create: {
      id: TEST_INSTRUMENT_ID,
      symbol: 'PF2TEST',
      name: 'PF-2 Decimal Round-Trip Test',
      type: 'STOCK',
      currency: 'USD',
      exchange: 'NYSE',
      exchangeTz: 'America/New_York',
    },
    update: {},
  });
});

afterAll(async () => {
  if (testTransactionIds.length > 0) {
    await prisma.transaction.deleteMany({
      where: { id: { in: testTransactionIds } },
    });
  }
  await prisma.instrument.deleteMany({
    where: { id: TEST_INSTRUMENT_ID },
  });
  await prisma.$disconnect();
});

describe('PF-2: Decimal round-trip through Prisma/SQLite', () => {
  const testValues = [
    '123.456789012345',
    '0.1',
    '99999999.99',
    '0.00000001',
  ];

  for (const value of testValues) {
    it(`preserves exact decimal "${value}" through write → read`, async () => {
      const txId = randomUUID();
      testTransactionIds.push(txId);

      await prisma.transaction.create({
        data: {
          id: txId,
          instrumentId: TEST_INSTRUMENT_ID,
          type: 'BUY',
          quantity: value,
          price: value,
          fees: value,
          tradeAt: new Date('2025-01-01T12:00:00Z'),
        },
      });

      const readBack = await prisma.transaction.findUniqueOrThrow({
        where: { id: txId },
      });

      // Prisma returns Decimal objects for Decimal columns.
      // Use .equals() for value comparison since .toString() may use
      // scientific notation (e.g. '1e-8' vs '0.00000001').
      expect(decimalEquals(readBack.quantity, value)).toBe(true);
      expect(decimalEquals(readBack.price, value)).toBe(true);
      expect(decimalEquals(readBack.fees, value)).toBe(true);
    });
  }
});
