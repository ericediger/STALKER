import { cn } from "@/lib/cn";
import {
  formatCurrency,
  formatPercent,
  formatQuantity,
  formatRelativeTime,
} from "@/lib/format";
import { ValueChange } from "@/components/ui/ValueChange";
import { toDecimal, div } from "@stalker/shared";
import type { HoldingDetail } from "@/lib/hooks/useHoldingDetail";

interface PositionSummaryProps {
  detail: HoldingDetail;
}

function computeAvgCost(totalCostBasis: string, totalQty: string): string {
  try {
    const cost = toDecimal(totalCostBasis);
    const qty = toDecimal(totalQty);
    if (qty.isZero()) return "0";
    return div(cost, qty).toString();
  } catch {
    return "0";
  }
}

interface MetricProps {
  label: string;
  children: React.ReactNode;
}

function Metric({ label, children }: MetricProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-text-tertiary uppercase tracking-wide">
        {label}
      </span>
      <span className="text-lg font-medium text-text-primary">{children}</span>
    </div>
  );
}

export function PositionSummary({ detail }: PositionSummaryProps) {
  const hasPrice = detail.markPrice != null && detail.markPrice !== "";
  const avgCost = computeAvgCost(detail.totalCostBasis, detail.totalQty);

  return (
    <div className="bg-bg-secondary rounded-lg border border-border-primary p-card">
      <div className="grid grid-cols-4 gap-6">
        {/* Row 1 */}
        <Metric label="Shares">
          <span className="font-mono tabular-nums">
            {formatQuantity(detail.totalQty)}
          </span>
        </Metric>

        <Metric label="Avg Cost">
          <span className="font-mono tabular-nums">
            {formatCurrency(avgCost)}
          </span>
        </Metric>

        <Metric label="Market Value">
          <span className="font-mono tabular-nums">
            {hasPrice ? formatCurrency(detail.marketValue) : "\u2014"}
          </span>
        </Metric>

        <Metric label="Unrealized P&L">
          {hasPrice ? (
            <span className="flex items-center gap-2">
              <ValueChange value={detail.unrealizedPnl} format="currency" />
              <ValueChange
                value={detail.unrealizedPnlPct}
                format="percent"
                className="text-sm"
              />
            </span>
          ) : (
            <span className="font-mono tabular-nums text-text-tertiary">
              {"\u2014"}
            </span>
          )}
        </Metric>

        {/* Row 2 */}
        <Metric label="Cost Basis">
          <span className="font-mono tabular-nums">
            {formatCurrency(detail.totalCostBasis)}
          </span>
        </Metric>

        <Metric label="Realized P&L">
          <ValueChange value={detail.realizedPnl} format="currency" />
        </Metric>

        <Metric label="Mark Price">
          <span className="font-mono tabular-nums">
            {hasPrice ? formatCurrency(detail.markPrice) : "\u2014"}
          </span>
        </Metric>

        <Metric label="Quote Time">
          <span
            className={cn(
              "text-base",
              detail.latestQuote
                ? "text-text-secondary"
                : "text-text-tertiary",
            )}
          >
            {detail.latestQuote
              ? formatRelativeTime(detail.latestQuote.asOf)
              : "\u2014"}
          </span>
        </Metric>
      </div>
    </div>
  );
}
