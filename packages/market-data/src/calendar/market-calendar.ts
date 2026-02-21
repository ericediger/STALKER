import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { getDay, addDays, subDays, setHours, setMinutes, setSeconds, setMilliseconds } from 'date-fns';
import {
  EXCHANGE_TIMEZONE_MAP,
  DEFAULT_TIMEZONE,
  SESSION_OPEN_HOUR,
  SESSION_OPEN_MINUTE,
  SESSION_CLOSE_HOUR,
  SESSION_CLOSE_MINUTE,
} from '@stalker/shared';

function getTimezone(exchange: string): string {
  return EXCHANGE_TIMEZONE_MAP[exchange] ?? DEFAULT_TIMEZONE;
}

/**
 * Returns true if the date falls on a weekday (Mon-Fri) in the exchange's timezone.
 * Does NOT account for market holidays (MVP scope: weekdays only).
 */
export function isTradingDay(date: Date, exchange: string): boolean {
  const tz = getTimezone(exchange);
  const zonedDate = toZonedTime(date, tz);
  const dayOfWeek = getDay(zonedDate);
  // 0 = Sunday, 6 = Saturday
  return dayOfWeek >= 1 && dayOfWeek <= 5;
}

/**
 * Returns the market open (9:30) and close (16:00) times as UTC Date objects
 * for the given exchange trading date.
 */
export function getSessionTimes(date: Date, exchange: string): { open: Date; close: Date } {
  const tz = getTimezone(exchange);

  // Convert the input date to the exchange's local time to get the calendar date
  const zonedDate = toZonedTime(date, tz);

  // Build open time in exchange-local: same calendar date, 9:30:00.000
  const localOpen = setMilliseconds(setSeconds(setMinutes(setHours(zonedDate, SESSION_OPEN_HOUR), SESSION_OPEN_MINUTE), 0), 0);
  // Build close time in exchange-local: same calendar date, 16:00:00.000
  const localClose = setMilliseconds(setSeconds(setMinutes(setHours(zonedDate, SESSION_CLOSE_HOUR), SESSION_CLOSE_MINUTE), 0), 0);

  // Convert from exchange-local back to UTC
  const open = fromZonedTime(localOpen, tz);
  const close = fromZonedTime(localClose, tz);

  return { open, close };
}

/**
 * Returns true if `now` falls within market hours on a trading day.
 */
export function isMarketOpen(now: Date, exchange: string): boolean {
  if (!isTradingDay(now, exchange)) {
    return false;
  }

  const { open, close } = getSessionTimes(now, exchange);
  return now >= open && now < close;
}

/**
 * Returns the most recent trading day before `date`.
 * Steps backward one day at a time in the exchange timezone until finding a weekday.
 */
export function getPriorTradingDay(date: Date, exchange: string): Date {
  let current = subDays(date, 1);

  // Step backward until we find a trading day (weekday in exchange timezone)
  while (!isTradingDay(current, exchange)) {
    current = subDays(current, 1);
  }

  return current;
}

/**
 * Returns the next trading day after `date`.
 * Steps forward one day at a time in the exchange timezone until finding a weekday.
 */
export function getNextTradingDay(date: Date, exchange: string): Date {
  let current = addDays(date, 1);

  // Step forward until we find a trading day (weekday in exchange timezone)
  while (!isTradingDay(current, exchange)) {
    current = addDays(current, 1);
  }

  return current;
}
