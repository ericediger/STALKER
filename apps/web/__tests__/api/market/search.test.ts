import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/market/search/route';
import { NextRequest } from 'next/server';

describe('GET /api/market/search', () => {
  it('returns { results: [] } with 200 status', async () => {
    const req = new NextRequest('http://localhost:3000/api/market/search?q=VTI');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const data = (await res.json()) as { results: unknown[] };
    expect(data).toEqual({ results: [] });
    expect(Array.isArray(data.results)).toBe(true);
  });

  it('returns 400 when q parameter is missing', async () => {
    const req = new NextRequest('http://localhost:3000/api/market/search');
    const res = await GET(req);

    expect(res.status).toBe(400);
  });
});
