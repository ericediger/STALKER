import { formatCurrency, formatQuantity, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import type { HoldingTransaction } from "@/lib/hooks/useHoldingDetail";

interface HoldingTransactionsProps {
  transactions: HoldingTransaction[];
}

export function HoldingTransactions({
  transactions,
}: HoldingTransactionsProps) {
  const sorted = [...transactions].sort(
    (a, b) => new Date(b.tradeAt).getTime() - new Date(a.tradeAt).getTime(),
  );

  if (sorted.length === 0) {
    return (
      <div className="bg-bg-secondary rounded-lg border border-border-primary p-6 text-center text-text-secondary text-sm">
        No transactions
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-heading text-text-primary">Transactions</h2>
      <div className="bg-bg-secondary rounded-lg border border-border-primary overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border-primary">
              <th className="text-text-tertiary text-sm font-medium uppercase tracking-wide px-3 py-2 text-left">
                Date
              </th>
              <th className="text-text-tertiary text-sm font-medium uppercase tracking-wide px-3 py-2 text-left">
                Type
              </th>
              <th className="text-text-tertiary text-sm font-medium uppercase tracking-wide px-3 py-2 text-right">
                Qty
              </th>
              <th className="text-text-tertiary text-sm font-medium uppercase tracking-wide px-3 py-2 text-right">
                Price
              </th>
              <th className="text-text-tertiary text-sm font-medium uppercase tracking-wide px-3 py-2 text-right">
                Fees
              </th>
              <th className="text-text-tertiary text-sm font-medium uppercase tracking-wide px-3 py-2 text-left">
                Notes
              </th>
              <th className="text-text-tertiary text-sm font-medium uppercase tracking-wide px-3 py-2 text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((tx) => (
              <tr
                key={tx.id}
                className="border-b border-border-primary last:border-b-0 hover:bg-bg-tertiary transition-colors"
              >
                <td className="px-3 py-2 text-text-primary">
                  {formatDate(tx.tradeAt)}
                </td>
                <td className="px-3 py-2">
                  <Badge
                    variant={tx.type === "BUY" ? "positive" : "negative"}
                    size="sm"
                  >
                    {tx.type}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-text-primary">
                  {formatQuantity(tx.quantity)}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-text-primary">
                  {formatCurrency(tx.price)}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-text-primary">
                  {formatCurrency(tx.fees)}
                </td>
                <td className="px-3 py-2 text-text-secondary text-sm max-w-[200px] truncate">
                  {tx.notes ?? "\u2014"}
                </td>
                <td className="px-3 py-2 text-right">
                  <span className="inline-flex items-center gap-2">
                    {/* Edit icon — onClick to be wired by lead */}
                    <button
                      type="button"
                      className="text-text-tertiary hover:text-text-primary transition-colors p-1"
                      aria-label="Edit transaction"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        <path d="m15 5 4 4" />
                      </svg>
                    </button>
                    {/* Delete icon — onClick to be wired by lead */}
                    <button
                      type="button"
                      className="text-text-tertiary hover:text-accent-negative transition-colors p-1"
                      aria-label="Delete transaction"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        <line x1="10" x2="10" y1="11" y2="17" />
                        <line x1="14" x2="14" y1="11" y2="17" />
                      </svg>
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
