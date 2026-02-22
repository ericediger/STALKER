import { describe, it, expect } from 'vitest';
import { MockPriceLookup } from '../src/mocks.js';
import { toDecimal } from '@stalker/shared';

describe('MockPriceLookup', () => {
  const bars = {
    'inst-AAPL': [
      { date: '2025-01-02', close: toDecimal('150') },
      { date: '2025-01-03', close: toDecimal('152') },
      { date: '2025-01-06', close: toDecimal('155') },
    ],
  };

  it('exact date match returns correct price with isCarryForward: false', async () => {
    const lookup = new MockPriceLookup(bars);
    const result = await lookup.getClosePriceOrCarryForward('inst-AAPL', '2025-01-03');

    expect(result).not.toBeNull();
    expect(result!.price.toString()).toBe('152');
    expect(result!.actualDate).toBe('2025-01-03');
    expect(result!.isCarryForward).toBe(false);
  });

  it('date with no exact match but prior bars returns carry-forward price', async () => {
    const lookup = new MockPriceLookup(bars);
    // 2025-01-04 (Sat) and 2025-01-05 (Sun) have no bars — should carry forward from Jan 3
    const result = await lookup.getClosePriceOrCarryForward('inst-AAPL', '2025-01-05');

    expect(result).not.toBeNull();
    expect(result!.price.toString()).toBe('152');
    expect(result!.actualDate).toBe('2025-01-03');
    expect(result!.isCarryForward).toBe(true);
  });

  it('date with no bars at all returns null', async () => {
    const lookup = new MockPriceLookup(bars);
    // Query for an instrument that has no bars
    const result = await lookup.getClosePriceOrCarryForward('inst-UNKNOWN', '2025-01-03');
    expect(result).toBeNull();

    // Also verify getClosePrice for unknown instrument
    const exact = await lookup.getClosePrice('inst-UNKNOWN', '2025-01-03');
    expect(exact).toBeNull();
  });

  it('date before all bars returns null (no carry-forward possible)', async () => {
    const lookup = new MockPriceLookup(bars);
    const result = await lookup.getClosePriceOrCarryForward('inst-AAPL', '2025-01-01');
    expect(result).toBeNull();
  });

  it('getFirstBarDate returns correct first date or null', async () => {
    const lookup = new MockPriceLookup(bars);

    const firstDate = await lookup.getFirstBarDate('inst-AAPL');
    expect(firstDate).toBe('2025-01-02');

    const noDate = await lookup.getFirstBarDate('inst-UNKNOWN');
    expect(noDate).toBeNull();
  });

  it('getClosePrice returns exact match or null', async () => {
    const lookup = new MockPriceLookup(bars);

    const exact = await lookup.getClosePrice('inst-AAPL', '2025-01-06');
    expect(exact).not.toBeNull();
    expect(exact!.toString()).toBe('155');

    // Date between bars — no exact match
    const miss = await lookup.getClosePrice('inst-AAPL', '2025-01-04');
    expect(miss).toBeNull();
  });
});
