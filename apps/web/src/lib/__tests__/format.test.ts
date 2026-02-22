import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatCurrency,
  formatPercent,
  formatQuantity,
  formatCompact,
  formatDate,
  formatRelativeTime,
} from '../format';

// ── formatCurrency ──────────────────────────────────────────────────

describe('formatCurrency', () => {
  it('formats a positive value', () => {
    expect(formatCurrency('12345.67')).toBe('$12,345.67');
  });

  it('formats a negative value', () => {
    expect(formatCurrency('-567.89')).toBe('-$567.89');
  });

  it('formats zero without negative sign', () => {
    expect(formatCurrency('0')).toBe('$0.00');
    expect(formatCurrency('-0')).toBe('$0.00');
    expect(formatCurrency('0.00')).toBe('$0.00');
  });

  it('shows + sign for positive when showSign is true', () => {
    expect(formatCurrency('567.89', { showSign: true })).toBe('+$567.89');
  });

  it('shows - sign for negative when showSign is true', () => {
    expect(formatCurrency('-567.89', { showSign: true })).toBe('-$567.89');
  });

  it('formats a large value with commas', () => {
    expect(formatCurrency('1234567890.12')).toBe('$1,234,567,890.12');
  });

  it('formats a small fractional value', () => {
    expect(formatCurrency('0.01')).toBe('$0.01');
  });

  it('returns em dash for empty string', () => {
    expect(formatCurrency('')).toBe('\u2014');
  });

  it('returns em dash for NaN', () => {
    expect(formatCurrency('NaN')).toBe('\u2014');
  });

  it('returns em dash for non-numeric string', () => {
    expect(formatCurrency('abc')).toBe('\u2014');
  });

  it('rounds to 2 decimal places', () => {
    expect(formatCurrency('1.999')).toBe('$2.00');
    expect(formatCurrency('1.555')).toBe('$1.56');
  });
});

// ── formatPercent ───────────────────────────────────────────────────

describe('formatPercent', () => {
  it('formats a positive percentage', () => {
    expect(formatPercent('5.678')).toBe('5.68%');
  });

  it('formats a negative percentage', () => {
    expect(formatPercent('-3.45')).toBe('-3.45%');
  });

  it('formats zero without negative sign', () => {
    expect(formatPercent('0')).toBe('0.00%');
    expect(formatPercent('-0')).toBe('0.00%');
  });

  it('shows + sign for positive when showSign is true', () => {
    expect(formatPercent('3.45', { showSign: true })).toBe('+3.45%');
  });

  it('shows - sign for negative when showSign is true', () => {
    expect(formatPercent('-3.45', { showSign: true })).toBe('-3.45%');
  });

  it('respects custom decimal places', () => {
    expect(formatPercent('5.6789', { decimals: 1 })).toBe('5.7%');
    expect(formatPercent('5.6789', { decimals: 3 })).toBe('5.679%');
  });

  it('returns em dash for invalid input', () => {
    expect(formatPercent('')).toBe('\u2014');
    expect(formatPercent('NaN')).toBe('\u2014');
    expect(formatPercent('abc')).toBe('\u2014');
  });

  it('formats a large percentage', () => {
    expect(formatPercent('1234.5')).toBe('1234.50%');
  });
});

// ── formatQuantity ──────────────────────────────────────────────────

describe('formatQuantity', () => {
  it('formats an integer with commas', () => {
    expect(formatQuantity('1234')).toBe('1,234');
  });

  it('preserves fractional precision', () => {
    expect(formatQuantity('0.5000')).toBe('0.5000');
  });

  it('formats a large integer', () => {
    expect(formatQuantity('1000000')).toBe('1,000,000');
  });

  it('formats a fractional with integer part commas', () => {
    expect(formatQuantity('12345.678')).toBe('12,345.678');
  });

  it('returns em dash for invalid input', () => {
    expect(formatQuantity('')).toBe('\u2014');
    expect(formatQuantity('abc')).toBe('\u2014');
  });

  it('formats a small integer without commas', () => {
    expect(formatQuantity('42')).toBe('42');
  });
});

// ── formatCompact ───────────────────────────────────────────────────

describe('formatCompact', () => {
  it('formats millions', () => {
    expect(formatCompact('1234567.89')).toBe('$1.2M');
  });

  it('formats thousands', () => {
    expect(formatCompact('12345.67')).toBe('$12.3K');
  });

  it('formats sub-thousand values', () => {
    expect(formatCompact('999')).toBe('$999');
  });

  it('formats negative millions', () => {
    expect(formatCompact('-1234567')).toBe('-$1.2M');
  });

  it('formats billions', () => {
    expect(formatCompact('5678000000')).toBe('$5.7B');
  });

  it('formats zero', () => {
    expect(formatCompact('0')).toBe('$0');
  });

  it('returns em dash for invalid input', () => {
    expect(formatCompact('')).toBe('\u2014');
    expect(formatCompact('NaN')).toBe('\u2014');
  });

  it('formats exact thousand boundary', () => {
    expect(formatCompact('1000')).toBe('$1.0K');
  });
});

// ── formatDate ──────────────────────────────────────────────────────

describe('formatDate', () => {
  it('formats an ISO datetime string', () => {
    expect(formatDate('2026-02-18T16:00:00Z')).toBe('Feb 18, 2026');
  });

  it('formats a date-only string', () => {
    expect(formatDate('2026-02-18')).toBe('Feb 18, 2026');
  });

  it('returns em dash for empty string', () => {
    expect(formatDate('')).toBe('\u2014');
  });

  it('returns em dash for invalid date', () => {
    expect(formatDate('not-a-date')).toBe('\u2014');
  });

  it('formats a date at year boundary', () => {
    expect(formatDate('2025-12-31T23:59:59Z')).toBe('Dec 31, 2025');
  });
});

// ── formatRelativeTime ──────────────────────────────────────────────

describe('formatRelativeTime', () => {
  beforeEach(() => {
    // Fix the current time to 2026-02-22T12:00:00Z
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-22T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows "just now" for very recent times', () => {
    expect(formatRelativeTime('2026-02-22T11:59:30Z')).toBe('just now');
  });

  it('shows minutes ago', () => {
    expect(formatRelativeTime('2026-02-22T11:55:00Z')).toBe('5 min ago');
  });

  it('shows 1 min ago', () => {
    expect(formatRelativeTime('2026-02-22T11:59:00Z')).toBe('1 min ago');
  });

  it('shows hours ago', () => {
    expect(formatRelativeTime('2026-02-22T10:00:00Z')).toBe('2 hr ago');
  });

  it('shows 1 hr ago', () => {
    expect(formatRelativeTime('2026-02-22T11:00:00Z')).toBe('1 hr ago');
  });

  it('shows days ago', () => {
    expect(formatRelativeTime('2026-02-19T12:00:00Z')).toBe('3 days ago');
  });

  it('shows 1 day ago', () => {
    expect(formatRelativeTime('2026-02-21T12:00:00Z')).toBe('1 day ago');
  });

  it('returns em dash for empty string', () => {
    expect(formatRelativeTime('')).toBe('\u2014');
  });

  it('returns em dash for invalid date', () => {
    expect(formatRelativeTime('not-a-date')).toBe('\u2014');
  });

  it('returns em dash for future dates', () => {
    expect(formatRelativeTime('2026-02-23T12:00:00Z')).toBe('\u2014');
  });

  it('shows weeks ago', () => {
    expect(formatRelativeTime('2026-02-08T12:00:00Z')).toBe('2 weeks ago');
  });
});
