import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from '../src/rate-limiter.js';

/**
 * Tests for the per-hour sliding window bucket in the RateLimiter.
 *
 * The per-hour bucket was added in Session 11 to support Tiingo's
 * 50 requests/hour limit. These tests verify:
 * - Hour budget enforcement (50th call allowed, 51st blocked)
 * - Interaction between per-minute, per-hour, and per-day buckets
 * - Sliding window reset after 1 hour
 * - getRemainingHour() accuracy
 */

describe('RateLimiter — Per-Hour Bucket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows exactly N calls when requestsPerHour is N', () => {
    const limiter = new RateLimiter({
      requestsPerMinute: 100, // high enough to not interfere
      requestsPerHour: 50,
      requestsPerDay: 10000,
    });

    for (let i = 0; i < 50; i++) {
      expect(limiter.canCall()).toBe(true);
      limiter.recordCall();
      // Advance 1 second between calls to avoid hitting per-minute limit
      vi.advanceTimersByTime(1000);
    }

    // 50 calls made — should be blocked now
    expect(limiter.canCall()).toBe(false);
  });

  it('blocks the 51st call when per-hour=50', () => {
    const limiter = new RateLimiter({
      requestsPerMinute: 100,
      requestsPerHour: 50,
      requestsPerDay: 10000,
    });

    // Make 50 calls, spaced 1 second apart
    for (let i = 0; i < 50; i++) {
      limiter.recordCall();
      vi.advanceTimersByTime(1000);
    }

    expect(limiter.canCall()).toBe(false);
    expect(limiter.getRemainingHour()).toBe(0);
  });

  it('blocks when per-hour exhausted even though per-day has budget', () => {
    const limiter = new RateLimiter({
      requestsPerMinute: 100,
      requestsPerHour: 5,
      requestsPerDay: 1000,
    });

    for (let i = 0; i < 5; i++) {
      limiter.recordCall();
      vi.advanceTimersByTime(1000);
    }

    // Per-hour is exhausted (5/5), but per-day still has room (5/1000)
    expect(limiter.canCall()).toBe(false);
    expect(limiter.getRemainingHour()).toBe(0);
    expect(limiter.getRemainingDaily()).toBe(995);
  });

  it('resets per-hour budget after 1 hour passes (sliding window)', () => {
    const limiter = new RateLimiter({
      requestsPerMinute: 100,
      requestsPerHour: 10,
      requestsPerDay: 10000,
    });

    // Make 10 calls at time T
    for (let i = 0; i < 10; i++) {
      limiter.recordCall();
    }

    expect(limiter.canCall()).toBe(false);
    expect(limiter.getRemainingHour()).toBe(0);

    // Advance 61 minutes — all 10 calls should slide out of the 1-hour window
    vi.advanceTimersByTime(61 * 60 * 1000);

    expect(limiter.canCall()).toBe(true);
    expect(limiter.getRemainingHour()).toBe(10);
  });

  it('per-minute + per-hour interaction: both must have budget', () => {
    const limiter = new RateLimiter({
      requestsPerMinute: 3,
      requestsPerHour: 50,
      requestsPerDay: 10000,
    });

    // Make 3 calls — per-minute exhausted, per-hour still has room
    limiter.recordCall();
    limiter.recordCall();
    limiter.recordCall();

    expect(limiter.canCall()).toBe(false);
    expect(limiter.getRemainingMinute()).toBe(0);
    expect(limiter.getRemainingHour()).toBe(47);

    // Advance past the minute window (61s), per-minute resets
    vi.advanceTimersByTime(61_000);

    expect(limiter.canCall()).toBe(true);
    expect(limiter.getRemainingMinute()).toBe(3);
    expect(limiter.getRemainingHour()).toBe(47);
  });

  it('getRemainingHour() returns correct value after calls', () => {
    const limiter = new RateLimiter({
      requestsPerMinute: 100,
      requestsPerHour: 50,
      requestsPerDay: 10000,
    });

    expect(limiter.getRemainingHour()).toBe(50);

    limiter.recordCall();
    expect(limiter.getRemainingHour()).toBe(49);

    limiter.recordCall();
    limiter.recordCall();
    expect(limiter.getRemainingHour()).toBe(47);
  });

  it('getRemainingHour() returns null when per-hour is not configured', () => {
    const limiter = new RateLimiter({
      requestsPerMinute: 5,
      requestsPerDay: 100,
      // No requestsPerHour
    });

    expect(limiter.getRemainingHour()).toBeNull();
  });

  it('sliding window partially expires: calls made at different times', () => {
    const limiter = new RateLimiter({
      requestsPerMinute: 100,
      requestsPerHour: 10,
      requestsPerDay: 10000,
    });

    // Make 5 calls at T=0
    for (let i = 0; i < 5; i++) {
      limiter.recordCall();
    }

    // Advance 30 minutes
    vi.advanceTimersByTime(30 * 60 * 1000);

    // Make 5 more calls at T=30min
    for (let i = 0; i < 5; i++) {
      limiter.recordCall();
    }

    // Per-hour is now full (10/10)
    expect(limiter.canCall()).toBe(false);
    expect(limiter.getRemainingHour()).toBe(0);

    // Advance 31 more minutes (total: 61min from first batch)
    // First 5 calls (from T=0) should slide out, second 5 (from T=30min) remain
    vi.advanceTimersByTime(31 * 60 * 1000);

    expect(limiter.canCall()).toBe(true);
    expect(limiter.getRemainingHour()).toBe(5);
  });

  it('waitForSlot resolves after hour window slides past oldest call', async () => {
    const limiter = new RateLimiter({
      requestsPerMinute: 100,
      requestsPerHour: 2,
      requestsPerDay: 10000,
    });

    limiter.recordCall();
    limiter.recordCall();
    expect(limiter.canCall()).toBe(false);

    const waitPromise = limiter.waitForSlot(3_700_000); // 61min+ timeout

    // Advance past the hour window
    vi.advanceTimersByTime(3_601_000);

    await waitPromise;
    // Resolved successfully means slot became available
    expect(limiter.canCall()).toBe(true);
  });

  it('per-hour bucket does not affect per-day counter', () => {
    const limiter = new RateLimiter({
      requestsPerMinute: 100,
      requestsPerHour: 5,
      requestsPerDay: 100,
    });

    // Make 5 calls
    for (let i = 0; i < 5; i++) {
      limiter.recordCall();
    }

    // Per-hour exhausted
    expect(limiter.getRemainingHour()).toBe(0);
    expect(limiter.getRemainingDaily()).toBe(95);

    // Advance 61 min — per-hour resets via sliding window
    vi.advanceTimersByTime(61 * 60 * 1000);

    // Per-hour recovered, per-day still counts all 5 calls
    expect(limiter.getRemainingHour()).toBe(5);
    expect(limiter.getRemainingDaily()).toBe(95);
  });
});
