import { describe, it, expect } from 'vitest';
import { getStalenessState } from '../staleness-banner-utils';

function makeStaleInstruments(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    symbol: `SYM${i}`,
    lastUpdated: '2026-02-25T10:00:00Z',
    minutesStale: 120,
  }));
}

describe('getStalenessState', () => {
  it('returns hidden when no instruments are stale', () => {
    const result = getStalenessState(0, 83);
    expect(result.variant).toBe('hidden');
  });

  it('returns hidden when totalInstruments is 0', () => {
    const result = getStalenessState(0, 0);
    expect(result.variant).toBe('hidden');
  });

  it('returns amber-standard for < 30% stale (5 of 83)', () => {
    const result = getStalenessState(5, 83);
    expect(result.variant).toBe('amber-standard');
    expect(result.text).toContain('5 instruments have stale prices');
  });

  it('returns amber-standard with singular for 1 stale instrument', () => {
    const result = getStalenessState(1, 83);
    expect(result.variant).toBe('amber-standard');
    expect(result.text).toContain('1 instrument has stale prices');
  });

  it('returns amber-detailed for 31-79% stale (40 of 83)', () => {
    const result = getStalenessState(40, 83);
    expect(result.variant).toBe('amber-detailed');
    expect(result.text).toContain('40 of 83');
    expect(result.text).toContain('43 instruments current');
  });

  it('returns blue-updating for >= 80% stale (80 of 83)', () => {
    const result = getStalenessState(80, 83);
    expect(result.variant).toBe('blue-updating');
    expect(result.text).toContain('3 of 83');
    expect(result.text).toContain('refreshed so far');
  });

  it('returns blue-updating when all instruments are stale', () => {
    const result = getStalenessState(83, 83);
    expect(result.variant).toBe('blue-updating');
    expect(result.text).toContain('0 of 83');
  });

  it('returns amber-detailed at exactly 31% boundary', () => {
    // 31 of 100 = 31%
    const result = getStalenessState(31, 100);
    expect(result.variant).toBe('amber-detailed');
  });

  it('returns amber-standard at exactly 30% boundary', () => {
    // 30 of 100 = 30%
    const result = getStalenessState(30, 100);
    expect(result.variant).toBe('amber-standard');
  });

  it('returns blue-updating at exactly 80% boundary', () => {
    // 80 of 100 = 80%
    const result = getStalenessState(80, 100);
    expect(result.variant).toBe('blue-updating');
  });
});
