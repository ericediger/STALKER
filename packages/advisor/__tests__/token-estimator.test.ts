import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  estimateMessageTokens,
  estimateConversationTokens,
} from '../src/token-estimator.js';
import { CONTEXT_BUDGET } from '../src/context-budget.js';

describe('estimateTokens', () => {
  it('returns reasonable count for English text', () => {
    // "Hello world" = 11 chars. At 3.5 chars/token → ceil(11/3.5) = 4
    const result = estimateTokens('Hello world');
    expect(result).toBe(4);
  });

  it('uses tighter ratio for structured data', () => {
    const text = '{"symbol":"AAPL","price":"185.50"}';
    const textEstimate = estimateTokens(text, false);
    const structuredEstimate = estimateTokens(text, true);
    // Structured should give a higher token count (fewer chars per token)
    expect(structuredEstimate).toBeGreaterThan(textEstimate);
  });

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

describe('estimateMessageTokens', () => {
  it('sums content + toolCalls + toolResults + overhead', () => {
    const msg = {
      role: 'assistant',
      content: 'Here is the analysis.',
      toolCalls: [{ id: 'tc1', name: 'getHolding', arguments: { symbol: 'AAPL' } }],
    };
    const tokens = estimateMessageTokens(msg);
    // Should include content tokens + toolCalls tokens + 4 overhead
    expect(tokens).toBeGreaterThan(4); // at minimum overhead
    expect(tokens).toBeLessThan(200); // reasonable upper bound
  });

  it('handles null content', () => {
    const msg = { role: 'assistant', content: null };
    const tokens = estimateMessageTokens(msg);
    expect(tokens).toBe(4); // just overhead
  });

  it('counts tool message content as structured', () => {
    const toolContent = '{"holdings":[{"symbol":"AAPL","value":"$50,000"}]}';
    const toolMsg = { role: 'tool', content: toolContent };
    const userMsg = { role: 'user', content: toolContent };

    // Tool messages use 3.0 chars/token, user messages use 3.5 chars/token
    // So tool message should have higher token estimate for same content
    expect(estimateMessageTokens(toolMsg)).toBeGreaterThan(estimateMessageTokens(userMsg));
  });
});

describe('estimateConversationTokens', () => {
  it('sums across all messages', () => {
    const messages = [
      { role: 'user', content: 'What is my portfolio worth?' },
      { role: 'assistant', content: 'Your portfolio is worth $100,000.' },
    ];
    const total = estimateConversationTokens(messages);
    const sum = messages.reduce((s, m) => s + estimateMessageTokens(m), 0);
    expect(total).toBe(sum);
  });

  it('returns 0 for empty array', () => {
    expect(estimateConversationTokens([])).toBe(0);
  });
});

describe('CONTEXT_BUDGET', () => {
  it('MESSAGE_BUDGET computes correctly from components', () => {
    const expected =
      CONTEXT_BUDGET.MODEL_CONTEXT_WINDOW -
      CONTEXT_BUDGET.SYSTEM_PROMPT_RESERVE -
      CONTEXT_BUDGET.SUMMARY_RESERVE -
      CONTEXT_BUDGET.RESPONSE_RESERVE -
      CONTEXT_BUDGET.SAFETY_MARGIN;
    expect(CONTEXT_BUDGET.MESSAGE_BUDGET).toBe(expected);
  });

  it('MESSAGE_BUDGET is positive and > 100,000', () => {
    expect(CONTEXT_BUDGET.MESSAGE_BUDGET).toBeGreaterThan(100_000);
  });
});
