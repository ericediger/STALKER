import { describe, it, expect } from "vitest";
import {
  transactionsToMarkers,
  type TransactionForMarker,
} from "@/lib/chart-marker-utils";

function makeTx(
  type: "BUY" | "SELL",
  quantity: string,
  price: string,
  tradeAt: string,
): TransactionForMarker {
  return { type, quantity, price, tradeAt };
}

describe("transactionsToMarkers", () => {
  it("returns empty array for empty input", () => {
    expect(transactionsToMarkers([])).toEqual([]);
  });

  it("converts BUY transaction to green arrowUp below bar", () => {
    const txs = [makeTx("BUY", "50", "220.00", "2025-06-15T14:30:00Z")];
    const markers = transactionsToMarkers(txs);

    expect(markers).toHaveLength(1);
    expect(markers[0]).toEqual({
      time: "2025-06-15",
      position: "belowBar",
      color: "#34D399",
      shape: "arrowUp",
      text: "B 50",
    });
  });

  it("converts SELL transaction to red arrowDown above bar", () => {
    const txs = [makeTx("SELL", "20", "235.50", "2025-11-20T16:00:00Z")];
    const markers = transactionsToMarkers(txs);

    expect(markers).toHaveLength(1);
    expect(markers[0]).toEqual({
      time: "2025-11-20",
      position: "aboveBar",
      color: "#F87171",
      shape: "arrowDown",
      text: "S 20",
    });
  });

  it("sorts markers by time ascending", () => {
    const txs = [
      makeTx("SELL", "10", "300.00", "2026-01-15T16:00:00Z"),
      makeTx("BUY", "50", "200.00", "2025-06-15T14:30:00Z"),
      makeTx("BUY", "25", "250.00", "2025-09-01T10:00:00Z"),
    ];
    const markers = transactionsToMarkers(txs);

    expect(markers).toHaveLength(3);
    expect(markers[0]!.time).toBe("2025-06-15");
    expect(markers[1]!.time).toBe("2025-09-01");
    expect(markers[2]!.time).toBe("2026-01-15");
  });

  it("formats fractional quantities with 2 decimal places", () => {
    const txs = [makeTx("BUY", "12.345", "100.00", "2025-06-15T14:30:00Z")];
    const markers = transactionsToMarkers(txs);

    expect(markers[0]!.text).toBe("B 12.35");
  });

  it("formats whole quantities without decimals", () => {
    const txs = [makeTx("BUY", "100.00", "50.00", "2025-06-15T14:30:00Z")];
    const markers = transactionsToMarkers(txs);

    expect(markers[0]!.text).toBe("B 100");
  });

  it("handles mixed BUY and SELL transactions correctly", () => {
    const txs = [
      makeTx("BUY", "100", "150.00", "2025-03-01T10:00:00Z"),
      makeTx("SELL", "50", "175.00", "2025-06-15T14:30:00Z"),
      makeTx("BUY", "30", "160.00", "2025-09-20T11:00:00Z"),
      makeTx("SELL", "80", "200.00", "2026-01-10T16:00:00Z"),
    ];
    const markers = transactionsToMarkers(txs);

    expect(markers).toHaveLength(4);

    // First marker: BUY
    expect(markers[0]!.shape).toBe("arrowUp");
    expect(markers[0]!.position).toBe("belowBar");
    expect(markers[0]!.color).toBe("#34D399");
    expect(markers[0]!.text).toBe("B 100");

    // Second marker: SELL
    expect(markers[1]!.shape).toBe("arrowDown");
    expect(markers[1]!.position).toBe("aboveBar");
    expect(markers[1]!.color).toBe("#F87171");
    expect(markers[1]!.text).toBe("S 50");

    // Third marker: BUY
    expect(markers[2]!.shape).toBe("arrowUp");
    expect(markers[2]!.text).toBe("B 30");

    // Fourth marker: SELL
    expect(markers[3]!.shape).toBe("arrowDown");
    expect(markers[3]!.text).toBe("S 80");
  });
});
