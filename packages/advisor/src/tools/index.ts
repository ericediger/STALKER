export {
  getPortfolioSnapshotDefinition,
  createGetPortfolioSnapshotExecutor,
} from './get-portfolio-snapshot.js';
export type { PortfolioSnapshotDeps } from './get-portfolio-snapshot.js';

export {
  getHoldingDefinition,
  createGetHoldingExecutor,
} from './get-holding.js';
export type { HoldingDeps } from './get-holding.js';

export {
  getTransactionsDefinition,
  createGetTransactionsExecutor,
} from './get-transactions.js';
export type { TransactionsDeps } from './get-transactions.js';

export {
  getQuotesDefinition,
  createGetQuotesExecutor,
} from './get-quotes.js';
export type { QuotesDeps } from './get-quotes.js';

export {
  getTopHoldingsDefinition,
  createGetTopHoldingsExecutor,
} from './get-top-holdings.js';
export type { TopHoldingsDeps } from './get-top-holdings.js';

import type { ToolDefinition } from '../llm-adapter.js';
import { getPortfolioSnapshotDefinition } from './get-portfolio-snapshot.js';
import { getHoldingDefinition } from './get-holding.js';
import { getTransactionsDefinition } from './get-transactions.js';
import { getQuotesDefinition } from './get-quotes.js';
import { getTopHoldingsDefinition } from './get-top-holdings.js';

/**
 * All tool definitions for the advisor.
 */
export const allToolDefinitions: ToolDefinition[] = [
  getPortfolioSnapshotDefinition,
  getHoldingDefinition,
  getTransactionsDefinition,
  getQuotesDefinition,
  getTopHoldingsDefinition,
];
