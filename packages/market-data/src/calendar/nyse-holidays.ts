/**
 * NYSE observed holidays for 2025–2026.
 * Update annually. Source: https://www.nyse.com/markets/hours-calendars
 *
 * Half-days (day after Thanksgiving, Christmas Eve) are NOT tracked.
 * The wasted API calls on ~3 half-days per year are negligible.
 */
export const NYSE_HOLIDAYS: ReadonlySet<string> = new Set([
  // 2025
  '2025-01-01', // New Year's Day
  '2025-01-20', // MLK Day
  '2025-02-17', // Presidents' Day
  '2025-04-18', // Good Friday
  '2025-05-26', // Memorial Day
  '2025-06-19', // Juneteenth
  '2025-07-04', // Independence Day
  '2025-09-01', // Labor Day
  '2025-11-27', // Thanksgiving
  '2025-12-25', // Christmas
  // 2026
  '2026-01-01', // New Year's Day
  '2026-01-19', // MLK Day
  '2026-02-16', // Presidents' Day
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
  '2026-06-19', // Juneteenth
  '2026-07-03', // Independence Day (observed — July 4 is Saturday)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving
  '2026-12-25', // Christmas
]);

/**
 * Returns true if the given date string (YYYY-MM-DD) is an NYSE observed holiday.
 */
export function isNYSEHoliday(dateStr: string): boolean {
  return NYSE_HOLIDAYS.has(dateStr);
}
