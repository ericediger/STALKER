import { describe, it, expect } from "vitest";
import {
  sortHoldings,
  computeTotals,
  type Holding,
  type SortColumn,
  type SortDirection,
} from "../holdings-utils";

function makeHolding(overrides: Partial<Holding> = {}): Holding {
  return {
    symbol: "AAPL",
    name: "Apple Inc.",
    instrumentId: "01KJ",
    qty: "10",
    price: "150.00",
    value: "1500.00",
    costBasis: "1200.00",
    unrealizedPnl: "300.00",
    unrealizedPnlPct: "25.00",
    allocation: "50.00",
    firstBuyDate: "2025-06-15T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * Simulate the pagination logic used in PortfolioTable.
 */
function paginate<T>(items: T[], page: number, perPage: number): T[] {
  return items.slice((page - 1) * perPage, page * perPage);
}

/**
 * Simulate the filter logic used in PortfolioTable.
 */
function filterByText(holdings: Holding[], query: string): Holding[] {
  if (!query.trim()) return holdings;
  const q = query.toLowerCase().trim();
  return holdings.filter(
    (h) =>
      h.symbol.toLowerCase().includes(q) ||
      h.name.toLowerCase().includes(q),
  );
}

describe("PortfolioTable logic — pagination", () => {
  const manyHoldings = Array.from({ length: 45 }, (_, i) =>
    makeHolding({
      symbol: `SYM${String(i + 1).padStart(3, "0")}`,
      name: `Company ${i + 1}`,
      instrumentId: `id-${i + 1}`,
      allocation: String(45 - i),
    }),
  );

  it("paginates 45 holdings into pages of 20", () => {
    const page1 = paginate(manyHoldings, 1, 20);
    expect(page1).toHaveLength(20);
    expect(page1[0]!.symbol).toBe("SYM001");

    const page2 = paginate(manyHoldings, 2, 20);
    expect(page2).toHaveLength(20);
    expect(page2[0]!.symbol).toBe("SYM021");

    const page3 = paginate(manyHoldings, 3, 20);
    expect(page3).toHaveLength(5);
    expect(page3[0]!.symbol).toBe("SYM041");
  });

  it("returns empty for out-of-range page", () => {
    const page10 = paginate(manyHoldings, 10, 20);
    expect(page10).toHaveLength(0);
  });
});

describe("PortfolioTable logic — filtering", () => {
  const holdings: Holding[] = [
    makeHolding({ symbol: "VTI", name: "Vanguard Total Stock Market ETF" }),
    makeHolding({ symbol: "QQQ", name: "Invesco QQQ Trust" }),
    makeHolding({ symbol: "VNQ", name: "Vanguard Real Estate ETF" }),
    makeHolding({ symbol: "AAPL", name: "Apple Inc." }),
  ];

  it("filters by symbol (case-insensitive)", () => {
    const result = filterByText(holdings, "vt");
    expect(result.map((h) => h.symbol)).toEqual(["VTI"]);
  });

  it("filters by name", () => {
    const result = filterByText(holdings, "vanguard");
    expect(result.map((h) => h.symbol)).toEqual(["VTI", "VNQ"]);
  });

  it("returns all when filter is empty", () => {
    const result = filterByText(holdings, "");
    expect(result).toHaveLength(4);
  });

  it("returns empty when no match", () => {
    const result = filterByText(holdings, "xyz");
    expect(result).toHaveLength(0);
  });
});

describe("PortfolioTable logic — sort cycle", () => {
  it("default sort: allocation descending", () => {
    const holdings: Holding[] = [
      makeHolding({ symbol: "A", allocation: "10" }),
      makeHolding({ symbol: "B", allocation: "50" }),
      makeHolding({ symbol: "C", allocation: "30" }),
    ];
    const sorted = sortHoldings(holdings, "allocation", "desc");
    expect(sorted.map((h) => h.symbol)).toEqual(["B", "C", "A"]);
  });

  it("sort by value ascending", () => {
    const holdings: Holding[] = [
      makeHolding({ symbol: "A", value: "5000" }),
      makeHolding({ symbol: "B", value: "1000" }),
      makeHolding({ symbol: "C", value: "3000" }),
    ];
    const sorted = sortHoldings(holdings, "value", "asc");
    expect(sorted.map((h) => h.symbol)).toEqual(["B", "C", "A"]);
  });
});

describe("PortfolioTable logic — totals row", () => {
  it("sums value, cost basis, and unrealized PnL across all holdings", () => {
    const holdings: Holding[] = [
      makeHolding({ value: "10000", costBasis: "8000", unrealizedPnl: "2000" }),
      makeHolding({ value: "5000", costBasis: "6000", unrealizedPnl: "-1000" }),
      makeHolding({ value: "3000", costBasis: "2500", unrealizedPnl: "500" }),
    ];
    const totals = computeTotals(holdings);
    expect(totals.totalValue).toBe("18000");
    expect(totals.totalCostBasis).toBe("16500");
    expect(totals.totalUnrealizedPnl).toBe("1500");
  });
});

describe("PortfolioTable logic — firstBuyDate column", () => {
  it("holdings with firstBuyDate sort correctly", () => {
    const holdings: Holding[] = [
      makeHolding({ symbol: "Z", firstBuyDate: "2025-12-01T00:00:00Z" }),
      makeHolding({ symbol: "A", firstBuyDate: "2025-01-15T00:00:00Z" }),
      makeHolding({ symbol: "M", firstBuyDate: "2025-06-20T00:00:00Z" }),
    ];
    const sorted = sortHoldings(holdings, "firstBuyDate", "asc");
    expect(sorted.map((h) => h.symbol)).toEqual(["A", "M", "Z"]);
  });

  it("null firstBuyDate sorts to end in ascending order", () => {
    const holdings: Holding[] = [
      makeHolding({ symbol: "B", firstBuyDate: null }),
      makeHolding({ symbol: "A", firstBuyDate: "2025-01-15T00:00:00Z" }),
    ];
    const sorted = sortHoldings(holdings, "firstBuyDate", "asc");
    expect(sorted.map((h) => h.symbol)).toEqual(["A", "B"]);
  });
});
