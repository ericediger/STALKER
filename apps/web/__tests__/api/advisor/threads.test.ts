import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrismaClient } = vi.hoisted(() => {
  const mockPrismaClient = {
    advisorThread: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    advisorMessage: {
      deleteMany: vi.fn(),
    },
  };
  return { mockPrismaClient };
});

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrismaClient,
}));

import { GET } from '@/app/api/advisor/threads/route';
import { GET as GET_BY_ID, DELETE } from '@/app/api/advisor/threads/[id]/route';
import { NextRequest } from 'next/server';

function makeRequest(url: string): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`);
}

describe('GET /api/advisor/threads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty list when no threads exist', async () => {
    mockPrismaClient.advisorThread.findMany.mockResolvedValue([]);

    const res = await GET();
    const body = (await res.json()) as { threads: unknown[] };

    expect(res.status).toBe(200);
    expect(body.threads).toEqual([]);
  });

  it('returns threads sorted by updatedAt desc with message count', async () => {
    const now = new Date('2026-02-23T10:00:00Z');
    const earlier = new Date('2026-02-22T10:00:00Z');

    mockPrismaClient.advisorThread.findMany.mockResolvedValue([
      {
        id: 'thread-1',
        title: 'Portfolio overview',
        createdAt: earlier,
        updatedAt: now,
        _count: { messages: 5 },
      },
      {
        id: 'thread-2',
        title: 'Tax analysis',
        createdAt: earlier,
        updatedAt: earlier,
        _count: { messages: 2 },
      },
    ]);

    const res = await GET();
    const body = (await res.json()) as { threads: Array<{ id: string; messageCount: number }> };

    expect(res.status).toBe(200);
    expect(body.threads).toHaveLength(2);
    expect(body.threads[0]!.id).toBe('thread-1');
    expect(body.threads[0]!.messageCount).toBe(5);
    expect(body.threads[1]!.messageCount).toBe(2);
  });

  it('returns 500 on database error', async () => {
    mockPrismaClient.advisorThread.findMany.mockRejectedValue(new Error('DB down'));

    const res = await GET();

    expect(res.status).toBe(500);
  });
});

describe('GET /api/advisor/threads/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns thread with messages', async () => {
    const now = new Date('2026-02-23T10:00:00Z');
    mockPrismaClient.advisorThread.findUnique.mockResolvedValue({
      id: 'thread-1',
      title: 'My thread',
      createdAt: now,
      updatedAt: now,
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello',
          toolCalls: null,
          toolResults: null,
          createdAt: now,
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Hi there!',
          toolCalls: null,
          toolResults: null,
          createdAt: now,
        },
      ],
    });

    const req = makeRequest('/api/advisor/threads/thread-1');
    const res = await GET_BY_ID(req, { params: Promise.resolve({ id: 'thread-1' }) });
    const body = (await res.json()) as { id: string; messages: Array<{ role: string }> };

    expect(res.status).toBe(200);
    expect(body.id).toBe('thread-1');
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0]!.role).toBe('user');
    expect(body.messages[1]!.role).toBe('assistant');
  });

  it('returns 404 for non-existent thread', async () => {
    mockPrismaClient.advisorThread.findUnique.mockResolvedValue(null);

    const req = makeRequest('/api/advisor/threads/nonexistent');
    const res = await GET_BY_ID(req, { params: Promise.resolve({ id: 'nonexistent' }) });

    expect(res.status).toBe(404);
  });

  it('includes hasSummary=true when summaryText exists', async () => {
    const now = new Date('2026-02-23T10:00:00Z');
    mockPrismaClient.advisorThread.findUnique.mockResolvedValue({
      id: 'thread-summary',
      title: 'Has summary',
      createdAt: now,
      updatedAt: now,
      summaryText: 'Earlier: discussed AAPL position.',
      messages: [
        { id: 'msg-1', role: 'user', content: 'Hello', toolCalls: null, toolResults: null, createdAt: now },
      ],
    });

    const req = makeRequest('/api/advisor/threads/thread-summary');
    const res = await GET_BY_ID(req, { params: Promise.resolve({ id: 'thread-summary' }) });
    const body = (await res.json()) as { hasSummary: boolean };

    expect(res.status).toBe(200);
    expect(body.hasSummary).toBe(true);
  });

  it('includes hasSummary=false when summaryText is null', async () => {
    const now = new Date('2026-02-23T10:00:00Z');
    mockPrismaClient.advisorThread.findUnique.mockResolvedValue({
      id: 'thread-no-summary',
      title: 'No summary',
      createdAt: now,
      updatedAt: now,
      summaryText: null,
      messages: [
        { id: 'msg-1', role: 'user', content: 'Hello', toolCalls: null, toolResults: null, createdAt: now },
      ],
    });

    const req = makeRequest('/api/advisor/threads/thread-no-summary');
    const res = await GET_BY_ID(req, { params: Promise.resolve({ id: 'thread-no-summary' }) });
    const body = (await res.json()) as { hasSummary: boolean };

    expect(res.status).toBe(200);
    expect(body.hasSummary).toBe(false);
  });

  it('parses toolCalls JSON in messages', async () => {
    const now = new Date();
    const toolCalls = [{ id: 'tc-1', name: 'getQuotes', arguments: { symbols: ['AAPL'] } }];

    mockPrismaClient.advisorThread.findUnique.mockResolvedValue({
      id: 'thread-1',
      title: 'Thread',
      createdAt: now,
      updatedAt: now,
      messages: [
        {
          id: 'msg-1',
          role: 'assistant',
          content: '',
          toolCalls: JSON.stringify(toolCalls),
          toolResults: null,
          createdAt: now,
        },
      ],
    });

    const req = makeRequest('/api/advisor/threads/thread-1');
    const res = await GET_BY_ID(req, { params: Promise.resolve({ id: 'thread-1' }) });
    const body = (await res.json()) as { messages: Array<{ toolCalls: unknown }> };

    expect(body.messages[0]!.toolCalls).toEqual(toolCalls);
  });
});

describe('DELETE /api/advisor/threads/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes thread and messages, returns 204', async () => {
    mockPrismaClient.advisorThread.findUnique.mockResolvedValue({
      id: 'thread-1',
      title: 'To delete',
    });
    mockPrismaClient.advisorMessage.deleteMany.mockResolvedValue({ count: 3 });
    mockPrismaClient.advisorThread.delete.mockResolvedValue({});

    const req = makeRequest('/api/advisor/threads/thread-1');
    const res = await DELETE(req, { params: Promise.resolve({ id: 'thread-1' }) });

    expect(res.status).toBe(204);
    expect(mockPrismaClient.advisorMessage.deleteMany).toHaveBeenCalledWith({
      where: { threadId: 'thread-1' },
    });
    expect(mockPrismaClient.advisorThread.delete).toHaveBeenCalledWith({
      where: { id: 'thread-1' },
    });
  });

  it('returns 404 for non-existent thread', async () => {
    mockPrismaClient.advisorThread.findUnique.mockResolvedValue(null);

    const req = makeRequest('/api/advisor/threads/nonexistent');
    const res = await DELETE(req, { params: Promise.resolve({ id: 'nonexistent' }) });

    expect(res.status).toBe(404);
  });
});
