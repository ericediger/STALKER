import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the Anthropic SDK before importing the adapter
const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
      constructor() {
        // no-op
      }
    },
  };
});

import { AnthropicAdapter } from '../src/anthropic-adapter.js';

describe('AnthropicAdapter', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-key' };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws when ANTHROPIC_API_KEY is not set', () => {
    delete process.env['ANTHROPIC_API_KEY'];
    expect(() => new AnthropicAdapter()).toThrow('ANTHROPIC_API_KEY');
  });

  it('sends messages and returns text response', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Hello there!' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const adapter = new AnthropicAdapter();
    const result = await adapter.chat(
      [{ role: 'user', content: 'Hi' }],
      [],
      { systemPrompt: 'Test system prompt' },
    );

    expect(result.content).toBe('Hello there!');
    expect(result.toolCalls).toBeNull();
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it('returns tool calls from response', async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: 'tool_use', id: 'tc-1', name: 'getQuotes', input: { symbols: ['AAPL'] } },
      ],
      usage: { input_tokens: 15, output_tokens: 8 },
    });

    const adapter = new AnthropicAdapter();
    const result = await adapter.chat(
      [{ role: 'user', content: 'Price of AAPL?' }],
      [{ name: 'getQuotes', description: 'Get quotes', parameters: {} }],
    );

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0]!.name).toBe('getQuotes');
    expect(result.toolCalls![0]!.arguments).toEqual({ symbols: ['AAPL'] });
    expect(result.toolCalls![0]!.id).toBe('tc-1');
  });

  it('translates tool messages to tool_result user messages', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Done.' }],
      usage: { input_tokens: 20, output_tokens: 5 },
    });

    const adapter = new AnthropicAdapter();
    await adapter.chat(
      [
        { role: 'user', content: 'Price?' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'tc-1', name: 'getQuotes', arguments: { symbols: ['AAPL'] } }],
        },
        { role: 'tool', content: '{"price":"$185"}', toolCallId: 'tc-1' },
      ],
      [{ name: 'getQuotes', description: 'Get quotes', parameters: {} }],
    );

    // Verify the messages sent to Anthropic API
    const callArgs = mockCreate.mock.calls[0]![0] as { messages: unknown[] };
    const messages = callArgs.messages as Array<{ role: string; content: unknown }>;

    // Third message should be user with tool_result content block
    const toolResultMsg = messages[2]!;
    expect(toolResultMsg.role).toBe('user');
    expect(Array.isArray(toolResultMsg.content)).toBe(true);
    const contentBlocks = toolResultMsg.content as Array<{ type: string; tool_use_id?: string; content?: string }>;
    expect(contentBlocks[0]!.type).toBe('tool_result');
    expect(contentBlocks[0]!.tool_use_id).toBe('tc-1');
  });

  it('uses LLM_MODEL env var when set', async () => {
    process.env['LLM_MODEL'] = 'claude-haiku-4-5-20251001';

    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Fast response.' }],
      usage: { input_tokens: 5, output_tokens: 3 },
    });

    const adapter = new AnthropicAdapter();
    await adapter.chat([{ role: 'user', content: 'Hi' }], []);

    const callArgs = mockCreate.mock.calls[0]![0] as { model: string };
    expect(callArgs.model).toBe('claude-haiku-4-5-20251001');
  });

  it('handles mixed text and tool_use content blocks', async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: 'text', text: 'Let me check that. ' },
        { type: 'tool_use', id: 'tc-1', name: 'getHolding', input: { symbol: 'VTI' } },
      ],
      usage: { input_tokens: 12, output_tokens: 8 },
    });

    const adapter = new AnthropicAdapter();
    const result = await adapter.chat(
      [{ role: 'user', content: 'Tell me about VTI' }],
      [{ name: 'getHolding', description: 'Get holding', parameters: {} }],
    );

    expect(result.content).toBe('Let me check that. ');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0]!.name).toBe('getHolding');
  });
});
