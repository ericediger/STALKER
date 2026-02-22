import type { Transaction, Instrument } from '@stalker/shared';
import type { PriceLookup, SnapshotStore } from './interfaces.js';
import { buildPortfolioValueSeries } from './value-series.js';
import type { CalendarFns } from './value-series.js';

/**
 * Rebuild portfolio value snapshots from the affected date forward.
 *
 * This is the primary entry point after a transaction create/edit/delete.
 * It deletes existing snapshots from `affectedDate` onward and rebuilds them.
 */
export async function rebuildSnapshotsFrom(params: {
  affectedDate: string;
  transactions: Transaction[];
  instruments: Instrument[];
  priceLookup: PriceLookup;
  snapshotStore: SnapshotStore;
  calendar: CalendarFns;
  endDate?: string; // defaults to today (YYYY-MM-DD)
}): Promise<{ snapshotsRebuilt: number }> {
  const {
    affectedDate,
    transactions,
    instruments,
    priceLookup,
    snapshotStore,
    calendar,
  } = params;

  // Default endDate to today
  const now = new Date();
  const endDate = params.endDate ?? formatDateStr(now);

  // Build the series (deleteFrom is called inside buildPortfolioValueSeries)
  await buildPortfolioValueSeries({
    transactions,
    instruments,
    priceLookup,
    snapshotStore,
    calendar,
    startDate: affectedDate,
    endDate,
  });

  // Count how many snapshots were written
  const snapshots = await snapshotStore.getRange(affectedDate, endDate);
  return { snapshotsRebuilt: snapshots.length };
}

function formatDateStr(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
