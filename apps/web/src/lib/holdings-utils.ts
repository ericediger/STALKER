import Decimal from "decimal.js";

export type SortColumn =
  | "symbol"
  | "name"
  | "firstBuyDate"
  | "qty"
  | "avgCost"
  | "price"
  | "value"
  | "costBasis"
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
  firstBuyDate: string | null;
}

/**
 * Compute average cost per share: costBasis / totalQuantity.
 * Returns null for zero-quantity positions (fully closed).
 */
export function avgCostPerShare(costBasis: string, totalQuantity: string): string | null {
  const qty = new Decimal(totalQuantity);
  if (qty.isZero()) return null;
  return new Decimal(costBasis).div(qty).toFixed(2);
}

const STRING_COLUMNS: ReadonlySet<SortColumn> = new Set(["symbol", "name"]);

/**
 * Sort holdings by column. String columns sort alphabetically (case-insensitive).
 * Date columns sort chronologically (nulls last). Numeric columns sort by Decimal comparison.
 */
export function sortHoldings(
  holdings: Holding[],
  column: SortColumn,
  direction: SortDirection,
): Holding[] {
  const sorted = [...holdings].sort((a, b) => {
    if (STRING_COLUMNS.has(column)) {
      const aVal = (a[column] as string).toLowerCase();
      const bVal = (b[column] as string).toLowerCase();
      return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    }
    if (column === "firstBuyDate") {
      const aVal = a.firstBuyDate;
      const bVal = b.firstBuyDate;
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;
      return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    }
    if (column === "avgCost") {
      const aVal = avgCostPerShare(a.costBasis, a.qty);
      const bVal = avgCostPerShare(b.costBasis, b.qty);
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;
      return new Decimal(aVal).cmp(new Decimal(bVal));
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
