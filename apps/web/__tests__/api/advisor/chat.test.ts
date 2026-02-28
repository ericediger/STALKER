import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockPrismaClient, mockExecuteToolLoop, mockWindowMessages, mockGenerateSummary } = vi.hoisted(() => {
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
  const mockWindowMessages = vi.fn();
  const mockGenerateSummary = vi.fn();
  return { mockPrismaClient, mockExecuteToolLoop, mockWindowMessages, mockGenerateSummary };
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
  createGetTopHoldingsExecutor: vi.fn(() => vi.fn()),
  windowMessages: mockWindowMessages,
  generateSummary: mockGenerateSummary,
  formatSummaryPreamble: vi.fn((text: string) => `[Summary] ${text} [/Summary]`),
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

/** Default windowMessages mock: fast path (no trimming) */
function setupDefaultWindowMock() {
  mockWindowMessages.mockImplementation(
    (msgs: Array<{ id: string; role: string; content: string }>) => ({
      messages: msgs,
      trimmed: [],
      shouldGenerateSummary: false,
      estimatedTokens: 100,
    }),
  );
}

describe('POST /api/advisor/chat', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-key' };
    vi.clearAllMocks();
    setupDefaultWindowMock();
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
      { id: 'msg-1', role: 'user', content: 'Hello advisor', toolCalls: null, toolResults: null, createdAt: now },
    ]);
    // findUnique called to load thread for summaryText
    mockPrismaClient.advisorThread.findUnique.mockResolvedValue({
      id: 'new-thread-id',
      title: 'Hello advisor',
      summaryText: null,
    });
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
      summaryText: null,
    });
    mockPrismaClient.advisorMessage.create.mockResolvedValue({});
    mockPrismaClient.advisorMessage.findMany.mockResolvedValue([
      { id: 'msg-1', role: 'user', content: 'Follow-up question', toolCalls: null, toolResults: null, createdAt: now },
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
      { id: 'msg-1', role: 'user', content: 'Error test', toolCalls: null, toolResults: null, createdAt: now },
    ]);
    mockPrismaClient.advisorThread.findUnique.mockResolvedValue({
      id: 'thread-err',
      title: 'Error test',
      summaryText: null,
    });

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
      { id: 'msg-1', role: 'user', content: 'Persist test', toolCalls: null, toolResults: null, createdAt: now },
    ]);
    mockPrismaClient.advisorThread.findUnique.mockResolvedValue({
      id: 'persist-thread',
      title: 'Persist test',
      summaryText: null,
    });
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

  // --- Session 19: Context Window Integration Tests ---

  it('short threads send all messages (no windowing)', async () => {
    const now = new Date();
    mockPrismaClient.advisorThread.create.mockResolvedValue({
      id: 'short-thread',
      title: 'Short thread',
      createdAt: now,
      updatedAt: now,
    });
    mockPrismaClient.advisorMessage.create.mockResolvedValue({});
    mockPrismaClient.advisorMessage.findMany.mockResolvedValue([
      { id: 'msg-1', role: 'user', content: 'Hello', toolCalls: null, toolResults: null, createdAt: now },
    ]);
    mockPrismaClient.advisorThread.findUnique.mockResolvedValue({
      id: 'short-thread',
      title: 'Short thread',
      summaryText: null,
    });
    mockPrismaClient.advisorThread.update.mockResolvedValue({});

    mockExecuteToolLoop.mockResolvedValue({
      messages: [{ role: 'assistant', content: 'Hi!' }],
      finalResponse: 'Hi!',
    });

    const req = makeJsonRequest({ message: 'Hello' });
    const res = await POST(req as never);

    expect(res.status).toBe(200);

    // windowMessages should have been called
    expect(mockWindowMessages).toHaveBeenCalledTimes(1);

    // Fast path: no summary generation triggered
    expect(mockGenerateSummary).not.toHaveBeenCalled();
  });

  it('prepends summary preamble when summaryText exists', async () => {
    const now = new Date();
    mockPrismaClient.advisorThread.findUnique.mockResolvedValue({
      id: 'summary-thread',
      title: 'Has summary',
      summaryText: 'Earlier: discussed AAPL holdings and tax implications.',
    });
    mockPrismaClient.advisorMessage.create.mockResolvedValue({});
    mockPrismaClient.advisorMessage.findMany.mockResolvedValue([
      { id: 'msg-1', role: 'user', content: 'What about MSFT?', toolCalls: null, toolResults: null, createdAt: now },
    ]);
    mockPrismaClient.advisorThread.update.mockResolvedValue({});

    mockExecuteToolLoop.mockResolvedValue({
      messages: [{ role: 'assistant', content: 'Let me check MSFT.' }],
      finalResponse: 'Let me check MSFT.',
    });

    const req = makeJsonRequest({ threadId: 'summary-thread', message: 'What about MSFT?' });
    const res = await POST(req as never);

    expect(res.status).toBe(200);

    // Verify the tool loop received the summary preamble as the first messages
    const toolLoopCall = mockExecuteToolLoop.mock.calls[0]![0] as { messages: Array<{ role: string; content: string }> };
    // First two messages should be the summary preamble pair
    expect(toolLoopCall.messages[0]!.role).toBe('user');
    expect(toolLoopCall.messages[0]!.content).toContain('[Summary]');
    expect(toolLoopCall.messages[1]!.role).toBe('assistant');
    expect(toolLoopCall.messages[1]!.content).toContain('earlier discussion');
  });

  it('triggers summary generation when shouldGenerateSummary is true', async () => {
    const now = new Date();
    const trimmedMsg = { id: 'old-1', role: 'user', content: 'Old message', createdAt: now };

    mockWindowMessages.mockReturnValue({
      messages: [{ id: 'recent-1', role: 'user', content: 'Recent', createdAt: now }],
      trimmed: [trimmedMsg],
      shouldGenerateSummary: true,
      estimatedTokens: 100,
    });

    mockPrismaClient.advisorThread.create.mockResolvedValue({
      id: 'gen-thread',
      title: 'Generate summary',
      createdAt: now,
      updatedAt: now,
    });
    mockPrismaClient.advisorMessage.create.mockResolvedValue({});
    mockPrismaClient.advisorMessage.findMany.mockResolvedValue([
      { id: 'recent-1', role: 'user', content: 'Recent', toolCalls: null, toolResults: null, createdAt: now },
    ]);
    mockPrismaClient.advisorThread.findUnique.mockResolvedValue({
      id: 'gen-thread',
      title: 'Generate summary',
      summaryText: null,
    });
    mockPrismaClient.advisorThread.update.mockResolvedValue({});

    mockGenerateSummary.mockResolvedValue('Generated summary text');

    mockExecuteToolLoop.mockResolvedValue({
      messages: [{ role: 'assistant', content: 'Response.' }],
      finalResponse: 'Response.',
    });

    const req = makeJsonRequest({ message: 'Recent' });
    const res = await POST(req as never);

    expect(res.status).toBe(200);

    // Wait a tick for fire-and-forget promise to settle
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Summary should have been generated
    expect(mockGenerateSummary).toHaveBeenCalledTimes(1);

    // Summary should have been stored in the thread
    const updateCalls = mockPrismaClient.advisorThread.update.mock.calls;
    const summaryUpdateCall = updateCalls.find(
      (call: Array<{ data?: { summaryText?: string } }>) => call[0]?.data?.summaryText === 'Generated summary text',
    );
    expect(summaryUpdateCall).toBeDefined();
  });

  it('sends windowed messages when thread exceeds budget', async () => {
    const now = new Date();

    // Simulate a long thread: windowMessages returns fewer messages than total
    const allMsgs = Array.from({ length: 20 }, (_, i) => ({
      id: `msg-${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`,
      toolCalls: null,
      toolResults: null,
      createdAt: new Date(now.getTime() + i * 1000),
    }));

    // windowMessages trims oldest messages, keeps recent 6
    const keptMsgs = allMsgs.slice(14); // last 6 messages
    const trimmedMsgs = allMsgs.slice(0, 14);
    mockWindowMessages.mockReturnValue({
      messages: keptMsgs.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
      trimmed: trimmedMsgs.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
      shouldGenerateSummary: true,
      estimatedTokens: 170_000,
    });

    mockPrismaClient.advisorThread.findUnique.mockResolvedValue({
      id: 'long-thread',
      title: 'Long thread',
      summaryText: null,
    });
    mockPrismaClient.advisorMessage.create.mockResolvedValue({});
    mockPrismaClient.advisorMessage.findMany.mockResolvedValue(allMsgs);
    mockPrismaClient.advisorThread.update.mockResolvedValue({});

    mockGenerateSummary.mockResolvedValue('Summary of trimmed messages');

    mockExecuteToolLoop.mockResolvedValue({
      messages: [{ role: 'assistant', content: 'Here is my response.' }],
      finalResponse: 'Here is my response.',
    });

    const req = makeJsonRequest({ threadId: 'long-thread', message: 'Latest question' });
    const res = await POST(req as never);
    const body = (await res.json()) as { messages: Array<{ content: string }> };

    expect(res.status).toBe(200);
    expect(body.messages[0]!.content).toBe('Here is my response.');

    // Verify tool loop received fewer messages than total in thread
    const toolLoopCall = mockExecuteToolLoop.mock.calls[0]![0] as { messages: Array<{ role: string }> };
    // Should have the 6 windowed messages, NOT all 20
    expect(toolLoopCall.messages.length).toBeLessThan(allMsgs.length);
    // Most recent messages should be present
    expect(toolLoopCall.messages.some(
      (m: { content?: string }) => m.content === 'Message 18' || m.content === 'Message 19',
    )).toBe(true);
  });

  it('triggers rolling summary when messages trimmed and summary already exists', async () => {
    const now = new Date();
    const trimmedMsg = { id: 'old-1', role: 'user', content: 'Old message', createdAt: now };

    mockWindowMessages.mockReturnValue({
      messages: [{ id: 'recent-1', role: 'user', content: 'Recent', createdAt: now }],
      trimmed: [trimmedMsg],
      shouldGenerateSummary: true,
      estimatedTokens: 170_000,
    });

    mockPrismaClient.advisorThread.findUnique.mockResolvedValue({
      id: 'rolling-thread',
      title: 'Rolling summary',
      summaryText: 'Previous summary of earlier discussion.',
    });
    mockPrismaClient.advisorMessage.create.mockResolvedValue({});
    mockPrismaClient.advisorMessage.findMany.mockResolvedValue([
      { id: 'recent-1', role: 'user', content: 'Recent', toolCalls: null, toolResults: null, createdAt: now },
    ]);
    mockPrismaClient.advisorThread.update.mockResolvedValue({});

    mockGenerateSummary.mockResolvedValue('Updated rolling summary');

    mockExecuteToolLoop.mockResolvedValue({
      messages: [{ role: 'assistant', content: 'Response.' }],
      finalResponse: 'Response.',
    });

    const req = makeJsonRequest({ threadId: 'rolling-thread', message: 'Recent' });
    const res = await POST(req as never);

    expect(res.status).toBe(200);

    // Wait for fire-and-forget
    await new Promise((resolve) => setTimeout(resolve, 10));

    // generateSummary should be called with the existing summary
    expect(mockGenerateSummary).toHaveBeenCalledTimes(1);
    const summaryArgs = mockGenerateSummary.mock.calls[0] as [unknown, unknown, string | null];
    expect(summaryArgs[2]).toBe('Previous summary of earlier discussion.');

    // Summary should have been persisted
    const updateCalls = mockPrismaClient.advisorThread.update.mock.calls;
    const summaryUpdateCall = updateCalls.find(
      (call: Array<{ data?: { summaryText?: string } }>) => call[0]?.data?.summaryText === 'Updated rolling summary',
    );
    expect(summaryUpdateCall).toBeDefined();
  });

  it('summary generation failure does not break chat response', async () => {
    const now = new Date();

    mockWindowMessages.mockReturnValue({
      messages: [{ id: 'recent-1', role: 'user', content: 'Recent', createdAt: now }],
      trimmed: [{ id: 'old-1', role: 'user', content: 'Old', createdAt: now }],
      shouldGenerateSummary: true,
      estimatedTokens: 100,
    });

    mockPrismaClient.advisorThread.create.mockResolvedValue({
      id: 'fail-thread',
      title: 'Summary fail',
      createdAt: now,
      updatedAt: now,
    });
    mockPrismaClient.advisorMessage.create.mockResolvedValue({});
    mockPrismaClient.advisorMessage.findMany.mockResolvedValue([
      { id: 'recent-1', role: 'user', content: 'Recent', toolCalls: null, toolResults: null, createdAt: now },
    ]);
    mockPrismaClient.advisorThread.findUnique.mockResolvedValue({
      id: 'fail-thread',
      title: 'Summary fail',
      summaryText: null,
    });
    mockPrismaClient.advisorThread.update.mockResolvedValue({});

    // Summary generation fails
    mockGenerateSummary.mockRejectedValue(new Error('LLM timeout'));

    mockExecuteToolLoop.mockResolvedValue({
      messages: [{ role: 'assistant', content: 'Response.' }],
      finalResponse: 'Response.',
    });

    const req = makeJsonRequest({ message: 'Recent' });
    const res = await POST(req as never);

    // Response should still succeed despite summary failure
    expect(res.status).toBe(200);
    const body = (await res.json()) as { messages: Array<{ content: string }> };
    expect(body.messages[0]!.content).toBe('Response.');
  });
});
