import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockInstrument } from '../../helpers/mock-prisma';

const { mockPrismaClient } = vi.hoisted(() => {
  const mockPrismaClient = {
    instrument: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    transaction: {
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
  return { mockPrismaClient };
});

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrismaClient,
}));

import { POST, GET } from '@/app/api/instruments/route';
import { GET as GET_BY_ID, DELETE } from '@/app/api/instruments/[id]/route';

function makeRequest(url: string, options?: RequestInit): Request {
  return new Request(`http://localhost:3000${url}`, options);
}

function makeJsonRequest(url: string, body: unknown): Request {
  return new Request(`http://localhost:3000${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Instrument CRUD API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/instruments', () => {
    it('creates an instrument with correct fields', async () => {
      mockPrismaClient.instrument.findUnique.mockResolvedValue(null);
      mockPrismaClient.instrument.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) =>
          mockInstrument({
            id: data.id as string,
            symbol: data.symbol as string,
            name: data.name as string,
            type: data.type as string,
            exchange: data.exchange as string,
            exchangeTz: data.exchangeTz as string,
            providerSymbolMap: data.providerSymbolMap as string,
            firstBarDate: data.firstBarDate as string | null,
          }),
      );

      const req = makeJsonRequest('/api/instruments', {
        symbol: 'aapl',
        name: 'Apple Inc.',
        type: 'STOCK',
        exchange: 'NASDAQ',
      });

      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.symbol).toBe('AAPL'); // uppercase-normalized
      expect(body.exchangeTz).toBe('America/New_York');
      expect(body.providerSymbolMap).toEqual({ fmp: 'AAPL', stooq: 'aapl.us' });
      expect(body.firstBarDate).toBeNull();
    });

    it('returns 409 for duplicate symbol', async () => {
      mockPrismaClient.instrument.findUnique.mockResolvedValue(mockInstrument());

      const req = makeJsonRequest('/api/instruments', {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        type: 'STOCK',
        exchange: 'NASDAQ',
      });

      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(409);
      expect(body.error).toBe('CONFLICT');
    });

    it('returns 400 for invalid input (missing symbol)', async () => {
      const req = makeJsonRequest('/api/instruments', {
        name: 'Apple Inc.',
        type: 'STOCK',
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid instrument type', async () => {
      const req = makeJsonRequest('/api/instruments', {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        type: 'BOND',
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('VALIDATION_ERROR');
    });

    it('defaults exchange to NYSE when not provided', async () => {
      mockPrismaClient.instrument.findUnique.mockResolvedValue(null);
      mockPrismaClient.instrument.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) =>
          mockInstrument({
            id: data.id as string,
            symbol: data.symbol as string,
            name: data.name as string,
            type: data.type as string,
            exchange: data.exchange as string,
            exchangeTz: data.exchangeTz as string,
            providerSymbolMap: data.providerSymbolMap as string,
          }),
      );

      const req = makeJsonRequest('/api/instruments', {
        symbol: 'MSFT',
        name: 'Microsoft Corp.',
        type: 'STOCK',
      });

      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.exchange).toBe('NYSE');
      expect(body.exchangeTz).toBe('America/New_York');
    });
  });

  describe('GET /api/instruments', () => {
    it('returns all instruments ordered by symbol', async () => {
      mockPrismaClient.instrument.findMany.mockResolvedValue([
        mockInstrument({ symbol: 'AAPL', providerSymbolMap: JSON.stringify({ fmp: 'AAPL' }) }),
        mockInstrument({ symbol: 'MSFT', providerSymbolMap: JSON.stringify({ fmp: 'MSFT' }) }),
      ]);

      const res = await GET();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toHaveLength(2);
      expect(body[0].symbol).toBe('AAPL');
      expect(body[1].symbol).toBe('MSFT');
      // providerSymbolMap should be parsed object, not string
      expect(typeof body[0].providerSymbolMap).toBe('object');
    });
  });

  describe('GET /api/instruments/[id]', () => {
    it('returns instrument by ID', async () => {
      mockPrismaClient.instrument.findUnique.mockResolvedValue(mockInstrument({ id: 'abc123' }));

      const req = makeRequest('/api/instruments/abc123');
      const res = await GET_BY_ID(req as never, { params: Promise.resolve({ id: 'abc123' }) });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.id).toBe('abc123');
      expect(typeof body.providerSymbolMap).toBe('object');
    });

    it('returns 404 for missing instrument', async () => {
      mockPrismaClient.instrument.findUnique.mockResolvedValue(null);

      const req = makeRequest('/api/instruments/nonexistent');
      const res = await GET_BY_ID(req as never, { params: Promise.resolve({ id: 'nonexistent' }) });

      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe('NOT_FOUND');
    });
  });

  describe('DELETE /api/instruments/[id]', () => {
    it('cascade deletes instrument and related data', async () => {
      mockPrismaClient.instrument.findUnique.mockResolvedValue(mockInstrument({ id: 'del-id' }));
      mockPrismaClient.$transaction.mockResolvedValue([]);

      const req = makeRequest('/api/instruments/del-id');
      const res = await DELETE(req as never, { params: Promise.resolve({ id: 'del-id' }) });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.deleted).toBe(true);
      expect(body.id).toBe('del-id');
      expect(mockPrismaClient.$transaction).toHaveBeenCalledTimes(1);
    });

    it('returns 404 when instrument does not exist', async () => {
      mockPrismaClient.instrument.findUnique.mockResolvedValue(null);

      const req = makeRequest('/api/instruments/nope');
      const res = await DELETE(req as never, { params: Promise.resolve({ id: 'nope' }) });

      expect(res.status).toBe(404);
    });
  });
});
