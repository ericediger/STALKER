/**
 * Context window budget allocation for the advisor.
 *
 * Claude Sonnet has a 200K token context window, but we budget conservatively:
 * - System prompt + tool definitions: ~3,500 tokens (measured)
 * - Summary prefix: ~800 tokens (when present)
 * - Response headroom: 16,000 tokens (max_tokens setting)
 * - Safety margin: 5,000 tokens (estimation error buffer)
 *
 * Available for conversation history: 200,000 - 3,500 - 800 - 16,000 - 5,000 = 174,700
 * We round down to ~174,700 (exact computed value).
 */

export const CONTEXT_BUDGET = {
  /** Total context window for the model */
  MODEL_CONTEXT_WINDOW: 200_000,

  /** Estimated tokens for system prompt + tool definitions */
  SYSTEM_PROMPT_RESERVE: 3_500,

  /** Max tokens for summary text prepended to windowed conversations */
  SUMMARY_RESERVE: 800,

  /** Max tokens allocated for LLM response (matches max_tokens in adapter) */
  RESPONSE_RESERVE: 16_000,

  /** Buffer for estimation inaccuracy */
  SAFETY_MARGIN: 5_000,

  /** Available tokens for conversation messages */
  get MESSAGE_BUDGET(): number {
    return (
      this.MODEL_CONTEXT_WINDOW -
      this.SYSTEM_PROMPT_RESERVE -
      this.SUMMARY_RESERVE -
      this.RESPONSE_RESERVE -
      this.SAFETY_MARGIN
    );
  },

  /** Threshold for triggering summary generation (% of MESSAGE_BUDGET used) */
  SUMMARY_TRIGGER_RATIO: 0.7,

  /** Target message count to keep in window after trimming */
  MIN_RECENT_MESSAGES: 6,

  /** Maximum messages to summarize in one pass */
  MAX_MESSAGES_PER_SUMMARY: 30,
} as const;
