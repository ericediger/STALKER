import { describe, it, expect } from 'vitest';
import { checkBudget } from '../src/budget.js';
import type { ProviderLimits } from '@stalker/shared';

const FMP_LIMITS: ProviderLimits = {
  requestsPerMinute: 5,
  requestsPerDay: 250,
  supportsIntraday: false,
  quoteDelayMinutes: 15,
};

describe('checkBudget', () => {
  it('should be within budget for 5 instruments at 30min interval', () => {
    const result = checkBudget(5, 1800, FMP_LIMITS);

    // 5 instruments * ceil(23400 / 1800) = 5 * 13 = 65 calls
    expect(result.ok).toBe(true);
    expect(result.estimatedCalls).toBe(65);
    expect(result.limit).toBe(250);
    expect(result.safeInterval).toBeUndefined();
    expect(result.message).toContain('Budget OK');
    expect(result.message).toContain('5 instruments');
    expect(result.message).toContain('65/250');
  });

  it('should exceed budget for 50 instruments at 30min interval', () => {
    const result = checkBudget(50, 1800, FMP_LIMITS);

    // 50 instruments * ceil(23400 / 1800) = 50 * 13 = 650 calls
    expect(result.ok).toBe(false);
    expect(result.estimatedCalls).toBe(650);
    expect(result.limit).toBe(250);
    expect(result.safeInterval).toBeDefined();
    expect(result.message).toContain('OVER BUDGET');

    // Safe interval should be at least: ceil(23400 * 50 / 250) = ceil(4680) = 4680 seconds
    expect(result.safeInterval!).toBeGreaterThanOrEqual(4680);
  });

  it('should always be within budget for 1 instrument', () => {
    const result = checkBudget(1, 1800, FMP_LIMITS);

    // 1 * ceil(23400 / 1800) = 1 * 13 = 13 calls
    expect(result.ok).toBe(true);
    expect(result.estimatedCalls).toBe(13);
    expect(result.limit).toBe(250);
    expect(result.safeInterval).toBeUndefined();
  });

  it('should handle 0 instruments', () => {
    const result = checkBudget(0, 1800, FMP_LIMITS);

    expect(result.ok).toBe(true);
    expect(result.estimatedCalls).toBe(0);
    expect(result.limit).toBe(250);
    expect(result.safeInterval).toBeUndefined();
    expect(result.message).toContain('No instruments');
  });

  it('should handle a very short poll interval that exceeds budget', () => {
    // 10 instruments at 60-second interval
    const result = checkBudget(10, 60, FMP_LIMITS);

    // 10 * ceil(23400 / 60) = 10 * 390 = 3900 calls
    expect(result.ok).toBe(false);
    expect(result.estimatedCalls).toBe(3900);
    expect(result.safeInterval).toBeDefined();
    // Safe interval: ceil(23400 * 10 / 250) = ceil(936) = 936 seconds
    expect(result.safeInterval!).toBe(936);
  });

  it('should compute correct safe interval for over-budget scenario', () => {
    // 20 instruments, 30min interval, limit 250
    const result = checkBudget(20, 1800, FMP_LIMITS);

    // 20 * 13 = 260 calls, just over 250
    expect(result.ok).toBe(false);
    expect(result.estimatedCalls).toBe(260);

    // Safe interval: ceil(23400 * 20 / 250) = ceil(1872) = 1872 seconds (~31 minutes)
    expect(result.safeInterval).toBe(1872);
  });

  it('should work with generous provider limits', () => {
    const generousLimits: ProviderLimits = {
      requestsPerMinute: 100,
      requestsPerDay: 10000,
      supportsIntraday: true,
      quoteDelayMinutes: 0,
    };

    const result = checkBudget(50, 60, generousLimits);

    // 50 * 390 = 19500 calls
    expect(result.ok).toBe(false);
    expect(result.estimatedCalls).toBe(19500);
    expect(result.limit).toBe(10000);
  });
});
