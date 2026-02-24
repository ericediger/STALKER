import type { ToolDefinition } from '../llm-adapter.js';

export const getPortfolioSnapshotDefinition: ToolDefinition = {
  name: 'getPortfolioSnapshot',
  description:
    'Get the current portfolio state including total value, cost basis, realized and unrealized PnL, and per-holding breakdown with allocation percentages. Optionally specify a time window.',
  parameters: {
    type: 'object',
    properties: {
      window: {
        type: 'string',
        enum: ['1W', '1M', '3M', '1Y', 'ALL'],
        description: 'Time window for performance metrics. Default: ALL',
      },
    },
  },
};

export interface PortfolioSnapshotDeps {
  fetchSnapshot: (window: string) => Promise<unknown>;
}

export function createGetPortfolioSnapshotExecutor(deps: PortfolioSnapshotDeps) {
  return async (args: Record<string, unknown>): Promise<unknown> => {
    const window = (args['window'] as string) ?? 'ALL';
    return deps.fetchSnapshot(window);
  };
}
