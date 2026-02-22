import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from '../src/rate-limiter.js';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('canCall', () => {
    it('returns true when both buckets have capacity', () => {
      const limiter = new RateLimiter({ requestsPerMinute: 5, requestsPerDay: 100 });
      expect(limiter.canCall()).toBe(true);
    });

    it('returns false when minute bucket is exhausted', () => {
      const limiter = new RateLimiter({ requestsPerMinute: 2, requestsPerDay: 100 });

      limiter.recordCall();
      limiter.recordCall();

      expect(limiter.canCall()).toBe(false);
    });

    it('returns false when day bucket is exhausted', () => {
      const limiter = new RateLimiter({ requestsPerMinute: 100, requestsPerDay: 3 });

      limiter.recordCall();
      limiter.recordCall();
      limiter.recordCall();

      expect(limiter.canCall()).toBe(false);
    });

    it('returns true after minute window slides past oldest call', () => {
      const limiter = new RateLimiter({ requestsPerMinute: 2, requestsPerDay: 100 });

      limiter.recordCall();
      limiter.recordCall();
      expect(limiter.canCall()).toBe(false);

      // Advance 61 seconds — oldest call should be outside the window
      vi.advanceTimersByTime(61_000);
      expect(limiter.canCall()).toBe(true);
    });
  });

  describe('recordCall', () => {
    it('decrements both minute and day remaining', () => {
      const limiter = new RateLimiter({ requestsPerMinute: 5, requestsPerDay: 100 });

      expect(limiter.getRemainingMinute()).toBe(5);
      expect(limiter.getRemainingDaily()).toBe(100);

      limiter.recordCall();

      expect(limiter.getRemainingMinute()).toBe(4);
      expect(limiter.getRemainingDaily()).toBe(99);
    });
  });

  describe('getRemainingMinute', () => {
    it('recovers after sliding window expires', () => {
      const limiter = new RateLimiter({ requestsPerMinute: 3, requestsPerDay: 100 });

      limiter.recordCall();
      limiter.recordCall();
      expect(limiter.getRemainingMinute()).toBe(1);

      // Advance past the minute window
      vi.advanceTimersByTime(61_000);

      expect(limiter.getRemainingMinute()).toBe(3);
    });
  });

  describe('getRemainingDaily', () => {
    it('resets at midnight UTC', () => {
      // Set time to 23:59:00 UTC
      vi.setSystemTime(new Date('2025-06-15T23:59:00Z'));
      const limiter = new RateLimiter({ requestsPerMinute: 100, requestsPerDay: 5 });

      limiter.recordCall();
      limiter.recordCall();
      expect(limiter.getRemainingDaily()).toBe(3);

      // Advance past midnight UTC
      vi.advanceTimersByTime(2 * 60 * 1000); // 2 minutes → now 00:01 next day

      expect(limiter.getRemainingDaily()).toBe(5);
    });
  });

  describe('waitForSlot', () => {
    it('resolves immediately when slot is available', async () => {
      const limiter = new RateLimiter({ requestsPerMinute: 5, requestsPerDay: 100 });

      // Should resolve without delay
      await limiter.waitForSlot(1000);
      // No error means success
    });

    it('waits for slot to become available in minute bucket', async () => {
      const limiter = new RateLimiter({ requestsPerMinute: 1, requestsPerDay: 100 });

      limiter.recordCall();
      expect(limiter.canCall()).toBe(false);

      const waitPromise = limiter.waitForSlot(70_000);

      // Advance past the minute window
      vi.advanceTimersByTime(61_000);

      await waitPromise;
      // Resolved means slot became available
    });

    it('throws on timeout when no slot becomes available', async () => {
      const limiter = new RateLimiter({ requestsPerMinute: 1, requestsPerDay: 0 });

      const waitPromise = limiter.waitForSlot(100);

      // Advance past the timeout
      vi.advanceTimersByTime(200);

      await expect(waitPromise).rejects.toThrow('Rate limiter timeout');
    });
  });
});
