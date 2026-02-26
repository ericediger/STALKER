import { describe, it, expect } from 'vitest';
import { isNYSEHoliday, NYSE_HOLIDAYS } from '../src/calendar/nyse-holidays.js';
import { isTradingDay, isMarketOpen } from '../src/calendar/market-calendar.js';

describe('isNYSEHoliday', () => {
  it('returns true for Christmas 2025', () => {
    expect(isNYSEHoliday('2025-12-25')).toBe(true);
  });

  it('returns true for New Year 2026', () => {
    expect(isNYSEHoliday('2026-01-01')).toBe(true);
  });

  it('returns false for a regular weekday', () => {
    expect(isNYSEHoliday('2025-06-10')).toBe(false);
  });

  it('returns false for a weekend', () => {
    expect(isNYSEHoliday('2025-06-14')).toBe(false);
  });

  it('covers all 10 NYSE holidays for 2025', () => {
    const holidays2025 = [...NYSE_HOLIDAYS].filter((d) => d.startsWith('2025'));
    expect(holidays2025).toHaveLength(10);
  });

  it('covers all 10 NYSE holidays for 2026', () => {
    const holidays2026 = [...NYSE_HOLIDAYS].filter((d) => d.startsWith('2026'));
    expect(holidays2026).toHaveLength(10);
  });
});

describe('isTradingDay with holidays', () => {
  it('returns false on Independence Day 2025 (Friday)', () => {
    // 2025-07-04 is a Friday — weekday but holiday
    expect(isTradingDay(new Date('2025-07-04T15:00:00Z'), 'NYSE')).toBe(false);
  });

  it('returns false on Thanksgiving 2025 (Thursday)', () => {
    // 2025-11-27 is a Thursday — weekday but holiday
    expect(isTradingDay(new Date('2025-11-27T15:00:00Z'), 'NYSE')).toBe(false);
  });

  it('returns true on the day before a holiday', () => {
    // 2025-07-03 is a Thursday — regular weekday
    expect(isTradingDay(new Date('2025-07-03T15:00:00Z'), 'NYSE')).toBe(true);
  });

  it('does not apply NYSE holidays to non-US exchanges', () => {
    // LSE does not observe July 4th
    expect(isTradingDay(new Date('2025-07-04T12:00:00Z'), 'LSE')).toBe(true);
  });
});

describe('isMarketOpen with holidays', () => {
  it('returns false on July 4 2025 during market hours', () => {
    // 2025-07-04 10:00 AM ET = 14:00 UTC (EDT)
    expect(isMarketOpen(new Date('2025-07-04T14:00:00Z'), 'NYSE')).toBe(false);
  });

  it('returns false on observed July 4 2026 (Friday July 3) during market hours', () => {
    // 2026-07-03 is the observed holiday (July 4 falls on Saturday)
    // 10:00 AM ET = 14:00 UTC (EDT)
    expect(isMarketOpen(new Date('2026-07-03T14:00:00Z'), 'NYSE')).toBe(false);
  });
});

describe('getNextTradingDay skips holidays', () => {
  // Import at test level to keep the test focused
  it('skips over holiday to next weekday', async () => {
    const { getNextTradingDay } = await import('../src/calendar/market-calendar.js');
    // Day before Thanksgiving 2025 (Wednesday Nov 26) → should skip Thursday Nov 27 → Friday Nov 28
    const result = getNextTradingDay(new Date('2025-11-26T15:00:00Z'), 'NYSE');
    expect(result.toISOString()).toContain('2025-11-28');
  });
});
