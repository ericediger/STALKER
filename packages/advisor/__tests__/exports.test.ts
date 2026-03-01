import { describe, it, expect } from 'vitest';
import {
  allToolDefinitions,
  getPortfolioSnapshotDefinition,
  getHoldingDefinition,
  getTransactionsDefinition,
  getQuotesDefinition,
  SYSTEM_PROMPT,
  estimateTokens,
  estimateMessageTokens,
  estimateConversationTokens,
  CONTEXT_BUDGET,
  windowMessages,
  groupIntoTurns,
  generateSummary,
  formatSummaryPreamble,
} from '../src/index.js';

describe('advisor package exports', () => {
  it('exports SYSTEM_PROMPT as a non-empty string', () => {
    expect(typeof SYSTEM_PROMPT).toBe('string');
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it('exports allToolDefinitions with 5 tools', () => {
    expect(allToolDefinitions).toHaveLength(5);
    const names = allToolDefinitions.map((t) => t.name);
    expect(names).toContain('getPortfolioSnapshot');
    expect(names).toContain('getHolding');
    expect(names).toContain('getTransactions');
    expect(names).toContain('getQuotes');
    expect(names).toContain('getTopHoldings');
  });

  it('each tool definition has name, description, and parameters', () => {
    for (const tool of allToolDefinitions) {
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(10);
      expect(typeof tool.parameters).toBe('object');
    }
  });

  it('getPortfolioSnapshot has window enum', () => {
    const props = getPortfolioSnapshotDefinition.parameters as {
      properties: { window: { enum: string[] } };
    };
    expect(props.properties.window.enum).toEqual(['1W', '1M', '3M', '1Y', 'ALL']);
  });

  it('getHolding requires symbol', () => {
    const params = getHoldingDefinition.parameters as { required: string[] };
    expect(params.required).toContain('symbol');
  });

  it('getTransactions has type enum with BUY and SELL', () => {
    const props = getTransactionsDefinition.parameters as {
      properties: { type: { enum: string[] } };
    };
    expect(props.properties.type.enum).toEqual(['BUY', 'SELL']);
  });

  it('getQuotes requires symbols array', () => {
    const params = getQuotesDefinition.parameters as { required: string[] };
    expect(params.required).toContain('symbols');
  });

  it('system prompt covers all 5 intent categories', () => {
    // Cross-holding synthesis
    expect(SYSTEM_PROMPT).toContain('allocation');
    // Tax-aware reasoning
    expect(SYSTEM_PROMPT).toContain('tax');
    // Performance attribution
    expect(SYSTEM_PROMPT).toContain('performance');
    // Concentration awareness
    expect(SYSTEM_PROMPT).toContain('concentration');
    // Staleness/data quality
    expect(SYSTEM_PROMPT).toContain('stale');
  });

  it('exports context window management functions', () => {
    expect(typeof estimateTokens).toBe('function');
    expect(typeof estimateMessageTokens).toBe('function');
    expect(typeof estimateConversationTokens).toBe('function');
    expect(typeof windowMessages).toBe('function');
    expect(typeof groupIntoTurns).toBe('function');
    expect(typeof generateSummary).toBe('function');
    expect(typeof formatSummaryPreamble).toBe('function');
  });

  it('exports CONTEXT_BUDGET with MESSAGE_BUDGET getter', () => {
    expect(typeof CONTEXT_BUDGET).toBe('object');
    expect(CONTEXT_BUDGET.MODEL_CONTEXT_WINDOW).toBe(200_000);
    expect(CONTEXT_BUDGET.MESSAGE_BUDGET).toBeGreaterThan(100_000);
  });
});
