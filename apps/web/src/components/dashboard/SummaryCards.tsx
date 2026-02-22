"use client";

import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { ValueChange } from "@/components/ui/ValueChange";
import { formatCurrency } from "@/lib/format";
import { toDecimal, add } from "@stalker/shared";
import type { PortfolioSnapshot } from "@/lib/hooks/usePortfolioSnapshot";

interface SummaryCardsProps {
  snapshot: PortfolioSnapshot | null;
  isLoading: boolean;
}

export function SummaryCards({ snapshot, isLoading }: SummaryCardsProps) {
  if (isLoading) {
    return (
      <>
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <Skeleton width="100px" height="14px" className="mb-3" />
            <Skeleton width="140px" height="28px" />
          </Card>
        ))}
      </>
    );
  }

  if (!snapshot) return null;

  const totalGain = add(
    toDecimal(snapshot.unrealizedPnl),
    toDecimal(snapshot.realizedPnl),
  ).toString();

  return (
    <>
      <Card>
        <p className="text-text-secondary text-sm mb-1">Total Gain / Loss</p>
        <p className="text-2xl font-mono tabular-nums">
          <ValueChange value={totalGain} format="currency" />
        </p>
      </Card>
      <Card>
        <p className="text-text-secondary text-sm mb-1">Unrealized P&L</p>
        <p className="text-2xl font-mono tabular-nums">
          <ValueChange value={snapshot.unrealizedPnl} format="currency" />
        </p>
      </Card>
      <Card>
        <p className="text-text-secondary text-sm mb-1">Realized P&L</p>
        <p className="text-2xl font-mono tabular-nums">
          <ValueChange value={snapshot.realizedPnl} format="currency" />
        </p>
      </Card>
    </>
  );
}
