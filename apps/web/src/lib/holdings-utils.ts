import Decimal from "decimal.js";

export type SortColumn =
  | "symbol"
  | "name"
  | "qty"
  | "price"
  | "value"
  | "unrealizedPnl"
  | "unrealizedPnlPct"
  | "allocation";

export type SortDirection = "asc" | "desc";

export interface Holding {
  symbol: string;
  name: string;
  instrumentId: string;
  qty: string;
  price: string;
  value: string;
  costBasis: string;
  unrealizedPnl: string;
  unrealizedPnlPct: string;
  allocation: string;
}

const STRING_COLUMNS: ReadonlySet<SortColumn> = new Set(["symbol", "name"]);

/**
 * Sort holdings by column. String columns sort alphabetically (case-insensitive).
 * Numeric columns sort by Decimal comparison.
 */
export function sortHoldings(
  holdings: Holding[],
  column: SortColumn,
  direction: SortDirection,
): Holding[] {
  const sorted = [...holdings].sort((a, b) => {
    if (STRING_COLUMNS.has(column)) {
      const aVal = a[column].toLowerCase();
      const bVal = b[column].toLowerCase();
      return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    }
    const aVal = new Decimal(a[column]);
    const bVal = new Decimal(b[column]);
    return aVal.cmp(bVal);
  });
  if (direction === "desc") sorted.reverse();
  return sorted;
}

/**
 * Compute allocation percentage: (holdingValue / totalValue) * 100.
 * Returns Decimal string. If totalValue is zero, returns "0".
 */
export function computeAllocation(
  holdingValue: string,
  totalValue: string,
): string {
  const total = new Decimal(totalValue);
  if (total.isZero()) return "0";
  return new Decimal(holdingValue).div(total).mul(100).toFixed(2);
}

/**
 * Compute totals for the footer row.
 */
export function computeTotals(holdings: Holding[]): {
  totalValue: string;
  totalCostBasis: string;
  totalUnrealizedPnl: string;
} {
  let totalValue = new Decimal(0);
  let totalCostBasis = new Decimal(0);
  let totalUnrealizedPnl = new Decimal(0);

  for (const h of holdings) {
    totalValue = totalValue.plus(new Decimal(h.value));
    totalCostBasis = totalCostBasis.plus(new Decimal(h.costBasis));
    totalUnrealizedPnl = totalUnrealizedPnl.plus(new Decimal(h.unrealizedPnl));
  }

  return {
    totalValue: totalValue.toString(),
    totalCostBasis: totalCostBasis.toString(),
    totalUnrealizedPnl: totalUnrealizedPnl.toString(),
  };
}

/**
 * Check if a symbol appears in the stale instruments list.
 */
export function isSymbolStale(
  symbol: string,
  staleInstruments: Array<{ symbol: string }>,
): boolean {
  return staleInstruments.some((s) => s.symbol === symbol);
}
