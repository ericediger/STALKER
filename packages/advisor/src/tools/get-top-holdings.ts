import type { ToolDefinition } from '../llm-adapter.js';

export const getTopHoldingsDefinition: ToolDefinition = {
  name: 'getTopHoldings',
  description:
    'Get the top N holdings by a chosen metric. Use for overview questions, concentration analysis, or "what are my biggest positions" queries. Prefer this over getPortfolioSnapshot for general portfolio questions — it returns only what is needed and is faster.',
  parameters: {
    type: 'object',
    properties: {
      count: {
        type: 'number',
        description: 'Number of holdings to return (default 10, max 20)',
      },
      sortBy: {
        type: 'string',
        enum: ['allocation', 'value', 'pnl', 'dayChange'],
        description: 'Sort criterion (default: allocation)',
      },
    },
  },
};

export interface TopHoldingsDeps {
  fetchTopHoldings: (count: number, sortBy: string) => Promise<unknown>;
}

export function createGetTopHoldingsExecutor(deps: TopHoldingsDeps) {
  return async (args: Record<string, unknown>): Promise<unknown> => {
    const rawCount = args['count'] as number | undefined;
    const count = Math.min(Math.max(rawCount ?? 10, 1), 20);
    const sortBy = (args['sortBy'] as string) ?? 'allocation';
    return deps.fetchTopHoldings(count, sortBy);
  };
}
