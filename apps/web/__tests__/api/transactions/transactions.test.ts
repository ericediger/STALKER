import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockInstrument, mockTransaction } from '../../helpers/mock-prisma';

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

import { POST, GET } from '@/app/api/transactions/route';
import { GET as GET_BY_ID, PUT, DELETE } from '@/app/api/transactions/[id]/route';

function makeRequest(url: string, options?: RequestInit): Request {
  return new Request(`http://localhost:3000${url}`, options);
}

function makeJsonRequest(url: string, body: unknown, method: string = 'POST'): Request {
  return new Request(`http://localhost:3000${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_BUY = {
  instrumentId: 'inst-1',
  type: 'BUY' as const,
  quantity: '100',
  price: '185.50',
  tradeAt: '2026-02-20T14:30:00.000Z',
  fees: '9.99',
};

const VALID_SELL = {
  instrumentId: 'inst-1',
  type: 'SELL' as const,
  quantity: '50',
  price: '190.00',
  tradeAt: '2026-02-21T10:00:00.000Z',
};

describe('Transaction CRUD API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/transactions', () => {
    it('creates a BUY transaction successfully', async () => {
      mockPrismaClient.instrument.findUnique.mockResolvedValue(mockInstrument({ id: 'inst-1' }));
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

      const req = makeJsonRequest('/api/transactions', VALID_BUY);
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.type).toBe('BUY');
      expect(body.quantity).toBe('100');
      expect(body.price).toBe('185.50');
      expect(body.fees).toBe('9.99');
    });

    it('creates a valid SELL transaction after existing BUY', async () => {
      const existingBuy = mockTransaction({
        id: 'buy-1',
        instrumentId: 'inst-1',
        type: 'BUY',
        quantity: '100',
        price: '185.50',
        tradeAt: new Date('2026-02-20T14:30:00Z'),
      });

      mockPrismaClient.instrument.findUnique.mockResolvedValue(mockInstrument({ id: 'inst-1' }));
      mockPrismaClient.transaction.findMany.mockResolvedValue([existingBuy]);
      mockPrismaClient.transaction.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) =>
          mockTransaction({
            id: data.id as string,
            instrumentId: data.instrumentId as string,
            type: data.type as string,
            quantity: data.quantity as string,
            price: data.price as string,
            tradeAt: data.tradeAt as Date,
          }),
      );

      const req = makeJsonRequest('/api/transactions', VALID_SELL);
      const res = await POST(req);

      expect(res.status).toBe(201);
    });

    it('rejects SELL that exceeds position with 422', async () => {
      const existingBuy = mockTransaction({
        id: 'buy-1',
        instrumentId: 'inst-1',
        type: 'BUY',
        quantity: '50',
        price: '185.50',
        tradeAt: new Date('2026-02-20T14:30:00Z'),
      });

      mockPrismaClient.instrument.findUnique.mockResolvedValue(
        mockInstrument({ id: 'inst-1', symbol: 'AAPL' }),
      );
      mockPrismaClient.transaction.findMany.mockResolvedValue([existingBuy]);

      const oversizedSell = {
        instrumentId: 'inst-1',
        type: 'SELL',
        quantity: '100',
        price: '190.00',
        tradeAt: '2026-02-21T10:00:00.000Z',
      };

      const req = makeJsonRequest('/api/transactions', oversizedSell);
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(422);
      expect(body.error).toBe('SELL_VALIDATION_FAILED');
      expect(body.details.instrumentSymbol).toBe('AAPL');
      expect(body.details.deficitQuantity).toBe('50');
    });

    it('rejects SELL with no prior BUYs', async () => {
      mockPrismaClient.instrument.findUnique.mockResolvedValue(
        mockInstrument({ id: 'inst-1', symbol: 'TSLA' }),
      );
      mockPrismaClient.transaction.findMany.mockResolvedValue([]);

      const req = makeJsonRequest('/api/transactions', {
        instrumentId: 'inst-1',
        type: 'SELL',
        quantity: '10',
        price: '200.00',
        tradeAt: '2026-02-21T10:00:00.000Z',
      });

      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(422);
      expect(body.error).toBe('SELL_VALIDATION_FAILED');
      expect(body.details.deficitQuantity).toBe('10');
    });

    it('returns 404 when instrument does not exist', async () => {
      mockPrismaClient.instrument.findUnique.mockResolvedValue(null);

      const req = makeJsonRequest('/api/transactions', VALID_BUY);
      const res = await POST(req);

      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe('NOT_FOUND');
    });

    it('returns 400 for invalid input (missing quantity)', async () => {
      const req = makeJsonRequest('/api/transactions', {
        instrumentId: 'inst-1',
        type: 'BUY',
        price: '185.50',
        tradeAt: '2026-02-20T14:30:00.000Z',
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for negative quantity', async () => {
      const req = makeJsonRequest('/api/transactions', {
        ...VALID_BUY,
        quantity: '-10',
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/transactions', () => {
    it('returns transactions filtered by instrumentId', async () => {
      mockPrismaClient.transaction.findMany.mockResolvedValue([
        mockTransaction({ instrumentId: 'inst-1', instrument: mockInstrument({ id: 'inst-1', symbol: 'AAPL', name: 'Apple Inc.' }) }),
      ]);

      const req = makeRequest('/api/transactions?instrumentId=inst-1');
      const res = await GET(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toHaveLength(1);
      // Verify decimals are serialized as strings
      expect(typeof body[0].quantity).toBe('string');
      expect(typeof body[0].price).toBe('string');
      // Verify instrument symbol is included
      expect(body[0].symbol).toBe('AAPL');
      expect(body[0].instrumentName).toBe('Apple Inc.');
    });

    it('returns all transactions when instrumentId is omitted', async () => {
      mockPrismaClient.transaction.findMany.mockResolvedValue([
        mockTransaction({ instrumentId: 'inst-1', instrument: mockInstrument({ id: 'inst-1', symbol: 'AAPL', name: 'Apple Inc.' }) }),
        mockTransaction({ id: 'tx-2', instrumentId: 'inst-2', instrument: mockInstrument({ id: 'inst-2', symbol: 'MSFT', name: 'Microsoft Corporation' }) }),
      ]);

      const req = makeRequest('/api/transactions');
      const res = await GET(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toHaveLength(2);
    });

    it('supports date and type filters', async () => {
      mockPrismaClient.transaction.findMany.mockResolvedValue([]);

      const req = makeRequest(
        '/api/transactions?instrumentId=inst-1&startDate=2026-01-01&endDate=2026-12-31&type=BUY',
      );
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(mockPrismaClient.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            instrumentId: 'inst-1',
            type: 'BUY',
            tradeAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
          include: { instrument: { select: { symbol: true, name: true } } },
        }),
      );
    });
  });

  describe('GET /api/transactions/[id]', () => {
    it('returns a transaction by ID', async () => {
      const tx = mockTransaction({ id: 'tx-123', instrument: mockInstrument() });
      mockPrismaClient.transaction.findUnique.mockResolvedValue(tx);

      const req = makeRequest('/api/transactions/tx-123');
      const res = await GET_BY_ID(req as never, { params: Promise.resolve({ id: 'tx-123' }) });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.id).toBe('tx-123');
    });

    it('returns 404 for missing transaction', async () => {
      mockPrismaClient.transaction.findUnique.mockResolvedValue(null);

      const req = makeRequest('/api/transactions/nope');
      const res = await GET_BY_ID(req as never, { params: Promise.resolve({ id: 'nope' }) });

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/transactions/[id]', () => {
    it('updates a transaction successfully', async () => {
      const existing = mockTransaction({
        id: 'tx-1',
        instrumentId: 'inst-1',
        type: 'BUY',
        quantity: '100',
        price: '185.50',
        tradeAt: new Date('2026-02-20T14:30:00Z'),
        instrument: mockInstrument({ id: 'inst-1' }),
      });

      mockPrismaClient.transaction.findUnique.mockResolvedValue(existing);
      mockPrismaClient.instrument.findUnique.mockResolvedValue(mockInstrument({ id: 'inst-1' }));
      mockPrismaClient.transaction.findMany.mockResolvedValue([existing]);
      mockPrismaClient.transaction.update.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) =>
          mockTransaction({
            id: 'tx-1',
            instrumentId: data.instrumentId as string,
            type: data.type as string,
            quantity: data.quantity as string,
            price: data.price as string,
            tradeAt: data.tradeAt as Date,
          }),
      );

      const req = makeJsonRequest('/api/transactions/tx-1', {
        ...VALID_BUY,
        quantity: '200',
      }, 'PUT');

      const res = await PUT(req as never, { params: Promise.resolve({ id: 'tx-1' }) });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.quantity).toBe('200');
    });

    it('rejects update that would violate sell invariant', async () => {
      // Existing: BUY 100, SELL 80
      const existingBuy = mockTransaction({
        id: 'tx-buy',
        instrumentId: 'inst-1',
        type: 'BUY',
        quantity: '100',
        price: '185.50',
        tradeAt: new Date('2026-02-19T14:30:00Z'),
      });
      const existingSell = mockTransaction({
        id: 'tx-sell',
        instrumentId: 'inst-1',
        type: 'SELL',
        quantity: '80',
        price: '190.00',
        tradeAt: new Date('2026-02-21T10:00:00Z'),
      });

      // Try to reduce the BUY from 100 to 50 → SELL of 80 would exceed
      const existingWithInstrument = {
        ...existingBuy,
        instrument: mockInstrument({ id: 'inst-1', symbol: 'AAPL' }),
      };
      mockPrismaClient.transaction.findUnique.mockResolvedValue(existingWithInstrument);
      mockPrismaClient.instrument.findUnique.mockResolvedValue(
        mockInstrument({ id: 'inst-1', symbol: 'AAPL' }),
      );
      mockPrismaClient.transaction.findMany.mockResolvedValue([existingBuy, existingSell]);

      const req = makeJsonRequest('/api/transactions/tx-buy', {
        instrumentId: 'inst-1',
        type: 'BUY',
        quantity: '50',
        price: '185.50',
        tradeAt: '2026-02-19T14:30:00.000Z',
      }, 'PUT');

      const res = await PUT(req as never, { params: Promise.resolve({ id: 'tx-buy' }) });
      const body = await res.json();

      expect(res.status).toBe(422);
      expect(body.error).toBe('SELL_VALIDATION_FAILED');
      expect(body.details.deficitQuantity).toBe('30');
    });
  });

  describe('DELETE /api/transactions/[id]', () => {
    it('deletes a transaction when remaining set is valid', async () => {
      const buyTx = mockTransaction({
        id: 'tx-buy',
        instrumentId: 'inst-1',
        type: 'BUY',
        quantity: '100',
        price: '185.50',
        tradeAt: new Date('2026-02-20T14:30:00Z'),
        instrument: mockInstrument({ id: 'inst-1' }),
      });

      mockPrismaClient.transaction.findUnique.mockResolvedValue(buyTx);
      mockPrismaClient.transaction.findMany.mockResolvedValue([]); // no remaining txs
      mockPrismaClient.transaction.delete.mockResolvedValue(buyTx);

      const req = makeRequest('/api/transactions/tx-buy');
      const res = await DELETE(req as never, { params: Promise.resolve({ id: 'tx-buy' }) });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.deleted).toBe(true);
    });

    it('rejects delete when removing BUY would invalidate later SELL', async () => {
      // Existing: BUY 100, SELL 80. Deleting the BUY would make the SELL invalid.
      const buyTx = mockTransaction({
        id: 'tx-buy',
        instrumentId: 'inst-1',
        type: 'BUY',
        quantity: '100',
        price: '185.50',
        tradeAt: new Date('2026-02-19T14:30:00Z'),
        instrument: mockInstrument({ id: 'inst-1', symbol: 'NVDA' }),
      });
      const sellTx = mockTransaction({
        id: 'tx-sell',
        instrumentId: 'inst-1',
        type: 'SELL',
        quantity: '80',
        price: '190.00',
        tradeAt: new Date('2026-02-21T10:00:00Z'),
      });

      mockPrismaClient.transaction.findUnique.mockResolvedValue(buyTx);
      // After removal, only the SELL remains
      mockPrismaClient.transaction.findMany.mockResolvedValue([sellTx]);

      const req = makeRequest('/api/transactions/tx-buy');
      const res = await DELETE(req as never, { params: Promise.resolve({ id: 'tx-buy' }) });
      const body = await res.json();

      expect(res.status).toBe(422);
      expect(body.error).toBe('SELL_VALIDATION_FAILED');
      expect(body.details.instrumentSymbol).toBe('NVDA');
      expect(body.details.deficitQuantity).toBe('80');
    });

    it('returns 404 for missing transaction', async () => {
      mockPrismaClient.transaction.findUnique.mockResolvedValue(null);

      const req = makeRequest('/api/transactions/nope');
      const res = await DELETE(req as never, { params: Promise.resolve({ id: 'nope' }) });

      expect(res.status).toBe(404);
    });
  });
});
