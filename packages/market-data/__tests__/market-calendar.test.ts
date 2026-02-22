import { describe, it, expect } from 'vitest';
import {
  isTradingDay,
  getSessionTimes,
  isMarketOpen,
  getPriorTradingDay,
  getNextTradingDay,
} from '../src/calendar/market-calendar.js';

describe('isTradingDay', () => {
  it('Monday through Friday are trading days', () => {
    // 2025-01-06 is a Monday
    expect(isTradingDay(new Date('2025-01-06T12:00:00Z'), 'NYSE')).toBe(true);
    // Tuesday
    expect(isTradingDay(new Date('2025-01-07T12:00:00Z'), 'NYSE')).toBe(true);
    // Wednesday
    expect(isTradingDay(new Date('2025-01-08T12:00:00Z'), 'NYSE')).toBe(true);
    // Thursday
    expect(isTradingDay(new Date('2025-01-09T12:00:00Z'), 'NYSE')).toBe(true);
    // Friday
    expect(isTradingDay(new Date('2025-01-10T12:00:00Z'), 'NYSE')).toBe(true);
  });

  it('Saturday and Sunday are not trading days', () => {
    // 2025-01-11 is a Saturday
    expect(isTradingDay(new Date('2025-01-11T12:00:00Z'), 'NYSE')).toBe(false);
    // 2025-01-12 is a Sunday
    expect(isTradingDay(new Date('2025-01-12T12:00:00Z'), 'NYSE')).toBe(false);
  });

  it('uses exchange timezone for day-of-week determination', () => {
    // Late Friday UTC could be Saturday in some timezones, but NYSE is ET
    // 2025-01-10 (Friday) at 23:00 UTC = still Friday in ET (18:00 ET)
    expect(isTradingDay(new Date('2025-01-10T23:00:00Z'), 'NYSE')).toBe(true);
  });
});

describe('getSessionTimes', () => {
  it('returns 9:30-16:00 ET as UTC for NYSE in winter (EST = UTC-5)', () => {
    // 2025-01-10 is a Friday in January (EST, UTC-5)
    const { open, close } = getSessionTimes(new Date('2025-01-10T12:00:00Z'), 'NYSE');

    // 9:30 AM ET in EST = 14:30 UTC
    expect(open.toISOString()).toBe('2025-01-10T14:30:00.000Z');
    // 4:00 PM ET in EST = 21:00 UTC
    expect(close.toISOString()).toBe('2025-01-10T21:00:00.000Z');
  });

  it('returns 9:30-16:00 ET as UTC for NYSE in summer (EDT = UTC-4)', () => {
    // 2025-07-10 is a Thursday in July (EDT, UTC-4)
    const { open, close } = getSessionTimes(new Date('2025-07-10T12:00:00Z'), 'NYSE');

    // 9:30 AM ET in EDT = 13:30 UTC
    expect(open.toISOString()).toBe('2025-07-10T13:30:00.000Z');
    // 4:00 PM ET in EDT = 20:00 UTC
    expect(close.toISOString()).toBe('2025-07-10T20:00:00.000Z');
  });

  it('DST spring forward: session times shift from UTC-5 to UTC-4', () => {
    // 2025 DST spring forward in US: March 9, 2025
    // March 7 (Friday before DST) - still EST (UTC-5)
    const preDst = getSessionTimes(new Date('2025-03-07T12:00:00Z'), 'NYSE');
    expect(preDst.open.toISOString()).toBe('2025-03-07T14:30:00.000Z');  // UTC-5
    expect(preDst.close.toISOString()).toBe('2025-03-07T21:00:00.000Z');

    // March 10 (Monday after DST) - now EDT (UTC-4)
    const postDst = getSessionTimes(new Date('2025-03-10T12:00:00Z'), 'NYSE');
    expect(postDst.open.toISOString()).toBe('2025-03-10T13:30:00.000Z'); // UTC-4
    expect(postDst.close.toISOString()).toBe('2025-03-10T20:00:00.000Z');
  });

  it('DST fall back: session times shift from UTC-4 to UTC-5', () => {
    // 2025 DST fall back in US: November 2, 2025
    // October 31 (Friday before fall back) - still EDT (UTC-4)
    const preFallBack = getSessionTimes(new Date('2025-10-31T12:00:00Z'), 'NYSE');
    expect(preFallBack.open.toISOString()).toBe('2025-10-31T13:30:00.000Z');  // UTC-4
    expect(preFallBack.close.toISOString()).toBe('2025-10-31T20:00:00.000Z');

    // November 3 (Monday after fall back) - now EST (UTC-5)
    const postFallBack = getSessionTimes(new Date('2025-11-03T12:00:00Z'), 'NYSE');
    expect(postFallBack.open.toISOString()).toBe('2025-11-03T14:30:00.000Z'); // UTC-5
    expect(postFallBack.close.toISOString()).toBe('2025-11-03T21:00:00.000Z');
  });
});

describe('isMarketOpen', () => {
  it('returns true at 10:00 ET on a weekday (15:00 UTC in winter)', () => {
    // 2025-01-10 (Friday), 10:00 AM ET = 15:00 UTC (EST)
    expect(isMarketOpen(new Date('2025-01-10T15:00:00Z'), 'NYSE')).toBe(true);
  });

  it('returns false at 17:00 ET on a weekday (22:00 UTC in winter)', () => {
    // 2025-01-10 (Friday), 5:00 PM ET = 22:00 UTC (EST)
    expect(isMarketOpen(new Date('2025-01-10T22:00:00Z'), 'NYSE')).toBe(false);
  });

  it('returns false on Saturday', () => {
    // 2025-01-11 (Saturday) at noon UTC
    expect(isMarketOpen(new Date('2025-01-11T15:00:00Z'), 'NYSE')).toBe(false);
  });

  it('returns true at market open (9:30 ET)', () => {
    // 2025-01-10 (Friday), 9:30 AM ET = 14:30 UTC (EST)
    expect(isMarketOpen(new Date('2025-01-10T14:30:00Z'), 'NYSE')).toBe(true);
  });

  it('returns false at market close (16:00 ET) -- close is exclusive', () => {
    // 2025-01-10 (Friday), 4:00 PM ET = 21:00 UTC (EST)
    expect(isMarketOpen(new Date('2025-01-10T21:00:00Z'), 'NYSE')).toBe(false);
  });

  it('returns false before market open (9:29 ET)', () => {
    // 2025-01-10 (Friday), 9:29 AM ET = 14:29 UTC (EST)
    expect(isMarketOpen(new Date('2025-01-10T14:29:00Z'), 'NYSE')).toBe(false);
  });
});

describe('getPriorTradingDay', () => {
  it('Monday returns Friday', () => {
    // 2025-01-06 is Monday
    const result = getPriorTradingDay(new Date('2025-01-06T12:00:00Z'), 'NYSE');
    expect(result.toISOString()).toContain('2025-01-03'); // Friday
  });

  it('Tuesday returns Monday', () => {
    // 2025-01-07 is Tuesday
    const result = getPriorTradingDay(new Date('2025-01-07T12:00:00Z'), 'NYSE');
    expect(result.toISOString()).toContain('2025-01-06'); // Monday
  });

  it('Sunday returns Friday', () => {
    // 2025-01-12 is Sunday
    const result = getPriorTradingDay(new Date('2025-01-12T12:00:00Z'), 'NYSE');
    expect(result.toISOString()).toContain('2025-01-10'); // Friday
  });

  it('Saturday returns Friday', () => {
    // 2025-01-11 is Saturday
    const result = getPriorTradingDay(new Date('2025-01-11T12:00:00Z'), 'NYSE');
    expect(result.toISOString()).toContain('2025-01-10'); // Friday
  });
});

describe('getNextTradingDay', () => {
  it('Friday returns Monday', () => {
    // 2025-01-10 is Friday
    const result = getNextTradingDay(new Date('2025-01-10T12:00:00Z'), 'NYSE');
    expect(result.toISOString()).toContain('2025-01-13'); // Monday
  });

  it('Thursday returns Friday', () => {
    // 2025-01-09 is Thursday
    const result = getNextTradingDay(new Date('2025-01-09T12:00:00Z'), 'NYSE');
    expect(result.toISOString()).toContain('2025-01-10'); // Friday
  });

  it('Saturday returns Monday', () => {
    // 2025-01-11 is Saturday
    const result = getNextTradingDay(new Date('2025-01-11T12:00:00Z'), 'NYSE');
    expect(result.toISOString()).toContain('2025-01-13'); // Monday
  });

  it('Sunday returns Monday', () => {
    // 2025-01-12 is Sunday
    const result = getNextTradingDay(new Date('2025-01-12T12:00:00Z'), 'NYSE');
    expect(result.toISOString()).toContain('2025-01-13'); // Monday
  });
});

describe('PF-4: DST boundary tests', () => {
  describe('2026 Spring Forward (March 8)', () => {
    it('getPriorTradingDay(Monday March 9) → Friday March 6', () => {
      // 2026-03-09 is a Monday. DST spring forward happens Sunday March 8, 2026.
      const result = getPriorTradingDay(new Date('2026-03-09T12:00:00Z'), 'NYSE');
      expect(result.toISOString()).toContain('2026-03-06'); // Friday
    });

    it('getNextTradingDay(Friday March 6) → Monday March 9', () => {
      const result = getNextTradingDay(new Date('2026-03-06T12:00:00Z'), 'NYSE');
      expect(result.toISOString()).toContain('2026-03-09'); // Monday
    });

    it('getSessionTimes(Monday March 9) → 13:30-20:00 UTC (EDT)', () => {
      // After spring forward: EDT = UTC-4
      // 9:30 AM ET = 13:30 UTC, 4:00 PM ET = 20:00 UTC
      const { open, close } = getSessionTimes(new Date('2026-03-09T15:00:00Z'), 'NYSE');
      expect(open.toISOString()).toBe('2026-03-09T13:30:00.000Z');
      expect(close.toISOString()).toBe('2026-03-09T20:00:00.000Z');
    });
  });

  describe('2025 Fall Back (November 2)', () => {
    it('getSessionTimes(Monday November 3) → 14:30-21:00 UTC (EST)', () => {
      // After fall back: EST = UTC-5
      // 9:30 AM ET = 14:30 UTC, 4:00 PM ET = 21:00 UTC
      const { open, close } = getSessionTimes(new Date('2025-11-03T16:00:00Z'), 'NYSE');
      expect(open.toISOString()).toBe('2025-11-03T14:30:00.000Z');
      expect(close.toISOString()).toBe('2025-11-03T21:00:00.000Z');
    });
  });
});
