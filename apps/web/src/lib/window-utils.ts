/**
 * Maps a PillToggle window option to date range params for the snapshot API.
 * Options: "1D" | "1W" | "1M" | "3M" | "1Y" | "ALL"
 */
export type WindowOption = '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL';

export const WINDOW_OPTIONS: { label: string; value: WindowOption }[] = [
  { label: '1D', value: '1D' },
  { label: '1W', value: '1W' },
  { label: '1M', value: '1M' },
  { label: '3M', value: '3M' },
  { label: '1Y', value: '1Y' },
  { label: 'ALL', value: 'ALL' },
];

export const DEFAULT_WINDOW: WindowOption = '1M';

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Returns the prior weekday (Mon-Fri). If today is Monday, returns the
 * previous Friday. Saturday returns Friday. Sunday returns Friday.
 */
function getPriorWeekday(from: Date): Date {
  const d = new Date(from);
  const day = d.getDay();
  if (day === 0) {
    // Sunday → Friday
    d.setDate(d.getDate() - 2);
  } else if (day === 1) {
    // Monday → Friday
    d.setDate(d.getDate() - 3);
  } else {
    // Tue-Sat → previous day
    d.setDate(d.getDate() - 1);
  }
  return d;
}

/**
 * Maps a window option to { startDate?, endDate } for API queries.
 * ALL returns no startDate (the API returns full history).
 */
export function getWindowDateRange(
  window: WindowOption,
  today?: Date,
): { startDate?: string; endDate: string } {
  const base = today ?? new Date();
  const endDate = toISODate(base);

  switch (window) {
    case '1D': {
      const start = getPriorWeekday(base);
      return { startDate: toISODate(start), endDate };
    }
    case '1W': {
      const start = new Date(base);
      start.setDate(start.getDate() - 7);
      return { startDate: toISODate(start), endDate };
    }
    case '1M': {
      const start = new Date(base);
      start.setMonth(start.getMonth() - 1);
      return { startDate: toISODate(start), endDate };
    }
    case '3M': {
      const start = new Date(base);
      start.setMonth(start.getMonth() - 3);
      return { startDate: toISODate(start), endDate };
    }
    case '1Y': {
      const start = new Date(base);
      start.setFullYear(start.getFullYear() - 1);
      return { startDate: toISODate(start), endDate };
    }
    case 'ALL':
      return { endDate };
    default:
      return { endDate };
  }
}
