import type { ProviderLimits } from '@stalker/shared';

/** Market hours duration in seconds: 9:30 to 16:00 ET = 6.5 hours = 23400 seconds */
const MARKET_HOURS_SECONDS = 23400;

export interface BudgetResult {
  ok: boolean;
  estimatedCalls: number;
  limit: number;
  safeInterval: number | undefined;
  message: string;
}

/**
 * Checks whether the planned polling budget fits within the provider's daily limit.
 *
 * @param instrumentCount - Number of tracked instruments
 * @param pollIntervalSeconds - Polling interval in seconds
 * @param providerLimits - Provider rate limits (requestsPerDay used)
 * @returns BudgetResult with ok/not-ok status and diagnostics
 */
export function checkBudget(
  instrumentCount: number,
  pollIntervalSeconds: number,
  providerLimits: ProviderLimits,
): BudgetResult {
  if (instrumentCount === 0) {
    return {
      ok: true,
      estimatedCalls: 0,
      limit: providerLimits.requestsPerDay,
      safeInterval: undefined,
      message: 'No instruments tracked. No API calls needed.',
    };
  }

  const cyclesDuringMarketHours = Math.ceil(MARKET_HOURS_SECONDS / pollIntervalSeconds);
  const estimatedCalls = instrumentCount * cyclesDuringMarketHours;
  const limit = providerLimits.requestsPerDay;
  const pollIntervalMinutes = Math.round(pollIntervalSeconds / 60);

  if (estimatedCalls <= limit) {
    const message =
      `Polling plan: ${instrumentCount} instruments every ${pollIntervalMinutes}min during market hours (~6.5hrs)\n` +
      `Estimated daily calls: ${estimatedCalls}/${limit}. Budget OK.`;
    return {
      ok: true,
      estimatedCalls,
      limit,
      safeInterval: undefined,
      message,
    };
  }

  // Over budget — compute a safe interval
  const safeInterval = Math.ceil((MARKET_HOURS_SECONDS * instrumentCount) / limit);
  const safeIntervalMinutes = Math.round(safeInterval / 60);
  const safeCycles = Math.ceil(MARKET_HOURS_SECONDS / safeInterval);
  const safeEstimatedCalls = instrumentCount * safeCycles;

  const message =
    `Polling plan: ${instrumentCount} instruments every ${pollIntervalMinutes}min during market hours (~6.5hrs)\n` +
    `Estimated daily calls: ${estimatedCalls}/${limit}. OVER BUDGET.\n` +
    `Extending interval to ${safeIntervalMinutes}min (~${safeEstimatedCalls} calls/day) to fit within limit.`;

  return {
    ok: false,
    estimatedCalls,
    limit,
    safeInterval,
    message,
  };
}
