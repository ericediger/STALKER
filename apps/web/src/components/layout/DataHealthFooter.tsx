"use client";

import { useMarketStatus } from "@/lib/hooks/useMarketStatus";

function formatPollingInterval(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `${hours} hr`;
}

function formatFreshness(allFreshMinutes: number | null, staleCount: number): {
  text: string;
  isStale: boolean;
} {
  if (staleCount > 0) {
    return {
      text: `${staleCount} quote${staleCount === 1 ? "" : "s"} stale > 1hr`,
      isStale: true,
    };
  }
  if (allFreshMinutes !== null) {
    return {
      text: `All quotes updated within ${allFreshMinutes} min`,
      isStale: false,
    };
  }
  return { text: "No quote data", isStale: false };
}

export function DataHealthFooter() {
  const { data, isLoading } = useMarketStatus();

  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-bg-secondary border-t border-border-primary">
      <div className="text-text-tertiary text-xs py-2 px-page flex items-center gap-1.5">
        {isLoading ? (
          <span>Checking data health...</span>
        ) : data ? (
          <>
            <span>{data.instrumentCount} instruments</span>
            <span className="select-none">&middot;</span>
            <span>Polling {formatPollingInterval(data.pollingInterval)}</span>
            <span className="select-none">&middot;</span>
            <span>
              {data.budget.usedToday} / {data.budget.dailyLimit} calls
            </span>
            <span className="select-none">&middot;</span>
            {(() => {
              const freshness = formatFreshness(
                data.freshness.allFreshWithinMinutes,
                data.freshness.staleInstruments.length,
              );
              return (
                <span className={freshness.isStale ? "text-accent-warning" : ""}>
                  {freshness.text}
                </span>
              );
            })()}
          </>
        ) : (
          <span>Data health unavailable</span>
        )}
      </div>
    </footer>
  );
}
