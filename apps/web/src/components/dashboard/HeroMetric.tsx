"use client";

import { formatCurrency } from "@/lib/format";
import { ValueChange } from "@/components/ui/ValueChange";
import { Skeleton } from "@/components/ui/Skeleton";
import type { PortfolioSnapshot } from "@/lib/hooks/usePortfolioSnapshot";

interface HeroMetricProps {
  snapshot: PortfolioSnapshot | null;
  isLoading: boolean;
}

export function HeroMetric({ snapshot, isLoading }: HeroMetricProps) {
  if (isLoading) {
    return (
      <div className="py-6">
        <Skeleton width="280px" height="48px" className="mb-3" />
        <Skeleton width="200px" height="24px" />
      </div>
    );
  }

  if (!snapshot) return null;

  return (
    <div className="py-6">
      <h1 className="font-heading text-4xl text-text-primary tracking-tight">
        {formatCurrency(snapshot.totalValue)}
      </h1>
      <div className="mt-2 flex items-center gap-3">
        <ValueChange
          value={snapshot.window.changeAmount}
          format="currency"
          className="text-lg"
        />
        <ValueChange
          value={snapshot.window.changePct}
          format="percent"
          className="text-lg"
        />
      </div>
    </div>
  );
}
