import { describe, it, expect } from "vitest";
import {
  sortHoldings,
  computeAllocation,
  computeTotals,
  isSymbolStale,
  type Holding,
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
    ...overrides,
  };
}

describe("sortHoldings", () => {
  const holdings: Holding[] = [
    makeHolding({ symbol: "MSFT", name: "Microsoft", value: "3000", unrealizedPnl: "-100", allocation: "30" }),
    makeHolding({ symbol: "AAPL", name: "Apple Inc.", value: "1500", unrealizedPnl: "300", allocation: "15" }),
    makeHolding({ symbol: "GOOGL", name: "Alphabet", value: "5000", unrealizedPnl: "1200", allocation: "50" }),
  ];

  it("sorts by symbol ascending", () => {
    const sorted = sortHoldings(holdings, "symbol", "asc");
    expect(sorted.map((h) => h.symbol)).toEqual(["AAPL", "GOOGL", "MSFT"]);
  });

  it("sorts by symbol descending", () => {
    const sorted = sortHoldings(holdings, "symbol", "desc");
    expect(sorted.map((h) => h.symbol)).toEqual(["MSFT", "GOOGL", "AAPL"]);
  });

  it("sorts by name case-insensitively", () => {
    const sorted = sortHoldings(holdings, "name", "asc");
    expect(sorted.map((h) => h.name)).toEqual(["Alphabet", "Apple Inc.", "Microsoft"]);
  });

  it("sorts by value ascending", () => {
    const sorted = sortHoldings(holdings, "value", "asc");
    expect(sorted.map((h) => h.symbol)).toEqual(["AAPL", "MSFT", "GOOGL"]);
  });

  it("sorts by value descending", () => {
    const sorted = sortHoldings(holdings, "value", "desc");
    expect(sorted.map((h) => h.symbol)).toEqual(["GOOGL", "MSFT", "AAPL"]);
  });

  it("sorts by unrealizedPnl ascending (negative first)", () => {
    const sorted = sortHoldings(holdings, "unrealizedPnl", "asc");
    expect(sorted.map((h) => h.symbol)).toEqual(["MSFT", "AAPL", "GOOGL"]);
  });

  it("sorts by allocation descending", () => {
    const sorted = sortHoldings(holdings, "allocation", "desc");
    expect(sorted.map((h) => h.symbol)).toEqual(["GOOGL", "MSFT", "AAPL"]);
  });

  it("does not mutate the original array", () => {
    const original = [...holdings];
    sortHoldings(holdings, "value", "asc");
    expect(holdings).toEqual(original);
  });
});

describe("computeAllocation", () => {
  it("computes allocation for a normal case", () => {
    expect(computeAllocation("1500", "10000")).toBe("15.00");
  });

  it("returns 0 when total is zero", () => {
    expect(computeAllocation("1500", "0")).toBe("0");
  });

  it("handles small values", () => {
    expect(computeAllocation("1", "10000")).toBe("0.01");
  });

  it("handles full allocation", () => {
    expect(computeAllocation("10000", "10000")).toBe("100.00");
  });
});

describe("computeTotals", () => {
  it("sums multiple holdings", () => {
    const holdings: Holding[] = [
      makeHolding({ value: "1500", costBasis: "1200", unrealizedPnl: "300" }),
      makeHolding({ value: "3000", costBasis: "2800", unrealizedPnl: "200" }),
      makeHolding({ value: "5000", costBasis: "5500", unrealizedPnl: "-500" }),
    ];
    const totals = computeTotals(holdings);
    expect(totals.totalValue).toBe("9500");
    expect(totals.totalCostBasis).toBe("9500");
    expect(totals.totalUnrealizedPnl).toBe("0");
  });

  it("handles a single holding", () => {
    const holdings: Holding[] = [
      makeHolding({ value: "2500", costBasis: "2000", unrealizedPnl: "500" }),
    ];
    const totals = computeTotals(holdings);
    expect(totals.totalValue).toBe("2500");
    expect(totals.totalCostBasis).toBe("2000");
    expect(totals.totalUnrealizedPnl).toBe("500");
  });

  it("returns zeros for empty array", () => {
    const totals = computeTotals([]);
    expect(totals.totalValue).toBe("0");
    expect(totals.totalCostBasis).toBe("0");
    expect(totals.totalUnrealizedPnl).toBe("0");
  });
});

describe("isSymbolStale", () => {
  const staleInstruments = [
    { symbol: "GOOGL" },
    { symbol: "TSLA" },
  ];

  it("returns true when symbol is in stale list", () => {
    expect(isSymbolStale("GOOGL", staleInstruments)).toBe(true);
  });

  it("returns false when symbol is not in stale list", () => {
    expect(isSymbolStale("AAPL", staleInstruments)).toBe(false);
  });

  it("returns false with empty stale list", () => {
    expect(isSymbolStale("GOOGL", [])).toBe(false);
  });
});
