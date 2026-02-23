import { describe, it, expect } from "vitest";
import {
  toCandlestickData,
  type PriceBar,
} from "@/lib/chart-candlestick-utils";

function makeBar(
  date: string,
  open: string,
  high: string,
  low: string,
  close: string,
): PriceBar {
  return { date, open, high, low, close, volume: 1000000, provider: "fmp" };
}

describe("toCandlestickData", () => {
  it("returns empty array for empty input", () => {
    expect(toCandlestickData([])).toEqual([]);
  });

  it("returns empty array for null-ish input", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(toCandlestickData(null as any)).toEqual([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(toCandlestickData(undefined as any)).toEqual([]);
  });

  it("converts a single bar", () => {
    const input = [makeBar("2026-02-18", "200.50", "205.00", "199.00", "203.75")];
    const result = toCandlestickData(input);
    expect(result).toEqual([
      { time: "2026-02-18", open: 200.5, high: 205, low: 199, close: 203.75 },
    ]);
  });

  it("converts multiple bars preserving order", () => {
    const input = [
      makeBar("2026-01-20", "100.00", "110.00", "95.00", "105.00"),
      makeBar("2026-01-21", "105.00", "115.00", "100.00", "112.00"),
      makeBar("2026-01-22", "112.00", "120.00", "108.00", "118.50"),
    ];
    const result = toCandlestickData(input);
    expect(result).toHaveLength(3);
    expect(result[0]!.time).toBe("2026-01-20");
    expect(result[1]!.open).toBe(105);
    expect(result[2]!.close).toBe(118.5);
  });

  it("handles zero values", () => {
    const input = [makeBar("2026-02-18", "0", "0", "0", "0")];
    const result = toCandlestickData(input);
    expect(result).toEqual([
      { time: "2026-02-18", open: 0, high: 0, low: 0, close: 0 },
    ]);
  });

  it("filters out bars with NaN open", () => {
    const input = [
      makeBar("2026-02-17", "100.00", "110.00", "95.00", "105.00"),
      makeBar("2026-02-18", "not-a-number", "110.00", "95.00", "105.00"),
      makeBar("2026-02-19", "200.00", "210.00", "195.00", "205.00"),
    ];
    const result = toCandlestickData(input);
    expect(result).toHaveLength(2);
    expect(result[0]!.time).toBe("2026-02-17");
    expect(result[1]!.time).toBe("2026-02-19");
  });

  it("filters out bars with NaN close", () => {
    const input = [makeBar("2026-02-18", "100", "110", "95", "bad")];
    const result = toCandlestickData(input);
    expect(result).toHaveLength(0);
  });

  it("filters out bars with NaN high", () => {
    const input = [makeBar("2026-02-18", "100", "bad", "95", "105")];
    const result = toCandlestickData(input);
    expect(result).toHaveLength(0);
  });

  it("filters out bars with NaN low", () => {
    const input = [makeBar("2026-02-18", "100", "110", "bad", "105")];
    const result = toCandlestickData(input);
    expect(result).toHaveLength(0);
  });

  it("handles negative values", () => {
    const input = [makeBar("2026-02-18", "-1.5", "-0.5", "-3.0", "-2.0")];
    const result = toCandlestickData(input);
    expect(result).toEqual([
      { time: "2026-02-18", open: -1.5, high: -0.5, low: -3, close: -2 },
    ]);
  });

  it("handles decimal string prices with many digits", () => {
    const input = [makeBar("2026-02-18", "123.456789", "130.123456", "120.000001", "125.999999")];
    const result = toCandlestickData(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.open).toBeCloseTo(123.456789);
    expect(result[0]!.close).toBeCloseTo(125.999999);
  });

  it("ignores extra fields (volume, provider)", () => {
    const bar: PriceBar = {
      date: "2026-02-18",
      open: "100",
      high: "110",
      low: "95",
      close: "105",
      volume: 6253286,
      provider: "fmp",
    };
    const result = toCandlestickData([bar]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      time: "2026-02-18",
      open: 100,
      high: 110,
      low: 95,
      close: 105,
    });
  });
});
