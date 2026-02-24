import type { ToolDefinition } from '../llm-adapter.js';

export const getHoldingDefinition: ToolDefinition = {
  name: 'getHolding',
  description:
    'Get detailed position information for a single instrument including quantity, average cost, market value, unrealized PnL, FIFO lot breakdown with per-lot cost basis and unrealized PnL, and recent transactions.',
  parameters: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description: 'Ticker symbol (e.g., VTI, QQQ, AAPL)',
      },
    },
    required: ['symbol'],
  },
};

export interface HoldingDeps {
  fetchHolding: (symbol: string) => Promise<unknown>;
}

export function createGetHoldingExecutor(deps: HoldingDeps) {
  return async (args: Record<string, unknown>): Promise<unknown> => {
    const symbol = args['symbol'] as string;
    if (!symbol) {
      return { error: 'symbol parameter is required' };
    }
    return deps.fetchHolding(symbol.toUpperCase());
  };
}
