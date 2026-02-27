/**
 * Context window manager for the advisor.
 *
 * AD-S19-2: Trims at turn boundaries, not individual messages.
 * A "turn" is a user message plus all assistant/tool responses until the next user message.
 * This prevents orphaned tool results or context-free assistant messages.
 */

import { estimateMessageTokens, estimateConversationTokens } from './token-estimator.js';
import { CONTEXT_BUDGET } from './context-budget.js';

export interface WindowableMessage {
  id: string;
  role: string;
  content: string | null;
  toolCalls?: unknown;
  toolResults?: unknown;
  createdAt: Date;
}

export interface WindowResult {
  /** Messages to send to the LLM */
  messages: WindowableMessage[];
  /** Messages that were trimmed (oldest first) */
  trimmed: WindowableMessage[];
  /** Whether summary generation should be triggered */
  shouldGenerateSummary: boolean;
  /** Estimated token count of windowed messages */
  estimatedTokens: number;
}

/**
 * Selects which messages to include in the LLM context window.
 *
 * Algorithm:
 * 1. Start with all messages
 * 2. If total estimated tokens <= MESSAGE_BUDGET, send all (fast path)
 * 3. Otherwise, keep the most recent N turns that fit within budget
 * 4. Never trim below MIN_RECENT_MESSAGES worth of turns
 * 5. Always trim at conversation boundaries (user message starts a turn)
 *
 * AD-S19-3: shouldGenerateSummary is set when messages are trimmed and no summary exists.
 */
export function windowMessages(
  allMessages: WindowableMessage[],
  summaryText: string | null,
): WindowResult {
  if (allMessages.length === 0) {
    return {
      messages: [],
      trimmed: [],
      shouldGenerateSummary: false,
      estimatedTokens: 0,
    };
  }

  const totalTokens = estimateConversationTokens(allMessages);
  const budget = CONTEXT_BUDGET.MESSAGE_BUDGET;

  // Fast path: everything fits
  if (totalTokens <= budget) {
    return {
      messages: allMessages,
      trimmed: [],
      shouldGenerateSummary: totalTokens >= budget * CONTEXT_BUDGET.SUMMARY_TRIGGER_RATIO,
      estimatedTokens: totalTokens,
    };
  }

  // Need to trim. Group messages into "turns" (user message + all responses until next user message)
  const turns = groupIntoTurns(allMessages);

  // Keep adding turns from most recent until we exceed budget
  let tokenCount = 0;
  let keepFromTurn = turns.length;

  for (let i = turns.length - 1; i >= 0; i--) {
    const turnTokens = turns[i]!.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
    if (tokenCount + turnTokens > budget && keepFromTurn < turns.length) {
      break; // This turn would exceed budget and we have at least one turn
    }
    tokenCount += turnTokens;
    keepFromTurn = i;
  }

  // Ensure we keep at least MIN_RECENT_MESSAGES worth of turns
  const minTurnsToKeep = Math.ceil(CONTEXT_BUDGET.MIN_RECENT_MESSAGES / 2); // ~3 turns = 6 messages
  if (turns.length - keepFromTurn < minTurnsToKeep) {
    keepFromTurn = Math.max(0, turns.length - minTurnsToKeep);
    tokenCount = turns
      .slice(keepFromTurn)
      .flat()
      .reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
  }

  const keptMessages = turns.slice(keepFromTurn).flat();
  const trimmedMessages = turns.slice(0, keepFromTurn).flat();

  return {
    messages: keptMessages,
    trimmed: trimmedMessages,
    shouldGenerateSummary: trimmedMessages.length > 0 && !summaryText,
    estimatedTokens: tokenCount,
  };
}

/**
 * Groups messages into conversational turns.
 * A turn starts with a user message and includes all subsequent
 * assistant/tool messages until the next user message.
 */
export function groupIntoTurns(messages: WindowableMessage[]): WindowableMessage[][] {
  const turns: WindowableMessage[][] = [];
  let currentTurn: WindowableMessage[] = [];

  for (const msg of messages) {
    if (msg.role === 'user' && currentTurn.length > 0) {
      turns.push(currentTurn);
      currentTurn = [];
    }
    currentTurn.push(msg);
  }

  if (currentTurn.length > 0) {
    turns.push(currentTurn);
  }

  return turns;
}
