import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockPrismaClient, mockExecuteToolLoop } = vi.hoisted(() => {
  const mockPrismaClient = {
    advisorThread: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    advisorMessage: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  };
  const mockExecuteToolLoop = vi.fn();
  return { mockPrismaClient, mockExecuteToolLoop };
});

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrismaClient,
}));

vi.mock('@stalker/advisor', () => ({
  AnthropicAdapter: vi.fn(),
  executeToolLoop: mockExecuteToolLoop,
  SYSTEM_PROMPT: 'Test system prompt',
  allToolDefinitions: [],
  createGetPortfolioSnapshotExecutor: vi.fn(() => vi.fn()),
  createGetHoldingExecutor: vi.fn(() => vi.fn()),
  createGetTransactionsExecutor: vi.fn(() => vi.fn()),
  createGetQuotesExecutor: vi.fn(() => vi.fn()),
}));

// Mock analytics and market-data deps used by buildToolExecutors
vi.mock('@/lib/prisma-price-lookup', () => ({
  PrismaPriceLookup: vi.fn(),
}));
vi.mock('@/lib/prisma-snapshot-store', () => ({
  PrismaSnapshotStore: vi.fn(),
}));
vi.mock('@stalker/analytics', () => ({
  queryPortfolioWindow: vi.fn(),
  processTransactions: vi.fn(),
}));
vi.mock('@stalker/market-data', () => ({
  getNextTradingDay: vi.fn(),
  isTradingDay: vi.fn(),
  getPriorTradingDay: vi.fn(),
}));

import { POST } from '@/app/api/advisor/chat/route';

function makeJsonRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/advisor/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/advisor/chat', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-key' };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns 503 when ANTHROPIC_API_KEY is missing', async () => {
    delete process.env['ANTHROPIC_API_KEY'];

    const req = makeJsonRequest({ message: 'Hello' });
    const res = await POST(req as never);
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(503);
    expect(body.code).toBe('LLM_NOT_CONFIGURED');
  });

  it('returns 400 when message is empty', async () => {
    const req = makeJsonRequest({ message: '' });
    const res = await POST(req as never);

    expect(res.status).toBe(400);
  });

  it('returns 400 when message is missing', async () => {
    const req = makeJsonRequest({});
    const res = await POST(req as never);

    expect(res.status).toBe(400);
  });

  it('creates a new thread when threadId is not provided', async () => {
    const now = new Date();
    mockPrismaClient.advisorThread.create.mockResolvedValue({
      id: 'new-thread-id',
      title: 'Hello advisor',
      createdAt: now,
      updatedAt: now,
    });
    mockPrismaClient.advisorMessage.create.mockResolvedValue({});
    mockPrismaClient.advisorMessage.findMany.mockResolvedValue([
      { role: 'user', content: 'Hello advisor', toolCalls: null, toolResults: null, createdAt: now },
    ]);
    mockPrismaClient.advisorThread.update.mockResolvedValue({});

    mockExecuteToolLoop.mockResolvedValue({
      messages: [{ role: 'assistant', content: 'Hi! How can I help?' }],
      finalResponse: 'Hi! How can I help?',
    });

    const req = makeJsonRequest({ message: 'Hello advisor' });
    const res = await POST(req as never);
    const body = (await res.json()) as { threadId: string; messages: unknown[] };

    expect(res.status).toBe(200);
    expect(body.threadId).toBe('new-thread-id');
    expect(mockPrismaClient.advisorThread.create).toHaveBeenCalled();
  });

  it('returns 404 when threadId does not exist', async () => {
    mockPrismaClient.advisorThread.findUnique.mockResolvedValue(null);

    const req = makeJsonRequest({ threadId: 'bad-id', message: 'Hello' });
    const res = await POST(req as never);

    expect(res.status).toBe(404);
  });

  it('uses existing thread when threadId is provided', async () => {
    const now = new Date();
    mockPrismaClient.advisorThread.findUnique.mockResolvedValue({
      id: 'existing-thread',
      title: 'My thread',
    });
    mockPrismaClient.advisorMessage.create.mockResolvedValue({});
    mockPrismaClient.advisorMessage.findMany.mockResolvedValue([
      { role: 'user', content: 'Follow-up question', toolCalls: null, toolResults: null, createdAt: now },
    ]);
    mockPrismaClient.advisorThread.update.mockResolvedValue({});

    mockExecuteToolLoop.mockResolvedValue({
      messages: [{ role: 'assistant', content: 'Here is my analysis.' }],
      finalResponse: 'Here is my analysis.',
    });

    const req = makeJsonRequest({ threadId: 'existing-thread', message: 'Follow-up question' });
    const res = await POST(req as never);
    const body = (await res.json()) as { threadId: string };

    expect(res.status).toBe(200);
    expect(body.threadId).toBe('existing-thread');
    expect(mockPrismaClient.advisorThread.create).not.toHaveBeenCalled();
  });

  it('returns 502 when tool loop throws', async () => {
    const now = new Date();
    mockPrismaClient.advisorThread.create.mockResolvedValue({
      id: 'thread-err',
      title: 'Error test',
      createdAt: now,
      updatedAt: now,
    });
    mockPrismaClient.advisorMessage.create.mockResolvedValue({});
    mockPrismaClient.advisorMessage.findMany.mockResolvedValue([
      { role: 'user', content: 'Error test', toolCalls: null, toolResults: null, createdAt: now },
    ]);

    mockExecuteToolLoop.mockRejectedValue(new Error('API rate limit'));

    const req = makeJsonRequest({ message: 'Error test' });
    const res = await POST(req as never);
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(502);
    expect(body.code).toBe('LLM_ERROR');
  });

  it('persists generated messages and returns them', async () => {
    const now = new Date();
    mockPrismaClient.advisorThread.create.mockResolvedValue({
      id: 'persist-thread',
      title: 'Persist test',
      createdAt: now,
      updatedAt: now,
    });
    mockPrismaClient.advisorMessage.create.mockResolvedValue({});
    mockPrismaClient.advisorMessage.findMany.mockResolvedValue([
      { role: 'user', content: 'Persist test', toolCalls: null, toolResults: null, createdAt: now },
    ]);
    mockPrismaClient.advisorThread.update.mockResolvedValue({});

    const generatedMessages = [
      {
        role: 'assistant' as const,
        content: '',
        toolCalls: [{ id: 'tc-1', name: 'getQuotes', arguments: { symbols: ['AAPL'] } }],
      },
      { role: 'tool' as const, content: '{"price":"$185"}', toolCallId: 'tc-1' },
      { role: 'assistant' as const, content: 'AAPL is at $185.' },
    ];

    mockExecuteToolLoop.mockResolvedValue({
      messages: generatedMessages,
      finalResponse: 'AAPL is at $185.',
    });

    const req = makeJsonRequest({ message: 'Persist test' });
    const res = await POST(req as never);
    const body = (await res.json()) as { messages: Array<{ role: string; content: string }> };

    expect(res.status).toBe(200);
    expect(body.messages).toHaveLength(3);
    expect(body.messages[2]!.content).toBe('AAPL is at $185.');

    // Should have persisted: 1 user message + 3 generated = 4 total creates
    expect(mockPrismaClient.advisorMessage.create).toHaveBeenCalledTimes(4);
  });
});
