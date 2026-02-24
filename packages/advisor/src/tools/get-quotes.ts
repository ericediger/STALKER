import type { ToolDefinition } from '../llm-adapter.js';

export const getQuotesDefinition: ToolDefinition = {
  name: 'getQuotes',
  description:
    'Get the latest cached price quotes for one or more instruments. Returns the price and asOf timestamp for each. Use this to check data freshness before presenting price-dependent analysis.',
  parameters: {
    type: 'object',
    properties: {
      symbols: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of ticker symbols',
      },
    },
    required: ['symbols'],
  },
};

export interface QuotesDeps {
  fetchQuotes: (symbols: string[]) => Promise<unknown>;
}

export function createGetQuotesExecutor(deps: QuotesDeps) {
  return async (args: Record<string, unknown>): Promise<unknown> => {
    const symbols = args['symbols'] as string[] | undefined;
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return { error: 'symbols parameter is required and must be a non-empty array' };
    }
    return deps.fetchQuotes(symbols.map((s) => s.toUpperCase()));
  };
}
