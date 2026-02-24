import { describe, it, expect, vi } from 'vitest';
import { executeToolLoop } from '../src/tool-loop.js';
import type { LLMAdapter, LLMResponse, Message, ToolDefinition } from '../src/llm-adapter.js';

function createMockAdapter(responses: LLMResponse[]): LLMAdapter {
  let callIndex = 0;
  return {
    chat: vi.fn(async (): Promise<LLMResponse> => {
      const response = responses[callIndex];
      if (!response) {
        throw new Error(`Mock adapter: unexpected call #${callIndex}`);
      }
      callIndex++;
      return response;
    }),
  };
}

const sampleTools: ToolDefinition[] = [
  {
    name: 'getQuotes',
    description: 'Get quotes',
    parameters: { type: 'object', properties: {} },
  },
];

describe('executeToolLoop', () => {
  it('returns final response when no tool calls', async () => {
    const adapter = createMockAdapter([
      { content: 'Hello!', toolCalls: null, usage: { inputTokens: 10, outputTokens: 5 } },
    ]);

    const result = await executeToolLoop({
      adapter,
      systemPrompt: 'You are a test bot.',
      messages: [{ role: 'user', content: 'Hi' }],
      tools: [],
      toolExecutors: {},
    });

    expect(result.finalResponse).toBe('Hello!');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]!.role).toBe('assistant');
  });

  it('executes tool calls and continues loop', async () => {
    const adapter = createMockAdapter([
      {
        content: '',
        toolCalls: [{ id: 'tc-1', name: 'getQuotes', arguments: { symbols: ['AAPL'] } }],
        usage: { inputTokens: 20, outputTokens: 10 },
      },
      {
        content: 'AAPL is at $185.',
        toolCalls: null,
        usage: { inputTokens: 30, outputTokens: 15 },
      },
    ]);

    const mockExecutor = vi.fn().mockResolvedValue({ price: '$185.50' });

    const result = await executeToolLoop({
      adapter,
      systemPrompt: 'Test',
      messages: [{ role: 'user', content: 'Price of AAPL?' }],
      tools: sampleTools,
      toolExecutors: { getQuotes: mockExecutor },
    });

    expect(result.finalResponse).toBe('AAPL is at $185.');
    // Messages: assistant (with tool call) + tool result + assistant (final)
    expect(result.messages).toHaveLength(3);
    expect(result.messages[0]!.role).toBe('assistant');
    expect(result.messages[1]!.role).toBe('tool');
    expect(result.messages[2]!.role).toBe('assistant');
    expect(mockExecutor).toHaveBeenCalledWith({ symbols: ['AAPL'] });
  });

  it('catches tool executor errors and returns error as tool result', async () => {
    const adapter = createMockAdapter([
      {
        content: '',
        toolCalls: [{ id: 'tc-1', name: 'getQuotes', arguments: { symbols: ['BAD'] } }],
        usage: { inputTokens: 20, outputTokens: 10 },
      },
      {
        content: 'Sorry, there was an error.',
        toolCalls: null,
        usage: { inputTokens: 30, outputTokens: 10 },
      },
    ]);

    const failingExecutor = vi.fn().mockRejectedValue(new Error('DB connection failed'));

    const result = await executeToolLoop({
      adapter,
      systemPrompt: 'Test',
      messages: [{ role: 'user', content: 'Quotes?' }],
      tools: sampleTools,
      toolExecutors: { getQuotes: failingExecutor },
    });

    expect(result.finalResponse).toBe('Sorry, there was an error.');
    // Check the tool result message contains the error
    const toolMsg = result.messages.find((m) => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(toolMsg!.content).toContain('DB connection failed');
  });

  it('handles unknown tool name gracefully', async () => {
    const adapter = createMockAdapter([
      {
        content: '',
        toolCalls: [{ id: 'tc-1', name: 'unknownTool', arguments: {} }],
        usage: { inputTokens: 20, outputTokens: 10 },
      },
      {
        content: 'I could not find that tool.',
        toolCalls: null,
        usage: { inputTokens: 30, outputTokens: 10 },
      },
    ]);

    const result = await executeToolLoop({
      adapter,
      systemPrompt: 'Test',
      messages: [{ role: 'user', content: 'Do something' }],
      tools: sampleTools,
      toolExecutors: {},
    });

    const toolMsg = result.messages.find((m) => m.role === 'tool');
    expect(toolMsg!.content).toContain('Unknown tool: unknownTool');
  });

  it('stops at maxIterations and returns fallback message for empty content', async () => {
    // Always returns tool calls — never a final response
    const adapter = createMockAdapter([
      {
        content: '',
        toolCalls: [{ id: 'tc-1', name: 'getQuotes', arguments: { symbols: ['A'] } }],
        usage: { inputTokens: 10, outputTokens: 5 },
      },
      {
        content: '',
        toolCalls: [{ id: 'tc-2', name: 'getQuotes', arguments: { symbols: ['B'] } }],
        usage: { inputTokens: 10, outputTokens: 5 },
      },
    ]);

    const mockExecutor = vi.fn().mockResolvedValue({ ok: true });

    const result = await executeToolLoop({
      adapter,
      systemPrompt: 'Test',
      messages: [{ role: 'user', content: 'Loop forever' }],
      tools: sampleTools,
      toolExecutors: { getQuotes: mockExecutor },
      maxIterations: 2,
    });

    // || coalesces empty strings to the fallback message (unlike ?? which only catches null/undefined)
    expect(result.finalResponse).toBe(
      'I was unable to complete the analysis within the allowed number of steps.'
    );
  });

  it('propagates adapter errors to caller', async () => {
    const adapter: LLMAdapter = {
      chat: vi.fn().mockRejectedValue(new Error('API rate limited')),
    };

    await expect(
      executeToolLoop({
        adapter,
        systemPrompt: 'Test',
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [],
        toolExecutors: {},
      }),
    ).rejects.toThrow('API rate limited');
  });

  it('handles null content in final response', async () => {
    const adapter = createMockAdapter([
      { content: null, toolCalls: null, usage: { inputTokens: 5, outputTokens: 0 } },
    ]);

    const result = await executeToolLoop({
      adapter,
      systemPrompt: 'Test',
      messages: [{ role: 'user', content: 'Hi' }],
      tools: [],
      toolExecutors: {},
    });

    expect(result.finalResponse).toBe('');
  });
});
