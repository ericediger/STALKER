"use client";

import type { StaleInstrument } from "@/lib/hooks/useMarketStatus";

interface StalenessBannerProps {
  staleInstruments: StaleInstrument[];
}

export function StalenessBanner({ staleInstruments }: StalenessBannerProps) {
  if (staleInstruments.length === 0) return null;

  return (
    <div className="bg-accent-warning/10 border border-accent-warning/30 rounded px-4 py-2 text-accent-warning text-sm">
      Some prices may be outdated
    </div>
  );
}
