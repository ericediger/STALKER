import { cn } from "@/lib/cn";
import {
  formatCurrency,
  formatPercent,
  formatQuantity,
  formatMonthYear,
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
  const isPriceHistoryFallback = detail.latestQuote?.provider === "price-history";

  return (
    <div className="bg-bg-secondary rounded-lg border border-border-primary p-card">
      <div className="grid grid-cols-4 gap-6">
        {/* Row 1: Current Price | Shares | Avg Cost | Market Value */}
        <Metric label="Current Price">
          <span className="font-mono tabular-nums">
            {hasPrice ? formatCurrency(detail.markPrice) : "\u2014"}
          </span>
          {hasPrice && isPriceHistoryFallback && detail.latestQuote && (
            <span className="text-xs text-accent-warning mt-0.5">
              As of {formatRelativeTime(detail.latestQuote.asOf)}
            </span>
          )}
        </Metric>

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

        {/* Row 2: Unrealized P&L | Day Change | Allocation % | Cost Basis */}
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

        <Metric label={detail.instrumentType === 'CRYPTO' ? '24h Change' : 'Day Change'}>
          {detail.dayChange != null ? (
            <span className="flex items-center gap-2">
              <ValueChange value={detail.dayChange} format="currency" />
              <ValueChange
                value={detail.dayChangePct ?? "0"}
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

        <Metric label="Allocation">
          <span className="font-mono tabular-nums">
            {formatPercent(detail.allocation)}
          </span>
        </Metric>

        <Metric label="Cost Basis">
          <span className="font-mono tabular-nums">
            {formatCurrency(detail.totalCostBasis)}
          </span>
        </Metric>

        {/* Row 3: Realized PnL | First Buy | Data Source | (reserved — empty) */}
        <Metric label="Realized P&L">
          <ValueChange value={detail.realizedPnl} format="currency" />
        </Metric>

        <Metric label="First Buy">
          <span className="text-base text-text-secondary">
            {detail.firstBuyDate
              ? formatMonthYear(detail.firstBuyDate)
              : "\u2014"}
          </span>
        </Metric>

        <Metric label="Data Source">
          <span
            className={cn(
              "text-base",
              isPriceHistoryFallback
                ? "text-accent-warning"
                : "text-text-secondary",
            )}
          >
            {detail.latestQuote?.provider ?? "\u2014"}
          </span>
        </Metric>

        {/* Reserved — empty 16th cell */}
        <div />
      </div>
    </div>
  );
}
