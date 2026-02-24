/**
 * Backfill Data Quality Tests
 *
 * Validates the data quality invariants that must hold after a Tiingo backfill.
 * Uses mocked provider data that matches the real Tiingo response shape.
 * Does NOT call live APIs.
 */

import { describe, it, expect } from 'vitest';
import { toDecimal, Decimal, ZERO } from '@stalker/shared';
import type { PriceBar, Resolution } from '@stalker/shared';

// ---------------------------------------------------------------------------
// Mock Data Generators — Match Tiingo Response Shape
// ---------------------------------------------------------------------------

/**
 * Creates a realistic PriceBar mimicking what TiingoProvider.getHistory() returns
 * after processing a Tiingo daily bar response.
 */
function makeTiingoBar(overrides: Partial<PriceBar> & { date: string }): PriceBar {
  return {
    id: 0,
    instrumentId: 'inst-AAPL',
    provider: 'tiingo',
    resolution: '1D' as Resolution,
    date: overrides.date,
    time: null,
    open: overrides.open ?? toDecimal('150.25'),
    high: overrides.high ?? toDecimal('153.50'),
    low: overrides.low ?? toDecimal('149.80'),
    close: overrides.close ?? toDecimal('152.30'),
    volume: overrides.volume !== undefined ? overrides.volume : 45000000,
    ...overrides,
  };
}

/**
 * Generate a series of realistic daily bars for testing.
 * Simulates 2 years of data with monotonically increasing dates (weekdays only).
 */
function generateRealisticBars(
  instrumentId: string,
  startDate: string,
  count: number,
  basePrice: number = 150,
): PriceBar[] {
  const bars: PriceBar[] = [];
  const current = new Date(startDate + 'T00:00:00Z');

  for (let i = 0; i < count; i++) {
    // Skip weekends
    while (current.getUTCDay() === 0 || current.getUTCDay() === 6) {
      current.setUTCDate(current.getUTCDate() + 1);
    }

    // Generate realistic OHLCV with small random walk
    const dayVariation = (Math.sin(i * 0.1) * 3) + (i * 0.01);
    const open = basePrice + dayVariation;
    const spread = 2 + Math.abs(Math.sin(i * 0.3));
    const high = open + spread;
    const low = open - spread * 0.8;
    const close = low + (high - low) * (0.3 + Math.abs(Math.sin(i * 0.7)) * 0.4);

    const year = current.getUTCFullYear();
    const month = String(current.getUTCMonth() + 1).padStart(2, '0');
    const day = String(current.getUTCDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    bars.push({
      id: 0,
      instrumentId,
      provider: 'tiingo',
      resolution: '1D' as Resolution,
      date: dateStr,
      time: null,
      open: toDecimal(open.toFixed(10)),
      high: toDecimal(high.toFixed(10)),
      low: toDecimal(low.toFixed(10)),
      close: toDecimal(close.toFixed(10)),
      volume: Math.floor(30000000 + Math.random() * 20000000),
    });

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return bars;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Backfill Data Quality Invariants', () => {
  const realisticBars = generateRealisticBars('inst-AAPL', '2024-02-26', 500, 170);

  describe('Price validity', () => {
    it('no zero-price bars — open, high, low, close all > 0', () => {
      for (const bar of realisticBars) {
        expect(
          bar.open.greaterThan(ZERO),
          `Bar ${bar.date}: open should be > 0, got ${bar.open.toString()}`,
        ).toBe(true);
        expect(
          bar.high.greaterThan(ZERO),
          `Bar ${bar.date}: high should be > 0, got ${bar.high.toString()}`,
        ).toBe(true);
        expect(
          bar.low.greaterThan(ZERO),
          `Bar ${bar.date}: low should be > 0, got ${bar.low.toString()}`,
        ).toBe(true);
        expect(
          bar.close.greaterThan(ZERO),
          `Bar ${bar.date}: close should be > 0, got ${bar.close.toString()}`,
        ).toBe(true);
      }
    });

    it('high >= low for every bar', () => {
      for (const bar of realisticBars) {
        expect(
          bar.high.greaterThanOrEqualTo(bar.low),
          `Bar ${bar.date}: high (${bar.high.toString()}) should be >= low (${bar.low.toString()})`,
        ).toBe(true);
      }
    });

    it('close is within [low, high] range', () => {
      for (const bar of realisticBars) {
        expect(
          bar.close.greaterThanOrEqualTo(bar.low),
          `Bar ${bar.date}: close (${bar.close.toString()}) should be >= low (${bar.low.toString()})`,
        ).toBe(true);
        expect(
          bar.close.lessThanOrEqualTo(bar.high),
          `Bar ${bar.date}: close (${bar.close.toString()}) should be <= high (${bar.high.toString()})`,
        ).toBe(true);
      }
    });

    it('open is within [low, high] range', () => {
      for (const bar of realisticBars) {
        expect(
          bar.open.greaterThanOrEqualTo(bar.low),
          `Bar ${bar.date}: open (${bar.open.toString()}) should be >= low (${bar.low.toString()})`,
        ).toBe(true);
        expect(
          bar.open.lessThanOrEqualTo(bar.high),
          `Bar ${bar.date}: open (${bar.open.toString()}) should be <= high (${bar.high.toString()})`,
        ).toBe(true);
      }
    });

    it('volume >= 0 when present', () => {
      for (const bar of realisticBars) {
        if (bar.volume !== null) {
          expect(
            bar.volume >= 0,
            `Bar ${bar.date}: volume should be >= 0, got ${bar.volume}`,
          ).toBe(true);
        }
      }
    });
  });

  describe('Date integrity', () => {
    it('no duplicate dates for same instrument', () => {
      const dateSet = new Set<string>();
      const duplicates: string[] = [];

      for (const bar of realisticBars) {
        const key = `${bar.instrumentId}:${bar.date}`;
        if (dateSet.has(key)) {
          duplicates.push(bar.date);
        }
        dateSet.add(key);
      }

      expect(duplicates, `Duplicate dates found: ${duplicates.join(', ')}`).toEqual([]);
    });

    it('bars are sorted by date ascending', () => {
      for (let i = 1; i < realisticBars.length; i++) {
        const prev = realisticBars[i - 1]!;
        const curr = realisticBars[i]!;
        expect(
          prev.date <= curr.date,
          `Bars not sorted: ${prev.date} should come before ${curr.date}`,
        ).toBe(true);
      }
    });

    it('firstBarDate matches earliest bar date', () => {
      // Simulate what the instrument creation route does:
      // determine firstBarDate from sorted bar dates
      const sortedDates = realisticBars.map((b) => b.date).sort();
      const firstBarDate = sortedDates[0] ?? null;

      expect(firstBarDate).not.toBeNull();
      expect(firstBarDate).toBe(realisticBars[0]!.date);
    });

    it('no weekend dates in bars', () => {
      const weekendBars: string[] = [];
      for (const bar of realisticBars) {
        const d = new Date(bar.date + 'T12:00:00Z');
        const dayOfWeek = d.getUTCDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          weekendBars.push(bar.date);
        }
      }
      expect(weekendBars, `Weekend dates found: ${weekendBars.join(', ')}`).toEqual([]);
    });

    it('date format is YYYY-MM-DD', () => {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      for (const bar of realisticBars) {
        expect(
          dateRegex.test(bar.date),
          `Bar date "${bar.date}" does not match YYYY-MM-DD format`,
        ).toBe(true);
      }
    });
  });

  describe('Provider metadata', () => {
    it('provider is set to tiingo for all bars', () => {
      for (const bar of realisticBars) {
        expect(bar.provider).toBe('tiingo');
      }
    });

    it('resolution is 1D for all bars', () => {
      for (const bar of realisticBars) {
        expect(bar.resolution).toBe('1D');
      }
    });

    it('instrumentId is consistent across all bars', () => {
      const firstId = realisticBars[0]!.instrumentId;
      for (const bar of realisticBars) {
        expect(bar.instrumentId).toBe(firstId);
      }
    });
  });

  describe('Tiingo adjusted price precision', () => {
    it('preserves full decimal precision from adjusted prices', () => {
      // Tiingo returns adjusted prices with up to 10 decimal places
      const bar = makeTiingoBar({
        date: '2025-06-15',
        open: toDecimal('150.1234567890'),
        high: toDecimal('155.9876543210'),
        low: toDecimal('149.0000000001'),
        close: toDecimal('153.5555555555'),
      });

      expect(bar.open.toString()).toBe('150.123456789');
      expect(bar.high.toString()).toBe('155.987654321');
      expect(bar.low.toString()).toBe('149.0000000001');
      expect(bar.close.toString()).toBe('153.5555555555');
    });

    it('detects zero-price bars from malformed data', () => {
      const zeroBars: PriceBar[] = [
        makeTiingoBar({ date: '2025-01-02', open: toDecimal('0'), high: toDecimal('100'), low: toDecimal('0'), close: toDecimal('100') }),
        makeTiingoBar({ date: '2025-01-03', close: toDecimal('0') }),
      ];

      const barsWithZeros = zeroBars.filter(
        (bar) =>
          bar.open.isZero() ||
          bar.high.isZero() ||
          bar.low.isZero() ||
          bar.close.isZero(),
      );

      expect(barsWithZeros.length).toBe(2);
    });
  });

  describe('Edge cases', () => {
    it('handles bars where open equals close (doji pattern)', () => {
      const doji = makeTiingoBar({
        date: '2025-03-15',
        open: toDecimal('150.00'),
        close: toDecimal('150.00'),
        high: toDecimal('151.00'),
        low: toDecimal('149.00'),
      });

      expect(doji.open.equals(doji.close)).toBe(true);
      expect(doji.high.greaterThanOrEqualTo(doji.open)).toBe(true);
      expect(doji.low.lessThanOrEqualTo(doji.open)).toBe(true);
    });

    it('handles bars where all OHLC are equal (flat day)', () => {
      const flatBar = makeTiingoBar({
        date: '2025-03-16',
        open: toDecimal('150.00'),
        high: toDecimal('150.00'),
        low: toDecimal('150.00'),
        close: toDecimal('150.00'),
      });

      expect(flatBar.high.greaterThanOrEqualTo(flatBar.low)).toBe(true);
      expect(flatBar.close.greaterThanOrEqualTo(flatBar.low)).toBe(true);
      expect(flatBar.close.lessThanOrEqualTo(flatBar.high)).toBe(true);
    });

    it('handles null volume gracefully', () => {
      const bar = makeTiingoBar({
        date: '2025-03-17',
        volume: null,
      });

      expect(bar.volume).toBeNull();
    });
  });
});
