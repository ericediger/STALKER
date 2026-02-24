import type { ToolDefinition } from '../llm-adapter.js';

export const getTransactionsDefinition: ToolDefinition = {
  name: 'getTransactions',
  description:
    'Get a list of transactions, optionally filtered by symbol, date range, or type (BUY/SELL).',
  parameters: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description: 'Filter by ticker symbol',
      },
      startDate: {
        type: 'string',
        description: 'ISO date string (YYYY-MM-DD)',
      },
      endDate: {
        type: 'string',
        description: 'ISO date string (YYYY-MM-DD)',
      },
      type: {
        type: 'string',
        enum: ['BUY', 'SELL'],
        description: 'Filter by transaction type',
      },
    },
  },
};

export interface TransactionsDeps {
  fetchTransactions: (filters: {
    symbol?: string;
    startDate?: string;
    endDate?: string;
    type?: string;
  }) => Promise<unknown>;
}

export function createGetTransactionsExecutor(deps: TransactionsDeps) {
  return async (args: Record<string, unknown>): Promise<unknown> => {
    return deps.fetchTransactions({
      symbol: args['symbol'] as string | undefined,
      startDate: args['startDate'] as string | undefined,
      endDate: args['endDate'] as string | undefined,
      type: args['type'] as string | undefined,
    });
  };
}
