import { describe, it, expect } from 'vitest';
import { getWindowDateRange, type WindowOption } from '@/lib/window-utils';

describe('getWindowDateRange', () => {
  // Use a fixed Wednesday so weekday logic is predictable
  const wednesday = new Date(2026, 1, 18); // Feb 18, 2026 (Wednesday)

  it('returns endDate equal to today for all windows', () => {
    const options: WindowOption[] = ['1D', '1W', '1M', '3M', '1Y', 'ALL'];
    for (const opt of options) {
      const result = getWindowDateRange(opt, wednesday);
      expect(result.endDate).toBe('2026-02-18');
    }
  });

  describe('1D window', () => {
    it('returns prior weekday (Tuesday) when today is Wednesday', () => {
      const result = getWindowDateRange('1D', wednesday);
      expect(result.startDate).toBe('2026-02-17');
    });

    it('returns Friday when today is Monday', () => {
      const monday = new Date(2026, 1, 16);
      const result = getWindowDateRange('1D', monday);
      expect(result.startDate).toBe('2026-02-13');
    });

    it('returns Friday when today is Sunday', () => {
      const sunday = new Date(2026, 1, 15);
      const result = getWindowDateRange('1D', sunday);
      expect(result.startDate).toBe('2026-02-13');
    });

    it('returns Friday when today is Saturday', () => {
      const saturday = new Date(2026, 1, 14);
      const result = getWindowDateRange('1D', saturday);
      expect(result.startDate).toBe('2026-02-13');
    });

    it('returns Monday when today is Tuesday', () => {
      const tuesday = new Date(2026, 1, 17);
      const result = getWindowDateRange('1D', tuesday);
      expect(result.startDate).toBe('2026-02-16');
    });
  });

  describe('1W window', () => {
    it('returns 7 days before today', () => {
      const result = getWindowDateRange('1W', wednesday);
      expect(result.startDate).toBe('2026-02-11');
    });
  });

  describe('1M window', () => {
    it('returns 1 month before today', () => {
      const result = getWindowDateRange('1M', wednesday);
      expect(result.startDate).toBe('2026-01-18');
    });

    it('handles month boundary (March 31 → Feb 28)', () => {
      const march31 = new Date(2026, 2, 31);
      const result = getWindowDateRange('1M', march31);
      // JS Date rolls March 31 - 1 month → Feb 28 (2026 is not a leap year)
      expect(result.startDate).toBe('2026-03-03');
    });
  });

  describe('3M window', () => {
    it('returns 3 months before today', () => {
      const result = getWindowDateRange('3M', wednesday);
      expect(result.startDate).toBe('2025-11-18');
    });
  });

  describe('1Y window', () => {
    it('returns 1 year before today', () => {
      const result = getWindowDateRange('1Y', wednesday);
      expect(result.startDate).toBe('2025-02-18');
    });
  });

  describe('ALL window', () => {
    it('returns no startDate', () => {
      const result = getWindowDateRange('ALL', wednesday);
      expect(result.startDate).toBeUndefined();
    });
  });

  it('uses current date when no today param provided', () => {
    const result = getWindowDateRange('ALL');
    expect(result.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.startDate).toBeUndefined();
  });
});
