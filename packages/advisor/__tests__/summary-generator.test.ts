import { describe, it, expect, vi } from 'vitest';
import { generateSummary, formatSummaryPreamble } from '../src/summary-generator.js';
import type { LLMAdapter, Message } from '../src/llm-adapter.js';

function makeMockAdapter(responseContent: string | null): LLMAdapter {
  return {
    chat: vi.fn().mockResolvedValue({
      content: responseContent,
      toolCalls: null,
      usage: { inputTokens: 500, outputTokens: 200 },
    }),
  };
}

describe('generateSummary', () => {
  it('generates summary from messages (mock LLM)', async () => {
    const adapter = makeMockAdapter('User asked about AAPL position. Advisor reported 100 shares at $185.');
    const messages: Message[] = [
      { role: 'user', content: 'How is my AAPL position?' },
      { role: 'assistant', content: 'You have 100 shares of AAPL at $185.' },
    ];

    const result = await generateSummary(adapter, messages, null);
    expect(result).toBe('User asked about AAPL position. Advisor reported 100 shares at $185.');
    expect(adapter.chat).toHaveBeenCalledTimes(1);
  });

  it('merges with existing summary when present', async () => {
    const adapter = makeMockAdapter('Updated summary with new context.');
    const messages: Message[] = [
      { role: 'user', content: 'What about MSFT?' },
      { role: 'assistant', content: 'MSFT is at $400.' },
    ];

    const result = await generateSummary(adapter, messages, 'Earlier: discussed AAPL position.');
    expect(result).toBe('Updated summary with new context.');

    // Verify the prompt includes the existing summary
    const chatCall = (adapter.chat as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const prompt = (chatCall[0] as Message[])[0]!.content;
    expect(prompt).toContain('Earlier: discussed AAPL position.');
    expect(prompt).toContain('updated summary');
  });

  it('returns existing summary if LLM returns null', async () => {
    const adapter = makeMockAdapter(null);
    const messages: Message[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ];

    const result = await generateSummary(adapter, messages, 'Existing summary.');
    expect(result).toBe('Existing summary.');
  });

  it('filters out tool messages from summary input', async () => {
    const adapter = makeMockAdapter('Summary without tool noise.');
    const messages: Message[] = [
      { role: 'user', content: 'Check AAPL' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'tc1', name: 'getQuotes', arguments: {} }] },
      { role: 'tool', content: '{"price":"$185"}', toolCallId: 'tc1' },
      { role: 'assistant', content: 'AAPL is at $185.' },
    ];

    await generateSummary(adapter, messages, null);

    // Verify the prompt does not contain raw tool JSON
    const chatCall = (adapter.chat as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const prompt = (chatCall[0] as Message[])[0]!.content;
    expect(prompt).not.toContain('{"price":"$185"}');
    // But should contain the user and assistant text
    expect(prompt).toContain('Check AAPL');
    expect(prompt).toContain('AAPL is at $185.');
  });

  it('returns empty string if no conversation text and no existing summary', async () => {
    const adapter = makeMockAdapter('Some summary');
    const messages: Message[] = [
      { role: 'tool', content: '{"data":"value"}', toolCallId: 'tc1' },
    ];

    const result = await generateSummary(adapter, messages, null);
    expect(result).toBe('');
    expect(adapter.chat).not.toHaveBeenCalled();
  });
});

describe('formatSummaryPreamble', () => {
  it('wraps text with context markers', () => {
    const result = formatSummaryPreamble('User discussed AAPL position.');
    expect(result).toContain('[Context from earlier in this conversation]');
    expect(result).toContain('User discussed AAPL position.');
    expect(result).toContain('[End of earlier context');
  });
});
