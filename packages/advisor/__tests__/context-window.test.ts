import { describe, it, expect, vi, beforeEach } from 'vitest';
import { windowMessages, groupIntoTurns } from '../src/context-window.js';
import type { WindowableMessage } from '../src/context-window.js';
import { estimateConversationTokens } from '../src/token-estimator.js';
import { CONTEXT_BUDGET } from '../src/context-budget.js';

function makeMsg(
  id: string,
  role: string,
  content: string,
  extra?: Partial<WindowableMessage>,
): WindowableMessage {
  return {
    id,
    role,
    content,
    createdAt: new Date(`2026-01-01T00:00:${id.padStart(2, '0')}Z`),
    ...extra,
  };
}

describe('groupIntoTurns', () => {
  it('groups correctly with user messages as turn boundaries', () => {
    const msgs = [
      makeMsg('1', 'user', 'Q1'),
      makeMsg('2', 'assistant', 'A1'),
      makeMsg('3', 'user', 'Q2'),
      makeMsg('4', 'assistant', 'A2'),
    ];
    const turns = groupIntoTurns(msgs);
    expect(turns).toHaveLength(2);
    expect(turns[0]).toHaveLength(2); // user + assistant
    expect(turns[1]).toHaveLength(2);
  });

  it('keeps tool calls and results in same turn as their assistant', () => {
    const msgs = [
      makeMsg('1', 'user', 'What is AAPL worth?'),
      makeMsg('2', 'assistant', '', { toolCalls: [{ id: 'tc1', name: 'getQuotes' }] }),
      makeMsg('3', 'tool', '{"price":"$185"}', { toolResults: { toolCallId: 'tc1' } }),
      makeMsg('4', 'assistant', 'AAPL is $185.'),
      makeMsg('5', 'user', 'And MSFT?'),
      makeMsg('6', 'assistant', 'Let me check.'),
    ];
    const turns = groupIntoTurns(msgs);
    expect(turns).toHaveLength(2);
    expect(turns[0]).toHaveLength(4); // user + assistant(tool) + tool + assistant
    expect(turns[1]).toHaveLength(2); // user + assistant
  });

  it('handles empty array', () => {
    expect(groupIntoTurns([])).toEqual([]);
  });

  it('handles messages starting with non-user role', () => {
    const msgs = [
      makeMsg('1', 'assistant', 'Welcome!'),
      makeMsg('2', 'user', 'Hi'),
      makeMsg('3', 'assistant', 'Hello!'),
    ];
    const turns = groupIntoTurns(msgs);
    expect(turns).toHaveLength(2);
    expect(turns[0]).toHaveLength(1); // assistant only
    expect(turns[1]).toHaveLength(2); // user + assistant
  });
});

describe('windowMessages', () => {
  it('returns all messages when under budget', () => {
    const msgs = [
      makeMsg('1', 'user', 'Hello'),
      makeMsg('2', 'assistant', 'Hi there!'),
    ];
    const result = windowMessages(msgs, null);
    expect(result.messages).toEqual(msgs);
    expect(result.trimmed).toEqual([]);
    expect(result.estimatedTokens).toBeGreaterThan(0);
  });

  it('returns empty result for empty message list', () => {
    const result = windowMessages([], null);
    expect(result.messages).toEqual([]);
    expect(result.trimmed).toEqual([]);
    expect(result.shouldGenerateSummary).toBe(false);
    expect(result.estimatedTokens).toBe(0);
  });

  it('trims oldest turns when over budget', () => {
    // Need at least 4 turns so that MIN_RECENT_MESSAGES (3 turns) is satisfiable
    // with 1 turn trimmed. Each big turn ≈ 114K tokens. Budget ≈ 174K tokens.
    const longContent = 'x'.repeat(400_000); // ~114K tokens at 3.5 chars/token
    const msgs = [
      makeMsg('1', 'user', longContent),
      makeMsg('2', 'assistant', longContent),
      makeMsg('3', 'user', 'Q2'),
      makeMsg('4', 'assistant', 'A2'),
      makeMsg('5', 'user', 'Q3'),
      makeMsg('6', 'assistant', 'A3'),
      makeMsg('7', 'user', 'Recent question'),
      makeMsg('8', 'assistant', 'Recent answer'),
    ];

    const result = windowMessages(msgs, null);
    // Should have trimmed the first turn (the huge one)
    expect(result.trimmed.length).toBeGreaterThan(0);
    // First turn should be in trimmed
    expect(result.trimmed.some((m) => m.id === '1')).toBe(true);
    // Recent messages should be kept
    expect(result.messages.some((m) => m.content === 'Recent question')).toBe(true);
    expect(result.messages.some((m) => m.content === 'Recent answer')).toBe(true);
  });

  it('never orphans tool calls from their results', () => {
    const longContent = 'x'.repeat(400_000);
    const msgs = [
      makeMsg('1', 'user', longContent),
      makeMsg('2', 'assistant', longContent),
      makeMsg('3', 'user', 'Check AAPL'),
      makeMsg('4', 'assistant', '', { toolCalls: [{ id: 'tc1', name: 'getQuotes' }] }),
      makeMsg('5', 'tool', '{"price":"$185"}', { toolResults: { toolCallId: 'tc1' } }),
      makeMsg('6', 'assistant', 'AAPL is $185.'),
    ];
    const result = windowMessages(msgs, null);

    // If the tool call assistant message is kept, the tool result must also be kept
    const hasToolCallMsg = result.messages.some((m) => m.id === '4');
    const hasToolResultMsg = result.messages.some((m) => m.id === '5');
    if (hasToolCallMsg) {
      expect(hasToolResultMsg).toBe(true);
    }
  });

  it('keeps at least MIN_RECENT_MESSAGES worth of turns', () => {
    // Create many turns with large content so even recent ones exceed budget
    const bigContent = 'x'.repeat(100_000);
    const msgs: WindowableMessage[] = [];
    for (let i = 0; i < 10; i++) {
      msgs.push(makeMsg(`u${i}`, 'user', bigContent));
      msgs.push(makeMsg(`a${i}`, 'assistant', bigContent));
    }
    const result = windowMessages(msgs, null);
    // Should keep at least 3 turns (MIN_RECENT_MESSAGES=6, ceil(6/2)=3 turns)
    expect(result.messages.length).toBeGreaterThanOrEqual(6);
  });

  it('sets shouldGenerateSummary when messages trimmed and no summary exists', () => {
    const longContent = 'x'.repeat(400_000);
    const msgs = [
      makeMsg('1', 'user', longContent),
      makeMsg('2', 'assistant', longContent),
      makeMsg('3', 'user', 'Q2'),
      makeMsg('4', 'assistant', 'A2'),
      makeMsg('5', 'user', 'Q3'),
      makeMsg('6', 'assistant', 'A3'),
      makeMsg('7', 'user', 'Recent'),
      makeMsg('8', 'assistant', 'Answer'),
    ];
    const result = windowMessages(msgs, null);
    expect(result.trimmed.length).toBeGreaterThan(0);
    expect(result.shouldGenerateSummary).toBe(true);
  });

  it('sets shouldGenerateSummary false when messages trimmed but summary already exists', () => {
    const longContent = 'x'.repeat(400_000);
    const msgs = [
      makeMsg('1', 'user', longContent),
      makeMsg('2', 'assistant', longContent),
      makeMsg('3', 'user', 'Q2'),
      makeMsg('4', 'assistant', 'A2'),
      makeMsg('5', 'user', 'Q3'),
      makeMsg('6', 'assistant', 'A3'),
      makeMsg('7', 'user', 'Recent'),
      makeMsg('8', 'assistant', 'Answer'),
    ];
    const result = windowMessages(msgs, 'Existing summary of earlier discussion.');
    expect(result.trimmed.length).toBeGreaterThan(0);
    expect(result.shouldGenerateSummary).toBe(false);
  });
});
