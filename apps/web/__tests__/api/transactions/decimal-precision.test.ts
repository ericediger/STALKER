import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockInstrument, mockTransaction } from '../../helpers/mock-prisma';

/**
 * Decimal precision E2E round-trip tests through the API layer.
 *
 * These tests verify that high-precision decimal values survive the full
 * API path: JSON input → Zod validation → Prisma create → serialization → JSON response.
 *
 * Complements apps/web/__tests__/decimal-roundtrip.test.ts which tests Prisma↔SQLite
 * directly. This file tests the API route layer on top.
 */

const { mockPrismaClient } = vi.hoisted(() => {
  const mockPrismaClient = {
    instrument: {
      findUnique: vi.fn(),
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
  };
  return { mockPrismaClient };
});

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrismaClient,
}));

vi.mock('@/lib/snapshot-rebuild-helper', () => ({
  triggerSnapshotRebuild: vi.fn().mockResolvedValue(undefined),
}));

import { POST, GET } from '@/app/api/transactions/route';

function makeJsonRequest(url: string, body: unknown, method: string = 'POST'): Request {
  return new Request(`http://localhost:3000${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(url: string): Request {
  return new Request(`http://localhost:3000${url}`);
}

describe('Decimal Precision — API Round-Trip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves high-precision price "185.7787708514" through POST → response', async () => {
    const precisePrice = '185.7787708514';
    const preciseQuantity = '100.123456789';
    const preciseFees = '9.87654321';

    mockPrismaClient.instrument.findUnique.mockResolvedValue(
      mockInstrument({ id: 'inst-1' }),
    );
    mockPrismaClient.transaction.findMany.mockResolvedValue([]);
    mockPrismaClient.transaction.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) =>
        mockTransaction({
          id: data.id as string,
          instrumentId: data.instrumentId as string,
          type: data.type as string,
          quantity: data.quantity as string,
          price: data.price as string,
          fees: data.fees as string,
          tradeAt: data.tradeAt as Date,
          notes: data.notes as string | null,
        }),
    );

    const req = makeJsonRequest('/api/transactions', {
      instrumentId: 'inst-1',
      type: 'BUY',
      quantity: preciseQuantity,
      price: precisePrice,
      tradeAt: '2026-02-20T14:30:00.000Z',
      fees: preciseFees,
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    // String comparison — exact match, no floating point corruption
    expect(body.price).toBe(precisePrice);
    expect(body.quantity).toBe(preciseQuantity);
    expect(body.fees).toBe(preciseFees);
  });

  it('preserves very small decimal "0.00000001" through POST → response', async () => {
    const tinyPrice = '0.00000001';

    mockPrismaClient.instrument.findUnique.mockResolvedValue(
      mockInstrument({ id: 'inst-1' }),
    );
    mockPrismaClient.transaction.findMany.mockResolvedValue([]);
    mockPrismaClient.transaction.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) =>
        mockTransaction({
          id: data.id as string,
          instrumentId: data.instrumentId as string,
          type: data.type as string,
          quantity: data.quantity as string,
          price: data.price as string,
          fees: data.fees as string,
          tradeAt: data.tradeAt as Date,
        }),
    );

    const req = makeJsonRequest('/api/transactions', {
      instrumentId: 'inst-1',
      type: 'BUY',
      quantity: '1',
      price: tinyPrice,
      tradeAt: '2026-02-20T14:30:00.000Z',
      fees: '0',
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.price).toBe(tinyPrice);
  });

  it('preserves large decimal "99999999.99999999" through POST → response', async () => {
    const largePrice = '99999999.99999999';

    mockPrismaClient.instrument.findUnique.mockResolvedValue(
      mockInstrument({ id: 'inst-1' }),
    );
    mockPrismaClient.transaction.findMany.mockResolvedValue([]);
    mockPrismaClient.transaction.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) =>
        mockTransaction({
          id: data.id as string,
          instrumentId: data.instrumentId as string,
          type: data.type as string,
          quantity: data.quantity as string,
          price: data.price as string,
          fees: data.fees as string,
          tradeAt: data.tradeAt as Date,
        }),
    );

    const req = makeJsonRequest('/api/transactions', {
      instrumentId: 'inst-1',
      type: 'BUY',
      quantity: '1',
      price: largePrice,
      tradeAt: '2026-02-20T14:30:00.000Z',
      fees: '0',
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.price).toBe(largePrice);
  });

  it('GET returns decimal values as strings, not numbers', async () => {
    const precisePrice = '185.7787708514';
    const preciseQuantity = '42.123456';

    mockPrismaClient.transaction.findMany.mockResolvedValue([
      {
        ...mockTransaction({
          id: 'tx-1',
          instrumentId: 'inst-1',
          quantity: preciseQuantity,
          price: precisePrice,
          fees: '0.99',
        }),
        instrument: mockInstrument({ id: 'inst-1', symbol: 'VTI', name: 'Vanguard Total Stock Market ETF' }),
      },
    ]);

    const req = makeGetRequest('/api/transactions?instrumentId=inst-1');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    // Values must be strings, never JavaScript numbers
    expect(typeof body[0].price).toBe('string');
    expect(typeof body[0].quantity).toBe('string');
    expect(typeof body[0].fees).toBe('string');
    // Exact precision preserved
    expect(body[0].price).toBe(precisePrice);
    expect(body[0].quantity).toBe(preciseQuantity);
    expect(body[0].fees).toBe('0.99');
  });
});
