import type { Instrument } from './types.js';

/**
 * Resolve the correct symbol string for a given provider.
 *
 * Check the instrument's providerSymbolMap for a provider-specific symbol.
 * Falls back to the instrument's raw symbol if no mapping exists.
 *
 * Example: For Stooq, AAPL might map to "aapl.us".
 */
export function getProviderSymbol(
  instrument: Instrument,
  providerName: string
): string {
  const mapped = instrument.providerSymbolMap[providerName];
  return mapped ?? instrument.symbol;
}
