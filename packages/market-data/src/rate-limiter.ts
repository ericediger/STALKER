export interface RateLimiterConfig {
  requestsPerMinute: number;
  requestsPerHour?: number;
  requestsPerDay: number;
}

/**
 * Token bucket rate limiter with per-minute (sliding window), per-hour (sliding window),
 * and per-day buckets.
 * Day bucket resets at midnight UTC.
 * Minute and hour buckets use sliding windows of call timestamps.
 */
export class RateLimiter {
  private readonly maxPerMinute: number;
  private readonly maxPerHour: number | null;
  private readonly maxPerDay: number;

  /** Timestamps (ms) of calls within the current sliding minute window */
  private minuteCallTimestamps: number[] = [];

  /** Timestamps (ms) of calls within the current sliding hour window */
  private hourCallTimestamps: number[] = [];

  /** Count of calls made in the current UTC day */
  private dayCallCount: number = 0;

  /** The UTC day string (YYYY-MM-DD) for the current day bucket */
  private currentDay: string;

  constructor(config: RateLimiterConfig) {
    this.maxPerMinute = config.requestsPerMinute;
    this.maxPerHour = config.requestsPerHour ?? null;
    this.maxPerDay = config.requestsPerDay;
    this.currentDay = this.getUtcDayString(Date.now());
  }

  /**
   * Returns true if the per-minute, per-hour (if configured), and per-day buckets all have capacity.
   */
  canCall(): boolean {
    this.pruneMinuteWindow();
    this.pruneHourWindow();
    this.resetDayIfNeeded();

    if (this.minuteCallTimestamps.length >= this.maxPerMinute) {
      return false;
    }
    if (this.maxPerHour !== null && this.hourCallTimestamps.length >= this.maxPerHour) {
      return false;
    }
    if (this.dayCallCount >= this.maxPerDay) {
      return false;
    }
    return true;
  }

  /**
   * Waits until a rate limit slot is available.
   * Uses setTimeout-based Promise, NOT busy-wait.
   * @param timeoutMs Maximum time to wait (default 60000ms). Throws if exceeded.
   */
  async waitForSlot(timeoutMs: number = 60000): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (!this.canCall()) {
      if (Date.now() >= deadline) {
        throw new Error(`Rate limiter timeout: no slot available within ${timeoutMs}ms`);
      }

      // Calculate how long until the oldest call in the minute window expires
      const waitMs = this.getWaitTimeMs();
      const remainingMs = deadline - Date.now();
      const sleepMs = Math.min(waitMs, remainingMs);

      if (sleepMs <= 0) {
        throw new Error(`Rate limiter timeout: no slot available within ${timeoutMs}ms`);
      }

      await this.sleep(sleepMs);
    }
  }

  /**
   * Records a call, consuming a token from all active buckets.
   */
  recordCall(): void {
    this.resetDayIfNeeded();
    const now = Date.now();
    this.minuteCallTimestamps.push(now);
    if (this.maxPerHour !== null) {
      this.hourCallTimestamps.push(now);
    }
    this.dayCallCount++;
  }

  /**
   * Returns remaining calls allowed in the current day bucket.
   */
  getRemainingDaily(): number {
    this.resetDayIfNeeded();
    return Math.max(0, this.maxPerDay - this.dayCallCount);
  }

  /**
   * Returns remaining calls allowed in the current minute window.
   */
  getRemainingMinute(): number {
    this.pruneMinuteWindow();
    return Math.max(0, this.maxPerMinute - this.minuteCallTimestamps.length);
  }

  /**
   * Returns remaining calls allowed in the current hour window, or null if per-hour is not configured.
   */
  getRemainingHour(): number | null {
    if (this.maxPerHour === null) {
      return null;
    }
    this.pruneHourWindow();
    return Math.max(0, this.maxPerHour - this.hourCallTimestamps.length);
  }

  // --- Private helpers ---

  private pruneMinuteWindow(): void {
    const oneMinuteAgo = Date.now() - 60_000;
    this.minuteCallTimestamps = this.minuteCallTimestamps.filter(
      (ts) => ts > oneMinuteAgo
    );
  }

  private pruneHourWindow(): void {
    const oneHourAgo = Date.now() - 3_600_000;
    this.hourCallTimestamps = this.hourCallTimestamps.filter(
      (ts) => ts > oneHourAgo
    );
  }

  private resetDayIfNeeded(): void {
    const today = this.getUtcDayString(Date.now());
    if (today !== this.currentDay) {
      this.currentDay = today;
      this.dayCallCount = 0;
    }
  }

  private getUtcDayString(timestampMs: number): string {
    const d = new Date(timestampMs);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getWaitTimeMs(): number {
    // If day bucket is exhausted, we'd need to wait until midnight UTC
    this.resetDayIfNeeded();
    if (this.dayCallCount >= this.maxPerDay) {
      const now = new Date();
      const tomorrow = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
      );
      return tomorrow.getTime() - now.getTime();
    }

    // If hour bucket is exhausted, wait for the oldest call in the hour window to expire
    if (this.maxPerHour !== null) {
      this.pruneHourWindow();
      if (this.hourCallTimestamps.length >= this.maxPerHour) {
        const oldest = this.hourCallTimestamps[0];
        if (oldest !== undefined) {
          return oldest + 3_600_000 - Date.now() + 1;
        }
      }
    }

    // If minute bucket is exhausted, wait for the oldest call to expire
    this.pruneMinuteWindow();
    if (this.minuteCallTimestamps.length >= this.maxPerMinute) {
      const oldest = this.minuteCallTimestamps[0];
      if (oldest !== undefined) {
        return oldest + 60_000 - Date.now() + 1; // +1ms to ensure it's past
      }
    }

    // Should be available now
    return 0;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
