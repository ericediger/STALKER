import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockInstrument, mockTransaction, prismaDecimal } from '../../helpers/mock-prisma';

/* -------------------------------------------------------------------------- */
/*  Mocks                                                                      */
/* -------------------------------------------------------------------------- */

const { mockPrismaClient } = vi.hoisted(() => {
  const mockPrismaClient = {
    instrument: {
      findMany: vi.fn(),
    },
    transaction: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return { mockPrismaClient };
});

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrismaClient,
}));

vi.mock('@/lib/snapshot-rebuild-helper', () => ({
  triggerSnapshotRebuild: vi.fn().mockResolvedValue(undefined),
}));

const { mockFindOrCreateInstrument, mockTriggerBackfill } = vi.hoisted(() => {
  return {
    mockFindOrCreateInstrument: vi.fn(),
    mockTriggerBackfill: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@/lib/auto-create-instrument', () => ({
  findOrCreateInstrument: mockFindOrCreateInstrument,
  triggerBackfill: mockTriggerBackfill,
}));

import { POST } from '@/app/api/transactions/bulk/route';

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function makeJsonRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/transactions/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const AAPL_INSTRUMENT = mockInstrument({ id: 'inst-aapl', symbol: 'AAPL', name: 'Apple Inc.', exchangeTz: 'America/New_York' });
const MSFT_INSTRUMENT = mockInstrument({ id: 'inst-msft', symbol: 'MSFT', name: 'Microsoft Corporation', exchangeTz: 'America/New_York' });

function validBuyRow(symbol: string, quantity: string, price: string, date: string) {
  return { symbol, type: 'BUY' as const, quantity, price, date };
}

function validSellRow(symbol: string, quantity: string, price: string, date: string) {
  return { symbol, type: 'SELL' as const, quantity, price, date };
}

/* -------------------------------------------------------------------------- */
/*  Tests                                                                      */
/* -------------------------------------------------------------------------- */

describe('POST /api/transactions/bulk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: $transaction executes the callback inline
    mockPrismaClient.$transaction.mockImplementation(async (fn: (tx: typeof mockPrismaClient) => Promise<void>) => {
      await fn(mockPrismaClient);
    });
  });

  it('inserts 5 valid rows successfully', async () => {
    mockPrismaClient.instrument.findMany.mockResolvedValue([AAPL_INSTRUMENT, MSFT_INSTRUMENT]);
    mockPrismaClient.transaction.findMany.mockResolvedValue([]); // no existing transactions
    mockPrismaClient.transaction.create.mockResolvedValue(undefined);

    const req = makeJsonRequest({
      rows: [
        validBuyRow('AAPL', '100', '185.50', '2025-06-15'),
        validBuyRow('AAPL', '50', '190.00', '2025-07-01'),
        validBuyRow('MSFT', '30', '350.00', '2025-06-20'),
        validBuyRow('MSFT', '20', '355.00', '2025-08-01'),
        validBuyRow('AAPL', '25', '195.00', '2025-09-01'),
      ],
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.inserted).toBe(5);
    expect(body.errors).toEqual([]);
    expect(body.earliestDate).toBeTruthy();
    // Verify $transaction was called (bulk insert)
    expect(mockPrismaClient.$transaction).toHaveBeenCalled();
    // Verify create was called 5 times
    expect(mockPrismaClient.transaction.create).toHaveBeenCalledTimes(5);
  });

  it('auto-creates instruments for unknown symbols in batch', async () => {
    // Only AAPL exists in database
    mockPrismaClient.instrument.findMany.mockResolvedValue([AAPL_INSTRUMENT]);
    mockPrismaClient.transaction.findMany.mockResolvedValue([]);
    mockPrismaClient.transaction.create.mockResolvedValue(undefined);

    const XYZ_INSTRUMENT = mockInstrument({ id: 'inst-xyz', symbol: 'XYZ', name: 'XYZ Corp' });
    const FAKE_INSTRUMENT = mockInstrument({ id: 'inst-fake', symbol: 'FAKE', name: 'Fake Inc' });
    mockFindOrCreateInstrument
      .mockResolvedValueOnce(XYZ_INSTRUMENT)
      .mockResolvedValueOnce(FAKE_INSTRUMENT);

    const req = makeJsonRequest({
      rows: [
        validBuyRow('AAPL', '100', '185.50', '2025-06-15'),
        validBuyRow('XYZ', '50', '100.00', '2025-07-01'),
        validBuyRow('AAPL', '25', '190.00', '2025-08-01'),
        validBuyRow('FAKE', '10', '50.00', '2025-09-01'),
        validBuyRow('AAPL', '30', '195.00', '2025-10-01'),
      ],
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.inserted).toBe(5);
    expect(body.autoCreatedInstruments).toEqual(['XYZ', 'FAKE']);
    expect(mockFindOrCreateInstrument).toHaveBeenCalledTimes(2);
    expect(mockFindOrCreateInstrument).toHaveBeenCalledWith('XYZ', true);
    expect(mockFindOrCreateInstrument).toHaveBeenCalledWith('FAKE', true);
  });

  it('rejects batch when SELL exceeds cumulative BUYs', async () => {
    mockPrismaClient.instrument.findMany.mockResolvedValue([AAPL_INSTRUMENT]);
    // Existing: BUY 50 shares
    mockPrismaClient.transaction.findMany.mockResolvedValue([
      mockTransaction({
        id: 'existing-buy',
        instrumentId: 'inst-aapl',
        type: 'BUY',
        quantity: '50',
        price: '180.00',
        tradeAt: new Date('2025-05-01T12:00:00Z'),
      }),
    ]);

    const req = makeJsonRequest({
      rows: [
        validBuyRow('AAPL', '20', '185.50', '2025-06-15'),
        // Sell 100, but only have 50 + 20 = 70 available
        validSellRow('AAPL', '100', '200.00', '2025-07-01'),
      ],
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.inserted).toBe(0);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].symbol).toBe('AAPL');
    expect(body.errors[0].error).toContain('Sell validation failed');
    expect(body.errors[0].error).toContain('negative');
    // Verify no transactions were created
    expect(mockPrismaClient.transaction.create).not.toHaveBeenCalled();
  });

  it('returns validation result without inserting on dryRun', async () => {
    mockPrismaClient.instrument.findMany.mockResolvedValue([AAPL_INSTRUMENT]);
    mockPrismaClient.transaction.findMany.mockResolvedValue([]);

    const req = makeJsonRequest({
      rows: [
        validBuyRow('AAPL', '100', '185.50', '2025-06-15'),
        validBuyRow('AAPL', '50', '190.00', '2025-07-01'),
      ],
      dryRun: true,
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.inserted).toBe(0);
    expect(body.errors).toEqual([]);
    // Verify NO inserts happened
    expect(mockPrismaClient.$transaction).not.toHaveBeenCalled();
    expect(mockPrismaClient.transaction.create).not.toHaveBeenCalled();
  });

  it('handles empty batch gracefully', async () => {
    const req = makeJsonRequest({ rows: [] });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.inserted).toBe(0);
    expect(body.errors).toEqual([]);
    expect(body.earliestDate).toBeNull();
  });

  it('converts date string to UTC tradeAt correctly', async () => {
    mockPrismaClient.instrument.findMany.mockResolvedValue([AAPL_INSTRUMENT]);
    mockPrismaClient.transaction.findMany.mockResolvedValue([]);
    mockPrismaClient.transaction.create.mockResolvedValue(undefined);

    const req = makeJsonRequest({
      rows: [validBuyRow('AAPL', '100', '185.50', '2025-06-15')],
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.inserted).toBe(1);
    // Verify the earliestDate is a valid ISO string based on 2025-06-15
    expect(body.earliestDate).toContain('2025-06-15');
    // Verify the transaction.create was called with a Date object
    expect(mockPrismaClient.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tradeAt: expect.any(Date),
        quantity: '100',
        price: '185.50',
      }),
    });
  });

  it('returns 400 for invalid request body', async () => {
    const req = makeJsonRequest({ rows: [{ symbol: '' }] });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('VALIDATION_ERROR');
  });

  it('handles sell validation for multiple instruments in one batch', async () => {
    mockPrismaClient.instrument.findMany.mockResolvedValue([AAPL_INSTRUMENT, MSFT_INSTRUMENT]);
    // No existing transactions
    mockPrismaClient.transaction.findMany.mockResolvedValue([]);
    mockPrismaClient.transaction.create.mockResolvedValue(undefined);

    const req = makeJsonRequest({
      rows: [
        validBuyRow('AAPL', '100', '185.50', '2025-06-15'),
        validBuyRow('MSFT', '50', '350.00', '2025-06-15'),
        validSellRow('AAPL', '30', '195.00', '2025-07-01'),
        validSellRow('MSFT', '20', '360.00', '2025-07-01'),
      ],
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.inserted).toBe(4);
    expect(body.errors).toEqual([]);
  });
});
