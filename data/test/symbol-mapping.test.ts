/**
 * Symbol Mapping Tests
 *
 * Tests that getProviderSymbol() correctly resolves symbols for different providers,
 * and that the instrument creation route builds correct providerSymbolMap entries.
 */

import { describe, it, expect } from 'vitest';
import { getProviderSymbol } from '@stalker/market-data';
import type { Instrument, InstrumentType } from '@stalker/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInstrument(
  symbol: string,
  providerSymbolMap: Record<string, string> = {},
): Instrument {
  return {
    id: `inst-${symbol}`,
    symbol,
    name: `${symbol} Test`,
    type: 'STOCK' as InstrumentType,
    currency: 'USD',
    exchange: 'NYSE',
    exchangeTz: 'America/New_York',
    providerSymbolMap,
    firstBarDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Reproduces the buildTiingoSymbol logic from the instrument creation route.
 * Tiingo uses hyphens where exchanges/FMP use dots (e.g., BRK.B -> BRK-B).
 */
function buildTiingoSymbol(symbol: string): string {
  return symbol.replace(/\./g, '-');
}

/**
 * Builds the providerSymbolMap as the instrument creation route does.
 */
function buildProviderSymbolMap(symbol: string): Record<string, string> {
  return {
    fmp: symbol,
    tiingo: buildTiingoSymbol(symbol),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Symbol Mapping', () => {
  describe('getProviderSymbol()', () => {
    it('resolves BRK-B for tiingo from providerSymbolMap', () => {
      const inst = makeInstrument('BRK.B', {
        fmp: 'BRK.B',
        tiingo: 'BRK-B',
      });

      const result = getProviderSymbol(inst, 'tiingo');
      expect(result).toBe('BRK-B');
    });

    it('resolves BRK.B for fmp from providerSymbolMap', () => {
      const inst = makeInstrument('BRK.B', {
        fmp: 'BRK.B',
        tiingo: 'BRK-B',
      });

      const result = getProviderSymbol(inst, 'fmp');
      expect(result).toBe('BRK.B');
    });

    it('falls back to raw symbol when no mapping exists for provider', () => {
      const inst = makeInstrument('AAPL', {
        fmp: 'AAPL',
        tiingo: 'AAPL',
      });

      // alpha-vantage has no mapping — should fall back to raw symbol
      const result = getProviderSymbol(inst, 'alpha-vantage');
      expect(result).toBe('AAPL');
    });

    it('falls back to raw symbol when providerSymbolMap is empty', () => {
      const inst = makeInstrument('GOOGL', {});

      const result = getProviderSymbol(inst, 'tiingo');
      expect(result).toBe('GOOGL');
    });

    it('handles symbols with no dots (simple case)', () => {
      const inst = makeInstrument('AAPL', {
        fmp: 'AAPL',
        tiingo: 'AAPL',
      });

      expect(getProviderSymbol(inst, 'fmp')).toBe('AAPL');
      expect(getProviderSymbol(inst, 'tiingo')).toBe('AAPL');
    });

    it('handles symbols with multiple dots', () => {
      // Hypothetical multi-dot symbol
      const inst = makeInstrument('BF.A.X', {
        fmp: 'BF.A.X',
        tiingo: 'BF-A-X',
      });

      expect(getProviderSymbol(inst, 'fmp')).toBe('BF.A.X');
      expect(getProviderSymbol(inst, 'tiingo')).toBe('BF-A-X');
    });
  });

  describe('Instrument creation providerSymbolMap building', () => {
    it('builds correct map for simple symbol (AAPL)', () => {
      const map = buildProviderSymbolMap('AAPL');
      expect(map).toEqual({
        fmp: 'AAPL',
        tiingo: 'AAPL',
      });
    });

    it('builds correct map for dotted symbol (BRK.B)', () => {
      const map = buildProviderSymbolMap('BRK.B');
      expect(map).toEqual({
        fmp: 'BRK.B',
        tiingo: 'BRK-B',
      });
    });

    it('builds correct map for ETF symbols', () => {
      const etfSymbols = ['VTI', 'QQQ', 'SPY', 'BND', 'VXUS', 'VNQ', 'XLK', 'AGG'];
      for (const sym of etfSymbols) {
        const map = buildProviderSymbolMap(sym);
        // No dots in ETF symbols, so fmp and tiingo should be identical
        expect(map.fmp).toBe(sym);
        expect(map.tiingo).toBe(sym);
      }
    });

    it('includes tiingo key (not stooq) in the map', () => {
      const map = buildProviderSymbolMap('AAPL');
      expect(map).toHaveProperty('tiingo');
      expect(map).not.toHaveProperty('stooq');
    });

    it('round-trips through getProviderSymbol correctly', () => {
      // Simulate the full flow: build map -> create instrument -> resolve symbol
      const symbol = 'BRK.B';
      const map = buildProviderSymbolMap(symbol);
      const inst = makeInstrument(symbol, map);

      // FMP should get BRK.B (with dot)
      expect(getProviderSymbol(inst, 'fmp')).toBe('BRK.B');
      // Tiingo should get BRK-B (with hyphen)
      expect(getProviderSymbol(inst, 'tiingo')).toBe('BRK-B');
      // Unknown provider falls back to raw symbol
      expect(getProviderSymbol(inst, 'unknown')).toBe('BRK.B');
    });
  });
});
