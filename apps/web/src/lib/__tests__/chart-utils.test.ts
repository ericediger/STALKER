import { describe, it, expect } from 'vitest';
import { toAreaChartData, type TimeseriesPoint } from '@/lib/chart-utils';

function makePoint(date: string, totalValue: string): TimeseriesPoint {
  return {
    date,
    totalValue,
    totalCostBasis: '100000',
    unrealizedPnl: '0',
    realizedPnl: '0',
  };
}

describe('toAreaChartData', () => {
  it('returns empty array for empty input', () => {
    expect(toAreaChartData([])).toEqual([]);
  });

  it('returns empty array for null-ish input', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(toAreaChartData(null as any)).toEqual([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(toAreaChartData(undefined as any)).toEqual([]);
  });

  it('converts a single point', () => {
    const input = [makePoint('2026-02-18', '302885.71')];
    const result = toAreaChartData(input);
    expect(result).toEqual([
      { time: '2026-02-18', value: 302885.71 },
    ]);
  });

  it('converts multiple points preserving order', () => {
    const input = [
      makePoint('2026-01-23', '301338.81'),
      makePoint('2026-01-24', '301500.00'),
      makePoint('2026-02-18', '302885.71'),
    ];
    const result = toAreaChartData(input);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ time: '2026-01-23', value: 301338.81 });
    expect(result[2]).toEqual({ time: '2026-02-18', value: 302885.71 });
  });

  it('handles zero values', () => {
    const input = [makePoint('2026-02-18', '0')];
    const result = toAreaChartData(input);
    expect(result).toEqual([{ time: '2026-02-18', value: 0 }]);
  });

  it('handles string "0.00"', () => {
    const input = [makePoint('2026-02-18', '0.00')];
    const result = toAreaChartData(input);
    expect(result).toEqual([{ time: '2026-02-18', value: 0 }]);
  });

  it('filters out NaN values', () => {
    const input = [
      makePoint('2026-02-17', '100.00'),
      makePoint('2026-02-18', 'not-a-number'),
      makePoint('2026-02-19', '200.00'),
    ];
    const result = toAreaChartData(input);
    expect(result).toHaveLength(2);
    expect(result[0]!.time).toBe('2026-02-17');
    expect(result[1]!.time).toBe('2026-02-19');
  });

  it('handles negative values', () => {
    const input = [makePoint('2026-02-18', '-500.25')];
    const result = toAreaChartData(input);
    expect(result).toEqual([{ time: '2026-02-18', value: -500.25 }]);
  });
});
