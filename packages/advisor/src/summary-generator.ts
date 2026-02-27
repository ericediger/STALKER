/**
 * Summary generation for trimmed advisor messages.
 *
 * AD-S19-4: Uses same LLM adapter, minimal prompt, no tools.
 * AD-S19-5: Called asynchronously (fire-and-forget) after response is returned.
 */

import type { LLMAdapter, Message } from './llm-adapter.js';

const SUMMARY_SYSTEM_PROMPT = `You are a conversation summarizer for a portfolio analysis advisor.

Summarize the conversation below into a concise briefing that captures:
1. Key portfolio questions the user asked
2. Important findings or insights the advisor provided
3. Specific instruments, lots, or metrics discussed
4. Any ongoing analysis threads or follow-up items

Keep the summary under 400 words. Use factual statements, not conversational tone.
Do not include greetings, pleasantries, or meta-commentary about the conversation.
Focus on information that would be needed to continue the conversation coherently.`;

/**
 * Generates a summary of trimmed messages to preserve context.
 *
 * Called asynchronously after a windowed response is returned.
 * The summary is stored in AdvisorThread.summaryText and prepended
 * to future LLM calls as a "Previously discussed:" preamble.
 */
export async function generateSummary(
  adapter: LLMAdapter,
  messagesToSummarize: Message[],
  existingSummary: string | null,
): Promise<string> {
  // Build the content to summarize — only user and assistant text content
  const conversationText = messagesToSummarize
    .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.content))
    .map((m) => `${m.role === 'user' ? 'User' : 'Advisor'}: ${m.content}`)
    .join('\n\n');

  if (!conversationText.trim()) {
    return existingSummary ?? '';
  }

  const prompt = existingSummary
    ? `Here is the existing summary of earlier conversation:\n\n${existingSummary}\n\n---\n\nHere are additional messages to incorporate into an updated summary:\n\n${conversationText}\n\nProduce an updated summary that merges the existing summary with the new messages.`
    : `Summarize this conversation:\n\n${conversationText}`;

  const response = await adapter.chat(
    [{ role: 'user', content: prompt }],
    [], // No tools for summary generation
    { maxTokens: 800, systemPrompt: SUMMARY_SYSTEM_PROMPT },
  );

  return response.content || existingSummary || '';
}

/**
 * Formats the summary text as a preamble for the LLM context.
 */
export function formatSummaryPreamble(summaryText: string): string {
  return `[Context from earlier in this conversation]\n${summaryText}\n[End of earlier context — recent messages follow]`;
}
