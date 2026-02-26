import type { PriceLookup } from '@stalker/analytics';
import type { PrismaClient } from '@prisma/client';
import { toDecimal } from '@stalker/shared';
import type { Decimal } from '@stalker/shared';

/**
 * Accepts PrismaClient or a Prisma interactive transaction client.
 */
type PrismaLike = Pick<PrismaClient, 'priceBar'>;

/**
 * Pre-loaded price bar data for a single instrument.
 * Dates are sorted ascending to enable efficient carry-forward lookups.
 */
interface InstrumentPriceData {
  /** Sorted ascending by date */
  dates: string[];
  /** Map from date string to close price */
  priceByDate: Map<string, Decimal>;
}

/**
 * A PriceLookup implementation that pre-loads all price bars into memory
 * for a set of instruments within a date range. Provides O(1) exact lookups
 * and O(log n) carry-forward lookups via binary search.
 *
 * Use this for batch operations (like snapshot rebuild) where the per-query
 * PriceLookup would result in thousands of individual DB queries.
 *
 * AD-S14-3: Single query per instrument, loaded into Map.
 */
export class BatchPriceLookup implements PriceLookup {
  private data: Map<string, InstrumentPriceData>;
  private firstBarDates: Map<string, string | null>;

  private constructor(
    data: Map<string, InstrumentPriceData>,
    firstBarDates: Map<string, string | null>,
  ) {
    this.data = data;
    this.firstBarDates = firstBarDates;
  }

  /**
   * Factory: pre-load all daily price bars for the given instruments.
   * Optionally constrained to a date range (but for carry-forward we load all).
   */
  static async preload(
    prisma: PrismaLike,
    instrumentIds: string[],
  ): Promise<BatchPriceLookup> {
    if (instrumentIds.length === 0) {
      return new BatchPriceLookup(new Map(), new Map());
    }

    // Single query to load all daily bars for all instruments
    const bars = await prisma.priceBar.findMany({
      where: {
        instrumentId: { in: instrumentIds },
        resolution: '1D',
      },
      orderBy: [
        { instrumentId: 'asc' },
        { date: 'asc' },
      ],
      select: {
        instrumentId: true,
        date: true,
        close: true,
      },
    });

    const data = new Map<string, InstrumentPriceData>();
    const firstBarDates = new Map<string, string | null>();

    // Initialize all instrument IDs (some may have no bars)
    for (const id of instrumentIds) {
      data.set(id, { dates: [], priceByDate: new Map() });
      firstBarDates.set(id, null);
    }

    // Populate from query results
    for (const bar of bars) {
      const instData = data.get(bar.instrumentId)!;
      const price = toDecimal(bar.close.toString());
      instData.dates.push(bar.date);
      instData.priceByDate.set(bar.date, price);

      // Track first bar date
      if (firstBarDates.get(bar.instrumentId) === null) {
        firstBarDates.set(bar.instrumentId, bar.date);
      }
    }

    return new BatchPriceLookup(data, firstBarDates);
  }

  async getClosePrice(instrumentId: string, date: string): Promise<Decimal | null> {
    const instData = this.data.get(instrumentId);
    if (!instData) return null;
    return instData.priceByDate.get(date) ?? null;
  }

  async getClosePriceOrCarryForward(
    instrumentId: string,
    date: string,
  ): Promise<{
    price: Decimal;
    actualDate: string;
    isCarryForward: boolean;
  } | null> {
    const instData = this.data.get(instrumentId);
    if (!instData || instData.dates.length === 0) return null;

    // Exact match — fast path
    const exact = instData.priceByDate.get(date);
    if (exact !== undefined) {
      return { price: exact, actualDate: date, isCarryForward: false };
    }

    // Binary search for the largest date <= target date
    const idx = this.upperBound(instData.dates, date) - 1;
    if (idx < 0) return null;

    const actualDate = instData.dates[idx]!;
    const price = instData.priceByDate.get(actualDate)!;
    return { price, actualDate, isCarryForward: true };
  }

  async getFirstBarDate(instrumentId: string): Promise<string | null> {
    return this.firstBarDates.get(instrumentId) ?? null;
  }

  /**
   * Binary search: returns the index of the first element > target.
   * So upperBound - 1 gives the last element <= target.
   */
  private upperBound(sortedDates: string[], target: string): number {
    let lo = 0;
    let hi = sortedDates.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sortedDates[mid]! <= target) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }
}
