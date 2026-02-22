import type { Decimal } from '@stalker/shared';
import type { PortfolioValueSnapshot } from '@stalker/shared';
import type { PriceLookup, SnapshotStore } from './interfaces.js';

/**
 * In-memory mock implementation of PriceLookup for tests.
 *
 * Constructor takes a map of instrumentId -> Array<{ date, close }> sorted by date ASC.
 */
export class MockPriceLookup implements PriceLookup {
  private readonly bars: Map<string, Array<{ date: string; close: Decimal }>>;

  constructor(bars: Record<string, Array<{ date: string; close: Decimal }>>) {
    this.bars = new Map(Object.entries(bars));
  }

  async getClosePrice(instrumentId: string, date: string): Promise<Decimal | null> {
    const instrumentBars = this.bars.get(instrumentId);
    if (!instrumentBars) return null;

    const bar = instrumentBars.find((b) => b.date === date);
    return bar ? bar.close : null;
  }

  async getClosePriceOrCarryForward(
    instrumentId: string,
    date: string,
  ): Promise<{ price: Decimal; actualDate: string; isCarryForward: boolean } | null> {
    const instrumentBars = this.bars.get(instrumentId);
    if (!instrumentBars || instrumentBars.length === 0) return null;

    // Find the most recent bar with barDate <= date
    let bestBar: { date: string; close: Decimal } | undefined;
    for (const bar of instrumentBars) {
      if (bar.date <= date) {
        bestBar = bar;
      } else {
        break; // bars are sorted ASC, so no need to continue
      }
    }

    if (!bestBar) return null;

    return {
      price: bestBar.close,
      actualDate: bestBar.date,
      isCarryForward: bestBar.date !== date,
    };
  }

  async getFirstBarDate(instrumentId: string): Promise<string | null> {
    const instrumentBars = this.bars.get(instrumentId);
    if (!instrumentBars || instrumentBars.length === 0) return null;
    return instrumentBars[0]!.date;
  }
}

/**
 * In-memory mock implementation of SnapshotStore for tests.
 */
export class MockSnapshotStore implements SnapshotStore {
  private snapshots: PortfolioValueSnapshot[] = [];

  async deleteFrom(date: string): Promise<number> {
    const before = this.snapshots.length;
    this.snapshots = this.snapshots.filter((s) => s.date < date);
    return before - this.snapshots.length;
  }

  async writeBatch(snapshots: PortfolioValueSnapshot[]): Promise<void> {
    this.snapshots.push(...snapshots);
  }

  async getRange(startDate: string, endDate: string): Promise<PortfolioValueSnapshot[]> {
    return this.snapshots
      .filter((s) => s.date >= startDate && s.date <= endDate)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  async getByDate(date: string): Promise<PortfolioValueSnapshot | null> {
    return this.snapshots.find((s) => s.date === date) ?? null;
  }

  /** Test helper: return all stored snapshots (sorted by date ASC). */
  getAll(): PortfolioValueSnapshot[] {
    return [...this.snapshots].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
}
