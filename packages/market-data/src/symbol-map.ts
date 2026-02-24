import type { Instrument } from './types.js';

/**
 * Resolve the correct symbol string for a given provider.
 *
 * Check the instrument's providerSymbolMap for a provider-specific symbol.
 * Falls back to the instrument's raw symbol if no mapping exists.
 *
 * Example: For Tiingo, BRK.B maps to "BRK-B" (hyphen instead of dot).
 */
export function getProviderSymbol(
  instrument: Instrument,
  providerName: string
): string {
  const mapped = instrument.providerSymbolMap[providerName];
  return mapped ?? instrument.symbol;
}
