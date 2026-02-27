/**
 * Conservative token estimation for context window management.
 *
 * Rule of thumb: ~4 characters per token for English text.
 * We use 3.5 chars/token to be conservative (overestimates slightly,
 * which means we trim earlier rather than later — safe failure mode).
 *
 * Tool call JSON and structured data is less token-efficient than prose,
 * so we use 3.0 chars/token for tool messages.
 *
 * AD-S19-1: Character-ratio heuristic, not model-specific tokenizer.
 */

const CHARS_PER_TOKEN_TEXT = 3.5;
const CHARS_PER_TOKEN_STRUCTURED = 3.0;

export function estimateTokens(text: string, isStructured = false): number {
  if (!text) return 0;
  const ratio = isStructured ? CHARS_PER_TOKEN_STRUCTURED : CHARS_PER_TOKEN_TEXT;
  return Math.ceil(text.length / ratio);
}

export function estimateMessageTokens(message: {
  role: string;
  content: string | null;
  toolCalls?: unknown;
  toolResults?: unknown;
}): number {
  let total = 0;

  // Content text
  if (message.content) {
    total += estimateTokens(message.content, message.role === 'tool');
  }

  // Tool calls (JSON)
  if (message.toolCalls) {
    total += estimateTokens(JSON.stringify(message.toolCalls), true);
  }

  // Tool results (JSON)
  if (message.toolResults) {
    total += estimateTokens(JSON.stringify(message.toolResults), true);
  }

  // Per-message overhead (role, formatting)
  total += 4;

  return total;
}

export function estimateConversationTokens(
  messages: ReadonlyArray<{ role: string; content: string | null; toolCalls?: unknown; toolResults?: unknown }>,
): number {
  return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
}
