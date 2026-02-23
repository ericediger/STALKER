import Decimal from "decimal.js";
import { formatCurrency, formatQuantity, formatDate } from "@/lib/format";
import { ValueChange } from "@/components/ui/ValueChange";
import type { HoldingLot } from "@/lib/hooks/useHoldingDetail";

interface LotsTableProps {
  lots: HoldingLot[];
  markPrice: string | null;
}

function computeLotUnrealizedPnl(
  lot: HoldingLot,
  markPrice: string,
): string {
  try {
    const mark = new Decimal(markPrice);
    const qty = new Decimal(lot.remainingQty);
    const cost = new Decimal(lot.costBasisRemaining);
    return mark.mul(qty).minus(cost).toString();
  } catch {
    return "0";
  }
}

function computeTotals(
  lots: HoldingLot[],
  markPrice: string | null,
): {
  totalRemainingQty: string;
  totalCostBasis: string;
  totalUnrealizedPnl: string | null;
} {
  let totalQty = new Decimal(0);
  let totalCost = new Decimal(0);
  let totalPnl = new Decimal(0);

  for (const lot of lots) {
    totalQty = totalQty.plus(new Decimal(lot.remainingQty));
    totalCost = totalCost.plus(new Decimal(lot.costBasisRemaining));
    if (markPrice) {
      totalPnl = totalPnl.plus(new Decimal(computeLotUnrealizedPnl(lot, markPrice)));
    }
  }

  return {
    totalRemainingQty: totalQty.toString(),
    totalCostBasis: totalCost.toString(),
    totalUnrealizedPnl: markPrice ? totalPnl.toString() : null,
  };
}

export function LotsTable({ lots, markPrice }: LotsTableProps) {
  const hasPrice = markPrice != null && markPrice !== "";
  const totals = computeTotals(lots, hasPrice ? markPrice : null);

  if (lots.length === 0) {
    return (
      <div className="bg-bg-secondary rounded-lg border border-border-primary p-6 text-center text-text-secondary text-sm">
        No open lots
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-heading text-text-primary">FIFO Lots</h2>
      <div className="bg-bg-secondary rounded-lg border border-border-primary overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border-primary">
              <th className="text-text-tertiary text-sm font-medium uppercase tracking-wide px-3 py-2 text-left">
                #
              </th>
              <th className="text-text-tertiary text-sm font-medium uppercase tracking-wide px-3 py-2 text-left">
                Opened
              </th>
              <th className="text-text-tertiary text-sm font-medium uppercase tracking-wide px-3 py-2 text-right">
                Orig Qty
              </th>
              <th className="text-text-tertiary text-sm font-medium uppercase tracking-wide px-3 py-2 text-right">
                Rem Qty
              </th>
              <th className="text-text-tertiary text-sm font-medium uppercase tracking-wide px-3 py-2 text-right">
                Cost Basis
              </th>
              <th className="text-text-tertiary text-sm font-medium uppercase tracking-wide px-3 py-2 text-right">
                Unrealized P&L
              </th>
            </tr>
          </thead>
          <tbody>
            {lots.map((lot, index) => (
              <tr
                key={index}
                className="border-b border-border-primary last:border-b-0 hover:bg-bg-tertiary transition-colors"
              >
                <td className="px-3 py-2 font-mono tabular-nums text-text-secondary">
                  {index + 1}
                </td>
                <td className="px-3 py-2 text-text-primary">
                  {formatDate(lot.openedAt)}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-text-primary">
                  {formatQuantity(lot.originalQty)}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-text-primary">
                  {formatQuantity(lot.remainingQty)}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-text-primary">
                  {formatCurrency(lot.costBasisRemaining)}
                </td>
                <td className="px-3 py-2 text-right">
                  {hasPrice ? (
                    <ValueChange
                      value={computeLotUnrealizedPnl(lot, markPrice)}
                      format="currency"
                    />
                  ) : (
                    <span className="font-mono tabular-nums text-accent-warning">
                      {"\u2014"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border-primary bg-bg-tertiary">
              <td className="px-3 py-2 font-medium text-text-secondary" colSpan={3}>
                Total
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums font-medium text-text-primary">
                {formatQuantity(totals.totalRemainingQty)}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums font-medium text-text-primary">
                {formatCurrency(totals.totalCostBasis)}
              </td>
              <td className="px-3 py-2 text-right">
                {totals.totalUnrealizedPnl != null ? (
                  <ValueChange
                    value={totals.totalUnrealizedPnl}
                    format="currency"
                    className="font-medium"
                  />
                ) : (
                  <span className="font-mono tabular-nums text-accent-warning">
                    {"\u2014"}
                  </span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
