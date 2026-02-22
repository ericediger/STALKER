import { vi } from 'vitest';

// Prisma Decimal-like object that route handlers receive
export function prismaDecimal(value: string): { toString(): string } {
  return { toString: () => value };
}

// Creates a mock instrument record as Prisma would return it
export function mockInstrument(overrides: Partial<{
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
}> = {}) {
  const now = new Date();
  return {
    id: overrides.id ?? 'test-instrument-id',
    symbol: overrides.symbol ?? 'AAPL',
    name: overrides.name ?? 'Apple Inc.',
    type: overrides.type ?? 'STOCK',
    currency: overrides.currency ?? 'USD',
    exchange: overrides.exchange ?? 'NASDAQ',
    exchangeTz: overrides.exchangeTz ?? 'America/New_York',
    providerSymbolMap: overrides.providerSymbolMap ?? JSON.stringify({ fmp: 'AAPL', stooq: 'aapl.us' }),
    firstBarDate: overrides.firstBarDate ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

// Creates a mock transaction record as Prisma would return it
export function mockTransaction(overrides: Partial<{
  id: string;
  instrumentId: string;
  type: string;
  quantity: string;
  price: string;
  fees: string;
  tradeAt: Date;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  instrument: ReturnType<typeof mockInstrument>;
}> = {}) {
  const now = new Date();
  return {
    id: overrides.id ?? 'test-tx-id',
    instrumentId: overrides.instrumentId ?? 'test-instrument-id',
    type: overrides.type ?? 'BUY',
    quantity: prismaDecimal(overrides.quantity ?? '100'),
    price: prismaDecimal(overrides.price ?? '185.50'),
    fees: prismaDecimal(overrides.fees ?? '0'),
    tradeAt: overrides.tradeAt ?? new Date('2026-02-20T14:30:00Z'),
    notes: overrides.notes ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    ...(overrides.instrument ? { instrument: overrides.instrument } : {}),
  };
}

// Builds a mock PrismaClient with all methods used by route handlers
export function createMockPrisma() {
  return {
    instrument: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    transaction: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    priceBar: {
      deleteMany: vi.fn(),
    },
    latestQuote: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };
}
