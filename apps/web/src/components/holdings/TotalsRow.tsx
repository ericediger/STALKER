"use client";

import { formatCurrency } from "@/lib/format";
import { ValueChange } from "@/components/ui/ValueChange";
import { computeTotals } from "@/lib/holdings-utils";
import type { Holding } from "@/lib/holdings-utils";

interface TotalsRowProps {
  holdings: Holding[];
}

export function TotalsRow({ holdings }: TotalsRowProps) {
  const { totalValue, totalUnrealizedPnl } = computeTotals(holdings);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <tfoot>
          <tr className="border-t-2 border-border-primary">
            <td className="px-3 py-2 text-text-primary font-semibold">Total</td>
            <td className="px-3 py-2" />
            <td className="px-3 py-2" />
            <td className="px-3 py-2" />
            <td className="px-3 py-2 text-right font-mono tabular-nums text-text-primary font-semibold">
              {formatCurrency(totalValue)}
            </td>
            <td className="px-3 py-2 text-right font-semibold">
              <ValueChange value={totalUnrealizedPnl} format="currency" />
            </td>
            <td className="px-3 py-2" />
            <td className="px-3 py-2" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
