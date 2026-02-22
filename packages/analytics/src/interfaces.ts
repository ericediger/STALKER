import type { Decimal } from '@stalker/shared';
import type { HoldingSnapshot, PortfolioValueSnapshot } from '@stalker/shared';

/**
 * Extended holding snapshot that tracks price estimation state.
 * Used in holdingsJson within PortfolioValueSnapshot.
 */
export interface HoldingSnapshotEntry extends HoldingSnapshot {
  /** True if the price used was carried forward from a prior trading day. */
  isEstimated?: boolean;
  /** True if no price data exists at all — value is unknown, only cost basis recorded. */
  costBasisOnly?: boolean;
}

/**
 * Abstraction over price bar storage for the analytics engine.
 * Implementations may query Prisma, use in-memory fixtures, etc.
 */
export interface PriceLookup {
  /** Returns the daily close price for an instrument on a specific trading date. Null if no bar exists. */
  getClosePrice(instrumentId: string, date: string): Promise<Decimal | null>;

  /** Returns the most recent close price on or before the given date. Null if no price history exists. */
  getClosePriceOrCarryForward(instrumentId: string, date: string): Promise<{
    price: Decimal;
    actualDate: string;
    isCarryForward: boolean;
  } | null>;

  /** Returns the earliest available price bar date for an instrument. Null if no data. */
  getFirstBarDate(instrumentId: string): Promise<string | null>;
}

/**
 * Abstraction over snapshot storage for the analytics engine.
 * Implementations may use Prisma, in-memory stores, etc.
 */
export interface SnapshotStore {
  /** Delete all snapshots from the given date forward. Returns count deleted. */
  deleteFrom(date: string): Promise<number>;

  /** Write a batch of snapshot rows. */
  writeBatch(snapshots: PortfolioValueSnapshot[]): Promise<void>;

  /** Read snapshots within a date range (inclusive). Sorted by date ASC. */
  getRange(startDate: string, endDate: string): Promise<PortfolioValueSnapshot[]>;

  /** Get the single snapshot for a specific date. Null if not built yet. */
  getByDate(date: string): Promise<PortfolioValueSnapshot | null>;
}
