"use client";

import type { StaleInstrument } from "@/lib/hooks/useMarketStatus";
import { getStalenessState } from "@/lib/staleness-banner-utils";
import { cn } from "@/lib/cn";

interface StalenessBannerProps {
  staleInstruments: StaleInstrument[];
  totalInstruments: number;
}

/**
 * Staleness banner with adaptive text based on stale ratio.
 *
 * - 0%: hidden
 * - 1–30%: amber warning with stale count
 * - 31–79%: amber warning with stale and fresh counts
 * - 80–100%: blue informational "updating" style
 */
export function StalenessBanner({ staleInstruments, totalInstruments }: StalenessBannerProps) {
  const state = getStalenessState(staleInstruments.length, totalInstruments);

  if (state.variant === 'hidden') return null;

  const isBlue = state.variant === 'blue-updating';

  return (
    <div className={cn(
      "rounded px-4 py-2 text-sm border",
      isBlue
        ? "bg-accent-info/10 border-accent-info/30 text-accent-info"
        : "bg-accent-warning/10 border-accent-warning/30 text-accent-warning",
    )}>
      {state.text}
    </div>
  );
}
